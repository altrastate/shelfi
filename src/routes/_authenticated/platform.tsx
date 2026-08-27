import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { EmptyState, ErrorState, LoadingList, PageHeader } from "@/components/shelfi/states";

export const Route = createFileRoute("/_authenticated/platform")({
  head: () => ({
    meta: [
      { title: "Platform — Shelfi" },
      { name: "description", content: "Platform administration for schools on Shelfi." },
      { property: "og:title", content: "Platform — Shelfi" },
      { property: "og:description", content: "Platform administration for schools on Shelfi." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlatformPage,
});

function PlatformPage() {
  const { data: session } = useSession();
  const isSystemAdmin = session?.roles.includes("system_admin") ?? false;

  const schools = useQuery({
    queryKey: ["shelfi", "schools"],
    enabled: isSystemAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schools")
        .select("id, name, slug, is_active, join_code")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!isSystemAdmin) {
    return (
      <>
        <PageHeader title="Platform" />
        <EmptyState
          icon={<Building2 className="size-5" />}
          title="Platform access required"
          description="Only Shelfi platform administrators can manage schools and the global catalogue."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Platform" description="Schools on Shelfi and their access." />
      {schools.isLoading ? (
        <LoadingList />
      ) : schools.isError ? (
        <ErrorState />
      ) : (schools.data ?? []).length === 0 ? (
        <EmptyState
          icon={<Building2 className="size-5" />}
          title="No schools yet"
          description="Schools you onboard onto Shelfi will be listed here with their join codes and status."
        />
      ) : (
        <ul className="space-y-3">
          {schools.data!.map((s) => (
            <li key={s.id} className="shelfi-surface flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{s.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {s.slug} · {s.is_active ? "active" : "inactive"}
                </p>
              </div>
              {s.join_code ? (
                <span className="font-mono text-xs tracking-widest text-primary">
                  {s.join_code}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
