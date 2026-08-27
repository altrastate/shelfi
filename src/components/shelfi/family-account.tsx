import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  familyKeys,
  fetchMyChildren,
  fetchMyGuardians,
  linkStatusLabel,
  linkStatusTone,
  relationshipLabel,
} from "@/lib/family";
import { requestParentLink } from "@/lib/family.functions";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const RELATIONSHIPS = ["mother", "father", "guardian", "other"] as const;

/** Student-side: the private code a child shares with a parent, generated on demand. */
export function GuardianCodeSection() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const code = useQuery({
    queryKey: ["shelfi", "family", "guardian-code", session?.id],
    enabled: Boolean(session?.id),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("guardian_code")
        .eq("id", session!.id)
        .maybeSingle();
      return (data?.["guardian_code"] as string | null) ?? null;
    },
  });

  const guardians = useQuery({
    queryKey: familyKeys.guardians(session?.id),
    enabled: Boolean(session?.id),
    staleTime: 60_000,
    queryFn: () => fetchMyGuardians(session!.id),
  });

  async function generate() {
    setBusy(true);
    const { data, error } = await supabase.rpc("ensure_guardian_code");
    setBusy(false);
    if (error) {
      toast.error("Could not create your guardian code.");
      return;
    }
    toast.success("Guardian code ready");
    queryClient.setQueryData(["shelfi", "family", "guardian-code", session?.id], data as string);
  }

  return (
    <section className="shelfi-surface mt-4 p-5">
      <h2 className="text-base">Guardian code</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Share this code with a parent or guardian so they can request a connection. Your school
        approves every request.
      </p>

      {code.data ? (
        <p className="mt-3 font-mono text-lg tracking-widest text-primary">{code.data}</p>
      ) : (
        <Button
          variant="outline"
          className="mt-3 min-h-12 w-full"
          onClick={generate}
          disabled={busy || code.isLoading}
        >
          {busy ? "Creating…" : "Create my guardian code"}
        </Button>
      )}

      <h3 className="mt-5 text-sm font-semibold text-foreground">Connected guardians</h3>
      {(guardians.data ?? []).length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">No guardians are connected yet.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {guardians.data!.map((g) => (
            <li key={g.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-foreground">
                {g.name || "Guardian"}{" "}
                <span className="text-muted-foreground">
                  · {relationshipLabel[g.relationshipType] ?? "Guardian"}
                </span>
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                  linkStatusTone[g.status],
                )}
              >
                {linkStatusLabel[g.status]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Parent-side: request a connection, and see the status of each child. */
export function ParentConnectionsSection() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const request = useServerFn(requestParentLink);
  const [joinCode, setJoinCode] = useState("");
  const [guardianCode, setGuardianCode] = useState("");
  const [relationship, setRelationship] = useState<(typeof RELATIONSHIPS)[number]>("guardian");
  const [busy, setBusy] = useState(false);

  const children = useQuery({
    queryKey: familyKeys.children(session?.id),
    enabled: Boolean(session?.id),
    staleTime: 60_000,
    queryFn: () => fetchMyChildren(session!.id),
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await request({
        data: {
          joinCode,
          guardianCode,
          relationshipType: relationship,
          fullName: session?.fullName ?? "",
        },
      });
      toast.success(`Request sent to ${result.schoolName}`, {
        description: `You'll see ${result.studentFirstName}'s library once the school approves it.`,
      });
      setJoinCode("");
      setGuardianCode("");
      await queryClient.invalidateQueries({ queryKey: ["shelfi"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send your request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="shelfi-surface mt-4 p-5">
      <h2 className="text-base">Connect a child</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Enter your child&rsquo;s school join code and the guardian code they generated in their
        Shelfi account. The school approves every connection.
      </p>

      <form onSubmit={submit} className="mt-4 space-y-3">
        <div className="space-y-2">
          <Label htmlFor="familyJoinCode">School join code</Label>
          <Input
            id="familyJoinCode"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="e.g. K7QMTX2D"
            className="min-h-12 tracking-widest"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="guardianCode">Child&rsquo;s guardian code</Label>
          <Input
            id="guardianCode"
            value={guardianCode}
            onChange={(e) => setGuardianCode(e.target.value.toUpperCase())}
            placeholder="e.g. 4F91A2C7"
            className="min-h-12 tracking-widest"
            required
          />
        </div>
        <Label>Relationship</Label>
        <div className="grid grid-cols-2 gap-2">
          {RELATIONSHIPS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRelationship(r)}
              className={
                relationship === r
                  ? "min-h-12 rounded-xl bg-primary text-sm font-semibold capitalize text-primary-foreground"
                  : "min-h-12 rounded-xl border border-border text-sm font-medium capitalize text-muted-foreground"
              }
            >
              {r}
            </button>
          ))}
        </div>
        <Button type="submit" className="min-h-12 w-full" disabled={busy}>
          {busy ? "Sending…" : "Request connection"}
        </Button>
      </form>

      <h3 className="mt-5 text-sm font-semibold text-foreground">Your children</h3>
      {(children.data ?? []).length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">
          Your children haven&rsquo;t been connected to this account yet.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {children.data!.map((c) => (
            <li key={c.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-foreground">
                {c.status === "active" ? c.fullName || "Your child" : "Pending connection"}{" "}
                <span className="text-muted-foreground">
                  · {relationshipLabel[c.relationshipType] ?? "Guardian"}
                </span>
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                  linkStatusTone[c.status],
                )}
              >
                {linkStatusLabel[c.status]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
