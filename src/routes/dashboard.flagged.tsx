import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Flag } from "lucide-react";
import { fullName } from "@/lib/validators";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/flagged")({
  component: FlaggedPage,
});

interface ProjectRow {
  id: string;
  title: string;
  description: string | null;
  is_active: boolean;
  is_admin_active: boolean;
  is_flagged: boolean;
  student_id: string;
  course_id: string | null;
  profiles: { first_name: string | null; last_name: string | null; email: string } | null;
  courses: { code: string; name: string } | null;
  project_flags: {
    id: string;
    reason: string;
    created_at: string;
    flagged_by: string;
    profiles: { first_name: string | null; last_name: string | null; email: string } | null;
  }[];
}

function FlaggedPage() {
  const { role } = useAuth();
  const [items, setItems] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data, error } = await supabase
      .from("projects")
      .select(
        "id, title, description, is_active, is_admin_active, is_flagged, student_id, course_id, profiles:student_id(first_name,last_name,email), courses(code,name), project_flags(id,reason,created_at,flagged_by,profiles:flagged_by(first_name,last_name,email))",
      )
      .eq("is_flagged", true)
      .order("updated_at", { ascending: false });
    if (error) {
      toast.error("Failed to load flagged projects: " + error.message);
      console.error("Flagged projects query error:", error);
      setLoading(false);
      return;
    }
    setItems((data ?? []) as unknown as ProjectRow[]);
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, []);

  const setActive = async (id: string, active: boolean) => {
    const { error } = await supabase
      .from("projects")
      .update({ is_admin_active: active, ...(active ? { is_flagged: false } : {}) })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(active ? "Project re-activated" : "Project deactivated");
    void load();
  };

  if (role !== "admin") return <EmptyState title="Admins only" />;

  return (
    <>
      <PageHeader
        title="Flagged projects"
        description="Review projects flagged for policy violations."
      />
      {loading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : items.length === 0 ? (
        <EmptyState icon={Flag} title="No flagged projects" />
      ) : (
        <div className="space-y-3">
          {items.map((p) => (
            <div key={p.id} className="rounded-lg border bg-card p-5">
              <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium">{p.title}</h3>
                    {p.courses && (
                      <Badge variant="outline" className="text-xs">
                        {p.courses.code}
                      </Badge>
                    )}
                    {p.is_admin_active ? (
                      <Badge className="bg-success text-success-foreground">Active</Badge>
                    ) : (
                      <Badge variant="destructive">Deactivated</Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    By {fullName(p.profiles ?? { email: "—" })}
                  </div>
                  {p.description && <p className="text-sm mt-2 line-clamp-2">{p.description}</p>}
                  <div className="mt-3 space-y-2">
                    {p.project_flags?.map((f) => (
                      <div
                        key={f.id}
                        className="text-xs bg-destructive/10 border border-destructive/30 rounded px-3 py-2"
                      >
                        <div className="font-medium">
                          Flagged by {fullName(f.profiles ?? { email: "—" })}
                        </div>
                        <div className="mt-1">
                          <strong>Reason:</strong> {f.reason}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {p.is_active ? (
                    <Button size="sm" variant="destructive" onClick={() => setActive(p.id, false)}>
                      Deactivate
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => setActive(p.id, true)}>
                      Re-activate
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
