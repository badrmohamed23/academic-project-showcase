// Req #37–41 — Instructor feedback: comments on project/tasks/thesis + project rating
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Star, Send, Pencil, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { fullName } from "@/lib/validators";
import { isBachelorSupervisorForCourseCode } from "@/lib/bachelor-supervisors";
import { cn } from "@/lib/utils";

interface Comment {
  id: string;
  body: string;
  author_id: string;
  task_id: string | null;
  thesis_id: string | null;
  created_at: string;
  updated_at: string;
}

interface AuthorInfo {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
}

interface ProjectMetadata {
  kind: "course" | "bachelor";
  course_code: string | null;
  is_active: boolean;
  student_id: string | null;
}

export function ProjectFeedbackDialog({
  projectId,
  projectTitle,
  onClose,
}: {
  projectId: string;
  projectTitle: string;
  onClose: () => void;
}) {
  const { user, role } = useAuth();
  const isInstructor = role === "instructor";
  const [comments, setComments] = useState<Comment[]>([]);
  const [authors, setAuthors] = useState<Record<string, AuthorInfo>>({});
  const [tasks, setTasks] = useState<{ id: string; title: string }[]>([]);
  const [theses, setTheses] = useState<{ id: string; label: string | null }[]>([]);
  const [projectMetadata, setProjectMetadata] = useState<ProjectMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [isCollaborator, setIsCollaborator] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: cs }, { data: ts }, { data: th }, { data: collab }, { data: proj }] =
      await Promise.all([
        supabase
          .from("project_comments")
          .select("*")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false }),
        supabase.from("project_tasks").select("id,title").eq("project_id", projectId),
        supabase.from("thesis_drafts").select("id,label").eq("project_id", projectId),
        isInstructor && user
          ? supabase
              .from("project_collaborators")
              .select("id")
              .eq("project_id", projectId)
              .eq("invitee_id", user.id)
              .eq("status", "accepted")
              .limit(1)
          : Promise.resolve({ data: null }),
        supabase
          .from("projects")
          .select("kind,is_active,student_id,courses(code)")
          .eq("id", projectId)
          .maybeSingle(),
      ]);
    const list = (cs ?? []) as Comment[];
    setComments(list);
    setTasks((ts ?? []) as { id: string; title: string }[]);
    setTheses((th ?? []) as { id: string; label: string | null }[]);
    setIsCollaborator(isInstructor && user ? !!(collab && collab.length > 0) : false);
    setProjectMetadata(
      proj
        ? {
            kind: ((proj.kind as string | undefined) ?? "course") as "course" | "bachelor",
            course_code: proj.courses?.code ?? null,
            is_active: proj.is_active ?? true,
            student_id: proj.student_id ?? null,
          }
        : null,
    );
    const ids = Array.from(new Set(list.map((c) => c.author_id)));
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,first_name,last_name,email")
        .in("id", ids);
      const map: Record<string, AuthorInfo> = {};
      for (const p of profs ?? []) map[p.id as string] = p as AuthorInfo;
      setAuthors(map);
    }
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, [projectId, user?.id]);

  const taskTitle = (id: string) => tasks.find((t) => t.id === id)?.title ?? "task";
  const thesisLabel = (id: string) => theses.find((t) => t.id === id)?.label ?? "draft";

  const generalComments = comments.filter((c) => !c.task_id && !c.thesis_id);
  const taskComments = comments.filter((c) => c.task_id);
  const thesisComments = comments.filter((c) => c.thesis_id);
  const isProjectStudent = !!projectMetadata && !!user && user.id === projectMetadata.student_id;
  const isBachelorSupervisor = isBachelorSupervisorForCourseCode(projectMetadata?.course_code, user?.id);
  const showTaskFeedbackTab =
    !!projectMetadata &&
    (projectMetadata.kind === "course"
      ? isCollaborator
      : isCollaborator || isProjectStudent || isBachelorSupervisor);
  const showThesisFeedbackTab =
    projectMetadata?.kind === "bachelor" &&
    (isCollaborator || isProjectStudent || isBachelorSupervisor);

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Feedback · {projectTitle}</DialogTitle>
          <DialogDescription>
            {isCollaborator
              ? "Comment on tasks for this project."
              : isInstructor
                ? "Add ratings and comments on this project."
                : "Instructor feedback on this project."}
          </DialogDescription>
        </DialogHeader>

        {!isCollaborator && <RatingSection projectId={projectId} canRate={isInstructor} />}

        <Tabs defaultValue="project" className="mt-4">
          <TabsList>
            <TabsTrigger value="project">General ({generalComments.length})</TabsTrigger>
            {showTaskFeedbackTab && (
              <TabsTrigger value="tasks" disabled={tasks.length === 0}>
                Tasks ({taskComments.length})
              </TabsTrigger>
            )}
            {showThesisFeedbackTab && (
              <TabsTrigger value="thesis" disabled={theses.length === 0}>
                Thesis ({thesisComments.length})
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="project">
            {isInstructor && <NewCommentForm projectId={projectId} onAdded={load} />}
            <CommentList
              items={generalComments}
              authors={authors}
              userId={user?.id}
              onChanged={load}
            />
          </TabsContent>

          {showTaskFeedbackTab && (
            <TabsContent value="tasks">
              {isInstructor && tasks.length > 0 && (
                <NewCommentForm
                  projectId={projectId}
                  onAdded={load}
                  targets={tasks.map((t) => ({ id: t.id, label: t.title }))}
                  targetKey="task_id"
                  placeholder="Comment on a task…"
                />
              )}
              <CommentList
                items={taskComments}
                authors={authors}
                userId={user?.id}
                onChanged={load}
                renderContext={(c) => (
                  <span className="text-xs text-muted-foreground">
                    on task: {taskTitle(c.task_id!)}
                  </span>
                )}
              />
            </TabsContent>
          )}

          {showThesisFeedbackTab && (
            <TabsContent value="thesis">
              {isInstructor && theses.length > 0 && (
                <NewCommentForm
                  projectId={projectId}
                  onAdded={load}
                  targets={theses.map((t) => ({ id: t.id, label: t.label ?? "draft" }))}
                  targetKey="thesis_id"
                  placeholder="Comment on a thesis draft…"
                />
              )}
              {theses.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center">
                  No thesis drafts uploaded yet.
                </div>
              ) : (
                <CommentList
                  items={thesisComments}
                  authors={authors}
                  userId={user?.id}
                  onChanged={load}
                  renderContext={(c) => (
                    <span className="text-xs text-muted-foreground">
                      on draft: {thesisLabel(c.thesis_id!)}
                    </span>
                  )}
                />
              )}
            </TabsContent>
          )}
        </Tabs>

        {loading && <div className="text-muted-foreground text-sm">Loading…</div>}
      </DialogContent>
    </Dialog>
  );
}

