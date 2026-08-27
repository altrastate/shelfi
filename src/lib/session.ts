import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "system_admin" | "school_admin" | "librarian" | "student" | "parent";
export type MembershipStatus = "pending" | "active" | "suspended" | "rejected";

export type SchoolSummary = {
  id: string;
  name: string;
  slug: string;
  join_code: string | null;
};

export type SessionProfile = {
  id: string;
  email: string | null;
  fullName: string;
  studentIdentifier: string | null;
  yearGroup: string | null;
  schoolId: string | null;
  status: MembershipStatus;
  roles: AppRole[];
  school: SchoolSummary | null;
  requestedRole: AppRole | null;
};

export const sessionQueryKey = ["shelfi", "session"] as const;

export async function fetchSession(): Promise<SessionProfile | null> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const [profileRes, rolesRes, requestRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, school_id, status, year_group, student_identifier")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
    supabase
      .from("school_join_requests")
      .select("requested_role, status")
      .eq("user_id", user.id)
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const profile = profileRes.data;
  let school: SchoolSummary | null = null;
  if (profile?.school_id) {
    const { data } = await supabase
      .from("schools")
      .select("id, name, slug, join_code")
      .eq("id", profile.school_id)
      .maybeSingle();
    school = data ?? null;
  }

  return {
    id: user.id,
    email: user.email ?? null,
    fullName: profile?.['full_name'] || (user.user_metadata?.['full_name'] as string) || "",
    studentIdentifier: profile?.['student_identifier'] ?? null,
    yearGroup: profile?.['year_group'] ?? null,
    schoolId: profile?.school_id ?? null,
    status: (profile?.status as MembershipStatus) ?? "pending",
    roles: (rolesRes.data ?? []).map((r) => r.role as AppRole),
    school,
    requestedRole: (requestRes.data?.['requested_role'] as AppRole | undefined) ?? null,
  };
}

export function useSession() {
  return useQuery({
    queryKey: sessionQueryKey,
    queryFn: fetchSession,
    staleTime: 30_000,
  });
}

export function primaryRole(roles: AppRole[]): AppRole {
  if (roles.includes("system_admin")) return "system_admin";
  if (roles.includes("school_admin")) return "school_admin";
  if (roles.includes("librarian")) return "librarian";
  if (roles.includes("parent")) return "parent";
  return "student";
}

export const roleLabel: Record<AppRole, string> = {
  system_admin: "Platform administrator",
  school_admin: "School administrator",
  librarian: "Librarian",
  student: "Student",
  parent: "Parent / guardian",
};

export function isPlatformAdmin(session?: SessionProfile | null) {
  return session?.roles.includes("system_admin") ?? false;
}

export function isSchoolAdmin(session?: SessionProfile | null) {
  return (session?.roles.includes("school_admin") ?? false) && Boolean(session?.schoolId);
}

/** A parent/guardian account: read-only family access, never school staff. */
export function isParent(session?: SessionProfile | null) {
  return session?.roles.includes("parent") ?? false;
}

/** Approved school staff: school administrator or active librarian. */
export function isActiveStaff(session?: SessionProfile | null) {
  if (!session?.schoolId) return false;
  if (session.roles.includes("school_admin")) return true;
  return session.roles.includes("librarian") && session.status === "active";
}

/** Where an authenticated user belongs after sign-in, from server-trusted state. */
export function homeRouteFor(session?: SessionProfile | null): string {
  if (!session) return "/auth";
  if (isPlatformAdmin(session)) return "/platform";
  if (isSchoolAdmin(session)) return "/manage";
  if (isParent(session)) return "/family";
  return "/dashboard";
}
