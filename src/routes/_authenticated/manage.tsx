import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { EmptyState, ErrorState, LoadingList, PageHeader } from "@/components/shelfi/states";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/manage")({
  head: () => ({
    meta: [
      { title: "Manage school — Shelfi" },
      { name: "description", content: "Librarian tools for members and join requests." },
      { property: "og:title", content: "Manage school — Shelfi" },
      { property: "og:description", content: "Librarian tools for members and join requests." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManagePage,
});

function ManagePage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const isLibrarian = session?.roles.includes("school_admin") ?? false;

  const members = useQuery({
    queryKey: ["shelfi", "members", session?.schoolId],
    enabled: isLibrarian && Boolean(session?.schoolId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, status, year_group")
        .eq("school_id", session!.schoolId!)
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  async function setStatus(id: string, status: "active" | "suspended") {
    const { error } = await supabase.from("profiles").update({ status }).eq("id", id);
    if (error) {
      toast.error("Could not update that member.");
      return;
    }
    toast.success(status === "active" ? "Member approved" : "Member suspended");
    await queryClient.invalidateQueries({ queryKey: ["shelfi", "members"] });
  }

  if (!isLibrarian) {
    return (
      <>
        <PageHeader title="Manage school" />
        <EmptyState
          icon={<Users className="size-5" />}
          title="Librarian access required"
          description="This area is only available to your school's librarian or school administrator."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Manage school"
        description={`Members and access for ${session?.school?.name ?? "your school"}.`}
      />
      {members.isLoading ? (
        <LoadingList />
      ) : members.isError ? (
        <ErrorState />
      ) : (members.data ?? []).length === 0 ? (
        <EmptyState
          icon={<Users className="size-5" />}
          title="No members yet"
          description="Share your school join code so students can request access to the library."
        />
      ) : (
        <ul className="space-y-3">
          {members.data!.map((m) => (
            <li key={m.id} className="shelfi-surface flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {m.full_name || "Unnamed member"}
                </p>
                <p className="text-xs capitalize text-muted-foreground">
                  {m.status}
                  {m.year_group ? ` · ${m.year_group}` : ""}
                </p>
              </div>
              {m.status === "active" ? (
                <Button variant="outline" size="sm" onClick={() => setStatus(m.id, "suspended")}>
                  Suspend
                </Button>
              ) : (
                <Button size="sm" onClick={() => setStatus(m.id, "active")}>
                  Approve
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
