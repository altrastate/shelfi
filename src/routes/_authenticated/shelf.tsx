import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { EmptyState, ErrorState, LoadingList, PageHeader } from "@/components/shelfi/states";

export const Route = createFileRoute("/_authenticated/shelf")({
  head: () => ({
    meta: [
      { title: "My Shelf — Shelfi" },
      { name: "description", content: "The books and resources you've saved on Shelfi." },
      { property: "og:title", content: "My Shelf — Shelfi" },
      { property: "og:description", content: "The books and resources you've saved on Shelfi." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ShelfPage,
});

function ShelfPage() {
  const { data: session } = useSession();
  const shelf = useQuery({
    queryKey: ["shelfi", "shelf", session?.id],
    enabled: Boolean(session?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shelf_items")
        .select("id, added_at, books(title), digital_resources(title)")
        .order("added_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <>
      <PageHeader title="My Shelf" description="Everything you've saved to read." />
      {shelf.isLoading ? (
        <LoadingList />
      ) : shelf.isError ? (
        <ErrorState />
      ) : (shelf.data ?? []).length === 0 ? (
        <EmptyState
          icon={<BookOpen className="size-5" />}
          title="Your shelf is empty"
          description="Save books and digital resources from your school library and they'll wait for you here."
        />
      ) : (
        <ul className="space-y-3">
          {shelf.data!.map((item) => {
            const row = item as unknown as {
              id: string;
              books?: { title: string } | null;
              digital_resources?: { title: string } | null;
            };
            return (
              <li key={row.id} className="shelfi-surface flex items-center gap-4 p-4">
                <div className="flex size-12 items-center justify-center rounded-lg bg-secondary">
                  <BookOpen className="size-5 text-primary" />
                </div>
                <p className="truncate text-sm font-semibold text-foreground">
                  {row.books?.title ?? row.digital_resources?.title ?? "Untitled"}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