function NewCommentForm({
  projectId,
  onAdded,
  targets,
  targetKey,
  placeholder = "Write a comment…",
}: {
  projectId: string;
  onAdded: () => void;
  targets?: { id: string; label: string }[];
  targetKey?: "task_id" | "thesis_id";
  placeholder?: string;
}) {
  const { user } = useAuth();
  const [body, setBody] = useState("");
  const [target, setTarget] = useState<string>(targets?.[0]?.id ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!user || !body.trim()) return;
    setBusy(true);
    const payload: {
      project_id: string;
      author_id: string;
      body: string;
      task_id?: string;
      thesis_id?: string;
    } = {
      project_id: projectId,
      author_id: user.id,
      body: body.trim(),
    };
    if (targetKey === "task_id" && target) payload.task_id = target;
    if (targetKey === "thesis_id" && target) payload.thesis_id = target;
    const { error } = await supabase.from("project_comments").insert(payload);
    setBusy(false);
    if (error) return toast.error(error.message);
    setBody("");
    toast.success("Comment added");
    onAdded();
  };

  return (
    <div className="rounded-lg border bg-card p-3 mt-3 space-y-2">
      {targets && targets.length > 0 && (
        <select
          className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        >
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      )}
      <Textarea
        placeholder={placeholder}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
      />
      <div className="flex justify-end">
        <Button size="sm" onClick={submit} disabled={busy || !body.trim()}>
          <Send className="h-4 w-4" /> Post
        </Button>
      </div>
    </div>
  );
}

function CommentList({
  items,
  authors,
  userId,
  onChanged,
  renderContext,
}: {
  items: Comment[];
  authors: Record<string, AuthorInfo>;
  userId?: string;
  onChanged: () => void;
  renderContext?: (c: Comment) => React.ReactNode;
}) {
  if (items.length === 0) {
    return <div className="text-sm text-muted-foreground py-6 text-center">No comments yet.</div>;
  }
  return (
    <div className="space-y-2 mt-3">
      {items.map((c) => (
        <CommentRow
          key={c.id}
          c={c}
          author={authors[c.author_id]}
          isMine={c.author_id === userId}
          onChanged={onChanged}
          renderContext={renderContext}
        />
      ))}
    </div>
  );
}

