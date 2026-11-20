import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  GraduationCap,
  LogOut,
  Bell,
  LayoutDashboard,
  Users,
  BookOpen,
  Flag,
  FileText,
  GitBranch,
  Building2,
  FolderKanban,
  Inbox,
  ShieldCheck,
  UserCircle,
  BadgeCheck,
  Briefcase,
  ListChecks,
  Heart,
  Sparkles,
  BarChart3,
  Search,
  MessageCircle,
  Mailbox,
  FolderSearch,
  CheckCheck,
} from "lucide-react";
import { useAuth, type AppRole } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fullName, roleLabel } from "@/lib/validators";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

type NavItem = { to: string; label: string; icon: typeof Bell };

const NAV: Record<AppRole, NavItem[]> = {
  admin: [
    { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { to: "/dashboard/users", label: "Users", icon: Users },
    { to: "/dashboard/employer-verification", label: "Employer Verification", icon: BadgeCheck },
    { to: "/dashboard/courses", label: "Courses", icon: BookOpen },
    { to: "/dashboard/link-requests", label: "Link Requests", icon: GitBranch },
    { to: "/dashboard/flagged", label: "Flagged Projects", icon: Flag },
    { to: "/dashboard/appeals", label: "Appeals", icon: FileText },
    { to: "/dashboard/admins", label: "Admins", icon: ShieldCheck },
    { to: "/dashboard/portfolios", label: "Portfolios", icon: Search },
    { to: "/dashboard/projects-search", label: "Project Search", icon: FolderSearch },
    { to: "/dashboard/instructors", label: "Instructors", icon: GraduationCap },
    { to: "/dashboard/messages", label: "Messages", icon: MessageCircle },
    { to: "/dashboard/stats", label: "Statistics", icon: BarChart3 },
    { to: "/dashboard/profile", label: "My Profile", icon: UserCircle },
    { to: "/dashboard/notifications", label: "Notifications", icon: Bell },
  ],
  instructor: [
    { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { to: "/dashboard/courses", label: "Courses", icon: BookOpen },
    { to: "/dashboard/my-links", label: "My Course Links", icon: GitBranch },
    { to: "/dashboard/linked-projects", label: "My Linked Projects", icon: FolderKanban },
    { to: "/dashboard/projects-search", label: "Project Search", icon: FolderSearch },
    { to: "/dashboard/portfolios", label: "Portfolios", icon: Search },
    { to: "/dashboard/instructors", label: "Instructors", icon: GraduationCap },
    { to: "/dashboard/invitations", label: "Invitations", icon: Mailbox },
    { to: "/dashboard/messages", label: "Messages", icon: MessageCircle },
    { to: "/dashboard/profile", label: "My Profile", icon: UserCircle },
    { to: "/dashboard/notifications", label: "Notifications", icon: Bell },
  ],
  student: [
    { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { to: "/dashboard/projects-search", label: "Project Search", icon: FolderSearch },
    { to: "/dashboard/projects", label: "My Projects", icon: FolderKanban },
    { to: "/dashboard/my-portfolio", label: "My Portfolio", icon: Briefcase },
    { to: "/dashboard/my-internships", label: "My Applications", icon: CheckCheck },
    { to: "/dashboard/tasks", label: "My Tasks", icon: ListChecks },
    { to: "/dashboard/invitations", label: "Invitations", icon: Mailbox },
    { to: "/dashboard/courses", label: "Courses", icon: BookOpen },
    { to: "/dashboard/portfolios", label: "Portfolios", icon: Search },
    { to: "/dashboard/instructors", label: "Instructors", icon: GraduationCap },
    { to: "/dashboard/internships", label: "Internships", icon: Briefcase },
    { to: "/dashboard/favorites", label: "Favorites", icon: Heart },
    { to: "/dashboard/recommendations", label: "Recommendations", icon: Sparkles },
    { to: "/dashboard/messages", label: "Messages", icon: MessageCircle },
    { to: "/dashboard/stats", label: "Statistics", icon: BarChart3 },
    { to: "/dashboard/appeals", label: "My Appeals", icon: FileText },
    { to: "/dashboard/profile", label: "My Profile", icon: UserCircle },
    { to: "/dashboard/notifications", label: "Notifications", icon: Bell },
  ],
  employer: [
    { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { to: "/dashboard/company", label: "Company Profile", icon: Building2 },
    { to: "/dashboard/internships", label: "Internships", icon: Briefcase },
    { to: "/dashboard/favorites", label: "Favorites", icon: Heart },
    { to: "/dashboard/projects-search", label: "Project Search", icon: FolderSearch },
    { to: "/dashboard/portfolios", label: "Portfolios", icon: Search },
    { to: "/dashboard/instructors", label: "Instructors", icon: GraduationCap },
    { to: "/dashboard/messages", label: "Messages", icon: MessageCircle },
    { to: "/dashboard/stats", label: "Statistics", icon: BarChart3 },
    { to: "/dashboard/profile", label: "My Profile", icon: UserCircle },
    { to: "/dashboard/notifications", label: "Notifications", icon: Bell },
  ],
};

export function DashboardShell({ children }: { children: ReactNode }) {
  const { user, profile, role, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const routerState = useRouterState();
  const [unread, setUnread] = useState(0);
  const [navQuery, setNavQuery] = useState("");

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login" });
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_read", false);
      setUnread(count ?? 0);
    };
    void load();
    const ch = supabase
      .channel("notif-" + user.id)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => { void load(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [user]);

  if (loading || !user || !role) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (profile && profile.is_active === false) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md rounded-lg border bg-card p-8 text-center">
          <h1 className="font-serif text-2xl font-bold">Account deactivated</h1>
          <p className="mt-2 text-muted-foreground">
            Your account has been deactivated by an administrator. Please contact support.
          </p>
          <Button
            className="mt-6"
            onClick={() => {
              void signOut().then(() => navigate({ to: "/login" }));
            }}
          >
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  const items = NAV[role];
  const filteredItems = items.filter((item) => {
    const query = navQuery.trim().toLowerCase();
    if (!query) return true;
    return item.label.toLowerCase().includes(query) || item.to.toLowerCase().includes(query);
  });
  const currentPath = routerState.location.pathname;

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <aside className="md:w-64 border-r bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="p-5 border-b">
          <Link to="/" className="flex items-center gap-2 font-serif font-bold text-lg">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
              <GraduationCap className="h-5 w-5" />
            </span>
            GUC Showcase
          </Link>
          <div className="mt-4 flex items-center gap-3">
            <Avatar className="h-10 w-10">
              {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt="" />}
              <AvatarFallback className="text-xs">
                {(
                  profile?.first_name?.[0] ??
                  profile?.company_name?.[0] ??
                  user.email?.[0] ??
                  "U"
                ).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">
                {fullName(profile ?? { email: user.email })}
              </div>
              <Badge variant="secondary" className="mt-1 text-[10px]">
                {roleLabel(role)}
              </Badge>
            </div>
          </div>
          <div className="mt-4 relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={navQuery}
              onChange={(e) => setNavQuery(e.target.value)}
              placeholder="Search sections"
              className="pl-9 h-9 bg-background/60"
            />
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {filteredItems.length === 0 ? (
            <div className="px-3 py-4 text-sm text-muted-foreground">No matching sections.</div>
          ) : (
            filteredItems.map((it) => {
              const Icon = it.icon;
              const active =
                currentPath === it.to || (it.to !== "/dashboard" && currentPath.startsWith(it.to));
              return (
                <Link
                  key={it.to}
                  to={it.to}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="flex-1">{it.label}</span>
                  {it.to === "/dashboard/notifications" && unread > 0 && (
                    <Badge variant="default" className="h-5 px-1.5 text-[10px]">
                      {unread}
                    </Badge>
                  )}
                </Link>
              );
            })
          )}
        </nav>
        <div className="p-3 border-t">
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={async () => {
              await signOut();
              toast.success("Signed out");
              navigate({ to: "/login" });
            }}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 bg-background overflow-x-hidden">
        <div className="sticky top-0 z-30 flex items-center justify-end gap-2 border-b bg-background/95 backdrop-blur px-4 md:px-10 h-14">
          <ThemeToggle className="shrink-0" />
          <NotificationBell userId={user.id} />
        </div>
        <div className="container mx-auto p-6 md:p-10 max-w-6xl">{children}</div>
      </main>
    </div>
  );
}

interface BellNotif {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link_url: string | null;
  is_read: boolean;
  created_at: string;
}

function NotificationBell({ userId }: { userId: string }) {
  const [items, setItems] = useState<BellNotif[]>([]);
  const [open, setOpen] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("notifications")
      .select("id,type,title,body,link_url,is_read,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(8);
    setItems((data ?? []) as BellNotif[]);
  };

  useEffect(() => {
    void load();
    const ch = supabase
      .channel("bell-" + userId)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => void load(),
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const unread = items.filter((i) => !i.is_read).length;

  const markAll = async () => {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false);
    if (error) return toast.error(error.message);
    toast.success("All notifications marked as read");
    void load();
  };

  const markOne = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    void load();
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="text-sm font-medium">Notifications</div>
          {unread > 0 && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={markAll}>
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              No notifications yet
            </div>
          ) : (
            items.map((n) => (
              <Link
                key={n.id}
                to={n.link_url ?? "/dashboard/notifications"}
                onClick={() => {
                  void markOne(n.id);
                  setOpen(false);
                }}
                className={cn(
                  "block px-3 py-2.5 border-b last:border-b-0 hover:bg-accent transition-colors",
                  !n.is_read && "bg-primary/5",
                )}
              >
                <div className="flex items-start gap-2">
                  <span
                    className={cn(
                      "mt-1.5 h-2 w-2 rounded-full shrink-0",
                      !n.is_read ? "bg-primary" : "bg-transparent",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium leading-snug">{n.title}</div>
                    {n.body && (
                      <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                        {n.body}
                      </div>
                    )}
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </div>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
        <Link
          to="/dashboard/notifications"
          onClick={() => setOpen(false)}
          className="block text-center text-xs text-primary hover:underline px-3 py-2 border-t"
        >
          View all notifications
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
      <div>
        <h1 className="font-serif text-3xl font-bold">{title}</h1>
        {description && <p className="text-muted-foreground mt-1">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
}: {
  icon?: typeof Inbox;
  title: string;
  description?: string;
}) {
  return (
    <div className="rounded-lg border border-dashed bg-muted/30 p-12 text-center">
      <Icon className="mx-auto h-10 w-10 text-muted-foreground" />
      <h3 className="mt-4 font-medium">{title}</h3>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

export function requireRole<T extends AppRole>(
  actual: AppRole | null,
  allowed: readonly T[],
): boolean {
  return !!actual && (allowed as readonly AppRole[]).includes(actual);
}

export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-card p-4 animate-pulse">
          <div className="h-4 w-2/3 rounded bg-muted mb-2" />
          <div className="h-3 w-1/2 rounded bg-muted mb-4" />
          <div className="space-y-2">
            <div className="h-3 rounded bg-muted" />
            <div className="h-3 w-5/6 rounded bg-muted" />
          </div>
          <div className="mt-4 flex gap-2">
            <div className="h-7 flex-1 rounded bg-muted" />
            <div className="h-7 flex-1 rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}