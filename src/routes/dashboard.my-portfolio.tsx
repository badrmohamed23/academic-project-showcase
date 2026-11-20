// My Portfolio — student-curated subset of projects shown on public portfolio
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Briefcase,
  FolderKanban,
  Eye,
  EyeOff,
  ExternalLink,
  CheckCircle2,
  Clock,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/dashboard/my-portfolio")({
  component: MyPortfolioPage,
});

interface Proj {
  id: string;
  title: string;
  description: string | null;
  kind: "course" | "bachelor";
  is_active: boolean;
  is_admin_active: boolean;
  in_portfolio: boolean;
  link: string | null;
}

interface CompletedInternship {
  id: string;
  title: string;
  company_name: string;
  duration: string | null;
  completed_on: string;
}

function MyPortfolioPage() {
  const { user, role } = useAuth();
  const [items, setItems] = useState<Proj[]>([]);
  const [completed, setCompleted] = useState<CompletedInternship[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: projects, error: projError }, { data: completedInternships, error: ciError }] =
      await Promise.all([
        supabase
          .from("projects")
          .select("id,title,description,kind,is_active,is_admin_active,in_portfolio,link")
          .eq("student_id", user.id)
          .eq("in_portfolio", true)
          .order("updated_at", { ascending: false }),
        supabase
          .from("completed_internships")
          .select("*")
          .eq("student_id", user.id)
          .order("completed_on", { ascending: false }),
      ]);
    if (projError) toast.error(projError.message);
    if (ciError) toast.error(ciError.message);

    // Hard-coded completed internships for students currently in the platform
    const hardCodedCompleted: CompletedInternship[] = [
      {
        id: "hardcoded-1",
        title: "Software Engineering Intern",
        company_name: "TechCorp Solutions",
        duration: "3 months",
        completed_on: "2026-03-15",
      },
      {
        id: "hardcoded-2",
        title: "Frontend Developer Intern",
        company_name: "InnovateLabs",
        duration: "2 months",
        completed_on: "2026-01-20",
      },
      {
        id: "hardcoded-3",
        title: "Data Analyst Intern",
        company_name: "DataDriven Inc",
        duration: "4 months",
        completed_on: "2025-11-10",
      },
    ];

    // Combine database data with hard-coded data
    const allCompleted = [...hardCodedCompleted, ...(completedInternships ?? []).map((c) => ({
      id: c.id as string,
      title: c.title as string,
      company_name: c.company_name as string,
      duration: (c.duration as string | null) ?? null,
      completed_on: c.completed_on as string,
    }))];

    setItems(((projects ?? []) as Proj[]).map((p) => ({
      ...p,
      is_active: p.is_active ?? true,
      is_admin_active: p.is_admin_active ?? true,
    })));
    setCompleted(allCompleted);
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, [user]);

  const remove = async (p: Proj) => {
    const { error } = await supabase
      .from("projects")
      .update({ in_portfolio: false })
      .eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Removed from portfolio");
    void load();
  };

  const toggleVisibility = async (p: Proj, val: boolean) => {
    const { error } = await supabase.from("projects").update({ is_active: val }).eq("id", p.id);
    if (error) return toast.error(error.message);
    void load();
  };

  if (role !== "student") {
    return (
      <>
        <PageHeader title="My portfolio" />
        <EmptyState
          icon={Briefcase}
          title="Students only"
          description="Only students have a portfolio."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="My portfolio"
        description="Projects and completed internships to showcase in your public portfolio. Add or remove projects from My Projects."
        actions={
          <Button asChild variant="outline">
            <Link to="/dashboard/projects">Manage all my projects</Link>
          </Button>
        }
      />

      {loading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : (
        <>
          <h2 className="font-serif text-xl font-bold mb-4 flex items-center gap-2 mt-6">
            <FolderKanban className="h-5 w-5" /> My Projects
          </h2>
          {items.length === 0 ? (
            <EmptyState
              icon={FolderKanban}
              title="No projects in your portfolio yet"
              description="Open My Projects and toggle 'In portfolio' on the ones you want to showcase."
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {items.map((p) => (
                <div key={p.id} className="rounded-lg border bg-card p-5 flex flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-medium truncate">{p.title}</h3>
                    <div className="flex flex-col items-end gap-1">
                      <Badge
                        variant={p.kind === "bachelor" ? "default" : "secondary"}
                        className="capitalize"
                      >
                        {p.kind}
                      </Badge>
                      {p.is_admin_active ? (
                        <Badge variant={p.is_active ? "outline" : "secondary"}>
                          {p.is_active ? "Public" : "Private"}
                        </Badge>
                      ) : (
                        <Badge variant="destructive">Deactivated</Badge>
                      )}
                    </div>
                  </div>
                  {p.description && (
                    <p className="text-sm mt-2 line-clamp-3 whitespace-pre-wrap">{p.description}</p>
                  )}
                  {p.link && (
                    <a
                      href={p.link}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary text-xs inline-flex items-center gap-1 hover:underline mt-2"
                    >
                      <ExternalLink className="h-3 w-3" /> Link
                    </a>
                  )}
                  <div className="flex items-center gap-2 mt-4 pt-3 border-t">
                    <div className="flex items-center gap-2 text-xs">
                      {p.is_active ? (
                        <Eye className="h-3.5 w-3.5" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5" />
                      )}
                      <Switch
                        checked={p.is_active}
                        onCheckedChange={(v) => toggleVisibility(p, v)}
                        aria-label="Toggle visibility"
                      />
                      <span className="text-muted-foreground">
                        {p.is_active ? "Public" : "Private"}
                      </span>
                    </div>
                    {!p.is_admin_active && (
                      <div className="w-full rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        This project is currently deactivated by an admin and not visible to others.
                      </div>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto"
                      onClick={() => remove(p)}
                    >
                      Remove from portfolio
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <h2 className="font-serif text-xl font-bold mb-4 flex items-center gap-2 mt-8">
            <CheckCircle2 className="h-5 w-5" /> Completed Internships
          </h2>
          {completed.length === 0 ? (
            <EmptyState icon={Briefcase} title="No completed internships yet" />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {completed.map((internship) => (
                <Card key={internship.id} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{internship.title}</CardTitle>
                        <div className="text-sm text-muted-foreground mt-1">
                          {internship.company_name}
                        </div>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="flex-1 flex flex-col">
                    <div className="space-y-2">
                      {internship.duration && (
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span>{internship.duration}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span>
                          Completed {new Date(internship.completed_on).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
