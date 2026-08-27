import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Library, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isActiveStaff, useSession } from "@/lib/session";
import {
  conditionOptions,
  copyStatusLabel,
  formatDate,
  libraryKeys,
  statusTone,
  type CopyStatus,
} from "@/lib/library";
import { EmptyState, ErrorState, LoadingList, PageHeader } from "@/components/shelfi/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export const Route = createFileRoute("/_authenticated/books/$bookId")({
  head: () => ({
    meta: [
      { title: "Book details — Shelfi" },
      { name: "description", content: "Book metadata and the physical copies held for it." },
      { property: "og:title", content: "Book details — Shelfi" },
      {
        property: "og:description",
        content: "Book metadata and the physical copies held for it.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BookDetailPage,
});

type CopyRow = {
  id: string;
  barcode: string | null;
  status: CopyStatus;
  condition: string;
  shelf_location: string | null;
  acquired_on: string | null;
};

function BookDetailPage() {
  const { bookId } = Route.useParams();
  const { data: session } = useSession();
  const staff = isActiveStaff(session);

  const book = useQuery({
    queryKey: libraryKeys.book(bookId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("books")
        .select(
          "id, school_id, title, subtitle, isbn, subject, edition, language, shelf_location, description, published_year, cover_url, authors(name), categories(name), physical_copies(id, barcode, status, condition, shelf_location, acquired_on)",
        )
        .eq("id", bookId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (book.isLoading) return <LoadingList />;
  if (book.isError) return <ErrorState />;
  if (!book.data) {
    return (
      <EmptyState
        icon={<Library className="size-5" />}
        title="Book not found"
        description="This title isn't in your school's catalogue."
      />
    );
  }

  const b = book.data;
  const copies = ((b['physical_copies'] as CopyRow[] | null) ?? []).slice().sort((x, y) =>
    (x.barcode ?? "").localeCompare(y.barcode ?? ""),
  );
  const author = (b['authors'] as { name: string } | null)?.name;

  return (
    <>
      <Link
        to="/library"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Catalogue
      </Link>
      <PageHeader
        title={b.title}
        description={[author, b.subject, b.edition].filter(Boolean).join(" · ") || undefined}
        action={staff ? <AddCopiesDialog bookId={bookId} schoolId={b['school_id'] as string} /> : undefined}
      />

      <dl className="shelfi-surface mb-5 grid grid-cols-2 gap-3 p-4 text-sm">
        <Detail label="ISBN" value={b.isbn} />
        <Detail label="Published" value={b['published_year']?.toString() ?? null} />
        <Detail label="Language" value={b.language} />
        <Detail label="Shelf" value={b['shelf_location']} />
        <Detail label="Category" value={(b['categories'] as { name: string } | null)?.name ?? null} />
        <Detail label="Copies" value={String(copies.length)} />
      </dl>
      {b.description ? (
        <p className="mb-5 text-sm text-muted-foreground">{b.description}</p>
      ) : null}

      <h2 className="mb-3 text-sm font-semibold text-foreground">Physical copies</h2>
      {copies.length === 0 ? (
        <EmptyState
          icon={<Library className="size-5" />}
          title="No copies registered"
          description={
            staff
              ? "Add physical copies so this title can be issued at the desk."
              : "This title has no copies on the shelves yet."
          }
        />
      ) : (
        <ul className="space-y-2">
          {copies.map((copy) => (
            <li key={copy.id} className="shelfi-surface flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs text-foreground">
                  {copy.barcode ?? copy.id.slice(0, 8).toUpperCase()}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {copy.condition} · {copy.shelf_location ?? "no shelf"} · acquired{" "}
                  {formatDate(copy.acquired_on)}
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-1 text-[11px] font-medium ${statusTone(copy.status)}`}
              >
                {copyStatusLabel[copy.status]}
              </span>
              {staff ? <CopyStatusMenu copy={copy} /> : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value || "—"}</dd>
    </div>
  );
}

function CopyStatusMenu({ copy }: { copy: CopyRow }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"lost" | "damaged" | "archived" | "available">("lost");

  const update = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("set_copy_status", {
        _copy_id: copy.id,
        _status: status,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success(`Copy marked ${status}`);
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["shelfi", "library"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update this copy."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Update
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update copy status</DialogTitle>
          <DialogDescription>
            {copy.barcode ?? copy.id.slice(0, 8).toUpperCase()} — the copy and its history are kept,
            only its status changes. Lost, damaged and archived copies cannot be issued.
          </DialogDescription>
        </DialogHeader>
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="lost">Lost</SelectItem>
            <SelectItem value="damaged">Damaged</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
            <SelectItem value="available">Back to available</SelectItem>
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button onClick={() => update.mutate()} disabled={update.isPending}>
            {update.isPending ? "Updating…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddCopiesDialog({ bookId, schoolId }: { bookId: string; schoolId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState("1");
  const [prefix, setPrefix] = useState("");
  const [shelf, setShelf] = useState("");
  const [condition, setCondition] = useState<string>("good");

  const add = useMutation({
    mutationFn: async () => {
      const n = Math.min(Math.max(Number(count) || 0, 1), 100);
      const { count: existing } = await supabase
        .from("physical_copies")
        .select("id", { count: "exact", head: true })
        .eq("book_id", bookId);
      const start = existing ?? 0;
      const rows = Array.from({ length: n }, (_, i) => ({
        school_id: schoolId,
        book_id: bookId,
        barcode: prefix.trim() ? `${prefix.trim()}-${String(start + i + 1).padStart(3, "0")}` : null,
        shelf_location: shelf.trim() || null,
        condition,
        acquired_on: new Date().toISOString().slice(0, 10),
      }));
      const { error } = await supabase.from("physical_copies").insert(rows);
      if (error) throw error;
      return n;
    },
    onSuccess: async (n) => {
      toast.success(`${n} ${n === 1 ? "copy" : "copies"} added`);
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["shelfi", "library"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add copies."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          Add copies
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add physical copies</DialogTitle>
          <DialogDescription>Each copy gets its own identity and status.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="copy-count">Number of copies</Label>
            <Input
              id="copy-count"
              type="number"
              min={1}
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="copy-prefix">Barcode prefix (optional)</Label>
            <Input id="copy-prefix" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="copy-shelf">Shelf location</Label>
            <Input id="copy-shelf" value={shelf} onChange={(e) => setShelf(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="copy-cond">Condition</Label>
            <Select value={condition} onValueChange={setCondition}>
              <SelectTrigger id="copy-cond">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {conditionOptions.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c[0]!.toUpperCase() + c.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => add.mutate()} disabled={add.isPending}>
            {add.isPending ? "Adding…" : "Add copies"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
