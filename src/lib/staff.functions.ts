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
 * Join requests for the caller's own school only. The rows are fetched through
 * the caller's session (RLS decides visibility); email addresses live in auth
 * and are attached afterwards for the request's own users only.
 */
export const listSchoolJoinRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<JoinRequestRow[]> => {
    const { data, error } = await context.supabase
      .from("school_join_requests")
      .select(
        "id, user_id, status, requested_role, requested_at, schools(name), profiles:user_id(full_name)",
      )
      .order("requested_at", { ascending: false });

    if (error) return [];
    const rows = data ?? [];
    if (rows.length === 0) return [];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const emails = new Map<string, string | null>();
    await Promise.all(
      rows.map(async (r) => {
        const userId = r['user_id'] as string;
        if (emails.has(userId)) return;
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(userId);
        emails.set(userId, u?.user?.email ?? null);
      }),
    );

    return rows.map((r) => {
      const profile = r['profiles'] as { full_name?: string } | null;
      const school = r['schools'] as { name?: string } | null;
      return {
        id: r['id'] as string,
        userId: r['user_id'] as string,
        fullName: profile?.full_name || "Unnamed user",
        email: emails.get(r['user_id'] as string) ?? null,
        requestedRole: (r['requested_role'] as JoinRequestRow["requestedRole"]) ?? "student",
        status: r['status'] as JoinRequestRow["status"],
        requestedAt: r['requested_at'] as string,
        schoolName: school?.name ?? "",
      };
    });
  });
