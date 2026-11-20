// Req #28, #29 — Invitations inbox: view all pending invitations, accept or reject
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, EmptyState } from "@/components/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Inbox, Check, X, FolderKanban } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { fullName } from "@/lib/validators";

export const Route = createFileRoute("/dashboard/invitations")({
  component: InvitationsPage,
});

interface Invitation {
  id: string;
  project_id: string;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  created_at: string;
  invited_by: string;
  project?: { title: string; student_id: string } | null;
  inviter?: { first_name: string | null; last_name: string | null; email: string } | null;
}

function InvitationsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("project_collaborators")
      .select("id,project_id,status,created_at,invited_by")
      .eq("invitee_id", user.id)
      .order("created_at", { ascending: false });
    const list = (data ?? []) as Invitation[];
    if (list.length) {
      const pids = Array.from(new Set(list.map((i) => i.project_id)));
      const ipids = Array.from(new Set(list.map((i) => i.invited_by)));
      const [{ data: projs }, { data: profs }] = await Promise.all([
        supabase.from("projects").select("id,title,student_id").in("id", pids),
        supabase.from("profiles").select("id,first_name,last_name,email").in("id", ipids),
      ]);
      const projMap = new Map((projs ?? []).map((p) => [p.id as string, p]));
      const profMap = new Map((profs ?? []).map((p) => [p.id as string, p]));
      for (const i of list) {
        i.project = (projMap.get(i.project_id) as Invitation["project"]) ?? null;
        i.inviter = (profMap.get(i.invited_by) as Invitation["inviter"]) ?? null;
      }
    }
    setItems(list);
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, [user]);

  const respond = async (id: string, status: "accepted" | "rejected") => {
    const { error } = await supabase
      .from("project_collaborators")
      .update({ status, responded_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Invitation ${status}`);
    void load();
  };

  return (
    <>
      <PageHeader
        title="Invitations"
        description="Project collaboration invitations sent to you."
      />
      {loading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No invitations"
          description="You'll see project collaboration requests here."
        />
      ) : (
        <div className="space-y-2">
          {items.map((i) => (
            <div
              key={i.id}
              className="rounded-lg border bg-card p-4 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="font-medium flex items-center gap-2">
                  <FolderKanban className="h-4 w-4" />
                  {i.project?.title ?? "Project"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Invited by {i.inviter ? fullName(i.inviter) : "—"} ·{" "}
                  {formatDistanceToNow(new Date(i.created_at), { addSuffix: true })}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {i.status === "pending" ? (
                  <>
                    <Button size="sm" onClick={() => respond(i.id, "accepted")}>
                      <Check className="h-4 w-4" /> Accept
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => respond(i.id, "rejected")}>
                      <X className="h-4 w-4" /> Reject
                    </Button>
                  </>
                ) : (
                  <Badge
                    variant={
                      i.status === "accepted"
                        ? "default"
                        : i.status === "rejected"
                          ? "destructive"
                          : "outline"
                    }
                    className="capitalize"
                  >
                    {i.status}
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