function CommentRow({
  c,
  author,
  isMine,
  onChanged,
  renderContext,
}: {
  c: Comment;
  author?: AuthorInfo;
  isMine: boolean;
  onChanged: () => void;
  renderContext?: (c: Comment) => React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c.body);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const { error } = await supabase
      .from("project_comments")
      .update({ body: draft.trim() })
      .eq("id", c.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    setEditing(false);
    onChanged();
  };
  const remove = async () => {
    if (!confirm("Delete this comment?")) return;
    const { error } = await supabase.from("project_comments").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    onChanged();
  };

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm">
          <span className="font-medium">{author ? fullName(author) : "Instructor"}</span>{" "}
          <span className="text-xs text-muted-foreground">
            · {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
          </span>
          {renderContext && <> · {renderContext(c)}</>}
        </div>
        {isMine && !editing && (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)} aria-label="Edit">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" onClick={remove} aria-label="Delete">
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        )}
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <Textarea rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} />
          <div className="flex gap-2 justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDraft(c.body);
                setEditing(false);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={save} disabled={busy || !draft.trim()}>
              <Check className="h-4 w-4" /> Save
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-1 text-sm whitespace-pre-wrap">{c.body}</p>
      )}
    </div>
  );
}

interface Rating {
  id: string;
  rating: number;
  instructor_id: string;
  comment?: string;
}

export function RatingSection({ projectId, canRate }: { projectId: string; canRate: boolean }) {
  const { user } = useAuth();
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("project_ratings")
      .select("id,rating,instructor_id,comment")
      .eq("project_id", projectId);
    setRatings((data ?? []) as Rating[]);
    const myRating = (data ?? []).find((r: any) => r.instructor_id === user?.id);
    if (myRating?.comment) setComment(myRating.comment);
  };
  useEffect(() => {
    void load();
  }, [projectId]);

  const myRating = ratings.find((r) => r.instructor_id === user?.id);
  const avg = ratings.length === 0 ? 0 : ratings.reduce((s, r) => s + r.rating, 0) / ratings.length;

  const setRating = async (val: number) => {
    if (!user || !canRate) return;
    setBusy(true);
    const res = myRating
      ? await supabase
          .from("project_ratings")
          .update({ rating: val, comment: comment.trim() || null })
          .eq("id", myRating.id)
      : await supabase.from("project_ratings").insert({
          project_id: projectId,
          instructor_id: user.id,
          rating: val,
          comment: comment.trim() || null,
        });
    setBusy(false);
    if (res.error) return toast.error(res.error.message);
    toast.success("Rating saved");
    void load();
  };

  const removeRating = async () => {
    if (!user || !myRating) return;
    const { error } = await supabase.from("project_ratings").delete().eq("id", myRating.id);
    if (error) return toast.error(error.message);
    setComment("");
    toast.success("Rating removed");
    void load();
  };

  return (
    <div className="rounded-lg border bg-card p-4 mt-2 space-y-3">
      <div>
        <div className="text-sm font-medium">Project rating</div>
        <div className="text-xs text-muted-foreground">
          {ratings.length === 0
            ? "Not rated yet"
            : `${avg.toFixed(1)} / 5 from ${ratings.length} instructor${ratings.length === 1 ? "" : "s"}`}
        </div>
      </div>

      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = canRate ? n <= (myRating?.rating ?? 0) : n <= Math.round(avg);
          return (
            <button
              key={n}
              disabled={!canRate || busy}
              onClick={() => setRating(n)}
              aria-label={`Rate ${n} star${n === 1 ? "" : "s"}`}
              className={cn(
                "p-0.5 transition",
                canRate && "hover:scale-110 cursor-pointer",
                !canRate && "cursor-default",
              )}
            >
              <Star
                className={cn(
                  "h-5 w-5",
                  filled ? "fill-amber-400 text-amber-400" : "text-muted-foreground",
                )}
              />
            </button>
          );
        })}
        {canRate && myRating && myRating.rating > 0 && (
          <Button size="sm" variant="ghost" onClick={removeRating}>
            Clear
          </Button>
        )}
      </div>

      {canRate && (
        <div className="space-y-2">
          <Textarea
            placeholder="Add a comment about this project…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
          />
          {myRating && myRating.rating > 0 && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setRating(myRating.rating)} disabled={busy}>
                <Send className="h-4 w-4" /> Save
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
