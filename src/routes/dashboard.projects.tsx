import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FolderKanban,
  Plus,
  Flag,
  Pencil,
  Trash2,
  ExternalLink,
  MessageSquare,
  Upload,
  Video,
  FileText,
  Eye,
  EyeOff,
  Star,
  Loader2,
  CheckCircle2,
  Download,
  ListChecks,
  Users as UsersIcon,
} from "lucide-react";
import { fullName } from "@/lib/validators";
import { toast } from "sonner";
import { ProjectTasksDialog } from "@/components/project-tasks-dialog";
import { CollaboratorsDialog } from "@/components/collaborators-dialog";
import { ProjectFeedbackDialog } from "@/components/project-feedback-dialog";
import { StorageLink } from "@/components/storage-link";

export const Route = createFileRoute("/dashboard/projects")({
  component: ProjectsPage,
});

interface Project {
  id: string;
  title: string;
  description: string | null;
  link: string | null;
  is_active: boolean;
  is_admin_active: boolean;
  is_flagged: boolean;
  in_portfolio: boolean;
  student_id: string;
  course_id: string | null;
  kind: "course" | "bachelor";
  file_path: string | null;
  video_path: string | null;
  programming_languages: string[];
  created_at: string;
  courses: { name: string; code: string } | null;
  project_flags: { id: string; reason: string }[];
  isCollaborator?: boolean;
  // hydrated separately
  studentProfile?: { first_name: string | null; last_name: string | null; email: string } | null;
}

interface Course {
  id: string;
  name: string;
  code: string;
}
interface ThesisDraft {
  id: string;
  project_id: string;
  file_path: string;
  label: string | null;
  is_final: boolean;
  created_at: string;
}

const FILES_BUCKET = "project-files";
const VIDEO_BUCKET = "project-videos";
const THESIS_BUCKET = "thesis-drafts";

