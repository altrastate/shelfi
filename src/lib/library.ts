import { supabase } from "@/integrations/supabase/client";

export type CopyStatus =
  | "available"
  | "borrowed"
  | "reserved"
  | "damaged"
  | "lost"
  | "retired"
  | "archived";

export type BorrowStatus = "borrowed" | "returned" | "overdue" | "lost";

export const copyStatusLabel: Record<CopyStatus, string> = {
  available: "Available",
  borrowed: "Borrowed",
  reserved: "Reserved",
  damaged: "Damaged",
  lost: "Lost",
  retired: "Retired",
  archived: "Archived",
};

export const conditionOptions = ["new", "good", "fair", "poor"] as const;

/** Tailwind classes for a status pill, using design-system tokens only. */
export function statusTone(status: CopyStatus | "overdue"): string {
  switch (status) {
    case "available":
      return "bg-primary/10 text-primary";
    case "borrowed":
      return "bg-accent/20 text-accent-foreground";
    case "overdue":
    case "lost":
      return "bg-destructive/10 text-destructive";
    case "damaged":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-secondary text-secondary-foreground";
  }
}

export function isOverdue(loan: { due_at: string; returned_at: string | null }): boolean {
  return !loan.returned_at && new Date(loan.due_at).getTime() < Date.now();
}

export function daysOverdue(dueAt: string): number {
  const diff = Date.now() - new Date(dueAt).getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export const libraryKeys = {
  books: (schoolId?: string | null, search?: string) =>
    ["shelfi", "library", "books", schoolId, search ?? ""] as const,
  book: (bookId: string) => ["shelfi", "library", "book", bookId] as const,
  stats: (schoolId?: string | null) => ["shelfi", "library", "stats", schoolId] as const,
  loans: (schoolId?: string | null, scope?: string) =>
    ["shelfi", "library", "loans", schoolId, scope ?? "all"] as const,
  members: (schoolId?: string | null, search?: string) =>
    ["shelfi", "library", "members", schoolId, search ?? ""] as const,
  myLoans: (userId?: string | null) => ["shelfi", "library", "my-loans", userId] as const,
};

export type LoanRow = {
  id: string;
  borrowed_at: string;
  due_at: string;
  returned_at: string | null;
  status: BorrowStatus;
  borrower_id: string;
  issued_by: string | null;
  physical_copies: {
    id: string;
    barcode: string | null;
    status: CopyStatus;
    books: { id: string; title: string } | null;
  } | null;
};

const LOAN_SELECT =
  "id, borrowed_at, due_at, returned_at, status, borrower_id, issued_by, physical_copies(id, barcode, status, books(id, title))";

/** Attaches display names for borrowers/staff using the school profiles the caller may read. */
export async function withPeopleNames<T extends { borrower_id: string; issued_by: string | null }>(
  rows: T[],
): Promise<(T & { borrowerName: string; issuedByName: string | null })[]> {
  const ids = [
    ...new Set(rows.flatMap((r) => [r.borrower_id, r.issued_by].filter(Boolean) as string[])),
  ];
  if (ids.length === 0) return rows.map((r) => ({ ...r, borrowerName: "", issuedByName: null }));
  const { data } = await supabase.from("profiles").select("id, full_name").in("id", ids);
  const names = new Map((data ?? []).map((p) => [p.id, p['full_name'] as string]));
  return rows.map((r) => ({
    ...r,
    borrowerName: names.get(r.borrower_id) ?? "Unknown member",
    issuedByName: r.issued_by ? (names.get(r.issued_by) ?? null) : null,
  }));
}

export async function fetchLoans(opts: {
  schoolId: string;
  scope: "active" | "overdue" | "history";
  limit?: number;
}) {
  let query = supabase.from("borrowings").select(LOAN_SELECT).eq("school_id", opts.schoolId);

  if (opts.scope === "active" || opts.scope === "overdue") {
    query = query.is("returned_at", null);
  }
  if (opts.scope === "overdue") {
    query = query.lt("due_at", new Date().toISOString());
  }

  const { data, error } = await query
    .order("borrowed_at", { ascending: false })
    .limit(opts.limit ?? 50);
  if (error) throw error;
  return withPeopleNames((data ?? []) as unknown as LoanRow[]);
}
