import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { daysOverdue, formatDate, isOverdue, libraryKeys, statusTone } from "@/lib/library";
import { EmptyState, ErrorState, LoadingList, PageHeader } from "@/components/shelfi/states";

export const Route = createFileRoute("/_authenticated/loans")({
  head: () => ({
    meta: [
      { title: "My loans — Shelfi" },
      { name: "description", content: "The library books you have out and your borrowing history." },
      { property: "og:title", content: "My loans — Shelfi" },
      {
        property: "og:description",
        content: "The library books you have out and your borrowing history.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyLoansPage,
});

type MyLoan = {
  id: string;
  borrowed_at: string;
  due_at: string;
  returned_at: string | null;
  status: string;
  physical_copies: { barcode: string | null; books: { title: string } | null } | null;
};

function MyLoansPage() {
  const { data: session } = useSession();

  const loans = useQuery({
    queryKey: libraryKeys.myLoans(session?.id),
    enabled: Boolean(session?.id),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("borrowings")
        .select(
          "id, borrowed_at, due_at, returned_at, status, physical_copies(barcode, books(title))",
        )
        .eq("borrower_id", session!.id)
        .order("borrowed_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as MyLoan[];
    },
  });

  const current = (loans.data ?? []).filter((l) => !l.returned_at);
  const past = (loans.data ?? []).filter((l) => l.returned_at);

  return (
    <>
      <PageHeader
        title="My loans"
        description="Books you currently have out, and everything you've borrowed before."
      />
      {loans.isLoading ? (
        <LoadingList />
      ) : loans.isError ? (
        <ErrorState />
      ) : (loans.data ?? []).length === 0 ? (
        <EmptyState
          icon={<BookOpen className="size-5" />}
          title="No loans yet"
          description="When your librarian issues you a book, it will show up here with its due date."
        />
      ) : (
        <div className="space-y-6">
          {current.length > 0 ? (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-foreground">Currently borrowed</h2>
              <ul className="space-y-2">
                {current.map((l) => (
                  <LoanRowItem key={l.id} loan={l} />
                ))}
              </ul>
            </section>
          ) : null}
          {past.length > 0 ? (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-foreground">History</h2>
              <ul className="space-y-2">
                {past.map((l) => (
                  <LoanRowItem key={l.id} loan={l} />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}

function LoanRowItem({ loan }: { loan: MyLoan }) {
  const over = isOverdue(loan);
  return (
    <li className="shelfi-surface flex items-start gap-3 p-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">
          {loan.physical_copies?.books?.title ?? "Unknown title"}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Borrowed {formatDate(loan.borrowed_at)} · due {formatDate(loan.due_at)}
          {loan.returned_at ? ` · returned ${formatDate(loan.returned_at)}` : ""}
        </p>
      </div>
      <span
        className={`rounded-full px-2 py-1 text-[11px] font-medium ${statusTone(
          over ? "overdue" : loan.returned_at ? "available" : "borrowed",
        )}`}
      >
        {over ? `${daysOverdue(loan.due_at)}d overdue` : loan.returned_at ? "Returned" : "On loan"}
      </span>
    </li>
  );
}
