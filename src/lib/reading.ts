import { supabase } from "@/integrations/supabase/client";

/** Shared shape for anything we can show as a book card. */
export type ReadingResource = {
  id: string;
  title: string;
  subtitle: string | null;
  author_name: string | null;
  subject: string | null;
  level: string | null;
  cover_path: string | null;
  storage_path: string | null;
  page_count: number | null;
  status: string;
};

export type ProgressRow = {
  resource_id: string;
  current_page: number;
  percent_complete: number;
  last_read_at: string;
  completed_at: string | null;
};

export type BookmarkRow = {
  id: string;
  resource_id: string;
  page: number | null;
  note: string | null;
  created_at: string;
};

export const readingKeys = {
  all: ["shelfi", "reading"] as const,
  shelf: (userId: string | undefined) => ["shelfi", "reading", "shelf", userId] as const,
  progressList: (userId: string | undefined) =>
    ["shelfi", "reading", "progress", userId] as const,
  progress: (userId: string | undefined, resourceId: string) =>
    ["shelfi", "reading", "progress", userId, resourceId] as const,
  shelfState: (userId: string | undefined, resourceId: string) =>
    ["shelfi", "reading", "shelf-state", userId, resourceId] as const,
  bookmarks: (userId: string | undefined, resourceId: string) =>
    ["shelfi", "reading", "bookmarks", userId, resourceId] as const,
};

export const RESOURCE_CARD_COLUMNS =
  "id, title, subtitle, author_name, subject, level, cover_path, storage_path, page_count, status";

/** Percentage at which a book counts as finished. */
export const COMPLETION_THRESHOLD = 98;

export async function fetchShelf(): Promise<
  { id: string; added_at: string; resource: ReadingResource }[]
> {
  const { data, error } = await supabase
    .from("shelf_items")
    .select(`id, added_at, digital_resources(${RESOURCE_CARD_COLUMNS})`)
    .not("resource_id", "is", null)
    .order("added_at", { ascending: false });
  if (error) throw error;
  return (data ?? [])
    .map((row) => {
      const r = row as unknown as {
        id: string;
        added_at: string;
        digital_resources: ReadingResource | null;
      };
      return r.digital_resources
        ? { id: r.id, added_at: r.added_at, resource: r.digital_resources }
        : null;
    })
    .filter((r): r is { id: string; added_at: string; resource: ReadingResource } => r !== null);
}

export async function fetchProgressList(): Promise<
  (ProgressRow & { resource: ReadingResource })[]
> {
  const { data, error } = await supabase
    .from("reading_progress")
    .select(
      `resource_id, current_page, percent_complete, last_read_at, completed_at, digital_resources(${RESOURCE_CARD_COLUMNS})`,
    )
    .order("last_read_at", { ascending: false })
    .limit(40);
  if (error) throw error;
  const rows = (data ?? []).map((row) => {
    const r = row as unknown as ProgressRow & { digital_resources: ReadingResource | null };
    return r.digital_resources
      ? ({ ...r, resource: r.digital_resources } as ProgressRow & { resource: ReadingResource })
      : null;
  });
  return rows.filter((r): r is ProgressRow & { resource: ReadingResource } => r !== null);
}

export async function fetchProgress(resourceId: string): Promise<ProgressRow | null> {
  const { data, error } = await supabase
    .from("reading_progress")
    .select("resource_id, current_page, percent_complete, last_read_at, completed_at")
    .eq("resource_id", resourceId)
    .maybeSingle();
  if (error) throw error;
  return (data as ProgressRow | null) ?? null;
}

/** Upsert on (user_id, resource_id) — one row per student per book, never one per page. */
export async function saveProgress(input: {
  userId: string;
  schoolId: string;
  resourceId: string;
  page: number;
  totalPages: number;
}) {
  const percent =
    input.totalPages > 0
      ? Math.min(100, Math.round((input.page / input.totalPages) * 100))
      : 0;
  const completed = percent >= COMPLETION_THRESHOLD;
  const { error } = await supabase.from("reading_progress").upsert(
    {
      user_id: input.userId,
      school_id: input.schoolId,
      resource_id: input.resourceId,
      current_page: input.page,
      percent_complete: percent,
      last_read_at: new Date().toISOString(),
      completed_at: completed ? new Date().toISOString() : null,
    },
    { onConflict: "user_id,resource_id" },
  );
  if (error) throw error;
  return { percent, completed };
}

export async function addToShelf(input: {
  userId: string;
  schoolId: string;
  resourceId: string;
}) {
  const { error } = await supabase.from("shelf_items").insert({
    user_id: input.userId,
    school_id: input.schoolId,
    resource_id: input.resourceId,
  });
  if (error && !/duplicate key/i.test(error.message)) throw error;
}

/**
 * Row-level security already scopes shelves to the signed-in student; the
 * explicit owner filter is defence in depth so a shared client can never
 * widen the delete.
 */
export async function removeFromShelf(resourceId: string, userId?: string) {
  let query = supabase.from("shelf_items").delete().eq("resource_id", resourceId);
  if (userId) query = query.eq("user_id", userId);
  const { error } = await query;
  if (error) throw error;
}

export async function fetchBookmarks(resourceId: string, userId?: string): Promise<BookmarkRow[]> {
  let query = supabase
    .from("bookmarks")
    .select("id, resource_id, page, note, created_at")
    .eq("resource_id", resourceId);
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query.order("page", { ascending: true });
  if (error) throw error;
  return (data ?? []) as BookmarkRow[];
}

export function progressLabel(p?: ProgressRow | null): string {
  if (!p) return "Start reading";
  if (p.completed_at) return "Read again";
  return "Continue reading";
}

/** Signed cover URLs for a batch of resources (covers live in private storage). */
export async function signCoverMap(paths: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const { data } = await supabase.storage.from("digital-books").createSignedUrls(unique, 3600);
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) map.set(item.path, item.signedUrl);
  }
  return map;
}
