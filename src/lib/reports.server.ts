import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type Client = SupabaseClient<Database>;
export type ReportPeriod = "7d" | "30d" | "90d" | "year" | "all";

/** Maximum rows pulled for any aggregate — reports stay bounded, never "load everything". */
const AGG_LIMIT = 5000;
const LIST_LIMIT = 15;
const CSV_LIMIT = 2000;

export function periodStart(period: ReportPeriod): string | null {
  const now = new Date();
  switch (period) {
    case "7d":
      return new Date(now.getTime() - 7 * 86_400_000).toISOString();
    case "30d":
      return new Date(now.getTime() - 30 * 86_400_000).toISOString();
    case "90d":
      return new Date(now.getTime() - 90 * 86_400_000).toISOString();
    case "year":
      return new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();
    default:
      return null;
  }
}

/**
 * Server-side authorization: only an approved school administrator or active
 * librarian of a school may read that school's reports. Platform admins get no
 * implicit school reports — they must hold a school role.
 */
export async function requireStaffContext(
  supabase: Client,
  userId: string,
): Promise<{ schoolId: string }> {
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("school_id, status").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role, school_id").eq("user_id", userId),
  ]);

  const schoolId = profile?.school_id ?? null;
  const roleNames = (roles ?? []).map((r) => r.role as string);
  const isAdmin = roleNames.includes("school_admin");
  const isLibrarian = roleNames.includes("librarian") && profile?.status === "active";

  if (!schoolId || (!isAdmin && !isLibrarian)) {
    throw new Error("Reports are available to school library staff only.");
  }
  return { schoolId };
}

async function countRows(
  supabase: Client,
  table: "books" | "physical_copies" | "digital_resources" | "shelf_items" | "borrowings" | "reading_progress",
  schoolId: string,
  apply?: (q: any) => any,
): Promise<number> {
  let q: any = supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("school_id", schoolId);
  if (apply) q = apply(q);
  const { count } = await q;
  return count ?? 0;
}

export type NamedCount = { label: string; value: number };
export type LoanRow = {
  id: string;
  title: string;
  author: string | null;
  student: string;
  borrowedAt: string;
  dueAt: string;
  returnedAt: string | null;
  status: string;
  daysOverdue: number;
};

export type LibraryReports = {
  period: ReportPeriod;
  physical: {
    titles: number;
    copies: number;
    available: number;
    borrowed: number;
    overdue: number;
    lost: number;
    damaged: number;
  };
  digital: {
    published: number;
    recentlyAdded: number;
    activeReaders: number;
    completed: number;
  };
  reading: {
    inProgress: number;
    completed: number;
    shelfItems: number;
    recentActivity: number;
  };
  mostBorrowed: { title: string; author: string | null; count: number }[];
  recentBorrowed: LoanRow[];
  recentReturned: LoanRow[];
  overdue: LoanRow[];
  borrowingTrend: { date: string; count: number }[];
  mostRead: { title: string; readers: number; completed: number }[];
  recentlyAccessed: { title: string; lastReadAt: string; percent: number }[];
  popularSubjects: NamedCount[];
};

type LoanRaw = {
  id: string;
  borrowed_at: string;
  due_at: string;
  returned_at: string | null;
  status: string;
  borrower_id: string;
  copy_id: string;
};

const LOAN_SELECT = "id, borrowed_at, due_at, returned_at, status, borrower_id, copy_id";

