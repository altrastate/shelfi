import { supabase } from "@/integrations/supabase/client";

export const DIGITAL_BUCKET = "digital-books";

export type DigitalStatus = "draft" | "published" | "archived";

export const digitalStatusLabel: Record<DigitalStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

export function digitalStatusTone(status: DigitalStatus): string {
  switch (status) {
    case "published":
      return "bg-primary/10 text-primary";
    case "draft":
      return "bg-accent/20 text-accent-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export type DigitalResource = {
  id: string;
  title: string;
  subtitle: string | null;
  author_name: string | null;
  description: string | null;
  subject: string | null;
  level: string | null;
  isbn: string | null;
  language: string | null;
  format: string | null;
  status: DigitalStatus;
  cover_path: string | null;
  storage_path: string | null;
  file_size: number | null;
  page_count: number | null;
  published_year: number | null;
  school_id: string | null;
  category_id: string | null;
  categories?: { name: string } | null;
};

export const digitalKeys = {
  all: ["shelfi", "digital"] as const,
  list: (schoolId: string | null | undefined, opts: Record<string, unknown>) =>
    ["shelfi", "digital", "list", schoolId, opts] as const,
  detail: (id: string) => ["shelfi", "digital", "detail", id] as const,
  stats: (schoolId: string | null | undefined) =>
    ["shelfi", "digital", "stats", schoolId] as const,
};

export const DIGITAL_PAGE_SIZE = 24;

/** Signed cover URLs, resolved in one round trip. Covers are private storage. */
export async function signCovers(paths: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const { data } = await supabase.storage.from(DIGITAL_BUCKET).createSignedUrls(unique, 3600);
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) map.set(item.path, item.signedUrl);
  }
  return map;
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "—";
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${mb.toFixed(1)} MB`;
}

export const MAX_PDF_BYTES = 100 * 1024 * 1024;
export const MAX_COVER_BYTES = 5 * 1024 * 1024;
