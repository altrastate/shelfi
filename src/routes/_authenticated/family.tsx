import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { BookOpen, ChevronRight, Heart } from "lucide-react";
import {
  familyKeys,
  fetchChildActivity,
  fetchMyChildren,
  linkStatusLabel,
  linkStatusTone,
  relationshipLabel,
  type ChildLink,
} from "@/lib/family";
import { isParent, useSession } from "@/lib/session";
import { EmptyState, ErrorState, LoadingList, PageHeader } from "@/components/shelfi/states";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/family")({
  head: () => ({
    meta: [
      { title: "Family — Shelfi" },
      {
        name: "description",
        content: "Follow your child's school library reading and borrowing on Shelfi.",
      },
      { property: "og:title", content: "Family — Shelfi" },
      {
        property: "og:description",
        content: "Follow your child's school library reading and borrowing on Shelfi.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FamilyHome,
});

function daysUntil(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function ChildCard({ link }: { link: ChildLink }) {
  const active = link.status === "active";
  const activity = useQuery({
    queryKey: familyKeys.child(link.id, link.studentId),
    enabled: active,
    staleTime: 60_000,
    queryFn: () => fetchChildActivity(link.studentId),
  });

  const reading = activity.data?.currentlyReading?.[0];
  const openLoans = (activity.data?.loans ?? []).filter((l) => !l.returnedAt);
  const dueSoon = openLoans.filter((l) => daysUntil(l.dueAt) <= 3 && daysUntil(l.dueAt) >= 0).length;
  const overdue = openLoans.filter((l) => daysUntil(l.dueAt) < 0).length;

  return (
    <article className="shelfi-surface p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
          <Heart className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-lg font-semibold text-foreground">
            {active ? (link.fullName || "Your child") : "Pending connection"}
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            {[relationshipLabel[link.relationshipType] ?? "Guardian", active ? link.yearGroup : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
            linkStatusTone[link.status],
          )}
        >
          {linkStatusLabel[link.status]}
        </span>
      </div>

      {!active ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {link.status === "pending"
            ? "Connection request awaiting school approval."
            : link.status === "rejected"
              ? "Your connection request was declined. Please speak to the school library."
              : "Your connection to this student is no longer active."}
        </p>
      ) : activity.isLoading ? (
        <div className="mt-4">
          <LoadingList rows={1} />
        </div>
      ) : activity.isError ? (
        <div className="mt-4">
          <ErrorState />
        </div>
      ) : (
        <>
          <div className="mt-4 rounded-xl border border-border bg-secondary/30 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Currently reading
            </p>
            {reading ? (
              <>
                <p className="mt-1 text-sm font-semibold text-foreground">{reading.title}</p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.min(100, Math.max(2, reading.percent))}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {Math.round(reading.percent)}% complete
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                {(link.fullName || "Your child")} hasn&rsquo;t started reading any Shelfi books yet.
              </p>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
              {openLoans.length === 0
                ? "No books currently borrowed"
                : `${openLoans.length} physical book${openLoans.length === 1 ? "" : "s"} borrowed`}
            </span>
            {dueSoon > 0 ? (
              <span className="rounded-full bg-accent/20 px-2.5 py-1 text-accent-foreground">
                {dueSoon} due soon
              </span>
            ) : null}
            {overdue > 0 ? (
              <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-destructive">
                {overdue} overdue
              </span>
            ) : null}
          </div>

          <Link
            to="/family/$studentId"
            params={{ studentId: link.studentId }}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            View library activity <ChevronRight className="size-4" />
          </Link>
        </>
      )}
    </article>
  );
}

function FamilyHome() {
  const { data: session, isLoading } = useSession();
  const parent = isParent(session);

  const children = useQuery({
    queryKey: familyKeys.children(session?.id),
    enabled: parent && Boolean(session?.id),
    staleTime: 60_000,
    queryFn: () => fetchMyChildren(session!.id),
  });

  if (isLoading) return <LoadingList rows={2} />;
  if (session && !parent) return <Navigate to="/dashboard" replace />;

  return (
    <>
      <PageHeader
        title={`Welcome back, ${(session?.fullName || "").split(" ")[0] || "there"}`}
        description="A calm, read-only view of your child's school library."
      />

      {children.isLoading ? (
        <LoadingList rows={2} />
      ) : children.isError ? (
        <ErrorState />
      ) : (children.data ?? []).length === 0 ? (
        <EmptyState
          icon={<BookOpen className="size-5" />}
          title="No children connected yet"
          description="Your children haven't been connected to this account yet. Ask the school for the join code and your child for their guardian code, then add the connection from your account."
          action={
            <Link
              to="/account"
              className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              Connect a child
            </Link>
          }
        />
      ) : (
        <>
          <h2 className="mb-3 text-base">Your children</h2>
          <div className="space-y-4">
            {children.data!.map((link) => (
              <ChildCard key={link.id} link={link} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
