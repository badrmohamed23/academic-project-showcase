import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GitBranch } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/my-links")({
  component: MyLinksPage,
});

interface Link {
  id: string;
  course_id: string;
  courses: { name: string; code: string } | null;
}

interface PendingRequest {
  id: string;
  course_id: string;
  action: "link" | "unlink";
  courses: { name: string; code: string } | null;
}

function MyLinksPage() {
  const { user, role } = useAuth();
  const [links, setLinks] = useState<Link[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    const [{ data: linkedCourses }, { data: pendingReqs }] = await Promise.all([
      supabase
        .from("instructor_courses")
        .select("id, course_id, courses(name,code)")
        .eq("instructor_id", user.id),
      supabase
        .from("instructor_link_requests")
        .select("id, course_id, action, courses(name,code)")
        .eq("instructor_id", user.id)
        .eq("status", "pending"),
    ]);
    setLinks((linkedCourses ?? []) as unknown as Link[]);
    setPendingRequests((pendingReqs ?? []) as unknown as PendingRequest[]);
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, [user]);

  const requestUnlink = async (course_id: string) => {
    if (!user) return;
    const { error } = await supabase.from("instructor_link_requests").insert({
      instructor_id: user.id,
      course_id,
      action: "unlink",
    });
    if (error) return toast.error(error.message);
    
    toast.success("Unlink request submitted");
    void load();
  };

  const cancelRequest = async (requestId: string) => {
    const { error } = await supabase
      .from("instructor_link_requests")
      .update({ status: "rejected" })
      .eq("id", requestId);
    if (error) return toast.error(error.message);
    toast.success("Request cancelled");
    void load();
  };

  if (role !== "instructor") return <EmptyState title="Instructors only" />;

  return (
    <>
      <PageHeader
        title="My course links"
        description="Courses you are linked to."
        actions={
          <Button asChild variant="outline">
            <Link to="/dashboard/courses">Browse courses</Link>
          </Button>
        }
      />
      {loading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : (
        <div className="space-y-6">
          {/* Linked courses */}
          {links.length === 0 && pendingRequests.length === 0 ? (
            <EmptyState
              icon={GitBranch}
              title="No course links yet"
              description="Browse courses and request to link."
            />
          ) : (
            <>
              {links.length > 0 && (
                <section>
                  <h3 className="font-semibold mb-3">Active links</h3>
                  <div className="space-y-2">
                    {links.map((l) => (
                      <div
                        key={l.id}
                        className="rounded-lg border bg-card p-4 flex items-center justify-between"
                      >
                        <div>
                          <div className="font-medium">{l.courses?.name}</div>
                          <div className="text-sm text-muted-foreground font-mono">{l.courses?.code}</div>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => requestUnlink(l.course_id)}>
                          Unlink
                        </Button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Pending requests */}
              {pendingRequests.length > 0 && (
                <section>
                  <h3 className="font-semibold mb-3">Pending requests</h3>
                  <div className="space-y-2">
                    {pendingRequests.map((req) => (
                      <div
                        key={req.id}
                        className="rounded-lg border bg-card p-4 flex items-center justify-between"
                      >
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {req.courses?.name}
                            <Badge variant="secondary">
                              {req.action === "link" ? "Link" : "Unlink"} pending
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground font-mono">{req.courses?.code}</div>
                        </div>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => cancelRequest(req.id)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          Cancel
                        </Button>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
