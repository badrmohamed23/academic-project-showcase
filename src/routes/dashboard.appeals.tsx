import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";
import { fullName } from "@/lib/validators";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/dashboard/appeals")({
  component: AppealsPage,
});

interface AppealRow {
  id: string;
  project_id: string;
  message: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  student_id: string;
  profiles: { first_name: string | null; last_name: string | null; email: string } | null;
  projects: { title: string; description: string | null } | null;
}

function AppealsPage() {
  const { role, user } = useAuth();
  const [items, setItems] = useState<AppealRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const q = supabase
      .from("project_appeals")
      .select("*, profiles:student_id(first_name,last_name,email), projects(title,description)")
      .order("created_at", { ascending: false });
    const finalQuery = role === "admin" ? q : q.eq("student_id", user?.id ?? "");
    const { data, error } = await finalQuery;
    if (error) {
      toast.error("Failed to load appeals: " + error.message);
      console.error("Appeal query error:", error);
      setLoading(false);
      return;
    }
    setItems((data ?? []) as unknown as AppealRow[]);
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, [role, user]);

  const review = async (a: AppealRow, decision: "approved" | "rejected") => {
    if (!user) return;
    const { error } = await supabase
      .from("project_appeals")
      .update({
        status: decision,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", a.id);
    if (error) return toast.error(error.message);
    if (decision === "approved") {
      // Re-activate the project at the admin level without forcing student visibility state.
      await supabase
        .from("projects")
        .update({ is_admin_active: true, is_flagged: false })
        .eq("id", a.project_id);
    }
    await supabase.from("notifications").insert({
      user_id: a.student_id,
      type: "appeal_reviewed",
      title: `Your appeal was ${decision}`,
      body: a.projects?.title ?? "",
      link_url: "/dashboard/projects-search",
    });
    toast.success(`Appeal ${decision}`);
    void load();
  };

  return (
    <>
      <PageHeader
        title={role === "admin" ? "Student appeals" : "My appeals"}
        description={
          role === "admin"
            ? "Review appeals contesting flags."
            : "Status of your submitted appeals."
        }
      />
      {loading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : items.length === 0 ? (
        <EmptyState icon={FileText} title="No appeals" />
      ) : (
        <div className="space-y-2">
          {items.map((a) => (
            <div key={a.id} className="rounded-lg border bg-card p-4">
              <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{a.projects?.title}</div>
                  <div className="text-xs text-muted-foreground">
                    By {fullName(a.profiles ?? { email: "—" })}
                  </div>
                  {a.projects?.description && (
                    <p className="text-xs text-muted-foreground mt-1">{a.projects.description}</p>
                  )}
                  <p className="text-sm mt-2 whitespace-pre-wrap">{a.message}</p>
                  <div className="text-xs text-muted-foreground mt-2">
                    {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                  </div>
                </div>
                <div className="shrink-0">
                  {a.status === "pending" && role === "admin" ? (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => review(a, "approved")}>
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => review(a, "rejected")}>
                        Reject
                      </Button>
                    </div>
                  ) : (
                    <Badge
                      variant={
                        a.status === "pending"
                          ? "secondary"
                          : a.status === "approved"
                            ? "default"
                            : "destructive"
                      }
                    >
                      {a.status}
                    </Badge>
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
