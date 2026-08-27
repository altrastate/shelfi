import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { getDigitalReadUrl } from "@/lib/digital.functions";
import { EmptyState, ErrorState } from "@/components/shelfi/states";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/read/$resourceId")({
  head: () => ({
    meta: [
      { title: "Reading — Shelfi" },
      { name: "description", content: "Read your school's digital books securely on Shelfi." },
      { property: "og:title", content: "Reading — Shelfi" },
      {
        property: "og:description",
        content: "Read your school's digital books securely on Shelfi.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReaderPage,
});

function ReaderPage() {
  const { resourceId } = Route.useParams();
  const fetchUrl = useServerFn(getDigitalReadUrl);

  const access = useQuery({
    queryKey: ["shelfi", "digital", "read", resourceId],
    queryFn: () => fetchUrl({ data: { resourceId } }),
    // signed link lives 15 minutes; refetch well before it expires
    staleTime: 10 * 60_000,
    retry: false,
  });

  return (
    <div className="flex min-h-[70vh] flex-col">
      <div className="mb-3 flex items-center justify-between gap-3">
        <Link
          to="/catalogue/$resourceId"
          params={{ resourceId }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to book
        </Link>
        <p className="truncate text-sm font-medium text-foreground">{access.data?.title ?? ""}</p>
      </div>

      {access.isLoading ? (
        <Skeleton className="h-[70vh] w-full rounded-xl" />
      ) : access.isError ? (
        <EmptyState
          title="You can't open this book"
          description={
            (access.error as Error)?.message?.replace(/^Error:\s*/, "") ??
            "This book isn't available to you right now."
          }
          action={
            <Button asChild variant="outline">
              <Link to="/catalogue">Back to digital library</Link>
            </Button>
          }
        />
      ) : !access.data?.url ? (
        <ErrorState message="This book's file is unavailable." />
      ) : (
        <object
          data={access.data.url}
          type="application/pdf"
          className="h-[75vh] w-full rounded-xl border border-border bg-card"
          aria-label={`${access.data.title} PDF reader`}
        >
          <div className="p-6 text-center text-sm text-muted-foreground">
            Your browser can't display this PDF inline.{" "}
            <a href={access.data.url} className="text-primary underline" rel="noreferrer">
              Open the book in a new tab
            </a>
            .
          </div>
        </object>
      )}
    </div>
  );
}
