import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Nobody self-enrols into a school. A user presents a school-issued join code
 * and requests either student or librarian access; a school administrator must
 * approve it. All authorization lives in the `request_school_join` security
 * definer function, executed as the signed-in user.
 */
export const requestSchoolAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { joinCode: string; role: "student" | "librarian"; fullName?: string }) => {
    const joinCode = String(data?.joinCode ?? "").trim().toUpperCase();
    if (joinCode.length < 4) throw new Error("Enter a valid join code.");
    const role = data?.role === "librarian" ? "librarian" : "student";
    return { joinCode, role, fullName: String(data?.fullName ?? "").trim() };
  })
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("request_school_join", {
      _join_code: data.joinCode,
      _role: data.role,
      _full_name: data.fullName,
    });

    if (error) {
      const message = error.message.includes("not recognised")
        ? "That join code is not recognised."
        : error.message.includes("Administrator accounts")
          ? "Administrator accounts cannot submit join requests."
          : "Could not submit your request. Please try again.";
      throw new Error(message);
    }

    const row = Array.isArray(rows) ? rows[0] : rows;
    return { schoolName: (row?.['school_name'] as string) ?? "your school", role: data.role };
  });
