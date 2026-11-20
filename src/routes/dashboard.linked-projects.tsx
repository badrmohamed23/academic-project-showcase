import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FolderKanban,
  ExternalLink,
  FileText,
  Video,
  Star,
} from "lucide-react";
import { fullName } from "@/lib/validators";
import { getBachelorSupervisorCourseCodes } from "@/lib/bachelor-supervisors";
import { toast } from "sonner";
import { ProjectFeedbackDialog } from "@/components/project-feedback-dialog";
import { StorageLink } from "@/components/storage-link";

export const Route = createFileRoute("/dashboard/linked-projects")({
  component: LinkedProjectsPage,
});

interface LinkedProject {
  id: string;
  title: string;
  description: string | null;
  link: string | null;
  student_id: string;
  course_id: string | null;
  kind: "course" | "bachelor";
  file_path: string | null;
  video_path: string | null;
  programming_languages: string[];
  created_at: string;
  courses: { name: string; code: string } | null;
  studentProfile?: { first_name: string | null; last_name: string | null; email: string } | null;
}

interface Course {
  id: string;
  name: string;
  code: string;
}

const FILES_BUCKET = "project-files";
const VIDEO_BUCKET = "project-videos";

function LinkedProjectsPage() {
  const { user, role } = useAuth();
  const [items, setItems] = useState<LinkedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedbackFor, setFeedbackFor] = useState<LinkedProject | null>(null);
  const [filter, setFilter] = useState<"all" | "course" | "bachelor">("all");

  const load = async () => {
    setLoading(true);
    if (!user || role !== "instructor") {
      setLoading(false);
      return;
    }

    try {
      // Get all projects where instructor has accepted collaboration
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

      const supervisedCourseCodes = getBachelorSupervisorCourseCodes(user.id);
      let supervisedProjectIds: string[] = [];
      if (supervisedCourseCodes.length > 0) {
        const { data: supervisedCourses, error: courseErr } = await supabase
          .from("courses")
          .select("id,code")
          .in("code", supervisedCourseCodes);

        if (courseErr) {
          toast.error(courseErr.message);
          setLoading(false);
          return;
        }

        const courseIds = (supervisedCourses ?? []).map((c: Course) => c.id);
        if (courseIds.length > 0) {
          const { data: bachelorProjects, error: bachelorErr } = await supabase
            .from("projects")
            .select("id")
            .in("course_id", courseIds)
            .eq("kind", "bachelor")
           // .eq("is_active", false);

          if (bachelorErr) {
            toast.error(bachelorErr.message);
            setLoading(false);
            return;
          }

          supervisedProjectIds = Array.from(
            new Set((bachelorProjects ?? []).map((p: { id: string }) => p.id)),
          );
        }
      }

      const projectIds = Array.from(
        new Set([...collabProjectIds, ...supervisedProjectIds]),
      );
      if (projectIds.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }

      // Fetch project details
      const { data: projects, error: projErr } = await supabase
        .from("projects")
        .select("id,title,description,link,student_id,course_id,kind,file_path,video_path,programming_languages,created_at,courses(name,code)")
        .in("id", projectIds)
        .order("created_at", { ascending: false });

      if (projErr) {
        toast.error(projErr.message);
        setLoading(false);
        return;
      }

      let list = (projects ?? []) as LinkedProject[];

      // Fetch student profiles
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
          studentProfile: (byId.get(p.student_id) as LinkedProject["studentProfile"]) ?? null,
        }));
      }

      setItems(list);
    } catch (error) {
      console.error("Error loading linked projects:", error);
      toast.error("Failed to load linked projects");
    }

    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [user, role]);

  const filtered = useMemo(
    () => (filter === "all" ? items : items.filter((p) => p.kind === filter)),
    [items, filter],
  );

  if (role !== "instructor") {
    return (
      <EmptyState icon={FolderKanban} title="Access denied" />
    );
  }

  return (
    <>
      <PageHeader
        title="My Linked Projects"
        description="Projects you are collaborating on. Add or edit feedback on project tasks."
      />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="course">Course</TabsTrigger>
            <TabsTrigger value="bachelor">Bachelor</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {loading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState 
          icon={FolderKanban} 
          title="No linked projects yet" 
          description="When you accept a collaboration invitation, projects will appear here."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((p) => (
            <LinkedProjectCard
              key={p.id}
              project={p}
              onOpenFeedback={() => setFeedbackFor(p)}
            />
          ))}
        </div>
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

function LinkedProjectCard({
  project: p,
  onOpenFeedback,
}: {
  project: LinkedProject;
  onOpenFeedback: () => void;
}) {
  return (
    <div className="rounded-lg border bg-card p-5 flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <div className="min-w-0">
            <h3 className="font-medium truncate">{p.title}</h3>
            <div className="text-xs text-muted-foreground mt-1">
              By {fullName(p.studentProfile ?? { email: "" })} · {p.courses ? p.courses.code : "No course"}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge variant={p.kind === "bachelor" ? "default" : "secondary"} className="capitalize">
            {p.kind}
          </Badge>
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

      <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t">
        <Button size="sm" variant="outline" onClick={onOpenFeedback}>
          <Star className="h-4 w-4" /> Add Feedback
        </Button>
      </div>
    </div>
  );
}
