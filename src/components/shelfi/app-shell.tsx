import { Link, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  Library,
  LayoutDashboard,
  ArrowLeftRight,
  User,
  Users,
  Sparkles,
  Building2,
  Heart,
  BarChart3,
  MoreHorizontal,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { isActiveStaff, isParent, primaryRole, roleLabel, useSession } from "@/lib/session";
import { ShelfiLogo } from "@/components/shelfi/logo";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: typeof BookOpen; description?: string };

export function AppShell({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [moreOpen, setMoreOpen] = useState(false);
  const roles = session?.roles ?? [];
  const role = primaryRole(roles);
  const staff = isActiveStaff(session);
  const platformAdmin = roles.includes("system_admin");
  const activeMember = session?.status === "active" && Boolean(session?.schoolId);
  const parent = isParent(session);

  // Bottom bar is capped at five items so labels never truncate on a 320px
  // screen; everything else lives in the "More" sheet.
  let nav: NavItem[] = [];
  let more: NavItem[] = [];

  if (parent) {
    // Guardians get a deliberately minimal, read-only surface.
    nav = [
      { to: "/family", label: "Home", icon: Heart },
      { to: "/family", label: "Children", icon: Users },
      { to: "/account", label: "Account", icon: User },
    ];
  } else if (staff) {
    nav = [
      { to: "/library", label: "Library", icon: Library },
      { to: "/circulation", label: "Desk", icon: ArrowLeftRight },
      { to: "/catalogue", label: "Digital", icon: Sparkles },
      { to: "/reports", label: "Reports", icon: BarChart3 },
    ];
    more = [
      { to: "/dashboard", label: "Home", icon: LayoutDashboard, description: "School overview" },
      { to: "/manage", label: "Manage school", icon: Users, description: "Members and requests" },
      { to: "/account", label: "Account", icon: User, description: "Profile and settings" },
    ];
    if (platformAdmin) {
      more.push({
        to: "/platform",
        label: "Platform",
        icon: Building2,
        description: "All schools",
      });
    }
  } else if (platformAdmin) {
    nav = [
      { to: "/platform", label: "Platform", icon: Building2 },
      { to: "/dashboard", label: "Home", icon: LayoutDashboard },
      { to: "/account", label: "Account", icon: User },
    ];
  } else if (activeMember) {
    nav = [
      { to: "/dashboard", label: "Home", icon: LayoutDashboard },
      { to: "/catalogue", label: "Library", icon: Library },
      { to: "/my-shelf", label: "My Shelf", icon: BookOpen },
      { to: "/account", label: "Profile", icon: User },
    ];
  } else {
    nav = [
      { to: "/dashboard", label: "Home", icon: LayoutDashboard },
      { to: "/account", label: "Account", icon: User },
    ];
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <Link to={parent ? "/family" : "/dashboard"} aria-label="Shelfi home">
            <ShelfiLogo markClassName="size-8 rounded-lg" />
          </Link>
          <div className="min-w-0 text-right">
            <p className="truncate text-xs font-medium text-foreground">
              {platformAdmin ? "Shelfi platform" : (session?.school?.name ?? "No school yet")}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">{roleLabel[role]}</p>
          </div>
        </div>
      </header>

      <main className="shelfi-page">{children}</main>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur"
      >
        <div className="mx-auto flex w-full max-w-4xl items-stretch justify-between gap-0.5 px-1 pb-[env(safe-area-inset-bottom)]">
          {nav.map((item, index) => {
            const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
            const Icon = item.icon;
            return (
              <Link
                key={`${item.to}-${index}`}
                to={item.to}
                aria-label={item.label}
                className={cn(
                  "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-0.5 py-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-5 shrink-0" />
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            );
          })}

          {more.length > 0 ? (
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-label="More destinations"
              aria-haspopup="dialog"
              className="flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-0.5 py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MoreHorizontal className="size-5 shrink-0" />
              <span className="max-w-full truncate">More</span>
            </button>
          ) : null}
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>More</SheetTitle>
          </SheetHeader>
          <div className="grid gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {more.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMoreOpen(false)}
                  className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-secondary"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-foreground">
                      {item.label}
                    </span>
                    {item.description ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.description}
                      </span>
                    ) : null}
                  </span>
                </Link>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
