import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Platform administrators designate the first School Administrator for a
 * school. The caller's platform role is verified through their own session
 * (RLS-backed) before any privileged lookup, and the role grant itself runs
 * through `assign_school_admin`, which re-checks `is_system_admin()`.
 */
export const assignSchoolAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { schoolId: string; email: string }) => {
    const schoolId = String(data?.schoolId ?? "").trim();
    const email = String(data?.email ?? "").trim().toLowerCase();
    if (!schoolId) throw new Error("Select a school.");
    if (!email.includes("@")) throw new Error("Enter a valid email address.");
    return { schoolId, email };
  })
  .handler(async ({ data, context }) => {
    const { data: isPlatformAdmin, error: roleError } = await context.supabase.rpc("is_system_admin");
    if (roleError || !isPlatformAdmin) {
      throw new Error("Only platform administrators can assign school administrators.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Locate the existing Shelfi account for that email address.
    let userId: string | null = null;
    for (let page = 1; page <= 10 && !userId; page++) {
      const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error("Could not look up that account.");
      const match = list.users.find((u) => (u.email ?? "").toLowerCase() === data.email);
      if (match) userId = match.id;
      if (list.users.length < 200) break;
    }

    if (!userId) {
      throw new Error("No Shelfi account with that email. Ask them to sign up first.");
    }

    const { error } = await context.supabase.rpc("assign_school_admin", {
      _user_id: userId,
      _school_id: data.schoolId,
    });
    if (error) throw new Error("Could not assign that school administrator.");

    return { userId, email: data.email };
  });