/** Resolve copy → book title/author and borrower → display name in two batched queries. */
async function decorateLoans(
  supabase: Client,
  schoolId: string,
  rows: LoanRaw[],
): Promise<LoanRow[]> {
  if (rows.length === 0) return [];
  const copyIds = [...new Set(rows.map((r) => r.copy_id))];
  const userIds = [...new Set(rows.map((r) => r.borrower_id))];

  const [{ data: copies }, { data: profiles }] = await Promise.all([
    supabase
      .from("physical_copies")
      .select("id, books(title, authors(name))")
      .eq("school_id", schoolId)
      .in("id", copyIds),
    supabase.from("profiles").select("id, full_name").in("id", userIds),
  ]);

  const bookByCopy = new Map<string, { title: string; author: string | null }>();
  for (const c of (copies ?? []) as any[]) {
    bookByCopy.set(c.id, {
      title: c.books?.title ?? "Unknown title",
      author: c.books?.authors?.name ?? null,
    });
  }
  const names = new Map(((profiles ?? []) as any[]).map((p) => [p.id, p.full_name as string]));

  return rows.map((r) => {
    const book = bookByCopy.get(r.copy_id);
    const overdueDays =
      !r.returned_at && new Date(r.due_at).getTime() < Date.now()
        ? Math.floor((Date.now() - new Date(r.due_at).getTime()) / 86_400_000)
        : 0;
    return {
      id: r.id,
      title: book?.title ?? "Unknown title",
      author: book?.author ?? null,
      student: names.get(r.borrower_id) ?? "Unknown member",
      borrowedAt: r.borrowed_at,
      dueAt: r.due_at,
      returnedAt: r.returned_at,
      status: !r.returned_at && overdueDays > 0 ? "overdue" : r.status,
      daysOverdue: overdueDays,
    };
  });
}

