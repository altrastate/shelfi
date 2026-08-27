import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { EmptyState, ErrorState, LoadingList, PageHeader } from "@/components/shelfi/states";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/catalogue")({
  head: () => ({
    meta: [
      { title: "Digital library — Shelfi" },
      {
        name: "description",
        content: "School-provided resources and licensed Shelfi catalogue titles.",
      },
      { property: "og:title", content: "Digital library — Shelfi" },
      {
        property: "og:description",
        content: "School-provided resources and licensed Shelfi catalogue titles.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CataloguePage,
});

function CataloguePage() {
  const { data: session } = useSession();
  const resources = useQuery({
    queryKey: ["shelfi", "digital-resources", session?.schoolId],
    enabled: Boolean(session?.schoolId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("digital_resources")
        .select("id, title, author_name, cover_url, source_type, format")
        .eq("is_active", true)
        .order("title")
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <>
      <PageHeader
        title="Digital library"
        description="Resources your school provides, plus Shelfi catalogue titles your school is licensed for."
      />
      {resources.isLoading ? (
        <LoadingList />
      ) : resources.isError ? (
        <ErrorState />
      ) : (resources.data ?? []).length === 0 ? (
        <EmptyState
          icon={<Sparkles className="size-5" />}
          title="No digital resources yet"
          description="School resources and licensed Shelfi catalogue titles will show up here once they're available to your school."
        />
      ) : (
        <ul className="space-y-3">
          {resources.data!.map((r) => (
            <li key={r.id} className="shelfi-surface flex items-center gap-4 p-4">
              <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary">
                {r.cover_url ? (
                  <img src={r.cover_url} alt="" className="size-full object-cover" />
                ) : (
                  <Sparkles className="size-5 text-primary" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{r.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.author_name ?? "Unknown author"}
                </p>
              </div>
              <Badge variant={r.source_type === "school" ? "secondary" : "outline"}>
                {r.source_type === "school" ? "School" : "Shelfi"}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
