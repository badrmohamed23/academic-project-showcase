import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarClock, Pencil, Plus, Trash2, User, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fullName } from "@/lib/validators";

export type Priority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "pending" | "postponed" | "completed";

export interface ProjectTask {
  id: string;
  project_id: string;
  student_id: string;
  title: string;
  description: string | null;
  priority: Priority;
  is_completed: boolean;
  status: TaskStatus;
  due_date: string | null;
  position: number;
  assignee_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssigneeOption {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  is_owner?: boolean;
}

export const PRIORITY_META: Record<Priority, { label: string; chip: string; dot: string }> = {
  low: {
    label: "Low",
    chip: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  medium: {
    label: "Medium",
    chip: "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  high: {
    label: "High",
    chip: "bg-orange-500/15 text-orange-700 border-orange-500/30 dark:text-orange-300",
    dot: "bg-orange-500",
  },
  urgent: {
    label: "Urgent",
    chip: "bg-red-500/15 text-red-700 border-red-500/30 dark:text-red-300",
    dot: "bg-red-500",
  },
};

export const STATUS_META: Record<TaskStatus, { label: string; chip: string; dot: string }> = {
  pending: {
    label: "Pending",
    chip: "bg-slate-500/15 text-slate-700 border-slate-500/30 dark:text-slate-300",
    dot: "bg-slate-500",
  },
  postponed: {
    label: "Postponed",
    chip: "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  completed: {
    label: "Completed",
    chip: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const meta = PRIORITY_META[priority] ?? PRIORITY_META.medium;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        meta.chip,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.pending;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        meta.chip,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

function formatDue(d: string | null) {
  if (!d) return null;
  const date = new Date(d + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((date.getTime() - today.getTime()) / 86400000);
  const label = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
  let tone = "text-muted-foreground";
  if (diff < 0) tone = "text-red-600 dark:text-red-400";
  else if (diff <= 2) tone = "text-amber-600 dark:text-amber-400";
  return { label, tone, diff };
}

async function loadAssignees(projectId: string): Promise<AssigneeOption[]> {
  const { data: proj } = await supabase
    .from("projects")
    .select("student_id")
    .eq("id", projectId)
    .maybeSingle();
  const ownerId = proj?.student_id as string | undefined;
  const { data: collabs } = await supabase
    .from("project_collaborators")
    .select("invitee_id")
    .eq("project_id", projectId)
    .eq("status", "accepted");
  const ids = new Set<string>();
  if (ownerId) ids.add(ownerId);
  for (const c of collabs ?? []) ids.add((c as { invitee_id: string }).invitee_id);
  if (ids.size === 0) return [];

  const { data: roles } = await supabase
    .from("user_roles")
    .select("user_id,role")
    .in("user_id", Array.from(ids));

  const studentIds = new Set<string>();
  for (const id of ids) {
    const roleRecord = (roles ?? []).find((r: any) => r.user_id === id);
    if (!roleRecord || roleRecord.role !== "instructor") {
      studentIds.add(id);
    }
  }

  if (studentIds.size === 0) return [];

  const { data: profs } = await supabase
    .from("profiles")
    .select("id,first_name,last_name,email")
    .in("id", Array.from(studentIds));
  return (profs ?? []).map((p: any) => ({
    id: p.id as string,
    first_name: p.first_name as string | null,
    last_name: p.last_name as string | null,
    email: p.email as string,
    is_owner: p.id === ownerId,
  }));
}

export function ProjectTasksDialog({
  projectId,
  projectTitle,
  onClose,
}: {
  projectId: string;
  projectTitle: string;
  onClose: () => void;
}) {
  const { user, role } = useAuth();
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [assignees, setAssignees] = useState<AssigneeOption[]>([]);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [projectKind, setProjectKind] = useState<"course" | "bachelor">("course");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ProjectTask | null>(null);
  const [openForm, setOpenForm] = useState(false);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [commentingOnTask, setCommentingOnTask] = useState<ProjectTask | null>(null);
  const [deleteFor, setDeleteFor] = useState<ProjectTask | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: proj } = await supabase
      .from("projects")
      .select("student_id,kind")
      .eq("id", projectId)
      .maybeSingle();
    const owner = (proj?.student_id as string | undefined) ?? null;
    setOwnerId(owner);
    setProjectKind(((proj?.kind as string | undefined) ?? "course") as "course" | "bachelor");

    const { data, error } = await supabase
      .from("project_tasks")
      .select("*")
      .eq("project_id", projectId)
      .order("status", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("position", { ascending: true });
    if (error) toast.error(error.message);
    const allTasks = (data ?? []).map((task: any) => ({
      id: task.id,
      project_id: task.project_id,
      student_id: task.student_id ?? owner ?? "",
      title: task.title,
      description: task.description ?? null,
      priority: (task.priority ?? "medium") as Priority,
      is_completed: task.is_completed ?? ((task.status ?? "pending") === "completed"),
      status: (task.status ?? "pending") as TaskStatus,
      due_date: task.due_date ?? null,
      position: task.position ?? 0,
      assignee_id: task.assignee_id ?? null,
      created_at: task.created_at,
      updated_at: task.updated_at,
    })) as ProjectTask[];
    const visibleTasks =
      owner && user && owner !== user.id
        ? allTasks.filter((t) => t.assignee_id === user.id)
        : allTasks;
    setTasks(visibleTasks);
    setAssignees(await loadAssignees(projectId));

    if (visibleTasks.length > 0) {
      const taskIds = visibleTasks.map((t) => t.id);
      const { data: comments } = await supabase
        .from("project_comments")
        .select("task_id")
        .in("task_id", taskIds);

      const counts: Record<string, number> = {};
      comments?.forEach((comment: { task_id: string | null }) => {
        if (comment.task_id) {
          counts[comment.task_id] = (counts[comment.task_id] || 0) + 1;
        }
      });
      setCommentCounts(counts);
    }

    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [projectId]);

  const isOwner = !!user && !!ownerId && user.id === ownerId;

  const setStatus = async (t: ProjectTask, status: TaskStatus) => {
    const { error } = await supabase.from("project_tasks").update({ status }).eq("id", t.id);
    if (error) return toast.error(error.message);
    void load();
  };

  const openCounts = tasks.filter((t) => t.status !== "completed").length;
  const assigneeMap = new Map(assignees.map((a) => [a.id, a]));

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tasks · {projectTitle}</DialogTitle>
            <DialogDescription>
              {openCounts} open · {tasks.length - openCounts} completed
              {!isOwner && " · You can update status of tasks assigned to you."}
            </DialogDescription>
          </DialogHeader>

          {isOwner && (
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setOpenForm(true);
                }}
              >
                <Plus className="h-4 w-4" /> Add task
              </Button>
            </div>
          )}

          {loading ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Loading…</div>
          ) : tasks.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center border border-dashed rounded-lg">
              {isOwner
                ? "No tasks yet. Add your first one to start tracking progress."
                : "No assigned tasks yet. You will see tasks assigned to you here."}
            </div>
          ) : (
            <ul className="space-y-2">
              {tasks.map((t) => {
                const canEditFull = isOwner;
                const canEditStatus = isOwner || (!!user && t.assignee_id === user.id);
                const taskCommentCount = commentCounts[t.id] || 0;
                const canComment =
                  role === "instructor" || (role === "student" && taskCommentCount > 0);
                return (
                  <TaskRow
                    key={t.id}
                    task={t}
                    assignee={t.assignee_id ? (assigneeMap.get(t.assignee_id) ?? null) : null}
                    canEditFull={canEditFull}
                    canEditStatus={canEditStatus}
                    canComment={canComment}
                    commentCount={taskCommentCount}
                    onStatusChange={(s) => setStatus(t, s)}
                    onEdit={() => {
                      setEditing(t);
                      setOpenForm(true);
                    }}
                    onDelete={() => setDeleteFor(t)}
                    onComment={() => setCommentingOnTask(t)}
                  />
                );
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      {openForm && user && isOwner && (
        <TaskFormDialog
          key={editing?.id ?? "new"}
          task={editing}
          projectId={projectId}
          studentId={user.id}
          assignees={assignees}
          allowAssignees={projectKind !== "bachelor"}
          onClose={() => {
            setOpenForm(false);
            setEditing(null);
            void load();
          }}
        />
      )}

      {deleteFor && (
        <AlertDialog open onOpenChange={(o) => !o && setDeleteFor(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this task?</AlertDialogTitle>
              <AlertDialogDescription>
                "{deleteFor.title}" will be permanently removed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90"
                onClick={async () => {
                  const { error } = await supabase
                    .from("project_tasks")
                    .delete()
                    .eq("id", deleteFor.id);
                  setDeleteFor(null);
                  if (error) return toast.error(error.message);
                  toast.success("Task deleted");
                  void load();
                }}
              >
                Yes, delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {commentingOnTask && (
        <TaskCommentsDialog
          task={commentingOnTask}
          projectId={projectId}
          onClose={() => {
            setCommentingOnTask(null);
            void load();
          }}
          onCommentsChanged={() => void load()}
        />
      )}
    </>
  );
}

function TaskCommentsDialog({
  task,
  projectId,
  onClose,
  onCommentsChanged,
}: {
  task: ProjectTask;
  projectId: string;
  onClose: () => void;
  onCommentsChanged?: () => void;
}) {
  const { user, role } = useAuth();
  const [comments, setComments] = useState<any[]>([]);
  const [authors, setAuthors] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");

  const isInstructor = role === "instructor";

  const loadComments = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("project_comments")
      .select("*")
      .eq("project_id", projectId)
      .eq("task_id", task.id)
      .order("created_at", { ascending: false });

    const commentList = data ?? [];
    setComments(commentList);

    const ids = Array.from(
      new Set(commentList.map((c: { author_id: string }) => c.author_id)),
    );
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,first_name,last_name,email")
        .in("id", ids);
      const map: Record<string, any> = {};
      for (const p of profs ?? []) map[p.id] = p;
      setAuthors(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadComments();
  }, [task.id, projectId]);

  const submitComment = async () => {
    if (!user || !newComment.trim()) return;
    const { error } = await supabase.from("project_comments").insert({
      project_id: projectId,
      task_id: task.id,
      author_id: user.id,
      body: newComment.trim(),
    });
    if (error) return toast.error(error.message);
    setNewComment("");
    toast.success("Comment added");
    void loadComments();
    onCommentsChanged?.();
  };

  const deleteComment = async (commentId: string) => {
    if (!confirm("Delete this comment?")) return;
    const { error } = await supabase.from("project_comments").delete().eq("id", commentId);
    if (error) return toast.error(error.message);
    void loadComments();
    onCommentsChanged?.();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isInstructor ? "Comments on" : "View comments on"} "{task.title}"
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {isInstructor && (
            <div className="border rounded-lg p-3">
              <Textarea
                placeholder="Add a comment..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                rows={3}
              />
              <div className="flex justify-end mt-2">
                <Button size="sm" onClick={submitComment} disabled={!newComment.trim()}>
                  Post Comment
                </Button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-sm text-muted-foreground text-center py-4">
              Loading comments...
            </div>
          ) : comments.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-4">No comments yet.</div>
          ) : (
            <div className="space-y-3">
              {comments.map((c) => {
                const author = authors[c.author_id];
                const isMine = c.author_id === user?.id;
                return (
                  <div key={c.id} className="border rounded-lg p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm">
                        <span className="font-medium">
                          {author ? fullName(author) : "Instructor"}
                        </span>{" "}
                        <span className="text-xs text-muted-foreground">
                          · {new Date(c.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      {isInstructor && isMine && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteComment(c.id)}
                          className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    <p className="mt-2 text-sm whitespace-pre-wrap">{c.body}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TaskRow({
  task,
  assignee,
  canEditFull = true,
  canEditStatus = true,
  canComment = false,
  commentCount = 0,
  onStatusChange,
  onEdit,
  onDelete,
  onComment,
  leading,
}: {
  task: ProjectTask;
  assignee?: AssigneeOption | null;
  canEditFull?: boolean;
  canEditStatus?: boolean;
  canComment?: boolean;
  commentCount?: number;
  onStatusChange: (s: TaskStatus) => void;
  onEdit: () => void;
  onDelete: () => void;
  onComment?: () => void;
  leading?: React.ReactNode;
}) {
  const due = formatDue(task.due_date);
  const completed = task.status === "completed";
  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-md border p-3 transition-colors",
        completed && "bg-muted/40",
      )}
    >
      <div className="w-[140px] shrink-0 mt-0.5">
        <Select
          value={task.status}
          onValueChange={(v) => onStatusChange(v as TaskStatus)}
          disabled={!canEditStatus}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(STATUS_META) as TaskStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                <span className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-full", STATUS_META[s].dot)} />
                  {STATUS_META[s].label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={cn(
              "text-sm font-medium",
              completed && "line-through text-muted-foreground",
            )}
          >
            {task.title}
          </span>
          <PriorityBadge priority={task.priority} />
          {assignee && (
            <Badge variant="outline" className="text-[10px] gap-1">
              <User className="h-3 w-3" />
              {fullName(assignee) || assignee.email}
            </Badge>
          )}
          {due && (
            <span
              className={cn("inline-flex items-center gap-1 text-[11px] font-medium", due.tone)}
            >
              <CalendarClock className="h-3 w-3" />
              {due.label}
              {due.diff < 0 && !completed && " (overdue)"}
            </span>
          )}
          {leading}
        </div>
        {task.description && (
          <p
            className={cn(
              "text-xs text-muted-foreground mt-1 whitespace-pre-wrap",
              completed && "line-through",
            )}
          >
            {task.description}
          </p>
        )}
      </div>
      <div className="flex gap-1 shrink-0">
        {canComment && onComment && (
          <Button size="sm" variant="ghost" onClick={onComment} aria-label="Comments">
            <MessageSquare className="h-4 w-4" />
            {commentCount > 0 && (
              <span className="ml-1 text-xs bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                {commentCount}
              </span>
            )}
          </Button>
        )}
        {canEditFull && (
          <>
            <Button size="sm" variant="ghost" onClick={onEdit} aria-label="Edit task">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={onDelete} aria-label="Delete task">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

function TaskFormDialog({
  task,
  projectId,
  studentId,
  assignees,
  allowAssignees = true,
  onClose,
}: {
  task: ProjectTask | null;
  projectId: string;
  studentId: string;
  assignees: AssigneeOption[];
  allowAssignees?: boolean;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [priority, setPriority] = useState<Priority>(task?.priority ?? "medium");
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "pending");
  const [dueDate, setDueDate] = useState<string>(task?.due_date ?? "");
  const [assigneeId, setAssigneeId] = useState<string>(task?.assignee_id ?? "__none__");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setBusy(true);
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      priority,
      status,
      due_date: dueDate || null,
      assignee_id: !allowAssignees ? null : assigneeId === "__none__" ? null : assigneeId,
    };
    const res = task
      ? await supabase.from("project_tasks").update(payload).eq("id", task.id)
      : await supabase
          .from("project_tasks")
          .insert({ ...payload, project_id: projectId, student_id: studentId });
    setBusy(false);
    if (res.error) return toast.error(res.error.message);
    toast.success(task ? "Task updated" : "Task added");
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{task ? "Edit task" : "New task"}</DialogTitle>
          <DialogDescription>Track what needs to get done on this project.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="task-desc">Description</Label>
            <Textarea
              id="task-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_META) as TaskStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      <span className="flex items-center gap-2">
                        <span className={cn("h-2 w-2 rounded-full", STATUS_META[s].dot)} />
                        {STATUS_META[s].label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PRIORITY_META) as Priority[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      <span className="flex items-center gap-2">
                        <span className={cn("h-2 w-2 rounded-full", PRIORITY_META[p].dot)} />
                        {PRIORITY_META[p].label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="due">Deadline</Label>
            <Input
              id="due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          {allowAssignees && (
            <div>
              <Label>Assignee</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unassigned</SelectItem>
                  {assignees.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {fullName(a) || a.email}
                      {a.is_owner ? " (owner)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Only one person can be assigned. Choose from the project owner and accepted
                collaborators.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { TaskFormDialog };