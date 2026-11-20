import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/dashboard-shell";
import { fullName } from "@/lib/validators";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardIndex,
});

interface Stats {
  [k: string]: number;
}

function DashboardIndex() {
  const { user, profile, role } = useAuth();
  const [stats, setStats] = useState<Stats>({});

  useEffect(() => {
    if (!role || !user) return;
    const load = async () => {
      const s: Stats = {};
      if (role === "admin") {
        const [u, c, lr, fl, ap] = await Promise.all([
          supabase.from("profiles").select("*", { count: "exact", head: true }),
          supabase.from("courses").select("*", { count: "exact", head: true }),
          supabase
            .from("instructor_link_requests")
            .select("*", { count: "exact", head: true })
            .eq("status", "pending"),
          supabase
            .from("projects")
            .select("*", { count: "exact", head: true })
            .eq("is_flagged", true),
          supabase
            .from("project_appeals")
            .select("*", { count: "exact", head: true })
            .eq("status", "pending"),
        ]);
        s.users = u.count ?? 0;
        s.courses = c.count ?? 0;
        s.pending_links = lr.count ?? 0;
        s.flagged = fl.count ?? 0;
        s.pending_appeals = ap.count ?? 0;
      } else if (role === "instructor") {
        const [c, l] = await Promise.all([
          supabase.from("courses").select("*", { count: "exact", head: true }),
          supabase
            .from("instructor_courses")
            .select("*", { count: "exact", head: true })
            .eq("instructor_id", user.id),
        ]);
        s.courses = c.count ?? 0;
        s.my_courses = l.count ?? 0;
      } else if (role === "student") {
        const [p, f, c] = await Promise.all([
          supabase
            .from("projects")
            .select("*", { count: "exact", head: true })
            .eq("student_id", user.id),
          supabase
            .from("projects")
            .select("*", { count: "exact", head: true })
            .eq("student_id", user.id)
            .eq("is_flagged", true),
          supabase
            .from("project_collaborators")
            .select("project_id", { count: "exact", head: true })
            .eq("invitee_id", user.id)
            .eq("status", "accepted"),
        ]);
        s.my_projects = (p.count ?? 0) + (c.count ?? 0);
        s.my_flagged = f.count ?? 0;
      } else if (role === "employer") {
        const [p] = await Promise.all([
          supabase
            .from("projects")
            .select("*", { count: "exact", head: true })
            .eq("is_active", true),
        ]);
        s.active_projects = p.count ?? 0;
      }
      setStats(s);
    };
    void load();
  }, [user, role]);

  if (!role) return null;
  return (
    <>
      <PageHeader title={`Welcome, ${fullName(profile ?? { email: user?.email })}`} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(stats).map(([k, v]) => (
          <StatCard key={k} label={prettyLabel(k)} value={v} />
        ))}
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {role === "admin" && (
          <>
            <QuickLink
              to="/dashboard/users"
              title="Manage users"
              desc="Activate, deactivate, and review accounts."
            />
            <QuickLink
              to="/dashboard/courses"
              title="Course catalog"
              desc="Add, edit, or remove courses."
            />
            <QuickLink
              to="/dashboard/link-requests"
              title="Review link requests"
              desc="Approve or reject instructor requests."
            />
            <QuickLink
              to="/dashboard/flagged"
              title="Flagged projects"
              desc="Moderate flagged content."
            />
          </>
        )}
        {role === "instructor" && (
          <>
            <QuickLink
              to="/dashboard/courses"
              title="Browse courses"
              desc="Request to link to a course."
            />
            <QuickLink
              to="/dashboard/projects-search"
              title="Project Search"
              desc="Search student projects by course and language."
            />
          </>
        )}
        {role === "student" && (
          <>
            <QuickLink
              to="/dashboard/projects-search"
              title="Project Search"
              desc="Search public projects and save favorites."
            />
            <QuickLink
              to="/dashboard/appeals"
              title="My appeals"
              desc="Contest a flag on your project."
            />
          </>
        )}
        {role === "employer" && (
          <>
            <QuickLink
              to="/dashboard/company"
              title="Company profile"
              desc="Tell students who you are."
            />
            <QuickLink
              to="/dashboard/projects-search"
              title="Project Search"
              desc="Find your next great hire."
            />
            <QuickLink
              to="/dashboard/favorites"
              title="Favorites"
              desc="View saved projects and portfolios."
            />
          </>
        )}
      </div>
    </>
  );
}

function prettyLabel(k: string) {
  return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 font-serif text-3xl font-bold">{value}</div>
    </div>
  );
}

function QuickLink({ to, title, desc }: { to: string; title: string; desc: string }) {
  return (
    <Link
      to={to}
      className="group rounded-lg border bg-card p-5 hover:border-primary hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="font-medium">{title}</div>
          <div className="text-sm text-muted-foreground mt-1">{desc}</div>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
      </div>
    </Link>
  );
}
