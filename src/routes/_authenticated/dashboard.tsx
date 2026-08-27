import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Clock, Library, ShieldX, Sparkles, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isActiveStaff, primaryRole, roleLabel, useSession } from "@/lib/session";
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

  const counts = useQuery({
    queryKey: ["shelfi", "dashboard-counts", session?.schoolId],
    enabled: Boolean(session?.schoolId) && session?.status === "active",
    queryFn: async () => {
      const [books, resources, shelf] = await Promise.all([
        supabase.from("books").select("id", { count: "exact", head: true }),
        supabase.from("digital_resources").select("id", { count: "exact", head: true }),
        supabase.from("shelf_items").select("id", { count: "exact", head: true }),
      ]);
      return {
        books: books.count ?? 0,
        resources: resources.count ?? 0,
        shelf: shelf.count ?? 0,
      };
    },
  });

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

  const tiles = [
    { to: "/library", label: "Physical books", value: counts.data?.books ?? 0, icon: Library },
    {
      to: "/catalogue",
      label: "Digital resources",
      value: counts.data?.resources ?? 0,
      icon: Sparkles,
    },
    { to: "/shelf", label: "On My Shelf", value: counts.data?.shelf ?? 0, icon: BookOpen },
  ];

  return (
    <>
      <PageHeader
        title={`Hello${session.fullName ? `, ${session.fullName.split(" ")[0]}` : ""}`}
        description={`${roleLabel[primaryRole(session.roles)]} · ${session.school?.name ?? ""}`}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiles.map((tile) => (
          <Link key={tile.to} to={tile.to} className="shelfi-surface p-4 transition-shadow hover:shadow-lift">
            <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-primary">
              <tile.icon className="size-4" />
            </span>
            <p className="mt-3 text-2xl font-semibold text-foreground">{tile.value}</p>
            <p className="text-sm text-muted-foreground">{tile.label}</p>
          </Link>
        ))}
      </div>
    </>
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
