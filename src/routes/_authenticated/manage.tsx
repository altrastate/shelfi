import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Users, Heart } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isActiveStaff, isSchoolAdmin, roleLabel, useSession } from "@/lib/session";
import { listSchoolJoinRequests } from "@/lib/staff.functions";
import { listParentLinkRequests } from "@/lib/family.functions";
import { familyKeys, relationshipLabel } from "@/lib/family";
import { EmptyState, ErrorState, LoadingList, PageHeader } from "@/components/shelfi/states";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/manage")({
  head: () => ({
    meta: [
      { title: "Manage school — Shelfi" },
      { name: "description", content: "School tools for members and join requests." },
      { property: "og:title", content: "Manage school — Shelfi" },
      { property: "og:description", content: "School tools for members and join requests." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManagePage,
});

const statusTone: Record<string, string> = {
  active: "bg-secondary text-primary",
  pending: "bg-muted text-muted-foreground",
  rejected: "bg-destructive/10 text-destructive",
  revoked: "bg-destructive/10 text-destructive",
  suspended: "bg-destructive/10 text-destructive",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-medium capitalize",
        statusTone[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {status}
    </span>
  );
}

function ManagePage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const staff = isActiveStaff(session);
  const schoolAdmin = isSchoolAdmin(session);
  const fetchRequests = useServerFn(listSchoolJoinRequests);

  const requests = useQuery({
    queryKey: ["shelfi", "join-requests", session?.schoolId],
    enabled: staff,
    queryFn: () => fetchRequests(),
  });

  const fetchParentLinks = useServerFn(listParentLinkRequests);
  const parentLinks = useQuery({
    queryKey: familyKeys.requests(session?.schoolId),
    enabled: staff,
    queryFn: () => fetchParentLinks(),
  });

  async function reviewParentLink(id: string, approve: boolean) {
    const { error } = await supabase.rpc("review_parent_link", {
      _relationship_id: id,
      _approve: approve,
    });
    if (error) {
      toast.error(error.message.replace(/^.*ERROR:\s*/, "") || "Could not update that request.");
      return;
    }
    toast.success(approve ? "Guardian connected" : "Request rejected");
    await queryClient.invalidateQueries({ queryKey: ["shelfi"] });
  }

  async function revokeParentLink(id: string) {
    const { error } = await supabase.rpc("revoke_parent_link", { _relationship_id: id });
    if (error) {
      toast.error(error.message.replace(/^.*ERROR:\s*/, "") || "Could not revoke that connection.");
      return;
    }
    toast.success("Connection revoked");
    await queryClient.invalidateQueries({ queryKey: ["shelfi"] });
  }

  const members = useQuery({
    queryKey: ["shelfi", "members", session?.schoolId],
    enabled: staff && Boolean(session?.schoolId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, status, year_group, student_identifier")
        .eq("school_id", session!.schoolId!)
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  async function review(requestId: string, approve: boolean) {
    const { error } = await supabase.rpc("review_join_request", {
      _request_id: requestId,
      _approve: approve,
    });
    if (error) {
      toast.error(error.message.replace(/^.*ERROR:\s*/, "") || "Could not update that request.");
      return;
    }
    toast.success(approve ? "Request approved" : "Request rejected");
    await queryClient.invalidateQueries({ queryKey: ["shelfi"] });
  }

  async function setStatus(id: string, status: "active" | "suspended") {
    const { error } = await supabase.from("profiles").update({ status }).eq("id", id);
    if (error) {
      toast.error("Could not update that member.");
      return;
    }
    toast.success(status === "active" ? "Member activated" : "Member suspended");
    await queryClient.invalidateQueries({ queryKey: ["shelfi", "members"] });
  }

  if (!staff) {
    return (
      <>
        <PageHeader title="Manage school" />
        <EmptyState
          icon={<Users className="size-5" />}
          title="School staff access required"
          description="This area is only available to your school's administrator or an approved librarian."
        />
      </>
    );
  }

  const pending = (requests.data ?? []).filter((r) => r.status === "pending");
  const reviewed = (requests.data ?? []).filter((r) => r.status !== "pending");

  return (
    <>
      <PageHeader
        title="Manage school"
        description={`Requests and members for ${session?.school?.name ?? "your school"}.`}
      />

      {session?.school?.join_code ? (
        <section className="shelfi-surface mb-5 p-4">
          <p className="text-xs text-muted-foreground">School join code</p>
          <p className="mt-1 font-mono text-lg tracking-widest text-primary">
            {session.school.join_code}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Share only with students and librarians who should join this school.
          </p>
        </section>
      ) : null}

      <h2 className="mb-3 text-base">Pending requests</h2>
      {requests.isLoading ? (
        <LoadingList />
      ) : requests.isError ? (
        <ErrorState />
      ) : pending.length === 0 ? (
        <EmptyState
          icon={<Users className="size-5" />}
          title="No pending requests"
          description="New student and librarian requests for your school appear here."
        />
      ) : (
        <ul className="space-y-3">
          {pending.map((r) => (
            <li key={r.id} className="shelfi-surface space-y-3 p-4">
              <div>
                <p className="text-sm font-semibold text-foreground">{r.fullName}</p>
                <p className="truncate text-xs text-muted-foreground">{r.email ?? "—"}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {roleLabel[r.requestedRole]} · {r.schoolName} ·{" "}
                  {new Date(r.requestedAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill status={r.status} />
                <span className="flex-1" />
                {schoolAdmin ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => review(r.id, false)}>
                      Reject
                    </Button>
                    <Button size="sm" onClick={() => review(r.id, true)}>
                      Approve
                    </Button>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Awaiting school administrator
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {reviewed.length > 0 ? (
        <>
          <h2 className="mb-3 mt-8 text-base">Reviewed</h2>
          <ul className="space-y-2">
            {reviewed.map((r) => (
              <li key={r.id} className="shelfi-surface flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{r.fullName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {roleLabel[r.requestedRole]} · {new Date(r.requestedAt).toLocaleDateString()}
                  </p>
                </div>
                <StatusPill status={r.status} />
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h2 className="mb-3 mt-8 text-base">Guardian connections</h2>
      {parentLinks.isLoading ? (
        <LoadingList />
      ) : parentLinks.isError ? (
        <ErrorState />
      ) : (parentLinks.data ?? []).length === 0 ? (
        <EmptyState
          icon={<Heart className="size-5" />}
          title="No guardian requests"
          description="Parent and guardian connection requests for your students appear here."
        />
      ) : (
        <ul className="space-y-3">
          {parentLinks.data!.map((p) => (
            <li key={p.id} className="shelfi-surface space-y-3 p-4">
              <div>
                <p className="text-sm font-semibold text-foreground">{p.parentName}</p>
                <p className="truncate text-xs text-muted-foreground">{p.parentEmail ?? "\u2014"}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {relationshipLabel[p.relationshipType] ?? "Guardian"} of {p.studentName}
                  {p.studentYearGroup ? ` \u00b7 ${p.studentYearGroup}` : ""} \u00b7{" "}
                  {new Date(p.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={p.status} />
                <span className="flex-1" />
                {p.status === "pending" ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => reviewParentLink(p.id, false)}>
                      Reject
                    </Button>
                    <Button size="sm" onClick={() => reviewParentLink(p.id, true)}>
                      Approve
                    </Button>
                  </>
                ) : p.status === "active" ? (
                  <Button variant="outline" size="sm" onClick={() => revokeParentLink(p.id)}>
                    Revoke
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mb-3 mt-8 text-base">Members</h2>
      {members.isLoading ? (
        <LoadingList />
      ) : members.isError ? (
        <ErrorState />
      ) : (members.data ?? []).length === 0 ? (
        <EmptyState
          icon={<Users className="size-5" />}
          title="No members yet"
          description="Approved students and librarians appear here."
        />
      ) : (
        <ul className="space-y-3">
          {members.data!.map((m) => (
            <li key={m.id} className="shelfi-surface flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {m.full_name || "Unnamed member"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {[m['student_identifier'], m.year_group].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              <StatusPill status={m.status} />
              {schoolAdmin ? (
                m.status === "active" ? (
                  <Button variant="outline" size="sm" onClick={() => setStatus(m.id, "suspended")}>
                    Suspend
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setStatus(m.id, "active")}>
                    Activate
                  </Button>
                )
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
