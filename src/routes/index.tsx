import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Library, ShieldCheck, Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Shelfi — The modern school library platform" },
      {
        name: "description",
        content:
          "Shelfi brings your school's physical shelves and digital reading together in one secure, mobile-first library platform.",
      },
      { property: "og:title", content: "Shelfi — The modern school library platform" },
      {
        property: "og:description",
        content:
          "Physical library management and digital reading for schools, in one secure multi-school platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const pillars = [
  {
    icon: Library,
    title: "Physical library",
    body: "Books, copies, categories and borrowing — organised for the way school libraries actually run.",
  },
  {
    icon: Sparkles,
    title: "Digital library",
    body: "School-provided resources alongside the licensed Shelfi catalogue, in one place.",
  },
  {
    icon: BookOpen,
    title: "My Shelf",
    body: "Every student gets a personal shelf with reading progress and bookmarks.",
  },
  {
    icon: ShieldCheck,
    title: "Safe by design",
    body: "Each school is fully isolated. Students join only through a school-controlled process.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Library className="size-4" />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">Shelfi</span>
        </div>
        <Link
          to="/auth"
          search={{}}
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
        >
          Sign in
        </Link>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 pb-20">
        <section className="py-10 sm:py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            School library platform
          </p>
          <h1 className="mt-3 text-4xl leading-tight sm:text-5xl">
            The whole school library, on every phone.
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted-foreground">
            Shelfi combines physical library management with digital reading access, built for
            schools that want one reliable, modern home for reading.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              to="/auth"
              search={{}}
              className="inline-flex min-h-12 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-soft transition-colors hover:bg-primary/90"
            >
              Get started
            </Link>
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="inline-flex min-h-12 items-center rounded-xl border border-border bg-card px-5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
            >
              Join with a school code
            </Link>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          {pillars.map((p) => (
            <article key={p.title} className="shelfi-surface p-5">
              <span className="flex size-10 items-center justify-center rounded-lg bg-secondary text-primary">
                <p.icon className="size-5" />
              </span>
              <h2 className="mt-4 text-lg">{p.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{p.body}</p>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
