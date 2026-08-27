import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeftRight, BookOpen, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isActiveStaff, useSession } from "@/lib/session";
import {
  daysOverdue,
  fetchLoans,
  formatDate,
  isOverdue,
  libraryKeys,
  statusTone,
} from "@/lib/library";
import { EmptyState, ErrorState, LoadingList, PageHeader } from "@/components/shelfi/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/circulation")({
  head: () => ({
    meta: [
      { title: "Circulation desk — Shelfi" },
      { name: "description", content: "Issue and return books, and track overdue loans." },
      { property: "og:title", content: "Circulation desk — Shelfi" },
      {
        property: "og:description",
        content: "Issue and return books, and track overdue loans.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CirculationPage,
});

function CirculationPage() {
  const { data: session } = useSession();
  const staff = isActiveStaff(session);
  const schoolId = session?.schoolId ?? null;

  if (!staff || !schoolId) {
    return (
      <>
        <PageHeader title="Circulation desk" />
        <EmptyState
          icon={<ArrowLeftRight className="size-5" />}
          title="Library staff only"
          description="Issuing and returning books is handled by your school's librarians."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Circulation desk"
        description="Issue, return and chase the books on loan."
      />
      <Tabs defaultValue="issue">
        <TabsList className="mb-4 w-full">
          <TabsTrigger value="issue" className="flex-1">
            Issue
          </TabsTrigger>
          <TabsTrigger value="return" className="flex-1">
            Return
          </TabsTrigger>
          <TabsTrigger value="overdue" className="flex-1">
            Overdue
          </TabsTrigger>
          <TabsTrigger value="history" className="flex-1">
            History
          </TabsTrigger>
        </TabsList>
        <TabsContent value="issue">
          <IssueTab schoolId={schoolId} />
        </TabsContent>
        <TabsContent value="return">
          <ReturnTab schoolId={schoolId} />
        </TabsContent>
        <TabsContent value="overdue">
          <LoanList schoolId={schoolId} scope="overdue" />
        </TabsContent>
        <TabsContent value="history">
          <LoanList schoolId={schoolId} scope="history" />
        </TabsContent>
      </Tabs>
    </>
  );
}

function defaultDueDate() {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}

function IssueTab({ schoolId }: { schoolId: string }) {
  const queryClient = useQueryClient();
  const [memberSearch, setMemberSearch] = useState("");
  const [memberId, setMemberId] = useState<string | null>(null);
  const [copySearch, setCopySearch] = useState("");
  const [copyId, setCopyId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState(defaultDueDate());

  const members = useQuery({
    queryKey: libraryKeys.members(schoolId),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, year_group, student_identifier, status")
        .eq("school_id", schoolId)
        .eq("status", "active")
        .order("full_name")
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const copies = useQuery({
    queryKey: ["shelfi", "library", "available-copies", schoolId],
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("physical_copies")
        .select("id, barcode, shelf_location, books(id, title, isbn, authors(name))")
        .eq("school_id", schoolId)
        .eq("status", "available")
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const memberMatches = useMemo(() => {
    const t = memberSearch.trim().toLowerCase();
    const list = members.data ?? [];
    if (!t) return list.slice(0, 8);
    return list
      .filter(
        (m) =>
          (m['full_name'] as string).toLowerCase().includes(t) ||
          (m['student_identifier'] ?? "").toLowerCase().includes(t),
      )
      .slice(0, 8);
  }, [members.data, memberSearch]);

  const copyMatches = useMemo(() => {
    const t = copySearch.trim().toLowerCase();
    const list = copies.data ?? [];
    if (!t) return list.slice(0, 8);
    return list
      .filter((c) => {
        const book = c['books'] as
          | { title: string; isbn: string | null; authors: { name: string } | null }
          | null;
        return (
          (c.barcode ?? "").toLowerCase().includes(t) ||
          (book?.title ?? "").toLowerCase().includes(t) ||
          (book?.isbn ?? "").toLowerCase().includes(t) ||
          (book?.authors?.name ?? "").toLowerCase().includes(t)
        );
      })
      .slice(0, 8);
  }, [copies.data, copySearch]);

  const selectedMember = (members.data ?? []).find((m) => m.id === memberId);
  const selectedCopy = (copies.data ?? []).find((c) => c.id === copyId);

  const issue = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("issue_copy", {
        _copy_id: copyId!,
        _borrower_id: memberId!,
        _due_at: new Date(`${dueDate}T23:59:59`).toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Book issued");
      setCopyId(null);
      setCopySearch("");
      await queryClient.invalidateQueries({ queryKey: ["shelfi", "library"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not issue this copy."),
  });

  return (
    <div className="space-y-4">
      <section className="shelfi-surface p-4">
        <p className="mb-2 text-sm font-semibold text-foreground">1. Member</p>
        {selectedMember ? (
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-foreground">
                {selectedMember['full_name'] as string}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {(selectedMember['student_identifier'] as string | null) ??
                  (selectedMember['year_group'] as string | null) ??
                  "Member"}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setMemberId(null)}>
              Change
            </Button>
          </div>
        ) : (
          <>
            <SearchInput
              value={memberSearch}
              onChange={setMemberSearch}
              placeholder="Search members by name or student ID"
            />
            <ul className="mt-2 space-y-1">
              {memberMatches.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setMemberId(m.id)}
                    className="min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary"
                  >
                    <span className="text-foreground">{m['full_name'] as string}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {(m['student_identifier'] as string | null) ??
                        (m['year_group'] as string | null) ??
                        ""}
                    </span>
                  </button>
                </li>
              ))}
              {memberMatches.length === 0 ? (
                <li className="px-3 py-2 text-xs text-muted-foreground">No members found.</li>
              ) : null}
            </ul>
          </>
        )}
      </section>

      <section className="shelfi-surface p-4">
        <p className="mb-2 text-sm font-semibold text-foreground">2. Available copy</p>
        {selectedCopy ? (
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-foreground">
                {(selectedCopy['books'] as { title: string } | null)?.title}
              </p>
              <p className="truncate font-mono text-xs text-muted-foreground">
                {selectedCopy.barcode ?? selectedCopy.id.slice(0, 8).toUpperCase()}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setCopyId(null)}>
              Change
            </Button>
          </div>
        ) : (
          <>
            <SearchInput
              value={copySearch}
              onChange={setCopySearch}
              placeholder="Search title, author, ISBN or copy barcode"
            />
            <ul className="mt-2 space-y-1">
              {copyMatches.map((c) => {
                const book = c['books'] as { title: string } | null;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setCopyId(c.id)}
                      className="min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary"
                    >
                      <span className="text-foreground">{book?.title ?? "Untitled"}</span>
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        {c.barcode ?? c.id.slice(0, 8).toUpperCase()}
                      </span>
                    </button>
                  </li>
                );
              })}
              {copyMatches.length === 0 ? (
                <li className="px-3 py-2 text-xs text-muted-foreground">
                  No available copies match.
                </li>
              ) : null}
            </ul>
          </>
        )}
      </section>

      <section className="shelfi-surface space-y-3 p-4">
        <div className="space-y-2">
          <Label htmlFor="due-date">3. Due date</Label>
          <Input
            id="due-date"
            type="date"
            value={dueDate}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <Button
          className="w-full"
          disabled={!memberId || !copyId || issue.isPending}
          onClick={() => issue.mutate()}
        >
          {issue.isPending ? "Issuing…" : "Confirm issue"}
        </Button>
      </section>
    </div>
  );
}

function ReturnTab({ schoolId }: { schoolId: string }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [outcome, setOutcome] = useState<Record<string, string>>({});

  const loans = useQuery({
    queryKey: libraryKeys.loans(schoolId, "active"),
    staleTime: 10_000,
    queryFn: () => fetchLoans({ schoolId, scope: "active", limit: 200 }),
  });

  const matches = useMemo(() => {
    const t = search.trim().toLowerCase();
    const list = loans.data ?? [];
    if (!t) return list;
    return list.filter(
      (l) =>
        l.borrowerName.toLowerCase().includes(t) ||
        (l.physical_copies?.books?.title ?? "").toLowerCase().includes(t) ||
        (l.physical_copies?.barcode ?? "").toLowerCase().includes(t),
    );
  }, [loans.data, search]);

  const ret = useMutation({
    mutationFn: async ({ copyId, result }: { copyId: string; result: string }) => {
      const { error } = await supabase.rpc("return_copy", {
        _copy_id: copyId,
        _outcome: result,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Return recorded");
      await queryClient.invalidateQueries({ queryKey: ["shelfi", "library"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not record this return."),
  });

  if (loans.isLoading) return <LoadingList />;
  if (loans.isError) return <ErrorState />;

  return (
    <div className="space-y-4">
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search by member, title or copy barcode"
      />
      {matches.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="size-5" />}
          title={(loans.data ?? []).length === 0 ? "Nothing on loan" : "No matching loans"}
          description={
            (loans.data ?? []).length === 0
              ? "Books you issue will appear here ready to be returned."
              : "Try the member's name or the copy barcode."
          }
        />
      ) : (
        <ul className="space-y-2">
          {matches.map((loan) => {
            const copyId = loan.physical_copies?.id;
            const over = isOverdue(loan);
            return (
              <li key={loan.id} className="shelfi-surface space-y-3 p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {loan.physical_copies?.books?.title ?? "Unknown title"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {loan.borrowerName} · {loan.physical_copies?.barcode ?? "no barcode"}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Borrowed {formatDate(loan.borrowed_at)} · due {formatDate(loan.due_at)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-[11px] font-medium ${statusTone(
                      over ? "overdue" : "borrowed",
                    )}`}
                  >
                    {over ? `${daysOverdue(loan.due_at)}d overdue` : "On loan"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Select
                    value={outcome[loan.id] ?? "returned"}
                    onValueChange={(v) => setOutcome((o) => ({ ...o, [loan.id]: v }))}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="returned">Returned in good order</SelectItem>
                      <SelectItem value="damaged">Returned damaged</SelectItem>
                      <SelectItem value="lost">Reported lost</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    disabled={!copyId || ret.isPending}
                    onClick={() =>
                      copyId &&
                      ret.mutate({ copyId, result: outcome[loan.id] ?? "returned" })
                    }
                  >
                    Confirm
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function LoanList({ schoolId, scope }: { schoolId: string; scope: "overdue" | "history" }) {
  const loans = useQuery({
    queryKey: libraryKeys.loans(schoolId, scope),
    staleTime: 15_000,
    queryFn: () => fetchLoans({ schoolId, scope, limit: scope === "history" ? 100 : 200 }),
  });

  if (loans.isLoading) return <LoadingList />;
  if (loans.isError) return <ErrorState />;
  if ((loans.data ?? []).length === 0) {
    return (
      <EmptyState
        icon={scope === "overdue" ? <AlertTriangle className="size-5" /> : <BookOpen className="size-5" />}
        title={scope === "overdue" ? "Nothing overdue" : "No borrowing history yet"}
        description={
          scope === "overdue"
            ? "Every book on loan is still within its due date."
            : "Issued and returned books will be listed here."
        }
      />
    );
  }

  return (
    <ul className="space-y-2">
      {loans.data!.map((loan) => {
        const over = isOverdue(loan);
        return (
          <li key={loan.id} className="shelfi-surface flex items-start gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">
                {loan.physical_copies?.books?.title ?? "Unknown title"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {loan.borrowerName} · {loan.physical_copies?.barcode ?? "no barcode"}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Out {formatDate(loan.borrowed_at)} · due {formatDate(loan.due_at)}
                {loan.returned_at ? ` · returned ${formatDate(loan.returned_at)}` : ""}
                {loan.issuedByName ? ` · by ${loan.issuedByName}` : ""}
              </p>
            </div>
            <span
              className={`rounded-full px-2 py-1 text-[11px] font-medium ${statusTone(
                over ? "overdue" : loan.returned_at ? "available" : "borrowed",
              )}`}
            >
              {over
                ? `${daysOverdue(loan.due_at)}d overdue`
                : loan.returned_at
                  ? loan.status === "lost"
                    ? "Lost"
                    : "Returned"
                  : "On loan"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9"
        aria-label={placeholder}
      />
    </div>
  );
}