export async function buildReports(
  supabase: Client,
  schoolId: string,
  period: ReportPeriod,
): Promise<LibraryReports> {
  const since = periodStart(period);
  const nowIso = new Date().toISOString();

  const [
    titles,
    copies,
    available,
    borrowedCopies,
    lost,
    damaged,
    published,
    recentlyAdded,
    shelfItems,
  ] = await Promise.all([
    countRows(supabase, "books", schoolId),
    countRows(supabase, "physical_copies", schoolId),
    countRows(supabase, "physical_copies", schoolId, (q) => q.eq("status", "available")),
    countRows(supabase, "physical_copies", schoolId, (q) => q.eq("status", "borrowed")),
    countRows(supabase, "physical_copies", schoolId, (q) => q.eq("status", "lost")),
    countRows(supabase, "physical_copies", schoolId, (q) => q.eq("status", "damaged")),
    countRows(supabase, "digital_resources", schoolId, (q) => q.eq("status", "published")),
    countRows(supabase, "digital_resources", schoolId, (q) =>
      since ? q.gte("created_at", since) : q,
    ),
    countRows(supabase, "shelf_items", schoolId),
  ]);

  const overdueCount = await countRows(supabase, "borrowings", schoolId, (q) =>
    q.is("returned_at", null).lt("due_at", nowIso),
  );

  // Aggregates: bounded reads, aggregated on the server (no per-row queries).
  const loanAggQuery = supabase
    .from("borrowings")
    .select(LOAN_SELECT)
    .eq("school_id", schoolId)
    .order("borrowed_at", { ascending: false })
    .limit(AGG_LIMIT);
  if (since) loanAggQuery.gte("borrowed_at", since);

  const progressQuery = supabase
    .from("reading_progress")
    .select("user_id, resource_id, percent_complete, completed_at, last_read_at")
    .eq("school_id", schoolId)
    .order("last_read_at", { ascending: false })
    .limit(AGG_LIMIT);
  if (since) progressQuery.gte("last_read_at", since);

  const [{ data: loanAgg }, { data: progress }, recentBorrowedRes, recentReturnedRes, overdueRes] =
    await Promise.all([
      loanAggQuery,
      progressQuery,
      supabase
        .from("borrowings")
        .select(LOAN_SELECT)
        .eq("school_id", schoolId)
        .order("borrowed_at", { ascending: false })
        .limit(LIST_LIMIT),
      supabase
        .from("borrowings")
        .select(LOAN_SELECT)
        .eq("school_id", schoolId)
        .not("returned_at", "is", null)
        .order("returned_at", { ascending: false })
        .limit(LIST_LIMIT),
      supabase
        .from("borrowings")
        .select(LOAN_SELECT)
        .eq("school_id", schoolId)
        .is("returned_at", null)
        .lt("due_at", nowIso)
        .order("due_at", { ascending: true })
        .limit(LIST_LIMIT),
    ]);

  const loans = (loanAgg ?? []) as LoanRaw[];

  // Most borrowed: copy → book, counted over the period's borrowing history.
  const copyIds = [...new Set(loans.map((l) => l.copy_id))];
  const copyToBook = new Map<string, { id: string; title: string; author: string | null }>();
  if (copyIds.length > 0) {
    const { data } = await supabase
      .from("physical_copies")
      .select("id, book_id, books(title, authors(name))")
      .eq("school_id", schoolId)
      .in("id", copyIds);
    for (const c of (data ?? []) as any[]) {
      copyToBook.set(c.id, {
        id: c.book_id,
        title: c.books?.title ?? "Unknown title",
        author: c.books?.authors?.name ?? null,
      });
    }
  }
  const byBook = new Map<string, { title: string; author: string | null; count: number }>();
  const trend = new Map<string, number>();
  for (const l of loans) {
    const book = copyToBook.get(l.copy_id);
    if (book) {
      const entry = byBook.get(book.id) ?? { title: book.title, author: book.author, count: 0 };
      entry.count += 1;
      byBook.set(book.id, entry);
    }
    const day = l.borrowed_at.slice(0, 10);
    trend.set(day, (trend.get(day) ?? 0) + 1);
  }
  const mostBorrowed = [...byBook.values()].sort((a, b) => b.count - a.count).slice(0, 10);
  const borrowingTrend = [...trend.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-90)
    .map(([date, count]) => ({ date, count }));

  // Digital reading aggregates.
  const rows = (progress ?? []) as {
    user_id: string;
    resource_id: string;
    percent_complete: number;
    completed_at: string | null;
    last_read_at: string;
  }[];
  const readers = new Set(rows.map((r) => r.user_id));
  const completedCount = rows.filter((r) => r.completed_at).length;
  const inProgress = rows.filter((r) => !r.completed_at && Number(r.percent_complete) > 0).length;

  const byResource = new Map<string, { readers: Set<string>; completed: number }>();
  for (const r of rows) {
    const entry = byResource.get(r.resource_id) ?? { readers: new Set<string>(), completed: 0 };
    entry.readers.add(r.user_id);
    if (r.completed_at) entry.completed += 1;
    byResource.set(r.resource_id, entry);
  }
  const resourceIds = [...byResource.keys()].slice(0, 200);
  const resourceMeta = new Map<string, { title: string; subject: string | null }>();
  if (resourceIds.length > 0) {
    const { data } = await supabase
      .from("digital_resources")
      .select("id, title, subject")
      .in("id", resourceIds);
    for (const r of (data ?? []) as any[]) {
      resourceMeta.set(r.id, { title: r.title, subject: r.subject ?? null });
    }
  }
  const mostRead = [...byResource.entries()]
    .map(([id, v]) => ({
      title: resourceMeta.get(id)?.title ?? "Untitled",
      readers: v.readers.size,
      completed: v.completed,
    }))
    .sort((a, b) => b.readers - a.readers)
    .slice(0, 10);

  const subjectCounts = new Map<string, number>();
  for (const r of rows) {
    const subject = resourceMeta.get(r.resource_id)?.subject;
    if (!subject) continue;
    subjectCounts.set(subject, (subjectCounts.get(subject) ?? 0) + 1);
  }
  const popularSubjects = [...subjectCounts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const recentlyAccessed = rows.slice(0, LIST_LIMIT).map((r) => ({
    title: resourceMeta.get(r.resource_id)?.title ?? "Untitled",
    lastReadAt: r.last_read_at,
    percent: Math.round(Number(r.percent_complete) || 0),
  }));

  const [recentBorrowed, recentReturned, overdue] = await Promise.all([
    decorateLoans(supabase, schoolId, (recentBorrowedRes.data ?? []) as LoanRaw[]),
    decorateLoans(supabase, schoolId, (recentReturnedRes.data ?? []) as LoanRaw[]),
    decorateLoans(supabase, schoolId, (overdueRes.data ?? []) as LoanRaw[]),
  ]);

  return {
    period,
    physical: {
      titles,
      copies,
      available,
      borrowed: borrowedCopies,
      overdue: overdueCount,
      lost,
      damaged,
    },
    digital: {
      published,
      recentlyAdded,
      activeReaders: readers.size,
      completed: completedCount,
    },
    reading: {
      inProgress,
      completed: completedCount,
      shelfItems,
      recentActivity: rows.length,
    },
    mostBorrowed,
    recentBorrowed,
    recentReturned,
    overdue,
    borrowingTrend,
    mostRead,
    recentlyAccessed,
    popularSubjects,
  };
}

function csv(rows: (string | number | null)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell === null || cell === undefined ? "" : String(cell);
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(","),
    )
    .join("\n");
}

