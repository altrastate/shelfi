import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Clock, Library, ShieldX, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isActiveStaff, primaryRole, roleLabel, useSession } from "@/lib/session";
import {
  RESOURCE_CARD_COLUMNS,
  fetchProgressList,
  readingKeys,
  signCoverMap,
  type ReadingResource,
} from "@/lib/reading";
import { BookCard } from "@/components/shelfi/book-card";
import { EmptyState, LoadingList, PageHeader } from "@/components/shelfi/states";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Home — Shelfi" },
      { name: "description", content: "Your school library at a glance on Shelfi." },
      { property: "og:title", content: "Home — Shelfi" },
      { property: "og:description", content: "Your school library at a glance on Shelfi." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data: session, isLoading } = useSession();


  if (isLoading) return <LoadingList rows={2} />;

  // Platform administration is a platform-level surface, not a school one.
  if (session?.roles.includes("system_admin")) {
    return <Navigate to="/platform" replace />;
  }

  if (!session?.schoolId) {
    return (
      <>
        <PageHeader title="Welcome to Shelfi" description="One more step before you can start." />
        <EmptyState
          icon={<Users className="size-5" />}
          title="You're not linked to a school yet"
          description="Enter the join code from your school to request student or librarian access."
          action={
            <Link
              to="/account"
              className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              Enter join code
            </Link>
          }
        />
      </>
    );
  }

  if (session.status === "rejected") {
    return (
      <>
        <PageHeader title="Request declined" />
        <EmptyState
          icon={<ShieldX className="size-5" />}
          title="Your request was not approved"
          description={`${session.school?.name ?? "The school"} declined your access request. Speak to your school administrator, then request access again from your Account page.`}
        />
      </>
    );
  }

  if (session.status !== "active") {
    const asLibrarian = session.requestedRole === "librarian";
    return (
      <>
        <PageHeader title={`Hello${session.fullName ? `, ${session.fullName.split(" ")[0]}` : ""}`} />
        <EmptyState
          icon={<Clock className="size-5" />}
          title="Awaiting approval"
          description={
            asLibrarian
              ? "Your librarian account is awaiting approval from your school administrator. You can sign out and return later."
              : `Your request to join ${session.school?.name ?? "your school"} is with the school. You'll get access as soon as it's approved.`
          }
        />
        <div className="shelfi-surface mt-4 space-y-1 p-5 text-sm">
          <p className="text-foreground">{session.school?.name}</p>
          <p className="text-muted-foreground">
            {roleLabel[session.requestedRole ?? "student"]} · pending
          </p>
        </div>
      </>
    );
  }

  if (isActiveStaff(session)) {
    return (
      <>
        <PageHeader
          title={`${session.school?.name ?? "Your school"} library`}
          description="Your school workspace on Shelfi."
        />
        <section className="shelfi-surface space-y-2 p-5 text-sm">
          <Row label="School" value={session.school?.name ?? "—"} />
          <Row label="Name" value={session.fullName || "—"} />
          <Row label="Role" value={roleLabel[primaryRole(session.roles)]} />
          <Row label="Status" value={session.status} />
        </section>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Link to="/manage" className="shelfi-surface p-4 transition-shadow hover:shadow-lift">
            <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-primary">
              <Users className="size-4" />
            </span>
            <p className="mt-3 text-sm font-semibold text-foreground">Manage school</p>
            <p className="text-xs text-muted-foreground">Requests, librarians and students</p>
          </Link>
          <Link to="/library" className="shelfi-surface p-4 transition-shadow hover:shadow-lift">
            <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-primary">
              <Library className="size-4" />
            </span>
            <p className="mt-3 text-sm font-semibold text-foreground">Library</p>
            <p className="text-xs text-muted-foreground">School collection</p>
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={`Hello${session.fullName ? `, ${session.fullName.split(" ")[0]}` : ""}`}
        description={`${roleLabel[primaryRole(session.roles)]} · ${session.school?.name ?? ""}`}
      />
      <StudentHome />
    </>
  );
}

function StudentHome() {
  const { data: session } = useSession();
  const userId = session?.id;

  const progress = useQuery({
    queryKey: readingKeys.progressList(userId),
    enabled: Boolean(userId),
    queryFn: fetchProgressList,
    staleTime: 60_000,
  });

  const recentlyAdded = useQuery({
    queryKey: ["shelfi", "reading", "recently-added", session?.schoolId],
    enabled: Boolean(session?.schoolId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("digital_resources")
        .select(RESOURCE_CARD_COLUMNS)
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []) as unknown as ReadingResource[];
    },
  });

  const rows = progress.data ?? [];
  const covers = useQuery({
    queryKey: ["shelfi", "reading", "home-covers", userId, rows.length, recentlyAdded.data?.length],
    enabled: progress.isSuccess && recentlyAdded.isSuccess,
    staleTime: 30 * 60_000,
    queryFn: () =>
      signCoverMap([
        ...rows.map((p) => p.resource.cover_path),
        ...(recentlyAdded.data ?? []).map((r) => r.cover_path),
      ]),
  });

  if (progress.isLoading || recentlyAdded.isLoading) return <LoadingList rows={2} />;

  const cover = (r: ReadingResource) =>
    r.cover_path ? (covers.data?.get(r.cover_path) ?? null) : null;
  const continuing = rows.filter((p) => !p.completed_at && p.percent_complete > 0).slice(0, 6);
  const recent = rows.slice(0, 6);
  const added = recentlyAdded.data ?? [];

  return (
    <div className="space-y-8">
      {continuing.length > 0 ? (
        <HomeSection title="Continue reading">
          {continuing.map((p) => (
            <BookCard
              key={p.resource_id}
              resource={p.resource}
              coverUrl={cover(p.resource)}
              percent={Math.round(p.percent_complete)}
            />
          ))}
        </HomeSection>
      ) : (
        <EmptyState
          icon={<BookOpen className="size-5" />}
          title="Start your reading journey"
          description="Open a digital book from the library and Shelfi will remember exactly where you stopped."
          action={
            <Link
              to="/catalogue"
              className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              Explore library
            </Link>
          }
        />
      )}

      {recent.length > 0 ? (
        <HomeSection title="Recently read">
          {recent.map((p) => (
            <BookCard
              key={`r-${p.resource_id}`}
              resource={p.resource}
              coverUrl={cover(p.resource)}
              percent={Math.round(p.percent_complete)}
            />
          ))}
        </HomeSection>
      ) : null}

      {added.length > 0 ? (
        <HomeSection title="Recently added">
          {added.map((r) => (
            <BookCard key={`a-${r.id}`} resource={r} coverUrl={cover(r)} />
          ))}
        </HomeSection>
      ) : null}
    </div>
  );
}

function HomeSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-3 grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium capitalize text-foreground">{value}</span>
    </div>
  );
}
