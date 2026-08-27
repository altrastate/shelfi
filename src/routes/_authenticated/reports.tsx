import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, Download, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { isActiveStaff, useSession } from "@/lib/session";
import { formatDate } from "@/lib/library";
import { exportReportCsv, getLibraryReports } from "@/lib/reports.functions";
import type { LibraryReports, ReportPeriod } from "@/lib/reports.server";
import { EmptyState, ErrorState, LoadingList, PageHeader } from "@/components/shelfi/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Library reports — Shelfi" },
      {
        name: "description",
        content: "See how your school library is borrowed, read and used.",
      },
      { property: "og:title", content: "Library reports — Shelfi" },
      {
        property: "og:description",
        content: "See how your school library is borrowed, read and used.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});

const periodLabels: Record<ReportPeriod, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  year: "This year",
  all: "All time",
};

function ReportsPage() {
  const { data: session } = useSession();
  const staff = isActiveStaff(session);
  const [period, setPeriod] = useState<ReportPeriod>("30d");
  const fetchReports = useServerFn(getLibraryReports);

  const reports = useQuery({
    queryKey: ["shelfi", "reports", period],
    enabled: staff,
    staleTime: 60_000,
    queryFn: () => fetchReports({ data: { period } }) as Promise<LibraryReports>,
  });

  if (!staff) {
    return (
      <>
        <PageHeader title="Library reports" />
        <EmptyState
          icon={<BarChart3 className="size-5" />}
          title="Library staff only"
          description="Reports are available to your school's administrators and librarians."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Library reports"
        description="How your library is actually being borrowed and read."
        action={
          <Select value={period} onValueChange={(v) => setPeriod(v as ReportPeriod)}>
            <SelectTrigger className="h-11 w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(periodLabels) as ReportPeriod[]).map((p) => (
                <SelectItem key={p} value={p}>
                  {periodLabels[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {reports.isLoading ? (
        <LoadingList rows={4} />
      ) : reports.isError || !reports.data ? (
        <ErrorState
          {...((reports.error as Error | undefined)?.message
            ? { message: (reports.error as Error).message }
            : {})}
        />
      ) : (
        <ReportsBody data={reports.data} period={period} />
      )}
    </>
  );
}

function StatCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="shelfi-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Section({
  title,
  children,
  note,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {note ? <p className="mb-3 text-sm text-muted-foreground">{note}</p> : null}
      {children}
    </section>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="shelfi-surface px-4 py-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function ExportButtons({ period }: { period: ReportPeriod }) {
  const runExport = useServerFn(exportReportCsv);
  const [busy, setBusy] = useState<string | null>(null);

  const kinds = [
    { kind: "borrowings", label: "Borrowing history" },
    { kind: "overdue", label: "Overdue loans" },
    { kind: "physical-catalogue", label: "Physical catalogue" },
    { kind: "digital-catalogue", label: "Digital catalogue" },
    { kind: "reading-activity", label: "Reading activity" },
  ] as const;

  async function download(kind: string) {
    setBusy(kind);
    try {
      const res = (await runExport({ data: { kind, period } })) as {
        filename: string;
        csv: string;
      };
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {kinds.map((k) => (
        <Button
          key={k.kind}
          variant="outline"
          size="sm"
          className="min-h-11"
          disabled={busy === k.kind}
          onClick={() => download(k.kind)}
        >
          <Download className="mr-2 size-4" />
          {k.label}
        </Button>
      ))}
    </div>
  );
}

function LoanTable({
  rows,
  columns,
  empty,
}: {
  rows: LibraryReports["recentBorrowed"];
  columns: "borrowed" | "returned" | "overdue";
  empty: string;
}) {
  const [query, setQuery] = useState("");
  const filtered = rows.filter((r) =>
    `${r.title} ${r.student}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  if (rows.length === 0) return <Note>{empty}</Note>;

  return (
    <div className="space-y-3">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search book or member"
        className="h-11"
      />
      <div className="shelfi-surface divide-y divide-border">
        {filtered.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No matching records.
          </p>
        ) : (
          filtered.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{r.title}</p>
                <p className="text-xs text-muted-foreground">
                  {r.student}
                  {r.author ? ` · ${r.author}` : ""}
                </p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                {columns === "returned" ? (
                  <p>Returned {formatDate(r.returnedAt)}</p>
                ) : (
                  <p>
                    Borrowed {formatDate(r.borrowedAt)} · due {formatDate(r.dueAt)}
                  </p>
                )}
                <p className={r.daysOverdue > 0 ? "text-destructive" : ""}>
                  {r.daysOverdue > 0 ? `${r.daysOverdue} days overdue` : r.status}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ReportsBody({ data, period }: { data: LibraryReports; period: ReportPeriod }) {
  const noActivity =
    data.borrowingTrend.length === 0 &&
    data.mostRead.length === 0 &&
    data.recentBorrowed.length === 0;

  return (
    <div>
      <Section title="Physical library">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Titles" value={data.physical.titles} />
          <StatCard label="Copies" value={data.physical.copies} />
          <StatCard label="Available" value={data.physical.available} />
          <StatCard label="On loan" value={data.physical.borrowed} />
          <StatCard label="Overdue" value={data.physical.overdue} />
          <StatCard label="Lost" value={data.physical.lost} />
          <StatCard label="Damaged" value={data.physical.damaged} />
        </div>
      </Section>

      <Section title="Digital library">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Published books" value={data.digital.published} />
          <StatCard
            label="Recently added"
            value={data.digital.recentlyAdded}
            hint={periodLabels[period].toLowerCase()}
          />
          <StatCard label="Active readers" value={data.digital.activeReaders} />
          <StatCard label="Completed" value={data.digital.completed} />
        </div>
      </Section>

      <Section title="Reading">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Being read" value={data.reading.inProgress} />
          <StatCard label="Completed" value={data.reading.completed} />
          <StatCard label="Shelf items" value={data.reading.shelfItems} />
          <StatCard label="Reading sessions" value={data.reading.recentActivity} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Reading insights are aggregate only. Private bookmarks, notes and Ask Shelfi
          conversations are never shown here.
        </p>
      </Section>

      {noActivity ? (
        <Section title="Insights">
          <EmptyState
            icon={<TrendingUp className="size-5" />}
            title="No library activity yet"
            description="Once students borrow books and start reading, borrowing trends and popularity insights will appear here."
          />
        </Section>
      ) : (
        <Section title="Insights">
          <Tabs defaultValue="physical">
            <TabsList className="mb-4 w-full">
              <TabsTrigger value="physical" className="flex-1">
                Physical
              </TabsTrigger>
              <TabsTrigger value="digital" className="flex-1">
                Digital
              </TabsTrigger>
            </TabsList>

            <TabsContent value="physical" className="space-y-6">
              {data.borrowingTrend.length > 0 ? (
                <div className="shelfi-surface p-4">
                  <p className="mb-3 text-sm font-medium text-foreground">Borrowing activity</p>
                  <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.borrowingTrend}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={24} />
                        <ReTooltip />
                        <Bar
                          dataKey="count"
                          fill="hsl(var(--primary))"
                          radius={[4, 4, 0, 0]}
                          isAnimationActive={false}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : null}

              <div>
                <h3 className="mb-2 text-sm font-medium text-foreground">Most borrowed</h3>
                {data.mostBorrowed.length === 0 ? (
                  <Note>No borrowing activity yet.</Note>
                ) : (
                  <div className="shelfi-surface divide-y divide-border">
                    {data.mostBorrowed.map((b) => (
                      <div key={b.title} className="flex items-center justify-between gap-3 p-4">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{b.title}</p>
                          <p className="text-xs text-muted-foreground">{b.author ?? "—"}</p>
                        </div>
                        <span className="text-sm font-semibold text-primary">{b.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="mb-2 text-sm font-medium text-foreground">Recently borrowed</h3>
                <LoanTable
                  rows={data.recentBorrowed}
                  columns="borrowed"
                  empty="No borrowing activity yet."
                />
              </div>

              <div>
                <h3 className="mb-2 text-sm font-medium text-foreground">Recently returned</h3>
                <LoanTable
                  rows={data.recentReturned}
                  columns="returned"
                  empty="No returns recorded yet."
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-medium text-foreground">Overdue</h3>
                  <Button asChild variant="ghost" size="sm" className="min-h-11">
                    <Link to="/circulation">Open circulation desk</Link>
                  </Button>
                </div>
                <LoanTable rows={data.overdue} columns="overdue" empty="Nothing is overdue." />
              </div>
            </TabsContent>

            <TabsContent value="digital" className="space-y-6">
              <div>
                <h3 className="mb-2 text-sm font-medium text-foreground">Most read</h3>
                {data.mostRead.length === 0 ? (
                  <Note>Not enough reading activity yet.</Note>
                ) : (
                  <div className="shelfi-surface divide-y divide-border">
                    {data.mostRead.map((r) => (
                      <div key={r.title} className="flex items-center justify-between gap-3 p-4">
                        <p className="min-w-0 truncate text-sm font-medium text-foreground">
                          {r.title}
                        </p>
                        <span className="whitespace-nowrap text-xs text-muted-foreground">
                          {r.readers} readers · {r.completed} completed
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="mb-2 text-sm font-medium text-foreground">Recently accessed</h3>
                {data.recentlyAccessed.length === 0 ? (
                  <Note>Your digital library has no reading activity yet.</Note>
                ) : (
                  <div className="shelfi-surface divide-y divide-border">
                    {data.recentlyAccessed.map((r, i) => (
                      <div
                        key={`${r.title}-${i}`}
                        className="flex items-center justify-between gap-3 p-4"
                      >
                        <p className="min-w-0 truncate text-sm text-foreground">{r.title}</p>
                        <span className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDate(r.lastReadAt)} · {r.percent}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="mb-2 text-sm font-medium text-foreground">Popular subjects</h3>
                {data.popularSubjects.length === 0 ? (
                  <Note>Not enough reading activity yet.</Note>
                ) : (
                  <div className="shelfi-surface divide-y divide-border">
                    {data.popularSubjects.map((s) => (
                      <div key={s.label} className="flex items-center justify-between gap-3 p-4">
                        <p className="text-sm text-foreground">{s.label}</p>
                        <span className="text-sm font-semibold text-primary">{s.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </Section>
      )}

      <Section title="Export" note="Exports include your school's data only.">
        <ExportButtons period={period} />
      </Section>
    </div>
  );
}
