import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isActiveStaff, useSession } from "@/lib/session";
import {
  DIGITAL_BUCKET,
  MAX_COVER_BYTES,
  MAX_PDF_BYTES,
  digitalKeys,
  digitalStatusLabel,
  digitalStatusTone,
  formatFileSize,
  type DigitalResource,
  type DigitalStatus,
} from "@/lib/digital";
import { EmptyState, ErrorState, LoadingList } from "@/components/shelfi/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/catalogue_/$resourceId")({
  head: () => ({
    meta: [
      { title: "Digital book — Shelfi" },
      { name: "description", content: "Digital book details and reading access on Shelfi." },
      { property: "og:title", content: "Digital book — Shelfi" },
      {
        property: "og:description",
        content: "Digital book details and reading access on Shelfi.",
      },
      { property: "og:type", content: "book" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DigitalBookPage,
});

function DigitalBookPage() {
  const { resourceId } = Route.useParams();
  const { data: session } = useSession();
  const staff = isActiveStaff(session);

  const detail = useQuery({
    queryKey: digitalKeys.detail(resourceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("digital_resources")
        .select(
          "id, title, subtitle, author_name, description, subject, level, isbn, language, format, status, cover_path, storage_path, file_size, page_count, published_year, school_id, category_id, categories(name)",
        )
        .eq("id", resourceId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const resource = data as unknown as DigitalResource;
      let coverUrl: string | null = null;
      if (resource.cover_path) {
        const { data: signed } = await supabase.storage
          .from(DIGITAL_BUCKET)
          .createSignedUrl(resource.cover_path, 3600);
        coverUrl = signed?.signedUrl ?? null;
      }
      return { resource, coverUrl };
    },
  });

  if (detail.isLoading) return <LoadingList rows={2} />;
  if (detail.isError) return <ErrorState message="We couldn't load this book right now." />;
  if (!detail.data) {
    return (
      <EmptyState
        icon={<Sparkles className="size-5" />}
        title="Book unavailable"
        description="This digital book doesn't exist, or it isn't available to your school."
        action={
          <Button asChild variant="outline">
            <Link to="/catalogue">Back to digital library</Link>
          </Button>
        }
      />
    );
  }

  const { resource, coverUrl } = detail.data;

  return (
    <>
      <Link
        to="/catalogue"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Digital library
      </Link>

      <div className="shelfi-surface flex gap-4 p-4">
        <div className="flex aspect-[3/4] w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={`Cover of ${resource.title}`}
              loading="lazy"
              className="size-full object-cover"
            />
          ) : (
            <Sparkles className="size-6 text-primary" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-foreground">{resource.title}</h1>
          {resource.subtitle ? (
            <p className="text-sm text-muted-foreground">{resource.subtitle}</p>
          ) : null}
          <p className="mt-1 text-sm text-muted-foreground">
            {resource.author_name ?? "Unknown author"}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {staff ? (
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${digitalStatusTone(resource.status)}`}
              >
                {digitalStatusLabel[resource.status]}
              </span>
            ) : null}
            {resource.subject ? <Chip>{resource.subject}</Chip> : null}
            {resource.level ? <Chip>{resource.level}</Chip> : null}
            {resource.categories?.name ? <Chip>{resource.categories.name}</Chip> : null}
          </div>
        </div>
      </div>

      {resource.status !== "published" && !staff ? (
        <div className="shelfi-surface mt-4 border-destructive/30 p-4 text-sm text-muted-foreground">
          This book isn't available to read at the moment.
        </div>
      ) : (
        <Button asChild className="mt-4 w-full" size="lg" disabled={!resource.storage_path}>
          <Link to="/read/$resourceId" params={{ resourceId: resource.id }}>
            <BookOpen className="mr-2 size-4" /> Read
          </Link>
        </Button>
      )}

      {resource.description ? (
        <section className="shelfi-surface mt-4 p-4">
          <h2 className="text-sm font-semibold text-foreground">About this book</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
            {resource.description}
          </p>
        </section>
      ) : null}

      <section className="shelfi-surface mt-4 space-y-1 p-4 text-sm">
        <Row label="Format" value={(resource.format ?? "PDF").toUpperCase()} />
        <Row label="Language" value={resource.language ?? "—"} />
        <Row label="ISBN" value={resource.isbn ?? "—"} />
        <Row label="File size" value={formatFileSize(resource.file_size)} />
      </section>

      {staff ? <StaffControls resource={resource} /> : null}
    </>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">
      {children}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function StaffControls({ resource }: { resource: DigitalResource }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [title, setTitle] = useState(resource.title);
  const [author, setAuthor] = useState(resource.author_name ?? "");
  const [subject, setSubject] = useState(resource.subject ?? "");
  const [level, setLevel] = useState(resource.level ?? "");
  const [description, setDescription] = useState(resource.description ?? "");
  const [replacement, setReplacement] = useState<File | null>(null);
  const [newCover, setNewCover] = useState<File | null>(null);

  useEffect(() => {
    setTitle(resource.title);
    setAuthor(resource.author_name ?? "");
    setSubject(resource.subject ?? "");
    setLevel(resource.level ?? "");
    setDescription(resource.description ?? "");
  }, [resource.id]);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: digitalKeys.all });
  }

  const saveMeta = useMutation({
    mutationFn: async () => {
      if (title.trim().length < 2) throw new Error("Enter a book title.");
      const { error } = await supabase
        .from("digital_resources")
        .update({
          title: title.trim(),
          author_name: author.trim() || null,
          subject: subject.trim() || null,
          level: level.trim() || null,
          description: description.trim() || null,
        })
        .eq("id", resource.id);
      if (error) throw new Error("Those changes could not be saved.");
    },
    onSuccess: async () => {
      toast.success("Book details updated.");
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async (status: DigitalStatus) => {
      if (status === "published" && !resource.storage_path) {
        throw new Error("Upload a PDF before publishing this book.");
      }
      const { error } = await supabase
        .from("digital_resources")
        .update({ status, is_active: status === "published" })
        .eq("id", resource.id);
      if (error) throw new Error("The status could not be changed.");
      return status;
    },
    onSuccess: async (status) => {
      toast.success(
        status === "published"
          ? "Published — students can now read this book."
          : status === "archived"
            ? "Archived — students can no longer see this book."
            : "Moved back to draft.",
      );
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const replaceFiles = useMutation({
    mutationFn: async () => {
      const storage = supabase.storage.from(DIGITAL_BUCKET);
      const schoolId = resource.school_id;
      if (!schoolId) throw new Error("This resource isn't owned by your school.");
      const update: {
        cover_path?: string;
        storage_path?: string;
        file_size?: number;
        format?: string;
      } = {};

      if (newCover) {
        if (!newCover.type.startsWith("image/")) throw new Error("The cover must be an image.");
        if (newCover.size > MAX_COVER_BYTES) throw new Error("Covers must be 5 MB or smaller.");
        const ext = newCover.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `covers/${schoolId}/${resource.id}/cover.${ext}`;
        const { error } = await storage.upload(path, newCover, {
          contentType: newCover.type,
          upsert: true,
        });
        if (error) throw new Error("The cover could not be uploaded.");
        update.cover_path = path;
      }

      if (replacement) {
        if (
          replacement.type !== "application/pdf" &&
          !replacement.name.toLowerCase().endsWith(".pdf")
        ) {
          throw new Error("Only PDF files are supported right now.");
        }
        if (replacement.size > MAX_PDF_BYTES) throw new Error("PDFs must be 100 MB or smaller.");
        const path = `files/${schoolId}/${resource.id}/book.pdf`;
        const { error } = await storage.upload(path, replacement, {
          contentType: "application/pdf",
          upsert: true,
        });
        if (error) throw new Error("The PDF could not be uploaded.");
        update.storage_path = path;
        update.file_size = replacement.size;
        update.format = "pdf";
      }

      if (Object.keys(update).length === 0) throw new Error("Choose a file to upload first.");
      const { error } = await supabase
        .from("digital_resources")
        .update(update)
        .eq("id", resource.id);
      if (error) throw new Error("The upload finished but the record could not be updated.");
    },
    onSuccess: async () => {
      toast.success("Files updated.");
      setReplacement(null);
      setNewCover(null);
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="shelfi-surface mt-4 space-y-4 p-4">
      <h2 className="text-sm font-semibold text-foreground">Staff controls</h2>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1.5">
          <Label className="text-xs">Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Author</Label>
          <Input value={author} onChange={(e) => setAuthor(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Subject</Label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Level / class</Label>
          <Input value={level} onChange={(e) => setLevel(e.target.value)} />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label className="text-xs">Description</Label>
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>
      <Button onClick={() => saveMeta.mutate()} disabled={saveMeta.isPending}>
        {saveMeta.isPending ? "Saving…" : "Save details"}
      </Button>

      <div className="space-y-2 border-t border-border pt-4">
        <Label className="text-xs">Replace cover image</Label>
        <Input
          type="file"
          accept="image/*"
          onChange={(e) => setNewCover(e.target.files?.[0] ?? null)}
        />
        <Label className="text-xs">Replace PDF file</Label>
        <Input
          type="file"
          accept="application/pdf"
          onChange={(e) => setReplacement(e.target.files?.[0] ?? null)}
        />
        <Button
          variant="outline"
          onClick={() => replaceFiles.mutate()}
          disabled={replaceFiles.isPending}
        >
          {replaceFiles.isPending ? "Uploading…" : "Upload files"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        {resource.status !== "published" ? (
          <Button onClick={() => setStatus.mutate("published")} disabled={setStatus.isPending}>
            Publish
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={() => setStatus.mutate("draft")}
            disabled={setStatus.isPending}
          >
            Unpublish
          </Button>
        )}
        {resource.status !== "archived" ? (
          <Button
            variant="outline"
            onClick={() => setStatus.mutate("archived")}
            disabled={setStatus.isPending}
          >
            Archive
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={() => setStatus.mutate("draft")}
            disabled={setStatus.isPending}
          >
            Restore to draft
          </Button>
        )}
        <Button variant="ghost" onClick={() => navigate({ to: "/catalogue" })}>
          Done
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Archiving keeps the record and file for your school's history — it only removes student
        access.
      </p>
    </section>
  );
}