export async function buildCsv(
  supabase: Client,
  schoolId: string,
  kind: string,
  since: string | null,
): Promise<string> {
  const nowIso = new Date().toISOString();

  if (kind === "borrowings" || kind === "overdue") {
    let q = supabase
      .from("borrowings")
      .select(LOAN_SELECT)
      .eq("school_id", schoolId)
      .order("borrowed_at", { ascending: false })
      .limit(CSV_LIMIT);
    if (kind === "overdue") q = q.is("returned_at", null).lt("due_at", nowIso);
    else if (since) q = q.gte("borrowed_at", since);
    const { data } = await q;
    const loans = await decorateLoans(supabase, schoolId, (data ?? []) as LoanRaw[]);
    return csv([
      ["Title", "Author", "Member", "Borrowed", "Due", "Returned", "Status", "Days overdue"],
      ...loans.map((l) => [
        l.title,
        l.author,
        l.student,
        l.borrowedAt,
        l.dueAt,
        l.returnedAt,
        l.status,
        l.daysOverdue,
      ]),
    ]);
  }

  if (kind === "physical-catalogue") {
    const { data } = await supabase
      .from("books")
      .select("title, subject, isbn, published_year, shelf_location, authors(name), categories(name)")
      .eq("school_id", schoolId)
      .order("title")
      .limit(CSV_LIMIT);
    return csv([
      ["Title", "Author", "Category", "Subject", "ISBN", "Published", "Shelf"],
      ...((data ?? []) as any[]).map((b) => [
        b.title,
        b.authors?.name ?? null,
        b.categories?.name ?? null,
        b.subject,
        b.isbn,
        b.published_year,
        b.shelf_location,
      ]),
    ]);
  }

  if (kind === "digital-catalogue") {
    const { data } = await supabase
      .from("digital_resources")
      .select("title, author_name, subject, level, format, status, page_count, created_at")
      .eq("school_id", schoolId)
      .order("title")
      .limit(CSV_LIMIT);
    return csv([
      ["Title", "Author", "Subject", "Level", "Format", "Status", "Pages", "Added"],
      ...((data ?? []) as any[]).map((r) => [
        r.title,
        r.author_name,
        r.subject,
        r.level,
        r.format,
        r.status,
        r.page_count,
        r.created_at,
      ]),
    ]);
  }

  // Reading activity summary: aggregate per digital book, never per student.
  const q = supabase
    .from("reading_progress")
    .select("user_id, resource_id, percent_complete, completed_at, last_read_at")
    .eq("school_id", schoolId)
    .order("last_read_at", { ascending: false })
    .limit(CSV_LIMIT);
  if (since) q.gte("last_read_at", since);
  const { data } = await q;
  const rows = (data ?? []) as any[];
  const byResource = new Map<string, { readers: Set<string>; completed: number; last: string }>();
  for (const r of rows) {
    const entry = byResource.get(r.resource_id) ?? {
      readers: new Set<string>(),
      completed: 0,
      last: r.last_read_at,
    };
    entry.readers.add(r.user_id);
    if (r.completed_at) entry.completed += 1;
    if (r.last_read_at > entry.last) entry.last = r.last_read_at;
    byResource.set(r.resource_id, entry);
  }
  const ids = [...byResource.keys()];
  const titles = new Map<string, string>();
  if (ids.length > 0) {
    const { data: res } = await supabase
      .from("digital_resources")
      .select("id, title")
      .in("id", ids.slice(0, 500));
    for (const r of (res ?? []) as any[]) titles.set(r.id, r.title);
  }
  return csv([
    ["Digital book", "Readers", "Completed", "Last activity"],
    ...[...byResource.entries()]
      .sort((a, b) => b[1].readers.size - a[1].readers.size)
      .map(([id, v]) => [titles.get(id) ?? "Untitled", v.readers.size, v.completed, v.last]),
  ]);
}
