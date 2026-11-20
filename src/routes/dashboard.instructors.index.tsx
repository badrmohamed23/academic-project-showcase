// Req #8, #9 — Search instructors by name or course
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState, SkeletonCards } from "@/components/dashboard-shell";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, GraduationCap, BookOpen, Lightbulb } from "lucide-react";
import { fullName } from "@/lib/validators";

export const Route = createFileRoute("/dashboard/instructors/")({
  component: InstructorsPage,
});

interface Row {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  avatar_url: string | null;
  research_interests: string[];
  courses: { id: string; name: string; code: string }[];
}

function InstructorsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [course, setCourse] = useState<string>("all");
  const [sort, setSort] = useState<"name" | "courses-desc">("courses-desc");
  const [courses, setCourses] = useState<{ id: string; name: string; code: string }[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "instructor");
      const ids = (roles ?? []).map((r) => r.user_id as string);
      if (ids.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }
      const [{ data: profs }, { data: ips }, { data: links }, { data: cs }] = await Promise.all([
        supabase.from("profiles").select("id,first_name,last_name,email,avatar_url").in("id", ids),
        supabase.from("instructor_profiles").select("id,research_interests").in("id", ids),
        supabase.from("instructor_courses").select("instructor_id,course_id").in("instructor_id", ids),
        supabase.from("courses").select("id,name,code").order("code"),
      ]);
      const courseMap = new Map((cs ?? []).map((c) => [c.id, c]));
      const linkMap = new Map<string, { id: string; name: string; code: string }[]>();
      for (const l of links ?? []) {
        const iid = l.instructor_id as string;
        const cid = l.course_id as string;
        const course = courseMap.get(cid);
        if (!course) continue;
        if (!linkMap.has(iid)) linkMap.set(iid, []);
        linkMap.get(iid)!.push(course);
      }
      const ipMap = new Map<string, string[]>();
      for (const ip of ips ?? [])
        ipMap.set(ip.id as string, (ip.research_interests as string[] | null) ?? []);
      setRows(
        ((profs ?? []) as Omit<Row, "courses" | "research_interests">[]).map((p) => ({
          ...p,
          research_interests: ipMap.get(p.id) ?? [],
          courses: linkMap.get(p.id) ?? [],
        })),
      );
      setCourses((cs ?? []) as typeof courses);
      setLoading(false);
    };
    void load();
  }, []);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    let list = rows.filter((r) => {
      const name = `${r.first_name ?? ""} ${r.last_name ?? ""}`.toLowerCase();
      const matchName =
        !ql ||
        name.includes(ql) ||
        (r.email ?? "").toLowerCase().includes(ql) ||
        r.courses.some(
          (c) => c.name.toLowerCase().includes(ql) || c.code.toLowerCase().includes(ql),
        );
      if (!matchName) return false;
      if (course !== "all" && !r.courses.some((c) => c.id === course)) return false;
      return true;
    });
    if (sort === "name")
      list = [...list].sort((a, b) =>
        `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`),
      );
    else list = [...list].sort((a, b) => b.courses.length - a.courses.length);
    return list;
  }, [rows, q, course, sort]);

  return (
    <>
      <PageHeader
        title="Find Instructors"
        description="Search course instructors by name, email, or course."
      />

      <div className="grid gap-3 md:grid-cols-3 mb-4">
        <div className="md:col-span-2 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by name, email, or course…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select value={course} onValueChange={setCourse}>
          <SelectTrigger>
            <SelectValue placeholder="Course taught" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All courses</SelectItem>
            {courses.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.code} — {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-between items-center mb-6">
        <div className="text-sm text-muted-foreground">
          {filtered.length} result{filtered.length === 1 ? "" : "s"}
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="courses-desc">Most courses first</SelectItem>
            <SelectItem value="name">Name (A–Z)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <SkeletonCards count={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No instructors found"
          description="Try a different search or filter."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((r) => (
            <Link
              key={r.id}
              to="/dashboard/instructors/$id"
              params={{ id: r.id }}
              className="rounded-lg border bg-card p-4 flex flex-col transition-all hover:shadow-md hover:-translate-y-0.5"
            >
              <div className="flex items-start gap-3">
                <Avatar className="h-12 w-12">
                  {r.avatar_url && <AvatarImage src={r.avatar_url} alt="" />}
                  <AvatarFallback>{(r.first_name?.[0] ?? "I").toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{fullName(r)}</div>
                  <div className="text-xs text-muted-foreground truncate">Course Instructor</div>
                </div>
              </div>
              {r.research_interests.length > 0 && (
                <div className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground line-clamp-1">
                  <Lightbulb className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span className="truncate">{r.research_interests.join(", ")}</span>
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-1 min-h-[22px]">
                {r.courses.length === 0 && (
                  <span className="text-xs text-muted-foreground">No linked courses</span>
                )}
                {r.courses.slice(0, 4).map((c) => (
                  <Badge key={c.id} variant="secondary" className="text-[10px]">
                    <BookOpen className="h-3 w-3 mr-1" />
                    {c.code}
                  </Badge>
                ))}
                {r.courses.length > 4 && (
                  <Badge variant="outline" className="text-[10px]">
                    +{r.courses.length - 4}
                  </Badge>
                )}
              </div>
              <Button size="sm" className="mt-4 w-full" tabIndex={-1}>
                View profile
              </Button>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
