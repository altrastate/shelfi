import { supabase } from "@/integrations/supabase/client";

/**
 * Parent / guardian family connections.
 *
 * Every read here goes through the caller's own session, so row-level security
 * decides what a guardian may see: their own relationship rows, and — only for
 * an ACTIVE relationship inside the same school — the child's profile, reading
 * progress, shelf and borrowing records. Ask Shelfi conversations and bookmarks
 * are never exposed to guardians. Nothing is filtered in the browser.
 */

export type ParentLinkStatus = "pending" | "active" | "rejected" | "revoked";

export type ChildLink = {
  id: string;
  studentId: string;
  schoolId: string;
  status: ParentLinkStatus;
  relationshipType: string;
  createdAt: string;
  approvedAt: string | null;
  /** Only readable once the connection is active. */
  fullName: string | null;
  yearGroup: string | null;
};

export const familyKeys = {
  all: ["shelfi", "family"] as const,
  children: (parentId: string | undefined) => ["shelfi", "family", "children", parentId] as const,
  child: (parentId: string | undefined, studentId: string) =>
    ["shelfi", "family", "child", parentId, studentId] as const,
  guardians: (studentId: string | undefined) =>
    ["shelfi", "family", "guardians", studentId] as const,
  requests: (schoolId: string | null | undefined) =>
    ["shelfi", "family", "requests", schoolId] as const,
};

export const linkStatusLabel: Record<ParentLinkStatus, string> = {
  pending: "Awaiting school approval",
  active: "Connected",
  rejected: "Declined",
  revoked: "No longer active",
};

export const linkStatusTone: Record<ParentLinkStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  active: "bg-secondary text-primary",
  rejected: "bg-destructive/10 text-destructive",
  revoked: "bg-destructive/10 text-destructive",
};

export const relationshipLabel: Record<string, string> = {
  mother: "Mother",
  father: "Father",
  guardian: "Guardian",
  other: "Guardian",
};

/** The signed-in guardian's own connections. Profile fields appear only when active. */
export async function fetchMyChildren(): Promise<ChildLink[]> {
  const { data, error } = await supabase
    .from("parent_student_relationships")
    .select(
      "id, student_user_id, school_id, status, relationship_type, created_at, approved_at, profiles!parent_student_relationships_student_user_id_fkey(full_name, year_group)",
    )
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => {
    const r = row as unknown as {
      id: string;
      student_user_id: string;
      school_id: string;
      status: ParentLinkStatus;
      relationship_type: string;
      created_at: string;
      approved_at: string | null;
      profiles: { full_name: string | null; year_group: string | null } | null;
    };
    return {
      id: r.id,
      studentId: r.student_user_id,
      schoolId: r.school_id,
      status: r.status,
      relationshipType: r.relationship_type,
      createdAt: r.created_at,
      approvedAt: r.approved_at,
      fullName: r.profiles?.full_name ?? null,
      yearGroup: r.profiles?.year_group ?? null,
    };
  });
}

export type ChildActivity = {
  currentlyReading: {
    resourceId: string;
    title: string;
    coverPath: string | null;
    percent: number;
    lastReadAt: string;
  }[];
  completed: { resourceId: string; title: string; coverPath: string | null; at: string }[];
  shelfCount: number;
  shelf: { resourceId: string; title: string; coverPath: string | null }[];
  loans: {
    id: string;
    title: string;
    dueAt: string;
    borrowedAt: string;
    returnedAt: string | null;
    status: string;
  }[];
};

type ProgressJoin = {
  resource_id: string;
  percent_complete: number;
  last_read_at: string;
  completed_at: string | null;
  digital_resources: { title: string; cover_path: string | null } | null;
};

/**
 * High-level activity for one child. Authorization is re-derived per query by
 * the database from the guardian's approved, active relationship — passing a
 * different student id simply returns nothing.
 */
export async function fetchChildActivity(studentId: string): Promise<ChildActivity> {
  const [progressRes, shelfRes, loansRes] = await Promise.all([
    supabase
      .from("reading_progress")
      .select(
        "resource_id, percent_complete, last_read_at, completed_at, digital_resources(title, cover_path)",
      )
      .eq("user_id", studentId)
      .order("last_read_at", { ascending: false })
      .limit(12),
    supabase
      .from("shelf_items")
      .select("resource_id, digital_resources(title, cover_path)")
      .eq("user_id", studentId)
      .not("resource_id", "is", null)
      .order("added_at", { ascending: false })
      .limit(12),
    supabase
      .from("borrowings")
      .select("id, borrowed_at, due_at, returned_at, status, physical_copies(books(title))")
      .eq("borrower_id", studentId)
      .order("borrowed_at", { ascending: false })
      .limit(20),
  ]);

  const progress = ((progressRes.data ?? []) as unknown as ProgressJoin[]).filter(
    (p) => p.digital_resources,
  );

  const shelf = ((shelfRes.data ?? []) as unknown as {
    resource_id: string;
    digital_resources: { title: string; cover_path: string | null } | null;
  }[])
    .filter((s) => s.digital_resources)
    .map((s) => ({
      resourceId: s.resource_id,
      title: s.digital_resources!.title,
      coverPath: s.digital_resources!.cover_path,
    }));

  const loans = ((loansRes.data ?? []) as unknown as {
    id: string;
    borrowed_at: string;
    due_at: string;
    returned_at: string | null;
    status: string;
    physical_copies: { books: { title: string } | null } | null;
  }[]).map((l) => ({
    id: l.id,
    title: l.physical_copies?.books?.title ?? "Library book",
    dueAt: l.due_at,
    borrowedAt: l.borrowed_at,
    returnedAt: l.returned_at,
    status: l.status,
  }));

  return {
    currentlyReading: progress
      .filter((p) => !p.completed_at)
      .map((p) => ({
        resourceId: p.resource_id,
        title: p.digital_resources!.title,
        coverPath: p.digital_resources!.cover_path,
        percent: Number(p.percent_complete ?? 0),
        lastReadAt: p.last_read_at,
      })),
    completed: progress
      .filter((p) => p.completed_at)
      .map((p) => ({
        resourceId: p.resource_id,
        title: p.digital_resources!.title,
        coverPath: p.digital_resources!.cover_path,
        at: p.completed_at!,
      })),
    shelfCount: shelf.length,
    shelf,
    loans,
  };
}

/** Guardians connected to the signed-in student — names and status only. */
export async function fetchMyGuardians(): Promise<
  { id: string; status: ParentLinkStatus; relationshipType: string; name: string | null }[]
> {
  const { data, error } = await supabase
    .from("parent_student_relationships")
    .select(
      "id, status, relationship_type, profiles!parent_student_relationships_parent_user_id_fkey(full_name)",
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const r = row as unknown as {
      id: string;
      status: ParentLinkStatus;
      relationship_type: string;
      profiles: { full_name: string | null } | null;
    };
    return {
      id: r.id,
      status: r.status,
      relationshipType: r.relationship_type,
      name: r.profiles?.full_name ?? null,
    };
  });
}
