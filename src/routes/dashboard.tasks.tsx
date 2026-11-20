import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { ListChecks, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  PRIORITY_META,
  PriorityBadge,
  TaskRow,
  TaskFormDialog,
  type ProjectTask,
  type Priority,
  type AssigneeOption,
} from "@/components/project-tasks-dialog";

type TaskStatus = "pending" | "in-progress" | "completed";

interface Profile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
}

export const Route = createFileRoute("/dashboard/tasks")({
  component: TasksPage,
});

interface ProjectMini {
  id: string;
  title: string;
  student_id: string;
}

function TasksPage() {
  const { user, role } = useAuth();
  const [projects, setProjects] = useState<ProjectMini[]>([]);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [assigneesByProject, setAssigneesByProject] = useState<Record<string, AssigneeOption[]>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "open" | "done">("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | Priority>("all");
  const [editing, setEditing] = useState<ProjectTask | null>(null);
  const [addingForProject, setAddingForProject] = useState<string | null>(null);
  const [deleteFor, setDeleteFor] = useState<ProjectTask | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);

    const { data: ts, error: tErr } = await supabase
      .from("project_tasks")
      .select("*")
      .or(`student_id.eq.${user.id},assignee_id.eq.${user.id}`)
      .order("is_completed", { ascending: true })
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (tErr) toast.error(tErr.message);
    const taskList = (ts ?? []).map((task: any) => ({
      ...task,
      priority: (task.priority ?? "medium") as Priority,
      status: (task.status ?? "pending") as TaskStatus,
      is_completed: task.is_completed ?? ((task.status ?? "pending") === "completed"),
      due_date: task.due_date ?? null,
      assignee_id: task.assignee_id ?? null,
      position: task.position ?? 0,
      description: task.description ?? null,
    })) as ProjectTask[];
    setTasks(taskList);

    const pidsFromTasks = Array.from(new Set(taskList.map((t) => t.project_id)));
    const { data: allUserProjects } = await supabase
      .from("projects")
      .select("id,title,student_id")
      .eq("student_id", user.id)
      .order("updated_at", { ascending: false });

    const allPids = new Set([
      ...pidsFromTasks,
      ...((allUserProjects as ProjectMini[]) ?? []).map((p) => p.id),
    ]);

    const pidsArray = Array.from(allPids);
    const projList = pidsArray.length
      ? supabase
          .from("projects")
          .select("id,title,student_id")
          .in("id", pidsArray)
          .order("updated_at", { ascending: false })
      : Promise.resolve({ data: [] as ProjectMini[], error: null });

    const { data: ps, error: pErr } = await projList;
    if (pErr) {
      toast.error(pErr.message);
      setLoading(false);
      return;
    }
    const projectList = (ps ?? []) as ProjectMini[];
    setProjects(projectList);

    if (projectList.length) {
      const map: Record<string, AssigneeOption[]> = {};
      const ids = new Set<string>([user.id]);
      const pidsForAssignees = projectList.map((p) => p.id);
      const { data: collabs } = await supabase
        .from("project_collaborators")
        .select("project_id,invitee_id")
        .in("project_id", pidsForAssignees)
        .eq("status", "accepted");
      for (const c of collabs ?? []) ids.add(c.invitee_id as string);
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,first_name,last_name,email")
        .in("id", Array.from(ids));
      const profMap = new Map<string, Profile>();
      for (const prof of profs ?? []) profMap.set((prof as Profile).id, prof as Profile);
      for (const p of projectList) {
        const owner = profMap.get(p.student_id);
        const list: AssigneeOption[] = [];
        if (owner)
          list.push({
            id: owner.id,
            first_name: owner.first_name,
            last_name: owner.last_name,
            email: owner.email,
            is_owner: true,
          });
        for (const c of collabs ?? []) {
          if (c.project_id === p.id) {
            const pr = profMap.get(c.invitee_id as string);
            if (pr)
              list.push({
                id: pr.id,
                first_name: pr.first_name,
                last_name: pr.last_name,
                email: pr.email,
              });
          }
        }
        map[p.id] = list;
      }
      setAssigneesByProject(map);
    } else {
      setAssigneesByProject({});
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [user]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filter === "open" && t.is_completed) return false;
      if (filter === "done" && !t.is_completed) return false;
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
      return true;
    });
  }, [tasks, filter, priorityFilter]);

  const grouped = useMemo(() => {
    const byProject = new Map<string, ProjectTask[]>();
    for (const t of filteredTasks) {
      const arr = byProject.get(t.project_id) ?? [];
      arr.push(t);
      byProject.set(t.project_id, arr);
    }
    return byProject;
  }, [filteredTasks]);

  const addingProject = projects.find((p) => p.id === addingForProject);

  const setStatus = async (t: ProjectTask, status: "pending" | "postponed" | "completed") => {
    const { error } = await supabase.from("project_tasks").update({ status }).eq("id", t.id);
    if (error) return toast.error(error.message);
    setTasks((prev) =>
      prev.map((x) =>
        x.id === t.id ? { ...x, status, is_completed: status === "completed" } : x,
      ),
    );
  };

  if (role !== "student") {
    return (
      <>
        <PageHeader title="My tasks" />
        <EmptyState
          icon={ListChecks}
          title="Tasks are for students"
          description="Sign in as a student to manage project tasks."
        />
      </>
    );
  }

  const totalOpen = tasks.filter((t) => !t.is_completed).length;
  const totalDone = tasks.length - totalOpen;

  return (
    <>
      <PageHeader
        title="My tasks"
        description={`${totalOpen} open · ${totalDone} completed across ${projects.length} project(s)`}
      />

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="open">Open</TabsTrigger>
            <TabsTrigger value="done">Done</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select
          value={priorityFilter}
          onValueChange={(v) => setPriorityFilter(v as typeof priorityFilter)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            {(Object.keys(PRIORITY_META) as Priority[]).map((p) => (
              <SelectItem key={p} value={p}>
                {PRIORITY_META[p].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No projects yet"
          description="Create a project first, then add tasks to it."
        />
      ) : (
        <Accordion type="multiple" defaultValue={projects.map((p) => p.id)} className="space-y-2">
          {projects.map((p) => {
            const projectTasks = grouped.get(p.id) ?? [];
            const allTasks = tasks.filter((t) => t.project_id === p.id);
            const open = allTasks.filter((t) => !t.is_completed).length;
            const isOwner = p.student_id === user?.id;
            return (
              <AccordionItem key={p.id} value={p.id} className="border rounded-lg bg-card px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-3 flex-1 min-w-0 pr-3">
                    <span className="font-medium truncate">{p.title}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {open}/{allTasks.length}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {isOwner && (
                    <div className="flex justify-end mb-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditing(null);
                          setAddingForProject(p.id);
                        }}
                      >
                        <Plus className="h-4 w-4" /> Add task
                      </Button>
                    </div>
                  )}
                  {projectTasks.length === 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-4">
                      {allTasks.length === 0
                        ? "No tasks yet."
                        : "No tasks match the current filters."}
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {projectTasks.map((t) => {
                        const a = t.assignee_id
                          ? ((assigneesByProject[p.id] ?? []).find(
                              (x) => x.id === t.assignee_id,
                            ) ?? null)
                          : null;
                        const canEditFull = t.student_id === user?.id;
                        return (
                          <TaskRow
                            key={t.id}
                            task={t}
                            assignee={a}
                            canEditFull={canEditFull}
                            canEditStatus={canEditFull || (!!user && t.assignee_id === user.id)}
                            onStatusChange={(s) => setStatus(t, s)}
                            onEdit={() => {
                              setEditing(t);
                              setAddingForProject(p.id);
                            }}
                            onDelete={() => setDeleteFor(t)}
                          />
                        );
                      })}
                    </ul>
                  )}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      {addingForProject && user && addingProject?.student_id === user.id && (
        <TaskFormDialog
          key={editing?.id ?? "new"}
          task={editing}
          projectId={addingForProject}
          studentId={user.id}
          assignees={assigneesByProject[addingForProject] ?? []}
          onClose={() => {
            setAddingForProject(null);
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
                  const id = deleteFor.id;
                  setDeleteFor(null);
                  const { error } = await supabase
                    .from("project_tasks")
                    .delete()
                    .eq("id", id);
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

      <span className="hidden">
        <PriorityBadge priority="low" />
      </span>
    </>
  );
}