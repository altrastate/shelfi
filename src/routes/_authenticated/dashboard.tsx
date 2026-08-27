import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Library, Sparkles, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { primaryRole, roleLabel, useSession } from "@/lib/session";
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
    enabled: Boolean(session?.schoolId),
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

  if (!session?.schoolId) {
    return (
      <>
        <PageHeader title="Welcome to Shelfi" description="One more step before you can read." />
        <EmptyState
          icon={<Users className="size-5" />}
          title="You're not linked to a school yet"
          description="Enter the join code from your librarian to request access to your school library."
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

  if (session.status === "pending") {
    return (
      <>
        <PageHeader title={`Hello${session.fullName ? `, ${session.fullName}` : ""}`} />
        <EmptyState
          icon={<Users className="size-5" />}
          title="Waiting for approval"
          description={`Your request to join ${session.school?.name ?? "your school"} is with the librarian. You'll get access as soon as it's approved.`}
        />
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
