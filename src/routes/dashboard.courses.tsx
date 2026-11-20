import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, BookOpen, GitBranch } from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/dashboard/courses")({
  component: CoursesPage,
});

interface Course {
  id: string;
  name: string;
  code: string;
}

function CoursesPage() {
  const { role, user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [myLinks, setMyLinks] = useState<Set<string>>(new Set());
  const [pendingActions, setPendingActions] = useState<Map<string, "link" | "unlink">>(new Map());
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Course | null>(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("courses").select("*").order("code");
    setCourses((data ?? []) as Course[]);
    if (role === "instructor" && user) {
      const [{ data: links }, { data: pendings }] = await Promise.all([
        supabase.from("instructor_courses").select("course_id").eq("instructor_id", user.id),
        supabase
          .from("instructor_link_requests")
          .select("course_id, action")
          .eq("instructor_id", user.id)
          .eq("status", "pending"),
      ]);
      setMyLinks(new Set((links ?? []).map((l) => l.course_id as string)));
      const m = new Map<string, "link" | "unlink">();
      for (const p of pendings ?? []) m.set(p.course_id as string, p.action as "link" | "unlink");
      setPendingActions(m);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [role, user]);

  const remove = async (id: string) => {
    if (!confirm("Delete this course?")) return;
    const { error } = await supabase.from("courses").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Course deleted");
    void load();
  };

  const requestLink = async (course_id: string, action: "link" | "unlink") => {
    if (!user) return;
    
    // Optimistic update - show pending state immediately
    const newPendingActions = new Map(pendingActions);
    newPendingActions.set(course_id, action);
    setPendingActions(newPendingActions);
    toast.info(`${action === "link" ? "Linking" : "Unlinking"}... pending review`, { duration: 2000 });

    const { error } = await supabase.from("instructor_link_requests").insert({
      instructor_id: user.id,
      course_id,
      action,
    });
    if (error) {
      // Revert optimistic update on error
      setPendingActions(pendingActions);
      return toast.error(error.message);
    }
  };

  return (
    <>
      <PageHeader
        title="Courses"
        description={role === "admin" ? "Manage the course catalog." : "All university courses."}
        actions={
          role === "admin" ? (
            <Dialog
              open={open}
              onOpenChange={(o) => {
                setOpen(o);
                if (!o) setEditing(null);
              }}
            >
              <DialogTrigger asChild>
                <Button
                  onClick={() => {
                    setEditing(null);
                    setOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" /> Add course
                </Button>
              </DialogTrigger>
              <CourseDialog
                key={editing?.id ?? "new"}
                course={editing}
                onClose={() => {
                  setOpen(false);
                  setEditing(null);
                  void load();
                }}
              />
            </Dialog>
          ) : undefined
        }
      />

      {loading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : courses.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No courses yet"
          description={role === "admin" ? "Create your first course." : "Check back later."}
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {courses.map((c) => {
                const linked = myLinks.has(c.id);
                const pending = pendingActions.get(c.id);
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-sm">{c.code}</TableCell>
                    <TableCell>{c.name}</TableCell>
                    <TableCell className="text-right">
                      {role === "admin" && (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditing(c);
                              setOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => remove(c.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                      {role === "instructor" && (
                        <div className="flex justify-end gap-2">
                          {pending ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled
                              className="cursor-not-allowed"
                            >
                              <GitBranch className="h-4 w-4" /> {pending === "link" ? "Link" : "Unlink"} pending…
                            </Button>
                          ) : linked ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => requestLink(c.id, "unlink")}
                            >
                              <GitBranch className="h-4 w-4" /> Unlink
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => requestLink(c.id, "link")}
                            >
                              <GitBranch className="h-4 w-4" /> Link
                            </Button>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}

function CourseDialog({ course, onClose }: { course: Course | null; onClose: () => void }) {
  const [name, setName] = useState(course?.name ?? "");
  const [code, setCode] = useState(course?.code ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const payload = { name: name.trim(), code: code.trim().toUpperCase() };
    const res = course
      ? await supabase.from("courses").update(payload).eq("id", course.id)
      : await supabase.from("courses").insert(payload);
    setBusy(false);
    if (res.error) return toast.error(res.error.message);
    toast.success(course ? "Course updated" : "Course created");
    onClose();
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{course ? "Edit course" : "Add course"}</DialogTitle>
        <DialogDescription>Course code must be unique.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="code">Course code</Label>
          <Input
            id="code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. CSEN 401"
          />
        </div>
        <div>
          <Label htmlFor="name">Course name</Label>
          <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
