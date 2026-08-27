import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookUp, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isActiveStaff, useSession } from "@/lib/session";
import {
  DIGITAL_BUCKET,
  DIGITAL_PAGE_SIZE,
  MAX_COVER_BYTES,
  MAX_PDF_BYTES,
  digitalKeys,
  digitalStatusLabel,
  digitalStatusTone,
  signCovers,
  type DigitalResource,
  type DigitalStatus,
} from "@/lib/digital";
import { EmptyState, ErrorState, LoadingList, PageHeader } from "@/components/shelfi/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/catalogue")({
  head: () => ({
    meta: [
      { title: "Digital library — Shelfi" },
      {
        name: "description",
        content: "Browse, search and read your school's digital books on Shelfi.",
      },
      { property: "og:title", content: "Digital library — Shelfi" },
      {
        property: "og:description",
        content: "Browse, search and read your school's digital books on Shelfi.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DigitalLibraryPage;
});

const SELECT_COLUMNS =
  "id, title, subtitle, author_name, description, subject, level, isbn, language, format, status, cover_path, storage_path, file_size, page_count, published_year, school_id, category_id, categories(name)";

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function DigitalLibraryPage() {
  const { data: session } = useSession();
  const staff = isActiveStaff(session);
  const schoolId = session?.schoolId ?? null;

  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState("all");
  const [level, setLevel] = useState("all");
  const [status, setStatus] = useState<DigitalStatus | "all">("all");
  const [page, setPage] = useState(0);
  const term = useDebounced(search);

  useEffect(() => {
    setPage(0);
  }, [term, subject, level, status]);

  const query = useQuery({
    queryKey: digitalKeys.list(schoolId, { term, subject, level, status, page, staff }),
    enabled: Boolean(schoolId),
    queryFn: async () => {
      let q = supabase
        .from("digital_resources")
        .select(SELECT_COLUMNS, { count: "exact" })
        .order("title")
        .range(page * DIGITAL_PAGE_SIZE, page * DIGITAL_PAGE_SIZE + DIGITAL_PAGE_SIZE - 1);

      if (!staff) q = q.eq("status", "published");
      else if (status !== "all") q = q.eq("status", status);

      if (term.trim()) {
        const like = `%${term.trim().replace(/[%,]/g, "")}%`;
        q = q.or(
          `title.ilike.${like},author_name.ilike.${like},subject.ilike.${like},description.ilike.${like}`,
        );
      }
      if (subject !== "all") q = q.eq("subject", subject);
      if (level !== "all") q = q.eq("level", level);

      const { data, error, count } = await q;
      if (error) throw error;
      const rows = (data ?? []) as unknown as DigitalResource[];
      const covers = await signCovers(rows.map((r) => r.cover_path));
      return { rows, count: count ?? 0, covers };
    },
  });

  const facets = useQuery({
    queryKey: ["shelfi", "digital", "facets", schoolId, staff],
    enabled: Boolean(schoolId),
    queryFn: async () => {
      let q = supabase.from("digital_resources").select("subject, level").limit(500);
      if (!staff) q = q.eq("status", "published");
      const { data } = await q;
      const subjects = [...new Set((data ?? []).map((r) => r.subject).filter(Boolean))] as string[];
      const levels = [...new Set((data ?? []).map((r) => r.level).filter(Boolean))] as string[];
      return { subjects: subjects.sort(), levels: levels.sort() };
    },
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / DIGITAL_PAGE_SIZE));

  if (!schoolId) {
    return (
      <>
        <PageHeader title="Digital library" />
        <EmptyState
          icon={<Sparkles className="size-5" />}
          title="Not linked to a school yet"
          description="Join a school with your join code to see its digital library."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Digital library"
        description={
          staff
            ? "Manage the digital books your school offers. Only published books reach students."
            : "Read your school's digital books on any device."
        }
        {...(staff ? { action: <AddDigitalBookDialog schoolId={schoolId} /> } : {})}
      />

      {staff ? <DigitalStats schoolId={schoolId} /> : null}

      <div className="mb-4 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, author or subject"
            className="pl-9"
            aria-label="Search the digital library"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={subject} onValueChange={setSubject}>
            <SelectTrigger className="w-[9.5rem]" aria-label="Filter by subject">
              <SelectValue placeholder="Subject" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All subjects</SelectItem>
              {(facets.data?.subjects ?? []).map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={level} onValueChange={setLevel}>
            <SelectTrigger className="w-[9rem]" aria-label="Filter by level or class">
              <SelectValue placeholder="Level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All levels</SelectItem>
              {(facets.data?.levels ?? []).map((l) => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {staff ? (
            <Select value={status} onValueChange={(v) => setStatus(v as DigitalStatus | "all")}>
              <SelectTrigger className="w-[9rem]" aria-label="Filter by status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          ) : null}
        </div>
      </div>

      {query.isLoading ? (
        <LoadingList />
      ) : query.isError ? (
        <ErrorState message="We couldn't load the digital library. Check your connection and try again." />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Sparkles className="size-5" />}
          title={term || subject !== "all" || level !== "all" ? "No matching books" : "No digital books yet"}
          description={
            term || subject !== "all" || level !== "all"
              ? "Try a different search term or clear the filters."
              : staff
                ? "Add your first digital book and publish it when it's ready for students."
                : "Your school hasn't published any digital books yet. Check back soon."
          }
        />
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  to="/catalogue/$resourceId"
                  params={{ resourceId: r.id }}
                  className="shelfi-surface block h-full overflow-hidden transition-shadow hover:shadow-lift"
                >
                  <div className="flex aspect-[3/4] items-center justify-center bg-secondary">
                    {r.cover_path && query.data?.covers.get(r.cover_path) ? (
                      <img
                        src={query.data.covers.get(r.cover_path)}
                        alt={`Cover of ${r.title}`}
                        loading="lazy"
                        decoding="async"
                        className="size-full object-cover"
                      />
                    ) : (
                      <Sparkles className="size-6 text-primary" />
                    )}
                  </div>
                  <div className="space-y-1 p-3">
                    <p className="line-clamp-2 text-sm font-semibold text-foreground">{r.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.author_name ?? "Unknown author"}
                    </p>
                    {staff ? (
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${digitalStatusTone(r.status)}`}
                      >
                        {digitalStatusLabel[r.status]}
                      </span>
                    ) : r.subject ? (
                      <span className="inline-block rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">
                        {r.subject}
                      </span>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {pages > 1 ? (
            <div className="mt-5 flex items-center justify-between">
              <Button
                variant="outline"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <p className="text-xs text-muted-foreground">
                Page {page + 1} of {pages}
              </p>
              <Button
                variant="outline"
                disabled={page + 1 >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}

function DigitalStats({ schoolId }: { schoolId: string }) {
  const stats = useQuery({
    queryKey: digitalKeys.stats(schoolId),
    queryFn: async () => {
      const counts = await Promise.all(
        (["draft", "published", "archived"] as DigitalStatus[]).map(async (s) => {
          const { count } = await supabase
            .from("digital_resources")
            .select("id", { count: "exact", head: true })
            .eq("status", s);
          return [s, count ?? 0] as const;
        }),
      );
      const map = Object.fromEntries(counts) as Record<DigitalStatus, number>;
      return { ...map, total: map.draft + map.published + map.archived };
    },
  });

  const tiles: { label: string; value: number }[] = [
    { label: "Total", value: stats.data?.total ?? 0 },
    { label: "Published", value: stats.data?.published ?? 0 },
    { label: "Draft", value: stats.data?.draft ?? 0 },
    { label: "Archived", value: stats.data?.archived ?? 0 },
  ];

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="shelfi-surface p-3">
          <p className="text-xl font-semibold text-foreground">{t.value}</p>
          <p className="text-xs text-muted-foreground">{t.label}</p>
        </div>
      ))}
    </div>
  );
}

type UploadStage = "idle" | "cover" | "file" | "saving";

function AddDigitalBookDialog({ schoolId }: { schoolId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [subject, setSubject] = useState("");
  const [level, setLevel] = useState("");
  const [isbn, setIsbn] = useState("");
  const [language, setLanguage] = useState("");
  const [description, setDescription] = useState("");
  const [pdf, setPdf] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [stage, setStage] = useState<UploadStage>("idle");

  const progress = useMemo(() => {
    switch (stage) {
      case "cover":
        return 25;
      case "file":
        return 60;
      case "saving":
        return 90;
      default:
        return 0;
    }
  }, [stage]);

  function reset() {
    setTitle("");
    setAuthor("");
    setSubject("");
    setLevel("");
    setIsbn("");
    setLanguage("");
    setDescription("");
    setPdf(null);
    setCover(null);
    setStage("idle");
  }

  const save = useMutation({
    mutationFn: async () => {
      if (title.trim().length < 2) throw new Error("Enter a book title.");
      if (!pdf) throw new Error("Select the PDF file for this book.");
      if (pdf.type !== "application/pdf" && !pdf.name.toLowerCase().endsWith(".pdf")) {
        throw new Error("Only PDF files are supported right now.");
      }
      if (pdf.size > MAX_PDF_BYTES) throw new Error("PDF files must be 100 MB or smaller.");
      if (cover && !cover.type.startsWith("image/")) throw new Error("The cover must be an image.");
      if (cover && cover.size > MAX_COVER_BYTES) throw new Error("Covers must be 5 MB or smaller.");

      const id = crypto.randomUUID();
      const uploaded: string[] = [];
      const storage = supabase.storage.from(DIGITAL_BUCKET);

      try {
        let coverPath: string | null = null;
        if (cover) {
          setStage("cover");
          const ext = cover.name.split(".").pop()?.toLowerCase() || "jpg";
          coverPath = `covers/${schoolId}/${id}/cover.${ext}`;
          const { error } = await storage.upload(coverPath, cover, {
            contentType: cover.type,
            upsert: true,
          });
          if (error) throw new Error("The cover image could not be uploaded. Please try again.");
          uploaded.push(coverPath);
        }

        setStage("file");
        const storagePath = `files/${schoolId}/${id}/book.pdf`;
        const { error: fileError } = await storage.upload(storagePath, pdf, {
          contentType: "application/pdf",
          upsert: true,
        });
        if (fileError) throw new Error("The PDF could not be uploaded. Please try again.");
        uploaded.push(storagePath);

        setStage("saving");
        const { error: insertError } = await supabase.from("digital_resources").insert({
          id,
          school_id: schoolId,
          source_type: "school",
          title: title.trim(),
          author_name: author.trim() || null,
          subject: subject.trim() || null,
          level: level.trim() || null,
          isbn: isbn.trim() || null,
          language: language.trim() || null,
          description: description.trim() || null,
          format: "pdf",
          status: "draft",
          is_active: false,
          storage_path: storagePath,
          cover_path: coverPath,
          file_size: pdf.size,
        });
        if (insertError) throw new Error("The book details could not be saved. Please try again.");
      } catch (err) {
        // never leave orphaned files behind when the record was not created
        if (uploaded.length) await storage.remove(uploaded);
        throw err;
      } finally {
        setStage("idle");
      }
    },
    onSuccess: async () => {
      toast.success("Digital book added as a draft. Publish it when it's ready.");
      reset();
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: digitalKeys.all });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!save.isPending) setOpen(v);
      }}
    >
      <Button onClick={() => setOpen(true)}>
        <BookUp className="mr-2 size-4" /> Add book
      </Button>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a digital book</DialogTitle>
          <DialogDescription>
            The book is saved as a draft. Students only see it once you publish it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Title" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Author">
              <Input value={author} onChange={(e) => setAuthor(e.target.value)} />
            </Field>
            <Field label="Subject">
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </Field>
            <Field label="Level / class">
              <Input value={level} onChange={(e) => setLevel(e.target.value)} />
            </Field>
            <Field label="Language">
              <Input value={language} onChange={(e) => setLanguage(e.target.value)} />
            </Field>
          </div>
          <Field label="ISBN">
            <Input value={isbn} onChange={(e) => setIsbn(e.target.value)} />
          </Field>
          <Field label="Description">
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <Field label="Cover image (optional, max 5 MB)">
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => setCover(e.target.files?.[0] ?? null)}
            />
          </Field>
          <Field label="PDF file (required, max 100 MB)" required>
            <Input
              type="file"
              accept="application/pdf"
              onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
            />
          </Field>
          {save.isPending ? (
            <div className="space-y-1">
              <Progress value={progress} />
              <p className="text-xs text-muted-foreground">
                {stage === "cover"
                  ? "Uploading cover…"
                  : stage === "file"
                    ? "Uploading PDF…"
                    : "Saving book details…"}
              </p>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Uploading…" : "Save draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {children}
    </div>
  );
}
