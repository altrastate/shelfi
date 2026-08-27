import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookPlus, Library, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isActiveStaff, useSession } from "@/lib/session";
import {
  libraryKeys,
  statusTone,
  type CopyStatus,
} from "@/lib/library";
import { EmptyState, ErrorState, LoadingList, PageHeader } from "@/components/shelfi/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/library")({
  head: () => ({
    meta: [
      { title: "Physical library — Shelfi" },
      {
        name: "description",
        content: "Catalogue, search and manage the books on your school's shelves.",
      },
      { property: "og:title", content: "Physical library — Shelfi" },
      {
        property: "og:description",
        content: "Catalogue, search and manage the books on your school's shelves.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LibraryPage,
});

type BookRow = {
  id: string;
  title: string;
  subtitle: string | null;
  isbn: string | null;
  subject: string | null;
  edition: string | null;
  shelf_location: string | null;
  cover_url: string | null;
  published_year: number | null;
  authors: { name: string } | null;
  categories: { id: string; name: string } | null;
  physical_copies: { id: string; status: CopyStatus }[];
};

const BOOK_SELECT =
  "id, title, subtitle, isbn, subject, edition, shelf_location, cover_url, published_year, authors(name), categories(id, name), physical_copies(id, status)";

function LibraryPage() {
  const { data: session } = useSession();
  const schoolId = session?.schoolId ?? null;
  const staff = isActiveStaff(session);
  const [search, setSearch] = useState("");
  const [availability, setAvailability] = useState<"all" | "available" | "borrowed">("all");
  const [subject, setSubject] = useState("all");

  const books = useQuery({
    queryKey: libraryKeys.books(schoolId),
    enabled: Boolean(schoolId),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("books")
        .select(BOOK_SELECT)
        .eq("school_id", schoolId!)
        .order("title")
        .limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as BookRow[];
    },
  });

  const subjects = useMemo(() => {
    const set = new Set<string>();
    for (const b of books.data ?? []) if (b.subject) set.add(b.subject);
    return [...set].sort();
  }, [books.data]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (books.data ?? []).filter((b) => {
      if (subject !== "all" && b.subject !== subject) return false;
      const counts = countCopies(b.physical_copies);
      if (availability === "available" && counts.available === 0) return false;
      if (availability === "borrowed" && counts.borrowed === 0) return false;
      if (!term) return true;
      return (
        b.title.toLowerCase().includes(term) ||
        (b.authors?.name ?? "").toLowerCase().includes(term) ||
        (b.isbn ?? "").toLowerCase().includes(term) ||
        (b.subject ?? "").toLowerCase().includes(term) ||
        (b.categories?.name ?? "").toLowerCase().includes(term)
      );
    });
  }, [books.data, search, availability, subject]);

  if (!schoolId) {
    return (
      <>
        <PageHeader title="Physical library" />
        <EmptyState
          icon={<Library className="size-5" />}
          title="No school yet"
          description="Join a school with your join code to see its library."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Physical library"
        description={
          staff
            ? "Catalogue, copies and availability across your shelves."
            : "Browse the books held on your school's shelves."
        }
        action={staff ? <AddBookDialog schoolId={schoolId} /> : undefined}
      />

      {staff ? <LibraryStats schoolId={schoolId} /> : null}

      <div className="mb-4 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, author, ISBN or subject"
            className="pl-9"
            aria-label="Search the catalogue"
          />
        </div>
        <div className="flex gap-2">
          <Select value={availability} onValueChange={(v) => setAvailability(v as typeof availability)}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Availability" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All availability</SelectItem>
              <SelectItem value="available">Has available copies</SelectItem>
              <SelectItem value="borrowed">Has borrowed copies</SelectItem>
            </SelectContent>
          </Select>
          <Select value={subject} onValueChange={setSubject}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Subject" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All subjects</SelectItem>
              {subjects.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {books.isLoading ? (
        <LoadingList />
      ) : books.isError ? (
        <ErrorState />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Library className="size-5" />}
          title={(books.data ?? []).length === 0 ? "No books catalogued yet" : "No matches"}
          description={
            (books.data ?? []).length === 0
              ? staff
                ? "Add your first book title, then register its physical copies."
                : "Once your librarian adds books, they'll appear here."
              : "Try a different search term or clear the filters."
          }
        />
      ) : (
        <ul className="space-y-3">
          {filtered.map((book) => {
            const counts = countCopies(book.physical_copies);
            return (
              <li key={book.id}>
                <Link
                  to="/books/$bookId"
                  params={{ bookId: book.id }}
                  className="shelfi-surface flex items-center gap-4 p-4 transition-colors hover:border-primary/40"
                >
                  <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary">
                    {book.cover_url ? (
                      <img src={book.cover_url} alt="" className="size-full object-cover" />
                    ) : (
                      <Library className="size-5 text-primary" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{book.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {book.authors?.name ?? book.subtitle ?? "Unknown author"}
                      {book.subject ? ` · ${book.subject}` : ""}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {counts.total} {counts.total === 1 ? "copy" : "copies"} · {counts.available}{" "}
                      available · {counts.borrowed} on loan
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-[11px] font-medium ${statusTone(
                      counts.available > 0 ? "available" : "borrowed",
                    )}`}
                  >
                    {counts.available > 0 ? "Available" : "All out"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function countCopies(copies: { status: CopyStatus }[]) {
  const total = copies.length;
  const available = copies.filter((c) => c.status === "available").length;
  const borrowed = copies.filter((c) => c.status === "borrowed").length;
  return { total, available, borrowed };
}

function LibraryStats({ schoolId }: { schoolId: string }) {
  const stats = useQuery({
    queryKey: libraryKeys.stats(schoolId),
    staleTime: 30_000,
    queryFn: async () => {
      const [titles, copies, overdue] = await Promise.all([
        supabase
          .from("books")
          .select("id", { count: "exact", head: true })
          .eq("school_id", schoolId),
        supabase.from("physical_copies").select("status").eq("school_id", schoolId).limit(5000),
        supabase
          .from("borrowings")
          .select("id", { count: "exact", head: true })
          .eq("school_id", schoolId)
          .is("returned_at", null)
          .lt("due_at", new Date().toISOString()),
      ]);
      const byStatus = new Map<string, number>();
      for (const c of copies.data ?? [])
        byStatus.set(c.status, (byStatus.get(c.status) ?? 0) + 1);
      return {
        titles: titles.count ?? 0,
        copies: (copies.data ?? []).length,
        available: byStatus.get("available") ?? 0,
        borrowed: byStatus.get("borrowed") ?? 0,
        lost: byStatus.get("lost") ?? 0,
        damaged: byStatus.get("damaged") ?? 0,
        overdue: overdue.count ?? 0,
      };
    },
  });

  const items: [string, number][] = stats.data
    ? [
        ["Titles", stats.data.titles],
        ["Copies", stats.data.copies],
        ["Available", stats.data.available],
        ["On loan", stats.data.borrowed],
        ["Overdue", stats.data.overdue],
        ["Lost", stats.data.lost],
        ["Damaged", stats.data.damaged],
      ]
    : [];

  if (!stats.data) return null;

  return (
    <div className="mb-5 grid grid-cols-3 gap-2 sm:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label} className="shelfi-surface px-3 py-2">
          <p className="text-lg font-semibold text-foreground">{value}</p>
          <p className="text-[11px] text-muted-foreground">{label}</p>
        </div>
      ))}
    </div>
  );
}

function AddBookDialog({ schoolId }: { schoolId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    author: "",
    isbn: "",
    subject: "",
    edition: "",
    publishedYear: "",
    language: "",
    shelfLocation: "",
    description: "",
    copies: "1",
    barcodePrefix: "",
    condition: "good",
  });

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const create = useMutation({
    mutationFn: async () => {
      const title = form.title.trim();
      if (!title) throw new Error("A book title is required.");
      const copies = Math.min(Math.max(Number(form.copies) || 0, 0), 100);

      let authorId: string | null = null;
      const authorName = form.author.trim();
      if (authorName) {
        const { data: existing } = await supabase
          .from("authors")
          .select("id")
          .eq("school_id", schoolId)
          .ilike("name", authorName)
          .maybeSingle();
        if (existing) authorId = existing.id;
        else {
          const { data, error } = await supabase
            .from("authors")
            .insert({ school_id: schoolId, name: authorName })
            .select("id")
            .single();
          if (error) throw error;
          authorId = data.id;
        }
      }

      const { data: book, error } = await supabase
        .from("books")
        .insert({
          school_id: schoolId,
          title,
          author_id: authorId,
          isbn: form.isbn.trim() || null,
          subject: form.subject.trim() || null,
          edition: form.edition.trim() || null,
          language: form.language.trim() || null,
          shelf_location: form.shelfLocation.trim() || null,
          description: form.description.trim() || null,
          published_year: form.publishedYear ? Number(form.publishedYear) : null,
        })
        .select("id, title")
        .single();
      if (error) throw error;

      if (copies > 0) {
        const prefix = form.barcodePrefix.trim();
        const rows = Array.from({ length: copies }, (_, i) => ({
          school_id: schoolId,
          book_id: book.id,
          barcode: prefix ? `${prefix}-${String(i + 1).padStart(3, "0")}` : null,
          shelf_location: form.shelfLocation.trim() || null,
          condition: form.condition,
          acquired_on: new Date().toISOString().slice(0, 10),
        }));
        const { error: copyError } = await supabase.from("physical_copies").insert(rows);
        if (copyError) throw copyError;
      }
      return { book, copies };
    },
    onSuccess: async ({ book, copies }) => {
      toast.success(`${book.title} added with ${copies} ${copies === 1 ? "copy" : "copies"}`);
      setForm((f) => ({
        ...f,
        title: "",
        author: "",
        isbn: "",
        edition: "",
        publishedYear: "",
        description: "",
        barcodePrefix: "",
        copies: "1",
      }));
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["shelfi", "library"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not add this book."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <BookPlus className="size-4" />
          Add book
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add a book</DialogTitle>
          <DialogDescription>
            Save the title and register its physical copies in one step.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Field label="Title" required value={form.title} onChange={set("title")} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Author" value={form.author} onChange={set("author")} />
            <Field label="Subject" value={form.subject} onChange={set("subject")} />
            <Field label="ISBN" value={form.isbn} onChange={set("isbn")} />
            <Field label="Edition" value={form.edition} onChange={set("edition")} />
            <Field
              label="Published year"
              type="number"
              value={form.publishedYear}
              onChange={set("publishedYear")}
            />
            <Field label="Language" value={form.language} onChange={set("language")} />
            <Field
              label="Shelf location"
              value={form.shelfLocation}
              onChange={set("shelfLocation")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="book-description">Description</Label>
            <Textarea
              id="book-description"
              rows={2}
              value={form.description}
              onChange={(e) => set("description")(e.target.value)}
            />
          </div>

          <div className="rounded-lg border border-border p-3">
            <p className="mb-3 text-sm font-medium text-foreground">Physical copies</p>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Number of copies"
                type="number"
                value={form.copies}
                onChange={set("copies")}
              />
              <div className="space-y-2">
                <Label htmlFor="copy-condition">Condition</Label>
                <Select value={form.condition} onValueChange={set("condition")}>
                  <SelectTrigger id="copy-condition">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["new", "good", "fair", "poor"].map((c) => (
                      <SelectItem key={c} value={c}>
                        {c[0]!.toUpperCase() + c.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-3">
              <Field
                label="Barcode prefix (optional)"
                value={form.barcodePrefix}
                onChange={set("barcodePrefix")}
                hint="Copies get -001, -002 … appended."
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={create.isPending || !form.title.trim()}>
              {create.isPending ? "Saving…" : "Save book"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  hint?: string;
}) {
  const id = `field-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
