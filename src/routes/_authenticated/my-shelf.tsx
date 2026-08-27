import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Library } from "lucide-react";
import { useSession } from "@/lib/session";
import {
  fetchProgressList,
  fetchShelf,
  readingKeys,
  signCoverMap,
  type ReadingResource,
} from "@/lib/reading";
import { BookCard } from "@/components/shelfi/book-card";
import { EmptyState, ErrorState, LoadingList, PageHeader } from "@/components/shelfi/states";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/my-shelf")({
  head: () => ({
    meta: [
      { title: "My Shelf — Shelfi" },
      {
        name: "description",
        content: "Your saved books, reading progress and finished titles on Shelfi.",
      },
      { property: "og:title", content: "My Shelf — Shelfi" },
      {
        property: "og:description",
        content: "Your saved books, reading progress and finished titles on Shelfi.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyShelfPage,
});

function MyShelfPage() {
  const { data: session } = useSession();
  const userId = session?.id;

  const shelf = useQuery({
    queryKey: readingKeys.shelf(userId),
    enabled: Boolean(userId),
    queryFn: fetchShelf,
    staleTime: 60_000,
  });

  const progress = useQuery({
    queryKey: readingKeys.progressList(userId),
    enabled: Boolean(userId),
    queryFn: fetchProgressList,
    staleTime: 60_000,
  });

  const covers = useQuery({
    queryKey: ["shelfi", "reading", "covers", userId, shelf.data?.length, progress.data?.length],
    enabled: shelf.isSuccess && progress.isSuccess,
    staleTime: 30 * 60_000,
    queryFn: () =>
      signCoverMap([
        ...(shelf.data ?? []).map((s) => s.resource.cover_path),
        ...(progress.data ?? []).map((p) => p.resource.cover_path),
      ]),
  });

  if (shelf.isLoading || progress.isLoading) return <LoadingList rows={3} />;
  if (shelf.isError || progress.isError) return <ErrorState />;

  const cover = (r: ReadingResource) =>
    r.cover_path ? (covers.data?.get(r.cover_path) ?? null) : null;

  const rows = progress.data ?? [];
  const continuing = rows.filter((p) => !p.completed_at && p.percent_complete > 0).slice(0, 8);
  const completed = rows.filter((p) => p.completed_at);
  const recent = rows.slice(0, 8);
  const saved = shelf.data ?? [];

  if (saved.length === 0 && rows.length === 0) {
    return (
      <>
        <PageHeader title="My Shelf" description="Your books. Your reading journey." />
        <EmptyState
          icon={<Library className="size-5" />}
          title="Your shelf is waiting."
          description="Find a book in the library and save it here."
          action={
            <Button asChild size="lg">
              <Link to="/catalogue">Explore library</Link>
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title="My Shelf" description="Your books. Your reading journey." />

      {continuing.length > 0 ? (
        <Section title="Continue reading">
          {continuing.map((p) => (
            <BookCard
              key={p.resource_id}
              resource={p.resource}
              coverUrl={cover(p.resource)}
              percent={Math.round(p.percent_complete)}
            />
          ))}
        </Section>
      ) : null}

      {saved.length > 0 ? (
        <Section title="Saved books">
          {saved.map((item) => (
            <BookCard
              key={item.id}
              resource={item.resource}
              coverUrl={cover(item.resource)}
            />
          ))}
        </Section>
      ) : (
        <section className="mt-8">
          <h2 className="font-display text-lg font-semibold text-foreground">Saved books</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Nothing saved yet —{" "}
            <Link to="/catalogue" className="text-primary underline">
              explore the library
            </Link>
            .
          </p>
        </section>
      )}

      {recent.length > 0 ? (
        <Section title="Recently read">
          {recent.map((p) => (
            <BookCard
              key={`recent-${p.resource_id}`}
              resource={p.resource}
              coverUrl={cover(p.resource)}
              percent={Math.round(p.percent_complete)}
            />
          ))}
        </Section>
      ) : null}

      {completed.length > 0 ? (
        <Section title="Completed">
          {completed.map((p) => (
            <BookCard
              key={`done-${p.resource_id}`}
              resource={p.resource}
              coverUrl={cover(p.resource)}
              caption="Finished"
            />
          ))}
        </Section>
      ) : null}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-3 grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5">{children}</div>
    </section>
  );
}
