// Req #47, #48, #49, #50, #51 — Portfolio discovery
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState, SkeletonCards } from "@/components/dashboard-shell";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, GraduationCap, FolderKanban, Heart } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/portfolios/")({
  component: PortfoliosPage,
});

interface PortfolioRow {
  id: string;
  name: string;
  email: string | null;
  major: string | null;
  skills: string[];
  project_count: number;
}

interface StudentProfileRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  major: string | null;
  skills: string[] | null;
}

interface ProfileRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

interface FavoriteRow {
  target_id: string;
}

function PortfoliosPage() {
  const { user, role } = useAuth();
  const [rows, setRows] = useState<PortfolioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [major, setMajor] = useState<string>("all");
  const [skill, setSkill] = useState<string>("all");
  const [sort, setSort] = useState<"projects-desc" | "projects-asc" | "name">("projects-desc");
  const [favIds, setFavIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: sps, error } = await supabase
        .from("student_profiles")
        .select("id,first_name,last_name,email,major,skills");
      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }
      const studentProfiles = (sps ?? []) as StudentProfileRow[];
      const ids = studentProfiles.map((student) => student.id);
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("id,first_name,last_name").in("id", ids)
        : { data: [] };
      const profileById = new Map<string, ProfileRow>(
        ((profiles ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]),
      );
      const counts: Record<string, number> = {};
      if (ids.length) {
        const { data: projs } = await supabase
          .from("projects")
          .select("student_id")
          .in("student_id", ids)
          .eq("is_active", true)
          .eq("is_admin_active", true)
          .eq("in_portfolio", true);
        for (const p of (projs ?? []) as Array<{ student_id: string }>) {
          const sid = p.student_id;
          counts[sid] = (counts[sid] ?? 0) + 1;
        }
      }
      setRows(
        studentProfiles.map((student) => {
          const profile = profileById.get(student.id);
          const firstName = (profile?.first_name ?? student.first_name ?? "").trim();
          const lastName = (profile?.last_name ?? student.last_name ?? "").trim();
          return {
            id: student.id,
            name: `${firstName} ${lastName}`.trim() || "Student",
            email: student.email,
            major: student.major,
            skills: student.skills ?? [],
            project_count: counts[student.id] ?? 0,
          };
        }),
      );
      if (user && (role === "student" || role === "employer")) {
        const { data: f } = await supabase
          .from("student_favorites")
          .select("target_id")
          .eq("student_id", user.id)
          .eq("kind", "portfolio");
        setFavIds(new Set(((f ?? []) as FavoriteRow[]).map((favorite) => favorite.target_id)));
      }
      setLoading(false);
    };
    void load();
  }, [user, role]);

  const majors = useMemo(
    () => Array.from(new Set(rows.map((r) => r.major).filter(Boolean) as string[])).sort(),
    [rows],
  );
  const skills = useMemo(() => Array.from(new Set(rows.flatMap((r) => r.skills))).sort(), [rows]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    let list = rows.filter((r) => {
      const name = r.name.toLowerCase();
      const email = (r.email ?? "").toLowerCase();
      if (ql && !name.includes(ql) && !email.includes(ql)) return false;
      if (major !== "all" && r.major !== major) return false;
      if (skill !== "all" && !r.skills.includes(skill)) return false;
      return true;
    });
    if (sort === "projects-desc") list = list.sort((a, b) => b.project_count - a.project_count);
    else if (sort === "projects-asc") list = list.sort((a, b) => a.project_count - b.project_count);
    else list = list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [rows, q, major, skill, sort]);

  const toggleFav = async (id: string) => {
    if (!user || (role !== "student" && role !== "employer"))
      return toast.info("Sign in as a student or employer to save favorites");
    const isFav = favIds.has(id);
    if (isFav) {
      await supabase
        .from("student_favorites")
        .delete()
        .eq("student_id", user.id)
        .eq("kind", "portfolio")
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
        .insert({ student_id: user.id, kind: "portfolio", target_id: id });
      if (error) return toast.error(error.message);
      setFavIds((s) => new Set(s).add(id));
      toast.success("Saved to favorites");
    }
  };

  return (
    <>
      <PageHeader
        title="Portfolio Discovery"
        description="Find student portfolios by name, major, or skill."
      />

      <div className="grid gap-3 md:grid-cols-4 mb-6">
        <div className="md:col-span-2 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          {/* #47 Search portfolios by student name or email */}
          <Input
            className="pl-9"
            placeholder="Search by name or email…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {/* #48 Filter by major */}
        <Select value={major} onValueChange={setMajor}>
          <SelectTrigger>
            <SelectValue placeholder="Major" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All majors</SelectItem>
            {majors.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* #48 Filter by skill */}
        <Select value={skill} onValueChange={setSkill}>
          <SelectTrigger>
            <SelectValue placeholder="Skill" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All skills</SelectItem>
            {skills.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-between items-center mb-4">
        <div className="text-sm text-muted-foreground">
          {filtered.length} result{filtered.length === 1 ? "" : "s"}
        </div>
        {/* #50 Sort by number of projects */}
        <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
          <SelectTrigger className="w-55">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="projects-desc">Most projects first</SelectItem>
            <SelectItem value="projects-asc">Fewest projects first</SelectItem>
            <SelectItem value="name">Name (A–Z)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <SkeletonCards count={6} />
      ) : filtered.length === 0 ? (
        <div className="space-y-3">
          <EmptyState
            icon={GraduationCap}
            title="No results found"
            description="Try a different search or filter."
          />
          {(q || major !== "all" || skill !== "all") && (
            <div className="text-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setQ("");
                  setMajor("all");
                  setSkill("all");
                }}
              >
                Clear all filters
              </Button>
            </div>
          )}
        </div>
      ) : (
        // #49 Results grid
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((r) => {
            return (
              <div key={r.id} className="rounded-lg border bg-card p-4 flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{r.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{r.email ?? "—"}</div>
                  </div>
                  {(role === "student" || role === "employer") && (
                    <button onClick={() => toggleFav(r.id)} title="Save portfolio">
                      <Heart
                        className={`h-4 w-4 ${favIds.has(r.id) ? "fill-destructive text-destructive" : "text-muted-foreground"}`}
                      />
                    </button>
                  )}
                </div>
                {r.major && <div className="mt-2 text-sm">{r.major}</div>}
                <div className="mt-2 flex flex-wrap gap-1">
                  {r.skills.slice(0, 3).map((s) => (
                    <Badge key={s} variant="secondary" className="text-[10px]">
                      {s}
                    </Badge>
                  ))}
                  {r.skills.length > 3 && (
                    <Badge variant="outline" className="text-[10px]">
                      +{r.skills.length - 3}
                    </Badge>
                  )}
                </div>
                <div className="mt-3 flex items-center gap-1 text-sm text-muted-foreground">
                  <FolderKanban className="h-4 w-4" /> {r.project_count} project
                  {r.project_count === 1 ? "" : "s"}
                </div>
                <div className="mt-4">
                  {/* #51 View portfolio */}
                  <Button asChild size="sm" className="w-full">
                    <Link to="/dashboard/portfolios/$id" params={{ id: r.id }}>
                      View Portfolio
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
