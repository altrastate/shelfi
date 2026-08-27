import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
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
  const [joinRole, setJoinRole] = useState<"student" | "librarian">("student");
  const [busy, setBusy] = useState(false);

  const [fullName, setFullName] = useState("");
  const [yearGroup, setYearGroup] = useState("");
  const [studentIdentifier, setStudentIdentifier] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [password, setPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (!session) return;
    setFullName(session.fullName);
    setYearGroup(session.yearGroup ?? "");
    setStudentIdentifier(session.studentIdentifier ?? "");
  }, [session?.id, session?.fullName, session?.yearGroup, session?.studentIdentifier]);

  const needsSchool = !session?.schoolId || session.status === "rejected";

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await join({
        data: { joinCode: code, role: joinRole, fullName: session?.fullName ?? "" },
      });
      toast.success(`Request sent to ${result.schoolName}`, {
        description: "You'll get access once your school approves it.",
      });
      setCode("");
      await queryClient.invalidateQueries();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit your request.");
    } finally {
      setBusy(false);
    }
  }

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setSavingProfile(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim(),
        year_group: yearGroup.trim() || null,
        student_identifier: studentIdentifier.trim() || null,
      })
      .eq("id", session.id);
    setSavingProfile(false);
    if (error) {
      toast.error("Could not save your profile.");
      return;
    }
    toast.success("Profile updated");
    await queryClient.invalidateQueries({ queryKey: ["shelfi"] });
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSavingPassword(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPassword("");
    toast.success("Password updated");
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
        <p className="pt-2 text-xs capitalize text-muted-foreground">
          {roleLabel[primaryRole(session?.roles ?? [])]}
          {session?.school ? ` · ${session.school.name}` : ""}
          {session ? ` · ${session.status}` : ""}
        </p>
      </section>

      <section className="shelfi-surface mt-4 p-5">
        <h2 className="text-base">Profile</h2>
        <form onSubmit={handleProfileSave} className="mt-4 space-y-3">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="min-h-12"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="studentIdentifier">Student ID</Label>
              <Input
                id="studentIdentifier"
                value={studentIdentifier}
                onChange={(e) => setStudentIdentifier(e.target.value)}
                placeholder="Optional"
                className="min-h-12"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="yearGroup">Class / year</Label>
              <Input
                id="yearGroup"
                value={yearGroup}
                onChange={(e) => setYearGroup(e.target.value)}
                placeholder="Optional"
                className="min-h-12"
              />
            </div>
          </div>
          <Button type="submit" className="min-h-12 w-full" disabled={savingProfile}>
            {savingProfile ? "Saving…" : "Save profile"}
          </Button>
        </form>
      </section>

      {needsSchool ? (
        <section className="shelfi-surface mt-4 p-5">
          <h2 className="text-base">Join your school</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter the join code from your school. A school administrator approves every request
            before access is granted.
          </p>
          <form onSubmit={handleJoin} className="mt-4 space-y-3">
            <Label htmlFor="joinCode">School join code</Label>
            <Input
              id="joinCode"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. K7QMTX2D"
              className="min-h-12 tracking-widest"
              required
            />
            <Label>I am joining as</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["student", "librarian"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setJoinRole(r)}
                  className={
                    joinRole === r
                      ? "min-h-12 rounded-xl bg-primary text-sm font-semibold text-primary-foreground"
                      : "min-h-12 rounded-xl border border-border text-sm font-medium text-muted-foreground"
                  }
                >
                  {r === "student" ? "Student" : "Librarian"}
                </button>
              ))}
            </div>
            <Button type="submit" className="min-h-12 w-full" disabled={busy}>
              {busy ? "Sending…" : "Request access"}
            </Button>
          </form>
        </section>
      ) : null}

      <section className="shelfi-surface mt-4 p-5">
        <h2 className="text-base">Change password</h2>
        <form onSubmit={handlePasswordChange} className="mt-4 space-y-3">
          <Label htmlFor="newPassword">New password</Label>
          <Input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
            className="min-h-12"
          />
          <Button
            type="submit"
            variant="outline"
            className="min-h-12 w-full"
            disabled={savingPassword || password.length < 8}
          >
            {savingPassword ? "Updating…" : "Update password"}
          </Button>
        </form>
      </section>

      <Button variant="outline" className="mt-6 min-h-12 w-full" onClick={handleSignOut}>
        Sign out
      </Button>
    </>
  );
}
