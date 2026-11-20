// Req #25–31 — Project collaboration: invite, cancel, accept, reject, remove
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, UserPlus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fullName } from "@/lib/validators";

interface SearchResult {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  role: "student" | "instructor";
}

interface CollabRow {
  id: string;
  project_id: string;
  invitee_id: string;
  invitee_role: "student" | "instructor" | "employer" | "admin";
  status: "pending" | "accepted" | "rejected" | "cancelled";
  created_at: string;
  invitee?: { first_name: string | null; last_name: string | null; email: string } | null;
}

export function CollaboratorsDialog({
  projectId,
  projectTitle,
  courseId,
  onClose,
}: {
  projectId: string;
  projectTitle: string;
  courseId: string | null;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [rows, setRows] = useState<CollabRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [linkedInstructorIds, setLinkedInstructorIds] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("project_collaborators")
      .select("id,project_id,invitee_id,invitee_role,status,created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    const list = (data ?? []) as CollabRow[];
    if (list.length) {
      const ids = list.map((r) => r.invitee_id);
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,first_name,last_name,email")
        .in("id", ids);
      const m = new Map((profs ?? []).map((p) => [p.id as string, p]));
      for (const r of list) r.invitee = (m.get(r.invitee_id) as CollabRow["invitee"]) ?? null;
    }
    setRows(list);

    // Load instructors linked to this project's course (only they can be invited as instructor)
    if (courseId) {
      const { data: ic } = await supabase
        .from("instructor_courses")
        .select("instructor_id")
        .eq("course_id", courseId);
      setLinkedInstructorIds(new Set((ic ?? []).map((x) => x.instructor_id as string)));
    } else {
      // bachelor project: all instructors auto-linked
      const { data: instr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "instructor");
      setLinkedInstructorIds(new Set((instr ?? []).map((x) => x.user_id as string)));
    }
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, [projectId, courseId]);

  // Search students or instructors by email/first/last
  const doSearch = async () => {
    const term = q.trim();
    if (!term) {
      setResults([]);
      return;
    }
    setSearching(true);
    const { data: profs } = await supabase
      .from("profiles")
      .select("id,first_name,last_name,email")
      .or(`email.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%`)
      .limit(20);
    const ids = (profs ?? []).map((p) => p.id as string);
    let withRoles: SearchResult[] = [];
    if (ids.length) {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id,role")
        .in("user_id", ids);
      const roleMap = new Map((roles ?? []).map((r) => [r.user_id as string, r.role as string]));
      withRoles = (profs ?? [])
        .map((p) => ({
          id: p.id as string,
          first_name: p.first_name as string | null,
          last_name: p.last_name as string | null,
          email: p.email as string,
          role: roleMap.get(p.id as string) as SearchResult["role"],
        }))
        .filter((r) => r.role === "student" || r.role === "instructor")
        .filter((r) => r.id !== user?.id) // can't invite self
        .filter((r) => r.role === "student" || linkedInstructorIds.has(r.id)); // instructors must be linked
    }
    setSearching(false);
    setResults(withRoles);
  };

  const invite = async (target: SearchResult) => {
    if (!user) return;
    const existing = rows.find(
      (r) => r.invitee_id === target.id && (r.status === "pending" || r.status === "accepted"),
    );
    if (existing) return toast.info("Already invited");
    const { error } = await supabase.from("project_collaborators").insert({
      project_id: projectId,
      invitee_id: target.id,
      invitee_role: target.role,
      invited_by: user.id,
      status: "pending",
    });
    if (error) return toast.error(error.message);
    toast.success(`Invited ${fullName(target)}`);
    setResults((prev) => prev.filter((r) => r.id !== target.id));
    void load();
  };

  const cancel = async (id: string) => {
    const { error } = await supabase
      .from("project_collaborators")
      .update({ status: "cancelled" })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Invitation cancelled");
    void load();
  };

  const removeAccepted = async (id: string) => {
    if (!confirm("Remove this collaborator from the project?")) return;
    const { error } = await supabase.from("project_collaborators").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Collaborator removed");
    void load();
  };

  const statusBadge = (s: CollabRow["status"]) => {
    const map = {
      pending: <Badge variant="secondary">No reply</Badge>,
      accepted: <Badge className="bg-emerald-600 hover:bg-emerald-600">Accepted</Badge>,
      rejected: <Badge variant="destructive">Rejected</Badge>,
      cancelled: <Badge variant="outline">Cancelled</Badge>,
    };
    return map[s];
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Collaborators · {projectTitle}</DialogTitle>
          <DialogDescription>
            Invite students and linked course instructors to collaborate.
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search by email, first or last name…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void doSearch();
                  }
                }}
              />
            </div>
            <Button onClick={doSearch} disabled={searching || !q.trim()}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
            </Button>
          </div>
          {results.length > 0 && (
            <div className="rounded-lg border divide-y">
              {results.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-3">
                  <div>
                    <div className="text-sm font-medium">{fullName(r)}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.email} · {r.role}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => invite(r)}>
                    <UserPlus className="h-4 w-4" /> Invite
                  </Button>
                </div>
              ))}
            </div>
          )}
          {q && !searching && results.length === 0 && (
            <div className="text-xs text-muted-foreground">
              No matching students or linked instructors.
            </div>
          )}
        </div>

        {/* Existing invitations / collaborators */}
        <div className="mt-4">
          <div className="text-sm font-medium mb-2">Invitations & collaborators</div>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground">No invitations yet.</div>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-2 rounded-lg border bg-card p-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {r.invitee ? fullName(r.invitee) : r.invitee_id}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {r.invitee?.email} · {r.invitee_role}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {statusBadge(r.status)}
                    {r.status === "pending" && (
                      <Button size="sm" variant="outline" onClick={() => cancel(r.id)}>
                        <X className="h-4 w-4" /> Cancel
                      </Button>
                    )}
                    {r.status === "accepted" && (
                      <Button size="sm" variant="ghost" onClick={() => removeAccepted(r.id)}>
                        <X className="h-4 w-4 text-destructive" /> Remove
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
