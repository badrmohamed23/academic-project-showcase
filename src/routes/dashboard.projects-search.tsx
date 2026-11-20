// Projects discovery — search/filter/sort with rich card UI matching Portfolios
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState, SkeletonCards } from "@/components/dashboard-shell";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  FolderKanban,
  Star,
  ExternalLink,
  FileText,
  Video,
  Calendar,
  User as UserIcon,
  Code2,
  Heart,
  Flag,
} from "lucide-react";
import { fullName } from "@/lib/validators";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { StorageLink } from "@/components/storage-link";
import { ProjectFeedbackDialog } from "@/components/project-feedback-dialog";

export const Route = createFileRoute("/dashboard/projects-search")({
  validateSearch: (s: Record<string, unknown>) => ({
    q: typeof s.q === "string" ? s.q : undefined,
    open: typeof s.open === "string" ? s.open : undefined,
  }),
  component: ProjectsSearchPage,
});

interface ProjectRow {
  id: string;
  title: string;
  description: string | null;
  link: string | null;
  kind: "course" | "bachelor";
  created_at: string;
  is_active: boolean;
  is_admin_active: boolean;
  is_flagged: boolean;
  student_id: string;
  course_id: string | null;
  file_path: string | null;
  video_path: string | null;
  programming_languages: string[];
  author?: {
    first_name: string | null;
    last_name: string | null;
    email: string;
    avatar_url: string | null;
  } | null;
  course?: { code: string; name: string } | null;
  avg_rating: number;
  rating_count: number;
  final_draft?: {
    file_path: string;
    label: string | null;
  } | null;
}

const FILES_BUCKET = "project-files";
const VIDEO_BUCKET = "project-videos";
const THESIS_BUCKET = "thesis-drafts";
type DateRange = "all" | "week" | "month" | "year";

function StarRating({ value, count }: { value: number; count: number }) {
  if (count === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Star className="h-3.5 w-3.5" /> No ratings
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(
            "h-3.5 w-3.5",
            i <= Math.round(value) ? "fill-amber-500 text-amber-500" : "text-muted-foreground/40",
          )}
        />
      ))}
      <span className="ml-1 text-xs font-medium">{value.toFixed(1)}</span>
    </span>
  );
}

