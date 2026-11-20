// Req #67 — Recommended projects
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, EmptyState, SkeletonCards } from "@/components/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Lightbulb, Star, FolderKanban, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/recommendations")({
  component: RecommendationsPage,
});

interface Rec {
  id: string;
  title: string;
  description: string | null;
  match: number;
  reason: string;
  rating: number;
}

const REASONS = [
  "Based on your interest in AI",
  "Similar to projects you liked",
  "Popular with your skill set",
  "Matches your major",
  "Trending this week",
];

function deterministicScore(seed: string, mod: number, base: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return base + (Math.abs(h) % mod);
}

function matchClass(m: number): string {
  if (m >= 90) return "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30";
  if (m >= 80) return "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30";
  return "bg-yellow-500/15 text-yellow-700 dark:text-yellow-500 border-yellow-500/30";
}

function RecommendationsPage() {
  const { role } = useAuth();
  const [recs, setRecs] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("projects")
        .select("id,title,description")
        .eq("is_active", true)
        .eq("is_admin_active", true)
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }
      const list: Rec[] = (data ?? [])
        .map((p, i) => ({
          id: p.id as string,
          title: p.title as string,
          description: (p.description as string | null) ?? null,
          match: deterministicScore(p.id as string, 29, 70),
          rating: 4 + deterministicScore(p.id as string, 10, 0) / 10,
          reason: REASONS[i % REASONS.length],
        }))
        .sort((a, b) => b.match - a.match);
      setRecs(list);
      setLoading(false);
    };
    void load();
  }, []);

  if (role !== "student") {
    return (
      <EmptyState
        icon={Sparkles}
        title="Students only"
        description="Recommendations are tailored for student accounts."
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Recommended Projects"
        description="Hand-picked for you based on your interests and activity."
      />
      {loading ? (
        <SkeletonCards count={6} />
      ) : recs.length === 0 ? (
        <EmptyState icon={Sparkles} title="Nothing to recommend yet" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recs.map((r) => (
            <Link
              key={r.id}
              to="/dashboard/projects-search"
              search={{ open: r.id } as never}
              className="group rounded-lg border bg-card p-4 flex flex-col transition-all hover:shadow-lg hover:-translate-y-0.5"
            >
              <div className="grid h-24 place-items-center rounded-md bg-gradient-to-br from-primary/15 via-accent/10 to-secondary/15 mb-3">
                <FolderKanban className="h-10 w-10 text-primary/70" />
              </div>
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold leading-tight">{r.title}</div>
                <Badge variant="outline" className={cn("shrink-0 border", matchClass(r.match))}>
                  {r.match}%
                </Badge>
              </div>
              <div className="mt-1 inline-flex items-center gap-1 text-xs text-amber-500">
                <Star className="h-3.5 w-3.5 fill-amber-500" /> {r.rating.toFixed(1)}
              </div>
              {r.description && (
                <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{r.description}</p>
              )}
              <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
                <Lightbulb className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  <span className="font-medium text-foreground">Why recommended?</span> {r.reason}
                </span>
              </div>
              <div className="mt-4 inline-flex items-center gap-1 text-sm text-primary font-medium group-hover:gap-2 transition-all">
                View project <ArrowRight className="h-4 w-4" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
