// Req #65, #66 — Favorites with Projects + Portfolios tabs
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, EmptyState, SkeletonCards } from "@/components/dashboard-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Heart, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/favorites")({
  component: FavoritesPage,
});

interface ProjectFav {
  favId: string;
  id: string;
  title: string;
  kind: string;
  description: string | null;
}
interface PortfolioFav {
  favId: string;
  id: string;
  name: string;
  email: string;
  major: string | null;
}

function FavoritesPage() {
  const { user, role } = useAuth();
  const [projects, setProjects] = useState<ProjectFav[]>([]);
  const [portfolios, setPortfolios] = useState<PortfolioFav[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmRemove, setConfirmRemove] = useState<{
    favId: string;
    where: "project" | "portfolio";
    name: string;
  } | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: favs, error } = await supabase
      .from("student_favorites")
      .select("*")
      .eq("student_id", user.id);
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const projectFavs = (favs ?? []).filter((f) => f.kind === "project");
    const portfolioFavs = (favs ?? []).filter((f) => f.kind === "portfolio");

    const projIds = projectFavs.map((f) => f.target_id as string);
    const portIds = portfolioFavs.map((f) => f.target_id as string);

    let projRows: ProjectFav[] = [];
    if (projIds.length) {
      const { data: ps } = await supabase
        .from("projects")
        .select("id,title,kind,description")
        .in("id", projIds);
      projRows = projectFavs.map((f) => {
        const p = (ps ?? []).find((x) => x.id === f.target_id);
        return {
          favId: f.id as string,
          id: f.target_id as string,
          title: (p?.title as string) ?? "Removed project",
          kind: (p?.kind as string) ?? "—",
          description: (p?.description as string | null) ?? null,
        };
      });
    }

    let portRows: PortfolioFav[] = [];
    if (portIds.length) {
      const [{ data: sps }, { data: profs }] = await Promise.all([
        supabase
          .from("student_profiles")
          .select("id,first_name,last_name,email,major")
          .in("id", portIds),
        supabase.from("profiles").select("id,first_name,last_name,email").in("id", portIds),
      ]);
      portRows = portfolioFavs.map((f) => {
        const sp = (sps ?? []).find((x) => x.id === f.target_id);
        const pr = (profs ?? []).find((x) => x.id === f.target_id);
        const fn = pr?.first_name ?? sp?.first_name ?? "";
        const ln = pr?.last_name ?? sp?.last_name ?? "";
        return {
          favId: f.id as string,
          id: f.target_id as string,
          name: `${fn} ${ln}`.trim() || "Student",
          email: (pr?.email ?? sp?.email ?? "—") as string,
          major: (sp?.major ?? null) as string | null,
        };
      });
    }

    setProjects(projRows);
    setPortfolios(portRows);
    setLoading(false);
  };

  useEffect(() => {
    void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [user]);

  const remove = async (favId: string, where: "project" | "portfolio") => {
    const { error } = await supabase.from("student_favorites").delete().eq("id", favId);
    if (error) return toast.error(error.message);
    if (where === "project") setProjects((p) => p.filter((x) => x.favId !== favId));
    else setPortfolios((p) => p.filter((x) => x.favId !== favId));
    toast.success("Removed from favorites");
  };

  if (role !== "student" && role !== "employer") {
    return (
      <EmptyState
        icon={Heart}
        title="Students and employers only"
        description="Favorites are available for student and employer accounts."
      />
    );
  }

  return (
    <>
      <PageHeader title="Favorites" description="Your saved projects and portfolios." />

      {loading ? (
        <SkeletonCards count={4} />
      ) : (
        // #66 separate tabs
        <Tabs defaultValue="projects">
          <TabsList>
            <TabsTrigger value="projects">Projects ({projects.length})</TabsTrigger>
            <TabsTrigger value="portfolios">Portfolios ({portfolios.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="projects" className="mt-4">
            {projects.length === 0 ? (
              <EmptyState
                icon={Heart}
                title="No favorites yet"
                description="Save projects from the Browse page to see them here."
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {projects.map((p) => (
                  <div key={p.favId} className="rounded-lg border bg-card p-4 flex flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{p.title}</div>
                        <Badge variant="outline" className="text-[10px] mt-1">
                          {p.kind}
                        </Badge>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Remove from favorites"
                        onClick={() =>
                          setConfirmRemove({ favId: p.favId, where: "project", name: p.title })
                        }
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    {p.description && (
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-3">
                        {p.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="portfolios" className="mt-4">
            {portfolios.length === 0 ? (
              <EmptyState
                icon={Heart}
                title="No favorites yet"
                description="Save portfolios from the discovery page to see them here."
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {portfolios.map((p) => (
                  <div key={p.favId} className="rounded-lg border bg-card p-4 flex flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          to="/dashboard/portfolios/$id"
                          params={{ id: p.id }}
                          className="font-medium hover:underline truncate block"
                        >
                          {p.name}
                        </Link>
                        <div className="text-xs text-muted-foreground truncate">{p.email}</div>
                        <Badge variant="outline" className="text-[10px] mt-1">
                          Portfolio
                        </Badge>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Remove from favorites"
                        onClick={() =>
                          setConfirmRemove({ favId: p.favId, where: "portfolio", name: p.name })
                        }
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    {p.major && <div className="text-sm mt-2">{p.major}</div>}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* #7 Confirm before remove */}
      <AlertDialog open={!!confirmRemove} onOpenChange={(o) => !o && setConfirmRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from favorites?</AlertDialogTitle>
            <AlertDialogDescription>
              "{confirmRemove?.name}" will be removed from your favorites. You can re-add it
              anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={async () => {
                if (!confirmRemove) return;
                const c = confirmRemove;
                setConfirmRemove(null);
                await remove(c.favId, c.where);
              }}
            >
              Yes, remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
