import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "system_admin" | "school_admin" | "student";

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
  schoolId: string | null;
  status: "pending" | "active" | "suspended";
  roles: AppRole[];
  school: SchoolSummary | null;
};

export const sessionQueryKey = ["shelfi", "session"] as const;

export async function fetchSession(): Promise<SessionProfile | null> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const [profileRes, rolesRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, school_id, status")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
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
    schoolId: profile?.school_id ?? null,
    status: (profile?.status as SessionProfile["status"]) ?? "pending",
    roles: (rolesRes.data ?? []).map((r) => r.role as AppRole),
    school,
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
  return "student";
}

export const roleLabel: Record<AppRole, string> = {
  system_admin: "Platform administrator",
  school_admin: "Librarian",
  student: "Student",
};
