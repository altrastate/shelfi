import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Library } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { EmptyState, ErrorState, LoadingList, PageHeader } from "@/components/shelfi/states";

export const Route = createFileRoute("/_authenticated/library")({
  head: () => ({
    meta: [
      { title: "Physical library — Shelfi" },
      { name: "description", content: "Browse the books on your school's shelves." },
      { property: "og:title", content: "Physical library — Shelfi" },
      { property: "og:description", content: "Browse the books on your school's shelves." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LibraryPage,
});

function LibraryPage() {
  const { data: session } = useSession();
  const books = useQuery({
    queryKey: ["shelfi", "books", session?.schoolId],
    enabled: Boolean(session?.schoolId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("books")
        .select("id, title, subtitle, cover_url, published_year, authors(name)")
        .order("title")
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <>
      <PageHeader
        title="Physical library"
        description="Books and copies held on your school's shelves."
      />
      {books.isLoading ? (
        <LoadingList />
      ) : books.isError ? (
        <ErrorState />
      ) : (books.data ?? []).length === 0 ? (
        <EmptyState
          icon={<Library className="size-5" />}
          title="No books catalogued yet"
          description="Once your librarian adds books and copies, they'll appear here to browse and borrow."
        />
      ) : (
        <ul className="space-y-3">
          {books.data!.map((book) => (
            <li key={book.id} className="shelfi-surface flex items-center gap-4 p-4">
              <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary">
                {book.cover_url ? (
                  <img src={book.cover_url} alt="" className="size-full object-cover" />
                ) : (
                  <Library className="size-5 text-primary" />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{book.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {(book as { authors?: { name: string } | null }).authors?.name ??
                    book.subtitle ??
                    "Unknown author"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