function ProjectsSearchPage() {
  const search = Route.useSearch();
  const { user, role } = useAuth();
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(search.q ?? "");
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [langFilter, setLangFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [sort, setSort] = useState<"newest" | "rating-desc" | "title">("newest");
  const [openId, setOpenId] = useState<string | null>(search.open ?? null);
  const [favIds, setFavIds] = useState<Set<string>>(new Set());
  const [flagTarget, setFlagTarget] = useState<ProjectRow | null>(null);
  const [flagReason, setFlagReason] = useState("");
  const [flagLoading, setFlagLoading] = useState(false);
  const [instructorCourseIds, setInstructorCourseIds] = useState<Set<string>>(new Set());
  const [feedbackFor, setFeedbackFor] = useState<ProjectRow | null>(null);

  const toggleActive = async (project: ProjectRow, active: boolean) => {
    const { error } = await supabase.from("projects").update({ is_admin_active: active }).eq("id", project.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(active ? "Project activated" : "Project deactivated");
    await loadProjects();
  };

  const loadProjects = async () => {
    setLoading(true);
    let query = supabase
      .from("projects")
      .select(
        "id,title,description,link,kind,created_at,is_active,is_admin_active,is_flagged,student_id,course_id,file_path,video_path,programming_languages, courses(code,name)",
      )
      .order("created_at", { ascending: false });
    // Only active projects should appear in the public search results for normal users
    if (role !== "admin") {
      query = query.neq("is_active", false).neq("is_admin_active", false);
    }
    const { data: ps, error: fetchError } = await query;
    if (fetchError) {
      toast.error(fetchError.message);
      setLoading(false);
      return;
    }
    const list = (ps ?? []) as unknown as ProjectRow[];
    const authorIds = Array.from(new Set(list.map((p) => p.student_id)));
    const profMap = new Map<
      string,
      {
        first_name: string | null;
        last_name: string | null;
        email: string;
        avatar_url: string | null;
      }
    >();
    if (authorIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,first_name,last_name,email,avatar_url")
        .in("id", authorIds);
      for (const p of profs ?? [])
        profMap.set(p.id as string, {
          first_name: p.first_name as string | null,
          last_name: p.last_name as string | null,
          email: p.email as string,
          avatar_url: p.avatar_url as string | null,
        });
    }
    const ids = list.map((p) => p.id);
    const ratingMap = new Map<string, { sum: number; n: number }>();
    if (ids.length) {
      const { data: ratings } = await supabase
        .from("project_ratings")
        .select("project_id,rating")
        .in("project_id", ids);
      for (const r of ratings ?? []) {
        const pid = r.project_id as string;
        const cur = ratingMap.get(pid) ?? { sum: 0, n: 0 };
        cur.sum += Number(r.rating);
        cur.n += 1;
        ratingMap.set(pid, cur);
      }
    }

    const thesisMap = new Map<string, { file_path: string; label: string | null }>();
    if (ids.length) {
      const { data: finals } = await supabase
        .from("thesis_drafts")
        .select("project_id,file_path,label")
        .eq("is_final", true)
        .in("project_id", ids);
      for (const t of finals ?? []) {
        thesisMap.set(t.project_id as string, {
          file_path: t.file_path as string,
          label: t.label as string | null,
        });
      }
    }

    for (const p of list) {
      p.is_active = p.is_active ?? true;
      p.is_admin_active = p.is_admin_active ?? true;
      p.author = profMap.get(p.student_id) ?? null;
      const rs = ratingMap.get(p.id);
      p.avg_rating = rs && rs.n > 0 ? rs.sum / rs.n : 0;
      p.rating_count = rs?.n ?? 0;
      p.programming_languages = p.programming_languages ?? [];
      p.final_draft = thesisMap.get(p.id) ?? null;
      const anyP = p as unknown as { courses?: { code: string; name: string } | null };
      p.course = anyP.courses ?? null;
    }
    setRows(role === "admin" ? list : list.filter((p) => p.is_active && p.is_admin_active));

    if (user && (role === "student" || role === "employer")) {
      const { data: f } = await supabase
        .from("student_favorites")
        .select("target_id")
        .eq("student_id", user.id)
        .eq("kind", "project");
      setFavIds(new Set((f ?? []).map((x) => x.target_id as string)));
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadProjects();
  }, [user, role]);

  const courseOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) if (r.course) m.set(r.course.code, `${r.course.code} — ${r.course.name}`);
    return Array.from(m.entries()).sort();
  }, [rows]);

  const langOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) for (const l of r.programming_languages) s.add(l);
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const now = Date.now();
    const cutoff =
      dateRange === "week"
        ? now - 7 * 86400000
        : dateRange === "month"
          ? now - 30 * 86400000
          : dateRange === "year"
            ? now - 365 * 86400000
            : 0;
    let list = rows.filter((r) => {
      if (ql && !r.title.toLowerCase().includes(ql)) return false;
      if (courseFilter !== "all" && r.course?.code !== courseFilter) return false;
      if (langFilter !== "all" && !r.programming_languages.includes(langFilter)) return false;
      if (cutoff && +new Date(r.created_at) < cutoff) return false;
      return true;
    });
    if (sort === "rating-desc")
      list = [...list].sort(
        (a, b) => b.avg_rating - a.avg_rating || b.rating_count - a.rating_count,
      );
    else if (sort === "title") list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    else list = [...list].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    return list;
  }, [rows, q, courseFilter, langFilter, dateRange, sort]);

  const opened = openId
    ? (filtered.find((r) => r.id === openId) ?? rows.find((r) => r.id === openId) ?? null)
    : null;

  const toggleFav = async (id: string) => {
    if (!user || (role !== "student" && role !== "employer"))
      return toast.info("Sign in as a student or employer to save favorites");
    const isFav = favIds.has(id);
    if (isFav) {
      await supabase
        .from("student_favorites")
        .delete()
        .eq("student_id", user.id)
        .eq("kind", "project")
        .eq("target_id", id);
      setFavIds((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
      toast.success("Removed from favorites");
    } else {
      const { error } = await supabase
        .from("student_favorites")
        .insert({ student_id: user.id, kind: "project", target_id: id });
      if (error) return toast.error(error.message);
      setFavIds((s) => new Set(s).add(id));
      toast.success("Saved to favorites");
    }
  };

  const clearFilters = () => {
    setQ("");
    setCourseFilter("all");
    setLangFilter("all");
    setDateRange("all");
  };

  const hasFilters = q || courseFilter !== "all" || langFilter !== "all" || dateRange !== "all";

  return (
    <>
      <PageHeader
        title="Discover Projects"
        description="Search public projects by title, course, language and date."
      />

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9 h-11 rounded-full"
          placeholder="Search projects by title…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-3 mb-4">
        <Select value={courseFilter} onValueChange={setCourseFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Course" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All courses</SelectItem>
            {courseOptions.map(([code, label]) => (
              <SelectItem key={code} value={code}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={langFilter} onValueChange={setLangFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Language" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All languages</SelectItem>
            {langOptions.map((l) => (
              <SelectItem key={l} value={l}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
          <SelectTrigger>
            <SelectValue placeholder="Created" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All time</SelectItem>
            <SelectItem value="week">Last week</SelectItem>
            <SelectItem value="month">Last month</SelectItem>
            <SelectItem value="year">Last year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-between items-center mb-6">
        <div className="text-sm text-muted-foreground">
          {filtered.length} result{filtered.length === 1 ? "" : "s"}
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
          <SelectTrigger className="w-55">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="rating-desc">Highest rated</SelectItem>
            <SelectItem value="title">Title (A–Z)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <SkeletonCards count={8} />
      ) : filtered.length === 0 ? (
        <div className="space-y-3">
          <EmptyState
            icon={FolderKanban}
            title="No projects found"
            description="Try a different search or filter."
          />
          {hasFilters && (
            <div className="text-center">
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear all filters
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((r) => {
            const authorName = r.author ? fullName(r.author) || r.author.email : "Unknown";
            return (
              <div
                key={r.id}
                className="group rounded-2xl border bg-card p-5 flex flex-col shadow-sm transition-all hover:shadow-xl hover:-translate-y-1"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-lg leading-tight line-clamp-2">{r.title}</h3>
                    {r.course && (
                      <div className="mt-1 text-xs text-secondary font-medium">
                        {r.course.code} — {r.course.name}
                      </div>
                    )}
                  </div>
                  {(role === "student" || role === "employer") && (
                    <button
                      onClick={() => toggleFav(r.id)}
                      title="Save to favorites"
                      className="shrink-0 rounded-full p-1.5 hover:bg-accent transition-colors"
                    >
                      <Heart
                        className={cn(
                          "h-4 w-4 transition-colors",
                          favIds.has(r.id)
                            ? "fill-destructive text-destructive"
                            : "text-muted-foreground",
                        )}
                      />
                    </button>
                  )}
                  {(role === "admin" || role === "instructor") && (
                    <button
                      onClick={() => setFlagTarget(r)}
                      title="Flag project"
                      className="shrink-0 rounded-full p-1.5 hover:bg-accent transition-colors"
                    >
                      <Flag className="h-4 w-4 text-destructive" />
                    </button>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-1 min-h-6">
                  {r.programming_languages.length === 0 ? (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      <Code2 className="h-3 w-3 mr-1" /> No languages
                    </Badge>
                  ) : (
                    <>
                      {r.programming_languages.slice(0, 3).map((l) => (
                        <Badge key={l} variant="secondary" className="text-[10px]">
                          {l}
                        </Badge>
                      ))}
                      {r.programming_languages.length > 3 && (
                        <Badge variant="outline" className="text-[10px]">
                          +{r.programming_languages.length - 3}
                        </Badge>
                      )}
                    </>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <StarRating value={r.avg_rating} count={r.rating_count} />
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {new Date(r.created_at).toLocaleDateString()}
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-2 text-sm">
                  <Avatar className="h-6 w-6">
                    {r.author?.avatar_url && <AvatarImage src={r.author.avatar_url} alt="" />}
                    <AvatarFallback className="text-[10px]">
                      {(r.author?.first_name?.[0] ?? authorName[0] ?? "U").toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate">{authorName}</span>
                </div>

                {role === "admin" && (
                  <div className="mt-3 flex flex-col gap-2 rounded-lg border border-muted-foreground/10 bg-muted/5 p-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Admin visibility</span>
                      <span>{r.is_admin_active ? "Active" : "Inactive"}</span>
                    </div>
                    <Switch checked={r.is_admin_active} onCheckedChange={(val) => void toggleActive(r, val)} />
                  </div>
                )}
                <Button size="sm" className="mt-4 w-full" onClick={() => setOpenId(r.id)}>
                  View details
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {opened && (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl">{opened.title}</DialogTitle>
                <DialogDescription>
                  {opened.course ? `${opened.course.code} — ${opened.course.name}` : ""}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    {opened.author?.avatar_url && (
                      <AvatarImage src={opened.author.avatar_url} alt="" />
                    )}
                    <AvatarFallback className="text-[10px]">
                      <UserIcon className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-medium">
                      {opened.author ? fullName(opened.author) || opened.author.email : "Unknown"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Created {new Date(opened.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Badge
                    variant={opened.kind === "bachelor" ? "default" : "secondary"}
                    className="capitalize"
                  >
                    {opened.kind}
                  </Badge>
                  <StarRating value={opened.avg_rating} count={opened.rating_count} />
                </div>

                {opened.programming_languages.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1.5">
                      Programming languages
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {opened.programming_languages.map((l) => (
                        <Badge key={l} variant="secondary">
                          {l}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {opened.description && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1.5">
                      Description
                    </div>
                    <p className="whitespace-pre-wrap">{opened.description}</p>
                  </div>
                )}

                <div className="flex flex-wrap gap-3 text-xs">
                  {opened.link && (
                    <a
                      href={opened.link}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary inline-flex items-center gap-1 hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" /> External link
                    </a>
                  )}
                  {opened.file_path && (
                    <StorageLink
                      bucket={FILES_BUCKET}
                      path={opened.file_path}
                      className="text-primary inline-flex items-center gap-1 hover:underline"
                    >
                      <FileText className="h-3 w-3" /> File
                    </StorageLink>
                  )}
                  {opened.video_path && (
                    <StorageLink
                      bucket={VIDEO_BUCKET}
                      path={opened.video_path}
                      className="text-primary inline-flex items-center gap-1 hover:underline"
                    >
                      <Video className="h-3 w-3" /> Demo video
                    </StorageLink>
                  )}
                  {opened.kind === "bachelor" && opened.final_draft && (
                    <StorageLink
                      bucket={THESIS_BUCKET}
                      path={opened.final_draft.file_path}
                      className="text-primary inline-flex items-center gap-1 hover:underline"
                    >
                      <FileText className="h-3 w-3" /> {opened.final_draft.label ?? "Final thesis draft"}
                    </StorageLink>
                  )}
                </div>

                {(role === "student" || role === "employer") && (
                  <Button variant="outline" onClick={() => toggleFav(opened.id)} className="w-full">
                    <Heart
                      className={cn(
                        "h-4 w-4 mr-1",
                        favIds.has(opened.id) && "fill-destructive text-destructive",
                      )}
                    />
                    {favIds.has(opened.id) ? "Remove from favorites" : "Add to favorites"}
                  </Button>
                )}

                {role === "instructor" && (
                  <Button
                    variant="default"
                    className="w-full"
                    onClick={() => setFeedbackFor(opened)}
                  >
                    <Star className="h-4 w-4 mr-1" /> Rate & Comment
                  </Button>
                )}

                {(role === "admin" || role === "instructor") && (
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => setFlagTarget(opened)}
                  >
                    <Flag className="h-4 w-4 mr-1" /> Flag project
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!flagTarget} onOpenChange={(o) => !o && setFlagTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Flag project</DialogTitle>
            <DialogDescription>
              Add a reason for flagging this project. The project will be deactivated automatically
              if there is no appeal.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium">Project</div>
              <div className="text-sm text-muted-foreground">{flagTarget?.title}</div>
            </div>
            <div>
              <Label htmlFor="flag-reason">Reason for flagging</Label>
              <Textarea
                id="flag-reason"
                rows={4}
                value={flagReason}
                onChange={(e) => setFlagReason(e.target.value)}
                placeholder="Describe why this project violates policy."
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <Button
              variant="outline"
              onClick={() => {
                setFlagTarget(null);
                setFlagReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={!flagReason.trim() || flagLoading}
              onClick={async () => {
                if (!flagTarget || !user) return;
                const project = flagTarget;
                setFlagLoading(true);
                const reason = flagReason.trim();
                const { data: existingAppeal, error: appealError } = await supabase
                  .from("project_appeals")
                  .select("id")
                  .eq("project_id", project.id)
                  .limit(1)
                  .maybeSingle();
                if (appealError) {
                  toast.error(appealError.message);
                  setFlagLoading(false);
                  return;
                }
                const { error: flagError } = await supabase.from("project_flags").insert({
                  project_id: project.id,
                  flagged_by: user.id,
                  reason,
                });
                if (flagError) {
                  toast.error(flagError.message);
                  setFlagLoading(false);
                  return;
                }
                const shouldDeactivate = !existingAppeal?.id;
                const { error: updateError } = await supabase
                  .from("projects")
                  .update({
                    is_flagged: true,
                    is_active: shouldDeactivate ? false : true,
                    is_admin_active: false,
                  })
                  .eq("id", project.id);
                if (updateError) {
                  toast.error(updateError.message);
                  setFlagLoading(false);
                  return;
                }
                const { error: notifError } = await supabase.from("notifications").insert({
                  user_id: project.student_id,
                  type: "project_flagged",
                  title: "Project flagged",
                  body: `Your project \"${project.title}\" was flagged. Reason: ${reason}`,
                  link_url: "/dashboard/appeals",
                });
                if (notifError) {
                  toast.error(notifError.message);
                }
                toast.success("Project flagged and student notified");
                setFlagLoading(false);
                setFlagReason("");
                setFlagTarget(null);
                setOpenId(null);
                await loadProjects();
              }}
            >
              {flagLoading ? "Flagging…" : "Flag project"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
