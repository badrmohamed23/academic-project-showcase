import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GitBranch } from "lucide-react";
import { fullName } from "@/lib/validators";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/dashboard/link-requests")({
  component: LinkRequestsPage,
});

interface Req {
  id: string;
  instructor_id: string;
  course_id: string;
  action: "link" | "unlink";
  status?: "pending" | "approved" | "rejected";
  created_at: string;
  profiles: { first_name: string | null; last_name: string | null; email: string } | null;
  courses: { name: string; code: string } | null;
}

function LinkRequestsPage() {
  const { role, user } = useAuth();
  const [items, setItems] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase
      .from("instructor_link_requests")
      .select("*, profiles:instructor_id(first_name,last_name,email), courses(name,code)")
      .order("created_at", { ascending: false });
    setItems((data ?? []) as unknown as Req[]);
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, []);

  const review = async (req: Req, decision: "approved" | "rejected") => {
    if (!user) return;
    const { error } = await supabase
      .from("instructor_link_requests")
      .update({
        status: decision,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", req.id);
    if (error) return toast.error(error.message);

    if (decision === "approved") {
      if (req.action === "link") {
        await supabase.from("instructor_courses").insert({
          instructor_id: req.instructor_id,
          course_id: req.course_id,
        });
      } else {
        await supabase
          .from("instructor_courses")
          .delete()
          .eq("instructor_id", req.instructor_id)
          .eq("course_id", req.course_id);
      }
    }
    // Notify instructor
    await supabase.from("notifications").insert({
      user_id: req.instructor_id,
      type: "link_request_reviewed",
      title: `Your ${req.action} request was ${decision}`,
      body: `${req.courses?.code ?? ""} ${req.courses?.name ?? ""}`.trim(),
      link_url: "/dashboard/my-links",
    });
    toast.success(`Request ${decision}`);
    void load();
  };

  if (role !== "admin") return <EmptyState title="Admins only" />;

  const getStatus = (req: Req) => req.status ?? "pending";

  return (
    <>
      <PageHeader
        title="Course link requests"
        description="Approve or reject instructors linking themselves to courses."
      />
      {loading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : items.length === 0 ? (
        <EmptyState icon={GitBranch} title="No requests" />
      ) : (
        <div className="space-y-2">
          {items.map((r) => (
            <div
              key={r.id}
              className="rounded-lg border bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium">
                  {fullName(r.profiles ?? { email: "—" })}{" "}
                  <Badge variant="outline" className="ml-1">
                    {r.action}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  {r.courses?.code} — {r.courses?.name} ·{" "}
                  {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                </div>
              </div>
              {getStatus(r) === "pending" ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => review(r, "approved")}
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => review(r, "rejected")}
                    className="border-red-500 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30"
                  >
                    Reject
                  </Button>
                </div>
              ) : (
                <Badge
                  variant={getStatus(r) === "approved" ? "default" : "destructive"}
                  className={
                    getStatus(r) === "approved"
                      ? "bg-emerald-600 text-white hover:bg-emerald-600"
                      : "bg-red-600 text-white hover:bg-red-600"
                  }
                >
                  {getStatus(r)}
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
