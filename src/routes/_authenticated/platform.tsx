import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { createSchool } from "@/lib/schools.functions";
import { EmptyState, ErrorState, LoadingList, PageHeader } from "@/components/shelfi/states";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/platform")({
  head: () => ({
    meta: [
      { title: "Platform — Shelfi" },
      { name: "description", content: "Platform administration for schools on Shelfi." },
      { property: "og:title", content: "Platform — Shelfi" },
      { property: "og:description", content: "Platform administration for schools on Shelfi." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlatformPage,
});

function PlatformPage() {
  const { data: session } = useSession();
  const isSystemAdmin = session?.roles.includes("system_admin") ?? false;
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  const schools = useQuery({
    queryKey: ["shelfi", "schools"],
    enabled: isSystemAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schools")
        .select("id, name, slug, is_active, join_code")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: () => createSchool({ data: { name, city, country, contactEmail } }),
    onSuccess: async (school) => {
      toast.success(`${school.name} created`, {
        description: `Join code: ${school.join_code}`,
      });
      setOpen(false);
      setName("");
      setCity("");
      setCountry("");
      setContactEmail("");
      await queryClient.invalidateQueries({ queryKey: ["shelfi", "schools"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not create the school.");
    },
  });

  if (!isSystemAdmin) {
    return (
      <>
        <PageHeader title="Platform" />
        <EmptyState
          icon={<Building2 className="size-5" />}
          title="Platform access required"
          description="Only Shelfi platform administrators can manage schools and the global catalogue."
        />
      </>
    );
  }

  const addSchoolButton = (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="size-4" />
          Add School
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a school</DialogTitle>
          <DialogDescription>
            Create a new school on Shelfi. A join code is generated so the school can invite
            students and librarians.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="school-name">School name</Label>
            <Input
              id="school-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Greenwood High School"
              required
              minLength={2}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="school-city">City</Label>
              <Input
                id="school-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="school-country">Country</Label>
              <Input
                id="school-country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="school-email">Contact email</Label>
            <Input
              id="school-email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={create.isPending || name.trim().length < 2}>
              {create.isPending ? "Creating…" : "Create school"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );

  return (
    <>
      <PageHeader
        title="Platform"
        description="Schools on Shelfi and their access."
        action={addSchoolButton}
      />
      {schools.isLoading ? (
        <LoadingList />
      ) : schools.isError ? (
        <ErrorState />
      ) : (schools.data ?? []).length === 0 ? (
        <EmptyState
          icon={<Building2 className="size-5" />}
          title="No schools yet"
          description="Create the first school to give it a join code and start onboarding its library."
          action={addSchoolButton}
        />
      ) : (
        <ul className="space-y-3">
          {schools.data!.map((s) => (
            <li key={s.id} className="shelfi-surface flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{s.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {s.slug} · {s.is_active ? "active" : "inactive"}
                </p>
              </div>
              {s.join_code ? (
                <span className="font-mono text-xs tracking-widest text-primary">
                  {s.join_code}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
