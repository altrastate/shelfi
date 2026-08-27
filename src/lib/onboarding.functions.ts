import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Students never self-register into a school. They request access with a
 * school-issued join code; a librarian must approve them before the profile
 * becomes active.
 */
export const requestSchoolAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { joinCode: string; fullName?: string }) => {
    const joinCode = String(data?.joinCode ?? "")
      .trim()
      .toUpperCase();
    if (joinCode.length < 4) throw new Error("Enter a valid join code.");
    return { joinCode, fullName: String(data?.fullName ?? "").trim() };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: school, error } = await supabaseAdmin
      .from("schools")
      .select("id, name, is_active")
      .eq("join_code", data.joinCode)
      .maybeSingle();

    if (error) throw new Error("Could not check that join code right now.");
    if (!school || !school['is_active']) throw new Error("That join code is not recognised.");

    const profileUpdate = {
      school_id: school['id'] as string,
      status: "pending" as const,
      ...(data.fullName ? { full_name: data.fullName } : {}),
    };

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update(profileUpdate)
      .eq("id", context.userId);
    if (profileError) throw new Error("Could not update your profile.");

    const { error: requestError } = await supabaseAdmin
      .from("school_join_requests")
      .upsert(
        { school_id: school['id'] as string, user_id: context.userId, status: "pending" },
        { onConflict: "school_id,user_id" },
      );
    if (requestError) throw new Error("Could not submit your request.");

    await supabaseAdmin
      .from("user_roles")
      .upsert(
        { user_id: context.userId, school_id: school['id'] as string, role: "student" },
        { onConflict: "user_id,role,school_id" },
      );

    return { schoolName: school['name'] as string };
  });
