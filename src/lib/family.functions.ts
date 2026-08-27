import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ParentLinkRequestRow = {
  id: string;
  parentUserId: string;
  parentName: string;
  parentEmail: string | null;
  studentUserId: string;
  studentName: string;
  studentYearGroup: string | null;
  relationshipType: string;
  status: "pending" | "active" | "rejected" | "revoked";
  createdAt: string;
  approvedAt: string | null;
};

/**
 * A guardian asks to be connected to a child using the school join code plus
 * the child's private guardian code. No student can be reached by name or by
 * guessing: the pairing is validated inside `request_parent_link`, executed as
 * the signed-in user, and the connection stays pending until school staff
 * approve it. Only the child's first name is echoed back.
 */
export const requestParentLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      joinCode: string;
      guardianCode: string;
      relationshipType?: string;
      fullName?: string;
    }) => {
      const joinCode = String(data?.joinCode ?? "").trim().toUpperCase();
      if (joinCode.length < 4) throw new Error("Enter a valid school join code.");
      const guardianCode = String(data?.guardianCode ?? "").trim().toUpperCase();
      if (guardianCode.length < 4) throw new Error("Enter your child's guardian code.");
      const allowed = ["mother", "father", "guardian", "other"];
      const relationshipType = allowed.includes(String(data?.relationshipType))
        ? String(data?.relationshipType)
        : "guardian";
      return {
        joinCode,
        guardianCode,
        relationshipType,
        fullName: String(data?.fullName ?? "").trim(),
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("request_parent_link", {
      _join_code: data.joinCode,
      _guardian_code: data.guardianCode,
      _relationship_type: data.relationshipType,
      _full_name: data.fullName,
    });

    if (error) {
      const message = error.message.includes("join code")
        ? "That school join code is not recognised."
        : error.message.includes("guardian code")
          ? "That guardian code is not recognised for this school."
          : error.message.includes("already has a school role")
            ? "This account already has a school role, so it cannot be used as a guardian account."
            : "Could not send your request. Please try again.";
      throw new Error(message);
    }

    const row = Array.isArray(rows) ? rows[0] : rows;
    return {
      schoolName: (row?.["school_name"] as string) ?? "your school",
      studentFirstName: (row?.["student_first_name"] as string) ?? "your child",
    };
  });

/**
 * Guardian connections for the caller's own school. Rows come back through the
 * caller's session so RLS decides visibility; parent email addresses live in
 * auth and are attached afterwards for exactly those users.
 */
export const listParentLinkRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ParentLinkRequestRow[]> => {
    const { data, error } = await context.supabase
      .from("parent_student_relationships")
      .select(
        "id, parent_user_id, student_user_id, status, relationship_type, created_at, approved_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) return [];
    const rows = data ?? [];
    if (rows.length === 0) return [];

    const ids = [
      ...new Set([
        ...rows.map((r) => r["parent_user_id"] as string),
        ...rows.map((r) => r["student_user_id"] as string),
      ]),
    ];

    const { data: profiles } = await context.supabase
      .from("profiles")
      .select("id, full_name, year_group")
      .in("id", ids);
    const byId = new Map(
      (profiles ?? []).map((p) => [
        p.id,
        { name: (p["full_name"] as string) || "", yearGroup: (p["year_group"] as string) ?? null },
      ]),
    );

    const parentIds = [...new Set(rows.map((r) => r["parent_user_id"] as string))];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const emails = new Map<string, string | null>();
    await Promise.all(
      parentIds.map(async (id) => {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(id);
        emails.set(id, u?.user?.email ?? null);
      }),
    );

    return rows.map((r) => {
      const parentId = r["parent_user_id"] as string;
      const studentId = r["student_user_id"] as string;
      return {
        id: r["id"] as string,
        parentUserId: parentId,
        parentName: byId.get(parentId)?.name || "Unnamed guardian",
        parentEmail: emails.get(parentId) ?? null,
        studentUserId: studentId,
        studentName: byId.get(studentId)?.name || "Unnamed student",
        studentYearGroup: byId.get(studentId)?.yearGroup ?? null,
        relationshipType: (r["relationship_type"] as string) ?? "guardian",
        status: r["status"] as ParentLinkRequestRow["status"],
        createdAt: r["created_at"] as string,
        approvedAt: (r["approved_at"] as string) ?? null,
      };
    });
  });
