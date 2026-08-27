import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { requestSchoolAccess } from "@/lib/onboarding.functions";
import { primaryRole, roleLabel, useSession } from "@/lib/session";
import { PageHeader } from "@/components/shelfi/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({
    meta: [
      { title: "Account — Shelfi" },
      { name: "description", content: "Manage your Shelfi account and school membership." },
      { property: "og:title", content: "Account — Shelfi" },
      { property: "og:description", content: "Manage your Shelfi account and school membership." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const join = useServerFn(requestSchoolAccess);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await join({ data: { joinCode: code, fullName: session?.fullName ?? "" } });
      toast.success(`Request sent to ${result.schoolName}`);
      await queryClient.invalidateQueries();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit your request.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: {}, replace: true });
  }

  return (
    <>
      <PageHeader title="Account" description="Your profile and school membership." />

      <section className="shelfi-surface space-y-1 p-5">
        <p className="text-sm font-semibold text-foreground">{session?.fullName || "Reader"}</p>
        <p className="text-sm text-muted-foreground">{session?.email}</p>
        <p className="pt-2 text-xs text-muted-foreground">
          {roleLabel[primaryRole(session?.roles ?? [])]}
          {session?.school ? ` · ${session.school.name}` : ""}
          {session ? ` · ${session.status}` : ""}
        </p>
      </section>

      {!session?.schoolId ? (
        <section className="shelfi-surface mt-4 p-5">
          <h2 className="text-base">Join your school</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter the join code from your librarian. They approve every request before access is
            granted.
          </p>
          <form onSubmit={handleJoin} className="mt-4 space-y-3">
            <Label htmlFor="joinCode">School join code</Label>
            <Input
              id="joinCode"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. SHELFI-1234"
              className="min-h-12 tracking-widest"
              required
            />
            <Button type="submit" className="min-h-12 w-full" disabled={busy}>
              {busy ? "Sending…" : "Request access"}
            </Button>
          </form>
        </section>
      ) : null}

      {session?.school?.join_code && session.roles.includes("school_admin") ? (
        <section className="shelfi-surface mt-4 p-5">
          <h2 className="text-base">Your school join code</h2>
          <p className="mt-2 font-mono text-lg tracking-widest text-primary">
            {session.school.join_code}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Share this only with students who should join your library.
          </p>
        </section>
      ) : null}

      <Button variant="outline" className="mt-6 min-h-12 w-full" onClick={handleSignOut}>
        Sign out
      </Button>
    </>
  );
}
