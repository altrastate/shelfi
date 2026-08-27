import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bookmark,
  BookmarkCheck,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  X,
  Sparkles,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { getDigitalReadUrl } from "@/lib/digital.functions";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import {
  fetchBookmarks,
  fetchProgress,
  readingKeys,
  saveProgress,
  type BookmarkRow,
} from "@/lib/reading";
import { EmptyState } from "@/components/shelfi/states";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { AskShelfiPanel } from "@/components/shelfi/ask-shelfi";
import { useIsMobile } from "@/hooks/use-mobile";

export const Route = createFileRoute("/_authenticated/read/$resourceId")({
  head: () => ({
    meta: [
      { title: "Shelfi Reader" },
      { name: "description", content: "Read your school's digital books securely on Shelfi." },
      { property: "og:title", content: "Shelfi Reader" },
      {
        property: "og:description",
        content: "Read your school's digital books securely on Shelfi.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReaderPage,
});

type PdfDoc = { numPages: number; getPage: (n: number) => Promise<any> };

function ReaderPage() {
  const { resourceId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const fetchUrl = useServerFn(getDigitalReadUrl);

  const access = useQuery({
    queryKey: ["shelfi", "digital", "read", resourceId],
    queryFn: () => fetchUrl({ data: { resourceId } }),
    staleTime: 10 * 60_000,
    retry: false,
  });

  const progress = useQuery({
    queryKey: readingKeys.progress(session?.id, resourceId),
    enabled: Boolean(session?.id),
    queryFn: () => fetchProgress(resourceId),
    staleTime: 60_000,
  });

  const bookmarks = useQuery({
    queryKey: readingKeys.bookmarks(session?.id, resourceId),
    enabled: Boolean(session?.id),
    queryFn: () => fetchBookmarks(resourceId, session?.id),
    staleTime: 60_000,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const docRef = useRef<PdfDoc | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const restoredRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ page: 1, total: 0 });

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [docReady, setDocReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const isMobile = useIsMobile();

  /**
   * Text of the page the student is on — extracted in the browser from the PDF
   * already loaded for reading, so no extra file access or storage change is
   * needed. Cached per page so repeat questions don't re-extract.
   */
  const pageTextCache = useRef(new Map<number, string>());
  const getPageText = useCallback(async (): Promise<string | null> => {
    const cached = pageTextCache.current.get(page);
    if (cached !== undefined) return cached || null;
    const doc = docRef.current;
    if (!doc) return null;
    try {
      const pdfPage = await doc.getPage(page);
      const content = await pdfPage.getTextContent();
      const text = (content.items as { str?: string }[])
        .map((i) => i.str ?? "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      pageTextCache.current.set(page, text);
      return text || null;
    } catch {
      return null;
    }
  }, [page]);

  // Load the PDF only once the signed URL is available.
  useEffect(() => {
    const url = access.data?.url;
    if (!url) return;
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = (
          await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
        ).default;
        const doc = (await pdfjs.getDocument({ url }).promise) as unknown as PdfDoc;
        if (cancelled) return;
        docRef.current = doc;
        setTotal(doc.numPages);
        setDocReady(true);
      } catch {
        if (!cancelled) setLoadError("We couldn't open this book's file.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [access.data?.url]);

  // Restore the saved reading position once, after the document is ready.
  useEffect(() => {
    if (!docReady || restoredRef.current || progress.isLoading) return;
    restoredRef.current = true;
    const saved = progress.data?.current_page ?? 1;
    if (saved > 1 && saved <= (docRef.current?.numPages ?? 1)) {
      setPage(saved);
      toast.success(`Resumed at page ${saved}`);
    }
  }, [docReady, progress.isLoading, progress.data?.current_page]);

  // Render the current page.
  const render = useCallback(async () => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas) return;
    const pdfPage = await doc.getPage(page);
    const container = canvas.parentElement;
    const available = (container?.clientWidth ?? 360) - 8;
    const base = pdfPage.getViewport({ scale: 1 });
    const scale = (available / base.width) * zoom;
    const viewport = pdfPage.getViewport({ scale });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    renderTaskRef.current?.cancel();
    const task = pdfPage.render({
      canvasContext: ctx,
      viewport,
      transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
    });
    renderTaskRef.current = task;
    try {
      await task.promise;
    } catch {
      /* superseded render */
    }
  }, [page, zoom]);

  useEffect(() => {
    if (!docReady) return;
    void render();
  }, [docReady, render]);

  useEffect(() => {
    if (!docReady) return;
    const onResize = () => void render();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [docReady, render]);

  // Persist progress: debounced while reading, and once on leaving.
  latest.current = { page, total };
  const persist = useCallback(async () => {
    if (!session?.id || !session.schoolId || latest.current.total === 0) return;
    try {
      await saveProgress({
        userId: session.id,
        schoolId: session.schoolId,
        resourceId,
        page: latest.current.page,
        totalPages: latest.current.total,
      });
      await queryClient.invalidateQueries({ queryKey: readingKeys.all });
    } catch {
      /* progress saving must never interrupt reading */
    }
  }, [session?.id, session?.schoolId, resourceId, queryClient]);

  useEffect(() => {
    if (!docReady || !restoredRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void persist(), 2500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [page, docReady, persist]);

  useEffect(() => {
    return () => {
      void persist();
    };
  }, [persist]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setPage((p) => Math.min(total || p, p + 1));
      if (e.key === "ArrowLeft") setPage((p) => Math.max(1, p - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total]);

  const currentBookmark = (bookmarks.data ?? []).find((b) => b.page === page);

  async function toggleBookmark() {
    if (!session?.id || !session.schoolId) return;
    try {
      if (currentBookmark) {
        const { error } = await supabase.from("bookmarks").delete().eq("id", currentBookmark.id).eq("user_id", session.id);
        if (error) throw error;
        toast.success("Bookmark removed.");
      } else {
        const { error } = await supabase.from("bookmarks").insert({
          user_id: session.id,
          school_id: session.schoolId,
          resource_id: resourceId,
          page,
        });
        // A rapid double-tap hits the one-bookmark-per-page rule; that is a
        // no-op for the student, not an error.
        if (error && !/duplicate key/i.test(error.message)) throw error;
        toast.success(`Page ${page} bookmarked.`);
      }
      await queryClient.invalidateQueries({
        queryKey: readingKeys.bookmarks(session.id, resourceId),
      });
    } catch {
      toast.error("We couldn't update that bookmark.");
    }
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setFullscreen(false);
      } else {
        await document.documentElement.requestFullscreen();
        setFullscreen(true);
      }
    } catch {
      /* not supported on this device */
    }
  }

  const percent = total > 0 ? Math.min(100, Math.round((page / total) * 100)) : 0;

  if (access.isError) {
    return (
      <EmptyState
        title="You can't open this book"
        description={
          (access.error as Error)?.message?.replace(/^Error:\s*/, "") ??
          "This book isn't available to you right now."
        }
        action={
          <Button onClick={() => navigate({ to: "/catalogue" })} variant="outline">
            Back to digital library
          </Button>
        }
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Top bar */}
      <header className="flex items-center gap-2 border-b border-border px-2 py-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-11"
          aria-label="Close reader"
          onClick={() => {
            void persist();
            navigate({ to: "/catalogue/$resourceId", params: { resourceId } });
          }}
        >
          <X className="size-5" />
        </Button>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {access.data?.title ?? "Loading…"}
        </p>
        <Button
          variant="ghost"
          size="icon"
          className="size-11"
          aria-label={currentBookmark ? "Remove bookmark" : "Bookmark this page"}
          onClick={() => void toggleBookmark()}
        >
          {currentBookmark ? (
            <BookmarkCheck className="size-5 text-primary" />
          ) : (
            <Bookmark className="size-5" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-11"
          aria-label="Ask Shelfi about this page"
          onClick={() => setAskOpen((v) => !v)}
        >
          <Sparkles className={askOpen ? "size-5 text-primary" : "size-5"} />
        </Button>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="size-11" aria-label="View bookmarks">
              <span className="text-xs font-semibold">{(bookmarks.data ?? []).length}</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[85vw] sm:w-96">
            <SheetHeader>
              <SheetTitle>Bookmarks</SheetTitle>
            </SheetHeader>
            <BookmarkList
              items={bookmarks.data ?? []}
              onOpen={(p) => setPage(p)}
              onRemove={async (id) => {
                await supabase.from("bookmarks").delete().eq("id", id);
                await queryClient.invalidateQueries({
                  queryKey: readingKeys.bookmarks(session?.id, resourceId),
                });
              }}
            />
          </SheetContent>
        </Sheet>
      </header>

      {/* Progress */}
      <div className="h-1 w-full bg-secondary">
        <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
      </div>

      {/* Book */}
      <div className="flex min-h-0 flex-1">
      <div className="flex-1 overflow-auto bg-muted/40 p-1">
        {access.isLoading || (!docReady && !loadError) ? (
          <Skeleton className="mx-auto h-[70vh] w-full max-w-3xl rounded-xl" />
        ) : loadError ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {loadError}{" "}
            {access.data?.url ? (
              <a href={access.data.url} className="text-primary underline" rel="noreferrer">
                Open the PDF directly
              </a>
            ) : null}
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-3xl justify-center">
            <canvas ref={canvasRef} className="rounded-lg bg-white shadow-sm" />
          </div>
        )}
      </div>

        {askOpen && !isMobile ? (
          <AskShelfiPanel
            resourceId={resourceId}
            bookTitle={access.data?.title ?? "this book"}
            page={page}
            getPageText={getPageText}
            onClose={() => setAskOpen(false)}
            className="w-[380px] shrink-0 border-l"
          />
        ) : null}
      </div>

      {askOpen && isMobile ? (
        <div className="fixed inset-x-0 bottom-0 z-50 h-[72vh] rounded-t-2xl border-t border-border bg-card shadow-lg">
          <AskShelfiPanel
            resourceId={resourceId}
            bookTitle={access.data?.title ?? "this book"}
            page={page}
            getPageText={getPageText}
            onClose={() => setAskOpen(false)}
            className="h-full rounded-t-2xl"
          />
        </div>
      ) : null}

      {/* Bottom controls */}
      <footer className="flex items-center justify-between gap-2 border-t border-border px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <Button
          variant="ghost"
          size="icon"
          className="size-11"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          <ChevronLeft className="size-5" />
        </Button>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-11"
            aria-label="Zoom out"
            onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(1)))}
          >
            <ZoomOut className="size-4" />
          </Button>
          <span className="min-w-24 text-center text-xs font-medium text-muted-foreground">
            {total ? `${page} / ${total}` : "—"}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-11"
            aria-label="Zoom in"
            onClick={() => setZoom((z) => Math.min(3, +(z + 0.2).toFixed(1)))}
          >
            <ZoomIn className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-11"
            aria-label={fullscreen ? "Exit full screen" : "Full screen"}
            onClick={() => void toggleFullscreen()}
          >
            {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-11"
          aria-label="Next page"
          disabled={total === 0 || page >= total}
          onClick={() => setPage((p) => Math.min(total, p + 1))}
        >
          <ChevronRight className="size-5" />
        </Button>
      </footer>
    </div>
  );
}

function BookmarkList({
  items,
  onOpen,
  onRemove,
}: {
  items: BookmarkRow[];
  onOpen: (page: number) => void;
  onRemove: (id: string) => Promise<void>;
}) {
  if (items.length === 0) {
    return (
      <p className="mt-6 text-sm text-muted-foreground">
        No bookmarks yet. Tap the bookmark icon while reading to save your place.
      </p>
    );
  }
  return (
    <ul className="mt-4 space-y-2">
      {items.map((b) => (
        <li key={b.id} className="flex items-center gap-2 rounded-xl border border-border p-3">
          <button
            className="min-h-11 flex-1 text-left text-sm font-medium text-foreground"
            onClick={() => onOpen(b.page ?? 1)}
          >
            Page {b.page ?? 1}
            {b.note ? (
              <span className="block text-xs font-normal text-muted-foreground">{b.note}</span>
            ) : null}
          </button>
          <Button variant="ghost" size="sm" onClick={() => void onRemove(b.id)}>
            Remove
          </Button>
        </li>
      ))}
    </ul>
  );
}
