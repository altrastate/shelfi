import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type JoinRequestRow = {
  id: string;
  userId: string;
  fullName: string;
  email: string | null;
  requestedRole: "student" | "librarian";
  status: "pending" | "active" | "suspended" | "rejected";
  requestedAt: string;
  schoolName: string;
};

/**
 * Join requests for the caller's own school only. Rows are read through the
 * caller's session, so RLS decides visibility; email addresses live in auth and
 * are attached afterwards for exactly those users.
 */
export const listSchoolJoinRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<JoinRequestRow[]> => {
    const { data, error } = await context.supabase
      .from("school_join_requests")
      .select("id, user_id, school_id, status, requested_role, requested_at, schools(name)")
      .order("requested_at", { ascending: false });

    if (error) return [];
    const rows = data ?? [];
    if (rows.length === 0) return [];

    const userIds = [...new Set(rows.map((r) => r['user_id'] as string))];
    const { data: profiles } = await context.supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);
    const names = new Map((profiles ?? []).map((p) => [p.id, p['full_name'] as string]));

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const emails = new Map<string, string | null>();
    await Promise.all(
      userIds.map(async (id) => {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(id);
        emails.set(id, u?.user?.email ?? null);
      }),
    );

    return rows.map((r) => {
      const school = r['schools'] as { name?: string } | null;
      const userId = r['user_id'] as string;
      return {
        id: r['id'] as string,
        userId,
        fullName: names.get(userId) || "Unnamed user",
        email: emails.get(userId) ?? null,
        requestedRole: (r['requested_role'] as JoinRequestRow["requestedRole"]) ?? "student",
        status: r['status'] as JoinRequestRow["status"],
        requestedAt: r['requested_at'] as string,
        schoolName: school?.name ?? "",
      };
    });
  });
