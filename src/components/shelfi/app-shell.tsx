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
} from "lucide-react";
import type { ReactNode } from "react";
import { isActiveStaff, isParent, primaryRole, roleLabel, useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: typeof BookOpen };

export function AppShell({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const roles = session?.roles ?? [];
  const role = primaryRole(roles);
  const staff = isActiveStaff(session);
  const platformAdmin = roles.includes("system_admin");
  const activeMember = session?.status === "active" && Boolean(session?.schoolId);

  const parent = isParent(session);

  if (parent) {
    const parentNav: NavItem[] = [
      { to: "/family", label: "Home", icon: Heart },
      { to: "/account", label: "Account", icon: User },
    ];
    return <Shell nav={parentNav} session={session} role={role} pathname={pathname}>{children}</Shell>;
  }

  const nav: NavItem[] = [{ to: "/dashboard", label: "Home", icon: LayoutDashboard }];
  if (activeMember && !staff) {
    nav.push(
      { to: "/catalogue", label: "Library", icon: Library },
      { to: "/my-shelf", label: "My Shelf", icon: BookOpen },
      { to: "/loans", label: "Loans", icon: Sparkles },
    );
  } else if (staff) {
    nav.push(
      { to: "/library", label: "Library", icon: Library },
      { to: "/catalogue", label: "Digital", icon: Sparkles },
      { to: "/circulation", label: "Desk", icon: ArrowLeftRight },
    );
  }
  if (staff) nav.push({ to: "/manage", label: "Manage", icon: Users });
  if (platformAdmin) nav.push({ to: "/platform", label: "Platform", icon: Building2 });
  nav.push({ to: "/account", label: "Account", icon: User });

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-3">
          <Link to="/dashboard" className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Library className="size-4" />
            </span>
            <span className="font-display text-lg font-semibold tracking-tight">Shelfi</span>
          </Link>
          <div className="text-right">
            <p className="text-xs font-medium text-foreground">
              {platformAdmin
                ? "Shelfi platform"
                : (session?.school?.name ?? "No school yet")}
            </p>
            <p className="text-[11px] text-muted-foreground">{roleLabel[role]}</p>
          </div>
        </div>
      </header>

      <main className="shelfi-page">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl items-stretch justify-between px-1">
          {nav.map((item) => {
            const active = pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-5" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