function ProjectsPage() {
  const { user, role } = useAuth();
  const [items, setItems] = useState<Project[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [openEdit, setOpenEdit] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [editingIsCollaborator, setEditingIsCollaborator] = useState(false);
  const [flagFor, setFlagFor] = useState<Project | null>(null);
  const [appealFor, setAppealFor] = useState<Project | null>(null);
  const [deleteFor, setDeleteFor] = useState<Project | null>(null);
  const [thesisFor, setThesisFor] = useState<Project | null>(null);
  const [tasksFor, setTasksFor] = useState<Project | null>(null);
  const [collabFor, setCollabFor] = useState<Project | null>(null);
  const [feedbackFor, setFeedbackFor] = useState<Project | null>(null);
  const [filter, setFilter] = useState<"all" | "course" | "bachelor">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    if (!user) {
      setLoading(false);
      return;
    }

    const selection =
      "id,title,description,link,is_active,is_admin_active,is_flagged,in_portfolio,student_id,course_id,kind,file_path,video_path,programming_languages,created_at, courses(name,code), project_flags(id,reason)";
    let list: Project[] = [];

    if (role === "student") {
      const { data: collabRows, error: collabErr } = await supabase
        .from("project_collaborators")
        .select("project_id")
        .eq("invitee_id", user.id)
        .eq("status", "accepted");
      if (collabErr) {
        toast.error(collabErr.message);
        setLoading(false);
        return;
      }
      const collabProjectIds = Array.from(
        new Set((collabRows ?? []).map((c: { project_id: string }) => c.project_id)),
      );

      const ownQuery = supabase
        .from("projects")
        .select(selection)
        .eq("student_id", user.id)
        .order("updated_at", { ascending: false });
      const collabQuery = collabProjectIds.length
        ? supabase
            .from("projects")
            .select(selection)
            .in("id", collabProjectIds)
            .order("updated_at", { ascending: false })
        : Promise.resolve({ data: [] as Project[] });

      const [ownRes, collabRes] = await Promise.all([ownQuery, collabQuery]);
      if (ownRes.error) {
        toast.error(ownRes.error.message);
        setLoading(false);
        return;
      }
      if ("error" in collabRes && collabRes.error) {
        toast.error(collabRes.error.message);
        setLoading(false);
        return;
      }

      const ownProjects = (ownRes.data ?? []) as Project[];
      const collabProjects = (collabRes.data ?? []) as Project[];
      const ownIds = new Set(ownProjects.map((p) => p.id));
      list = [
        ...ownProjects,
        ...collabProjects
          .filter((p) => !ownIds.has(p.id))
          .map((p) => ({ ...p, isCollaborator: true })),
      ];
    } else {
      let q = supabase.from("projects").select(selection).order("updated_at", { ascending: false });
      if (role === "employer") q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }
      list = (data ?? []) as Project[];
    }

    list = list.map((p) => ({
      ...p,
      is_admin_active: p.is_admin_active ?? true,
    }));

    if (list.length > 0) {
      const ids = Array.from(new Set(list.map((p) => p.student_id)));
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,first_name,last_name,email")
        .in("id", ids);
      const byId = new Map(
        (profs ?? []).map((p: {
          id: string;
          first_name: string | null;
          last_name: string | null;
          email: string;
        }) => [p.id, p]),
      );
      list = list.map((p) => ({
        ...p,
        studentProfile: (byId.get(p.student_id) as Project["studentProfile"]) ?? null,
      }));
    }

    setItems(list);
    const { data: cs } = await supabase.from("courses").select("id,name,code").order("code");
    setCourses((cs ?? []) as Course[]);
    setSelected(new Set());
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, [user, role]);

  const filtered = useMemo(
    () => (filter === "all" ? items : items.filter((p) => p.kind === filter)),
    [items, filter],
  );

  const visibleSelectable = filtered.filter((p) => p.is_active && p.student_id === user?.id);
  const allSelected =
    visibleSelectable.length > 0 && visibleSelectable.every((p) => selected.has(p.id));

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(visibleSelectable.map((p) => p.id)));
  };

  const toggleVisibility = async (p: Project, val: boolean) => {
    const { error } = await supabase.from("projects").update({ is_active: val }).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success(val ? "Project is now public" : "Project is now private");
    void load();
  };

  const toggleActive = async (p: Project, val: boolean) => {
    const { error } = await supabase.from("projects").update({ is_admin_active: val }).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success(val ? "Project activated" : "Project deactivated");
    void load();
  };

  const togglePortfolio = async (p: Project, val: boolean) => {
    const { error } = await supabase.from("projects").update({ in_portfolio: val }).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success(val ? "Added to your portfolio" : "Removed from your portfolio");
    void load();
  };

  const bulkSetVisibility = async (val: boolean) => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    const { error } = await supabase
      .from("projects")
      .update({ is_active: val })
      .in("id", Array.from(selected));
    setBulkBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${selected.size} project(s) updated`);
    void load();
  };

  return (
    <>
      <PageHeader
        title={
          role === "student"
            ? "My projects"
            : role === "employer"
              ? "Discover projects"
              : "Projects"
        }
        description={
          role === "student"
            ? "Submit and manage your work. New projects are active by default and can be deactivated later."
            : "Browse student projects."
        }
        actions={
          role === "student" ? (
            <Dialog
              open={openEdit}
              onOpenChange={(o) => {
                setOpenEdit(o);
                if (!o) {
                  setEditing(null);
                  setEditingIsCollaborator(false);
                }
              }}
            >
              <DialogTrigger asChild>
                <Button
                  onClick={() => {
                    setEditing(null);
                    setOpenEdit(true);
                  }}
                >
                  <Plus className="h-4 w-4" /> New project
                </Button>
              </DialogTrigger>
              <ProjectDialog
                key={editing?.id ?? "new"}
                project={editing}
                courses={courses}
                isCollaborator={editingIsCollaborator}
                onClose={() => {
                  setOpenEdit(false);
                  setEditing(null);
                  setEditingIsCollaborator(false);
                  void load();
                }}
              />
            </Dialog>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="course">Course</TabsTrigger>
            <TabsTrigger value="bachelor">Bachelor</TabsTrigger>
          </TabsList>
        </Tabs>

        {role === "student" && visibleSelectable.length > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
              Select all visible
            </label>
            {selected.size > 0 && (
              <>
                <span className="text-xs text-muted-foreground">{selected.size} selected</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={bulkBusy}
                  onClick={() => bulkSetVisibility(true)}
                >
                  <Eye className="h-4 w-4" /> Make public
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={bulkBusy}
                  onClick={() => bulkSetVisibility(false)}
                >
                  <EyeOff className="h-4 w-4" /> Make private
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={FolderKanban} title="No projects yet" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              role={role}
              userId={user?.id}
              isSelected={selected.has(p.id)}
              onSelect={() => toggleSelect(p.id)}
              onEdit={() => {
                setEditing(p);
                setEditingIsCollaborator(p.isCollaborator ?? false);
                setOpenEdit(true);
              }}
              onDelete={() => setDeleteFor(p)}
              onFlag={() => setFlagFor(p)}
              onAppeal={() => setAppealFor(p)}
              onToggleVisibility={(v) => toggleVisibility(p, v)}
              onTogglePortfolio={(v) => togglePortfolio(p, v)}
              onToggleActive={(v) => toggleActive(p, v)}
              onOpenThesis={() => setThesisFor(p)}
              onOpenTasks={() => setTasksFor(p)}
              onOpenCollaborators={() => setCollabFor(p)}
              onOpenFeedback={() => setFeedbackFor(p)}
            />
          ))}
        </div>
      )}

      {flagFor && (
        <FlagDialog
          project={flagFor}
          onClose={() => {
            setFlagFor(null);
            void load();
          }}
        />
      )}
      {appealFor && (
        <AppealDialog
          project={appealFor}
          onClose={() => {
            setAppealFor(null);
            void load();
          }}
        />
      )}
      {deleteFor && (
        <DeleteDialog
          project={deleteFor}
          onClose={() => {
            setDeleteFor(null);
            void load();
          }}
        />
      )}
      {thesisFor && (
        <ThesisDialog
          project={thesisFor}
          onClose={() => {
            setThesisFor(null);
            void load();
          }}
        />
      )}
      {tasksFor && (
        <ProjectTasksDialog
          projectId={tasksFor.id}
          projectTitle={tasksFor.title}
          onClose={() => setTasksFor(null)}
        />
      )}
      {collabFor && (
        <CollaboratorsDialog
          projectId={collabFor.id}
          projectTitle={collabFor.title}
          courseId={collabFor.course_id}
          onClose={() => setCollabFor(null)}
        />
      )}
      {feedbackFor && (
        <ProjectFeedbackDialog
          projectId={feedbackFor.id}
          projectTitle={feedbackFor.title}
          onClose={() => setFeedbackFor(null)}
        />
      )}
    </>
  );
}

function ProjectCard({
  project: p,
  role,
  userId,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  onFlag,
  onAppeal,
  onToggleVisibility,
  onTogglePortfolio,
  onToggleActive,
  onOpenThesis,
  onOpenTasks,
  onOpenCollaborators,
  onOpenFeedback,
}: {
  project: Project;
  role: string | null;
  userId?: string;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onFlag: () => void;
  onAppeal: () => void;
  onToggleVisibility: (v: boolean) => void;
  onTogglePortfolio: (v: boolean) => void;
  onToggleActive: (v: boolean) => void;
  onOpenThesis: () => void;
  onOpenTasks: () => void;
  onOpenCollaborators: () => void;
  onOpenFeedback: () => void;
}) {
  const isMine = role === "student" && p.student_id === userId;

  return (
    <div
      className={`rounded-lg border bg-card p-5 flex flex-col ${isSelected ? "ring-2 ring-primary" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          {isMine && p.is_active && (
            <Checkbox
              className="mt-1"
              checked={isSelected}
              onCheckedChange={onSelect}
              aria-label="Select project"
            />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-medium truncate">{p.title}</h3>
              {role === "student" && !isMine && p.isCollaborator && (
                <Badge variant="secondary" className="text-[10px] uppercase">
                  Collaborator
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {!isMine && role === "student" && p.studentProfile ? (
                <>By {fullName(p.studentProfile)} · </>
              ) : null}
              {p.courses ? p.courses.code : "No course"}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge variant={p.kind === "bachelor" ? "default" : "secondary"} className="capitalize">
            {p.kind}
          </Badge>
          {p.is_flagged && <Badge variant="destructive">Flagged</Badge>}
          {!p.is_flagged && (
            <Badge variant={p.is_active ? "outline" : "secondary"}>
              {p.is_active ? "Public" : "Private"}
            </Badge>
          )}
          {isMine && p.in_portfolio && (
            <Badge variant="default" className="text-[10px]">
              In portfolio
            </Badge>
          )}
        </div>
      </div>

      {p.description && (
        <p className="text-sm mt-3 line-clamp-3 whitespace-pre-wrap">{p.description}</p>
      )}

      {p.programming_languages?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {p.programming_languages.slice(0, 5).map((l) => (
            <Badge key={l} variant="secondary" className="text-[10px]">
              {l}
            </Badge>
          ))}
        </div>
      )}

      <div className="text-xs text-muted-foreground mt-2">
        Created {new Date(p.created_at).toLocaleDateString()}
      </div>

      <div className="flex flex-wrap gap-2 mt-3 text-xs">
        {p.link && (
          <a
            href={p.link}
            target="_blank"
            rel="noreferrer"
            className="text-primary inline-flex items-center gap-1 hover:underline"
          >
            <ExternalLink className="h-3 w-3" /> Link
          </a>
        )}
        {p.file_path && (
          <StorageLink
            bucket={FILES_BUCKET}
            path={p.file_path}
            className="text-primary inline-flex items-center gap-1 hover:underline"
          >
            <FileText className="h-3 w-3" /> File
          </StorageLink>
        )}
        {p.video_path && (
          <StorageLink
            bucket={VIDEO_BUCKET}
            path={p.video_path}
            className="text-primary inline-flex items-center gap-1 hover:underline"
          >
            <Video className="h-3 w-3" /> Demo video
          </StorageLink>
        )}
      </div>

      {role === "student" && p.is_flagged && p.project_flags?.[0] && (
        <div className="mt-3 text-xs bg-destructive/10 border border-destructive/30 rounded px-3 py-2">
          <strong>Flag reason:</strong> {p.project_flags[0].reason}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t">
        {isMine && (
          <>
            <div className="flex items-center gap-2 text-xs">
              {p.is_active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              <Switch
                checked={p.is_active}
                onCheckedChange={onToggleVisibility}
                aria-label="Toggle visibility"
              />
              <span className="text-muted-foreground">{p.is_active ? "Public" : "Private"}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Switch
                checked={p.in_portfolio}
                onCheckedChange={onTogglePortfolio}
                aria-label="Toggle portfolio"
              />
              <span className="text-muted-foreground">In portfolio</span>
            </div>
            <div className="flex gap-1 ml-auto flex-wrap">
              <Button size="sm" variant="outline" onClick={onOpenTasks}>
                <ListChecks className="h-4 w-4" /> Tasks
              </Button>
              {p.kind !== "bachelor" && (
                <Button size="sm" variant="outline" onClick={onOpenCollaborators}>
                  <UsersIcon className="h-4 w-4" /> Collaborators
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={onOpenFeedback}>
                <Star className="h-4 w-4" /> Feedback
              </Button>
              {p.kind === "bachelor" && (
                <Button size="sm" variant="outline" onClick={onOpenThesis}>
                  <FileText className="h-4 w-4" /> Thesis
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={onEdit} aria-label="Edit">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={onDelete} aria-label="Delete">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
              {p.is_flagged && (
                <Button size="sm" variant="outline" onClick={onAppeal}>
                  <MessageSquare className="h-4 w-4" /> Appeal
                </Button>
              )}
            </div>
          </>
        )}
        {!isMine && role === "student" && p.isCollaborator && (
          <div className="flex gap-1 ml-auto flex-wrap">
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Pencil className="h-4 w-4" /> Update files
            </Button>
          </div>
        )}
        {role === "instructor" && (
          <Button size="sm" variant="outline" className="ml-auto" onClick={onOpenFeedback}>
            <Star className="h-4 w-4" /> Feedback
          </Button>
        )}
        {(role === "instructor" || role === "admin") && !p.is_flagged && (
          <Button size="sm" variant="outline" onClick={onFlag}>
            <Flag className="h-4 w-4" /> Flag
          </Button>
        )}
        {role === "admin" && (
          <div className="flex items-center gap-2 text-xs ml-auto">
            <Switch
              checked={p.is_admin_active}
              onCheckedChange={onToggleActive}
              aria-label="Toggle active status"
            />
            <span className="text-muted-foreground">{p.is_admin_active ? "Active" : "Inactive"}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectDialog({
  project,
  courses,
  isCollaborator = false,
  onClose,
}: {
  project: Project | null;
  courses: Course[];
  isCollaborator?: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [title, setTitle] = useState(project?.title ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [link, setLink] = useState(project?.link ?? "");
  const [courseId, setCourseId] = useState(project?.course_id ?? "");
  const [kind, setKind] = useState<"course" | "bachelor">(project?.kind ?? "course");
  const [filePath, setFilePath] = useState<string | null>(project?.file_path ?? null);
  const [videoPath, setVideoPath] = useState<string | null>(project?.video_path ?? null);
  const [langs, setLangs] = useState((project?.programming_languages ?? []).join(", "));
  const [busy, setBusy] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

 const upload = async (
  f: File,
  bucket: string,
  setPath: (s: string | null) => void,
  setBusyFlag: (b: boolean) => void,
) => {
  if (!user) return;
  setBusyFlag(true);
  const ext = f.name.split(".").pop() ?? "bin";
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, f, {
    upsert: false,
    contentType: f.type,  // ← add this
  });
  setBusyFlag(false);
  if (error) return toast.error(error.message);
  setPath(path);
  toast.success("Uploaded");
};

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!project && !courseId) {
      toast.error("Please select a course");
      return;
    }
    setBusy(true);
    const payload = project && isCollaborator
      ? {
          description: description.trim() || null,
          link: link.trim() || null,
          file_path: kind === "bachelor" ? null : filePath,
          video_path: videoPath,
        }
      : {
          title: title.trim(),
          description: description.trim() || null,
          link: link.trim() || null,
          course_id: courseId,
          kind,
          file_path: kind === "bachelor" ? null : filePath,
          video_path: videoPath,
          programming_languages: langs
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        };
    const res = project
      ? await supabase.from("projects").update(payload).eq("id", project.id)
      : await supabase.from("projects").insert({
          ...payload,
          student_id: user.id,
          is_active: true,
          is_admin_active: true,
          is_flagged: false,
          in_portfolio: false,
        });
    setBusy(false);
    if (res.error) return toast.error(res.error.message);
    toast.success(project ? "Updated" : "Created");
    onClose();
  };

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{project ? "Edit project" : "New project"}</DialogTitle>
        <DialogDescription>
          Showcase your work to instructors and employers. New projects are active by default and can be
          deactivated from your project list.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        {project && isCollaborator ? (
          <div className="rounded-lg border p-4 space-y-4 bg-slate-50 dark:bg-slate-900">
            <div className="text-sm font-medium">Collaboration edit</div>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <Label>Project title</Label>
                <Input value={project.title} disabled />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Project type</Label>
                  <Input
                    value={project.kind === "bachelor" ? "Bachelor project" : "Course project"}
                    disabled
                  />
                </div>
                <div>
                  <Label>Course</Label>
                  <Input
                    value={
                      courses.find((c) => c.id === project.course_id)
                        ? `${courses.find((c) => c.id === project.course_id)?.code} — ${
                            courses.find((c) => c.id === project.course_id)?.name
                          }`
                        : project.kind === "bachelor"
                        ? "Bachelor project"
                        : "No course"
                    }
                    disabled
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="d">Description</Label>
                <Textarea
                  id="d"
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="text-xs text-muted-foreground">
                You may update the project description, report file, shared link, and demo video for this
                collaboration.
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Project type</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as "course" | "bachelor")}> 
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="course">Course project</SelectItem>
                    <SelectItem value="bachelor">Bachelor project</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Course *</Label>
                <Select value={courseId} onValueChange={setCourseId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a course" />
                  </SelectTrigger>
                  <SelectContent>
                    {courses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.code} — {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="t">Title</Label>
              <Input id="t" required value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="d">Description</Label>
              <Textarea
                id="d"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </>
        )}
        <div>
          <Label htmlFor="l">Link (optional)</Label>
          <Input
            id="l"
            type="url"
            placeholder="https://"
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
        </div>
        {!(project && isCollaborator) && (
          <div>
            <Label htmlFor="pl">Programming languages (comma-separated)</Label>
            <Input
              id="pl"
              placeholder="TypeScript, Python, Java"
              value={langs}
              onChange={(e) => setLangs(e.target.value)}
            />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {kind !== "bachelor" && (
            <UploadSlot
              label="Project report"
              icon={FileText}
              path={filePath}
              bucket={FILES_BUCKET}
              uploading={uploadingFile}
              inputRef={fileInput}
              accept=".pdf,.zip,.doc,.docx,.ppt,.pptx,.txt,.md"
              onPick={(f) => upload(f, FILES_BUCKET, setFilePath, setUploadingFile)}
              onClear={() => setFilePath(null)}
            />
          )}
          <UploadSlot
            label="Demo video"
            icon={Video}
            path={videoPath}
            bucket={VIDEO_BUCKET}
            uploading={uploadingVideo}
            inputRef={videoInput}
            accept="video/*"
            onPick={(f) => upload(f, VIDEO_BUCKET, setVideoPath, setUploadingVideo)}
            onClear={() => setVideoPath(null)}
          />
        </div>

        {kind === "bachelor" && !(project && isCollaborator) && (
          <div className="text-xs text-muted-foreground">
            Bachelor projects don't include a project report — upload your thesis drafts from the
            project card after saving.
          </div>
        )}

        <DialogFooter>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function UploadSlot({
  label,
  icon: Icon,
  path,
  bucket,
  uploading,
  inputRef,
  accept,
  onPick,
  onClear,
}: {
  label: string;
  icon: typeof FileText;
  path: string | null;
  bucket: string;
  uploading: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  accept: string;
  onPick: (f: File) => void;
  onClear: () => void;
}) {
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4" /> {label}
      </div>
      {path ? (
        <div className="flex items-center gap-2 text-xs">
          <StorageLink
            bucket={bucket}
            path={path}
            className="text-primary inline-flex items-center gap-1 hover:underline truncate"
          >
            <Download className="h-3 w-3" /> {path.split("/").pop()}
          </StorageLink>
          <Button type="button" size="sm" variant="ghost" onClick={onClear}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Upload className="h-3 w-3" />
          )}
          {uploading ? "Uploading…" : "Upload"}
        </Button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        title={`${label} file input`}
        aria-label={`${label} file input`}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function DeleteDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    setBusy(true);
    // best-effort cleanup of storage
    if (project.file_path) await supabase.storage.from(FILES_BUCKET).remove([project.file_path]);
    if (project.video_path) await supabase.storage.from(VIDEO_BUCKET).remove([project.video_path]);
    const { error } = await supabase.from("projects").delete().eq("id", project.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Project deleted");
    onClose();
  };
  return (
    <AlertDialog open onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this project?</AlertDialogTitle>
          <AlertDialogDescription>
            "{project.title}" will be permanently removed along with its uploaded file and demo
            video. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={remove}
            disabled={busy}
            className="bg-destructive hover:bg-destructive/90"
          >
            {busy ? "Deleting…" : "Yes, delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ThesisDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const { user } = useAuth();
  const [drafts, setDrafts] = useState<ThesisDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [label, setLabel] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("thesis_drafts")
      .select("*")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setDrafts((data ?? []) as ThesisDraft[]);
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, [project.id]);

  const upload = async (f: File) => {
    if (!user) return;
    setUploading(true);
    const ext = f.name.split(".").pop() ?? "pdf";
    const path = `${user.id}/${project.id}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(THESIS_BUCKET)
      .upload(path, f, { upsert: false });
    if (upErr) {
      setUploading(false);
      return toast.error(upErr.message);
    }
    const { error: insErr } = await supabase.from("thesis_drafts").insert({
      project_id: project.id,
      student_id: user.id,
      file_path: path,
      label: label.trim() || null,
    });
    setUploading(false);
    if (insErr) return toast.error(insErr.message);
    setLabel("");
    toast.success("Draft uploaded");
    void load();
  };

  const setFinal = async (id: string) => {
    // unset other finals first, then set this one
    const others = drafts.filter((d) => d.id !== id && d.is_final).map((d) => d.id);
    if (others.length > 0) {
      await supabase.from("thesis_drafts").update({ is_final: false }).in("id", others);
    }
    const { error } = await supabase.from("thesis_drafts").update({ is_final: true }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Marked as final draft (visible to others)");
    void load();
  };

  const unsetFinal = async (id: string) => {
    const { error } = await supabase.from("thesis_drafts").update({ is_final: false }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Reverted to draft (private)");
    void load();
  };

  const remove = async (d: ThesisDraft) => {
    if (!confirm("Delete this draft?")) return;
    await supabase.storage.from(THESIS_BUCKET).remove([d.file_path]);
    const { error } = await supabase.from("thesis_drafts").delete().eq("id", d.id);
    if (error) return toast.error(error.message);
    toast.success("Draft deleted");
    void load();
  };

  const signedUrl = async (path: string) => {
    const { data } = await supabase.storage.from(THESIS_BUCKET).createSignedUrl(path);
    if (!data?.signedUrl) {
      toast.error("Could not create link");
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Thesis drafts</DialogTitle>
          <DialogDescription>
            Drafts are private. Mark one as the final draft to make it visible alongside this public
            project.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border p-3 space-y-2">
          <Label>Upload a new draft</Label>
          <div className="flex gap-2">
            <Input
              placeholder="Optional label (e.g. Draft v2 — chapters 1–3)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <Button type="button" disabled={uploading} onClick={() => inputRef.current?.click()}>
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {uploading ? "Uploading…" : "Upload PDF"}
            </Button>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.doc,.docx"
            title="Thesis draft file input"
            aria-label="Thesis draft file input"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              e.target.value = "";
            }}
          />
        </div>

        <div className="space-y-2 max-h-80 overflow-y-auto">
          {loading ? (
            <div className="text-muted-foreground text-sm">Loading…</div>
          ) : drafts.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">No drafts yet.</div>
          ) : (
            drafts.map((d) => (
              <div key={d.id} className="flex items-center gap-2 rounded-md border p-3">
                <FileText className="h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate">{d.label || d.file_path.split("/").pop()}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(d.created_at).toLocaleString()}
                  </div>
                </div>
                {d.is_final && (
                  <Badge className="gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Final
                  </Badge>
                )}
                <Button size="sm" variant="ghost" onClick={() => signedUrl(d.file_path)}>
                  <Download className="h-4 w-4" />
                </Button>
                {d.is_final ? (
                  <Button size="sm" variant="outline" onClick={() => unsetFinal(d.id)}>
                    Make draft
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setFinal(d.id)}>
                    <Star className="h-4 w-4" /> Set final
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => remove(d)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FlagDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const { user } = useAuth();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (reason.trim().length < 10) {
      toast.error("Please provide a clear reason (≥ 10 chars).");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("project_flags").insert({
      project_id: project.id,
      flagged_by: user.id,
      reason: reason.trim(),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Project flagged");
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Flag project</DialogTitle>
          <DialogDescription>
            "{project.title}" will be deactivated automatically.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="r">Reason</Label>
            <Textarea
              id="r"
              rows={4}
              placeholder="e.g. Plagiarism — code copied from..."
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={busy}>
              {busy ? "Flagging…" : "Submit flag"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AppealDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const { user } = useAuth();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (message.trim().length < 10) {
      toast.error("Please write a short explanation (≥ 10 chars).");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("project_appeals").insert({
      project_id: project.id,
      student_id: user.id,
      message: message.trim(),
      flag_id: project.project_flags?.[0]?.id ?? null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Appeal submitted");
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Appeal flag</DialogTitle>
          <DialogDescription>State your point of view. An admin will review.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="m">Your message</Label>
            <Textarea
              id="m"
              rows={4}
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Submitting…" : "Submit appeal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
