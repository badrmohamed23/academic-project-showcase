// Req #9 — Instructor full profile with linked courses
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, EmptyState } from "@/components/dashboard-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  BookOpen,
  GraduationCap,
  Mail,
  MessageCircle,
  Lightbulb,
  Clock,
} from "lucide-react";
import { fullName } from "@/lib/validators";
import { startConversation } from "@/lib/messaging";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/instructors/$id")({
  component: InstructorDetail,
});

interface InstructorData {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  avatar_url: string | null;
  bio: string | null;
  research_interests: string[];
  education: { degree: string; institution: string; year: string }[];
  courses: { id: string; name: string; code: string }[];
}

function InstructorDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<InstructorData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [{ data: prof }, { data: ip }, { data: links }, { data: cs }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,first_name,last_name,email,avatar_url")
          .eq("id", id)
          .maybeSingle(),
        supabase
          .from("instructor_profiles")
          .select("bio,research_interests,education")
          .eq("id", id)
          .maybeSingle(),
        supabase.from("instructor_courses").select("course_id").eq("instructor_id", id),
        supabase.from("courses").select("id,name,code"),
      ]);
      if (!prof) {
        setLoading(false);
        return;
      }
      const courseMap = new Map((cs ?? []).map((c: { id: string; name: string; code: string }) => [c.id, c]));
      setData({
        id: prof.id as string,
        first_name: prof.first_name as string | null,
        last_name: prof.last_name as string | null,
        email: prof.email as string,
        avatar_url: prof.avatar_url as string | null,
        bio: (ip?.bio as string | null) ?? null,
        research_interests: (ip?.research_interests as string[] | null) ?? [],
        education: (ip?.education as InstructorData["education"] | null) ?? [],
        courses: (links ?? [])
          .map((l:{ course_id: string }) => courseMap.get(l.course_id as string))
          .filter(Boolean) as { id: string; name: string; code: string }[],
      });
      setLoading(false);
    };
    void load();
  }, [id]);

  const message = async () => {
    if (!user || !data) return;
    if (data.id === user.id) return;
    const cid = await startConversation(user.id, data.id);
    if (!cid) return toast.error("Could not start conversation");
    navigate({ to: "/dashboard/messages", search: { c: cid } as never });
  };

  if (loading) return <div className="text-muted-foreground">Loading…</div>;
  if (!data) return <EmptyState icon={GraduationCap} title="Instructor not found" />;

  return (
    <>
      <Link
        to="/dashboard/instructors"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <PageHeader title={fullName(data)} />

      <div className="rounded-lg border bg-card p-6 mb-6">
        <div className="flex items-start gap-4">
          <Avatar className="h-20 w-20">
            {data.avatar_url && <AvatarImage src={data.avatar_url} alt="" />}
            <AvatarFallback>{(data.first_name?.[0] ?? "I").toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-sm flex items-center gap-2 text-muted-foreground">
              <Mail className="h-4 w-4" />
              {data.email}
            </div>
            {data.bio && <p className="mt-3 text-sm whitespace-pre-wrap">{data.bio}</p>}
          </div>
          {user && user.id !== data.id && (
            <Button variant="outline" onClick={message}>
              <MessageCircle className="h-4 w-4" /> Message
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-lg border bg-card p-5">
          <h2 className="font-medium flex items-center gap-2 mb-3">
            <Lightbulb className="h-4 w-4" /> Research interests
          </h2>
          {data.research_interests.length === 0 ? (
            <div className="text-sm text-muted-foreground">Not provided.</div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {data.research_interests.map((r) => (
                <Badge key={r} variant="secondary">
                  {r}
                </Badge>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-lg border bg-card p-5">
          <h2 className="font-medium flex items-center gap-2 mb-3">
            <GraduationCap className="h-4 w-4" /> Education
          </h2>
          {data.education.length === 0 ? (
            <div className="text-sm text-muted-foreground">Not provided.</div>
          ) : (
            <ul className="space-y-2">
              {data.education.map((e, i) => (
                <li key={i} className="text-sm">
                  <div className="font-medium">{e.degree}</div>
                  <div className="text-muted-foreground text-xs">
                    {e.institution}
                    {e.year ? ` · ${e.year}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-lg border bg-card p-5 mt-6">
        <h2 className="font-medium flex items-center gap-2 mb-3">
          <BookOpen className="h-4 w-4" /> Linked courses
        </h2>
        {data.courses.length === 0 ? (
          <div className="text-sm text-muted-foreground">No courses linked.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {data.courses.map((c) => (
              <Link
                key={c.id}
                to="/dashboard/projects-search"
                search={{ q: c.code } as never}
                className="rounded-full border px-3 py-1 text-xs hover:bg-accent transition-colors inline-flex items-center gap-1"
              >
                <BookOpen className="h-3 w-3" />
                <span className="font-mono">{c.code}</span>
                <span className="text-muted-foreground">— {c.name}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border bg-card p-5 mt-6">
        <h2 className="font-medium flex items-center gap-2 mb-3">
          <Clock className="h-4 w-4" /> Office hours
        </h2>
        <ul className="text-sm space-y-1 text-muted-foreground">
          <li>Monday · 14:00 – 16:00</li>
          <li>Wednesday · 10:00 – 12:00</li>
        </ul>
      </section>
    </>
  );
}
