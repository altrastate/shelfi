import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, CheckCircle2, Library } from "lucide-react";
import {
  familyKeys,
  fetchChildActivity,
  fetchMyChildren,
  linkStatusLabel,
} from "@/lib/family";
import { isParent, useSession } from "@/lib/session";
import { EmptyState, ErrorState, LoadingList, PageHeader } from "@/components/shelfi/states";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/family_/$studentId")({
  head: () => ({
    meta: [
      { title: "Child library activity — Shelfi" },
      {
        name: "description",
        content: "A read-only summary of your child's reading and borrowing.",
      },
      { property: "og:title", content: "Child library activity — Shelfi" },
      {
        property: "og:description",
        content: "A read-only summary of your child's reading and borrowing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChildDetail,
});

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function ChildDetail() {
  const { studentId } = Route.useParams();
  const { data: session, isLoading } = useSession();
  const parent = isParent(session);

  // Authorization is re-derived from the parent's approved relationships every
  // time a child is opened — a swapped id in the URL resolves to nothing.
  const children = useQuery({
    queryKey: familyKeys.children(session?.id),
    enabled: parent && Boolean(session?.id),
    staleTime: 60_000,
    queryFn: () => fetchMyChildren(session!.id),
  });

  const link = (children.data ?? []).find((c) => c.studentId === studentId);

  const activity = useQuery({
    queryKey: familyKeys.child(session?.id, studentId),
    enabled: Boolean(link && link.status === "active"),
    staleTime: 60_000,
    queryFn: () => fetchChildActivity(studentId),
  });

  if (isLoading || children.isLoading) return <LoadingList rows={3} />;
  if (session && !parent) return <Navigate to="/dashboard" replace />;

  if (!link) {
    return (
      <>
        <PageHeader title="Library activity" />
        <EmptyState
          icon={<BookOpen className="size-5" />}
          title="Not available"
          description="This student isn't connected to your account."
          action={
            <Link
              to="/family"
              className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              Back to family
            </Link>
          }
        />
      </>
    );
  }

  if (link.status !== "active") {
    return (
      <>
        <PageHeader title="Library activity" />
        <EmptyState
          icon={<BookOpen className="size-5" />}
          title={linkStatusLabel[link.status]}
          description={
            link.status === "pending"
              ? "Connection request awaiting school approval."
              : link.status === "rejected"
                ? "Your connection request was declined."
                : "Your connection to this student is no longer active."
          }
        />
      </>
    );
  }

  const name = link.fullName || "Your child";
  const openLoans = (activity.data?.loans ?? []).filter((l) => !l.returnedAt);
  const pastLoans = (activity.data?.loans ?? []).filter((l) => l.returnedAt).slice(0, 8);

  return (
    <>
      <Link
        to="/family"
        className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground"
      >
        <ArrowLeft className="size-4" /> Family
      </Link>

      <PageHeader
        title={name}
        description={[link.yearGroup, "Read-only library activity"].filter(Boolean).join(" · ")}
      />

      {activity.isLoading ? (
        <LoadingList rows={3} />
      ) : activity.isError ? (
        <ErrorState />
      ) : (
        <>
          <h2 className="mb-3 text-base">Reading</h2>
          {(activity.data?.currentlyReading ?? []).length === 0 ? (
            <EmptyState
              icon={<BookOpen className="size-5" />}
              title="Nothing in progress"
              description={`${name} hasn't started reading any Shelfi books yet.`}
            />
          ) : (
            <ul className="space-y-3">
              {activity.data!.currentlyReading.map((r) => (
                <li key={r.resourceId} className="shelfi-surface p-4">
                  <p className="text-sm font-semibold text-foreground">{r.title}</p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.min(100, Math.max(2, r.percent))}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {Math.round(r.percent)}% complete · last opened {formatDate(r.lastReadAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {(activity.data?.completed ?? []).length > 0 ? (
            <>
              <h2 className="mb-3 mt-8 text-base">Completed</h2>
              <ul className="space-y-2">
                {activity.data!.completed.map((c) => (
                  <li key={c.resourceId} className="shelfi-surface flex items-center gap-3 p-3">
                    <CheckCircle2 className="size-4 shrink-0 text-primary" />
                    <p className="min-w-0 flex-1 truncate text-sm text-foreground">{c.title}</p>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDate(c.at)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {(activity.data?.shelf ?? []).length > 0 ? (
            <>
              <h2 className="mb-3 mt-8 text-base">On My Shelf</h2>
              <ul className="space-y-2">
                {activity.data!.shelf.map((s) => (
                  <li key={s.resourceId} className="shelfi-surface flex items-center gap-3 p-3">
                    <BookOpen className="size-4 shrink-0 text-muted-foreground" />
                    <p className="min-w-0 flex-1 truncate text-sm text-foreground">{s.title}</p>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <h2 className="mb-3 mt-8 text-base">Physical library</h2>
          {openLoans.length === 0 ? (
            <EmptyState
              icon={<Library className="size-5" />}
              title="No books currently borrowed"
              description={`${name} has no library books out at the moment.`}
            />
          ) : (
            <ul className="space-y-3">
              {openLoans.map((l) => {
                const days = Math.ceil((new Date(l.dueAt).getTime() - Date.now()) / 86_400_000);
                const overdue = days < 0;
                return (
                  <li key={l.id} className="shelfi-surface flex items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{l.title}</p>
                      <p className="text-xs text-muted-foreground">Due {formatDate(l.dueAt)}</p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                        overdue
                          ? "bg-destructive/10 text-destructive"
                          : days <= 3
                            ? "bg-accent/20 text-accent-foreground"
                            : "bg-secondary text-primary",
                      )}
                    >
                      {overdue ? `${Math.abs(days)}d overdue` : days <= 3 ? "Due soon" : "On loan"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {pastLoans.length > 0 ? (
            <>
              <h2 className="mb-3 mt-8 text-base">Recent borrowing history</h2>
              <ul className="space-y-2">
                {pastLoans.map((l) => (
                  <li key={l.id} className="shelfi-surface flex items-center gap-3 p-3">
                    <p className="min-w-0 flex-1 truncate text-sm text-foreground">{l.title}</p>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      returned {l.returnedAt ? formatDate(l.returnedAt) : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <p className="mt-8 text-xs text-muted-foreground">
            Shelfi shows guardians a high-level summary only. Your child&rsquo;s Ask Shelfi
            conversations, notes and bookmarks stay private to them.
          </p>
        </>
      )}
    </>
  );
}
