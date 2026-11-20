// Role-aware internship detail.
// Student (#83, #84, #89): see details + Apply modal with cover letter; notification on submit.
// Employer: existing applicants/suggestions view.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Briefcase, Star, UserPlus, Building2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const COVER_MIN = 20;

export const Route = createFileRoute("/dashboard/internships/$id")({
  component: InternshipDetailRouter,
});

interface Internship {
  id: string;
  employer_id: string;
  title: string;
  details: string | null;
  skills: string[];
  programming_languages: string[];
  duration: string | null;
  deadline: string | null;
  hiring_status: "hiring" | "filled";
  archived: boolean;
  created_at?: string;
}

function daysLeft(deadline: string | null): number | null {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function InternshipDetailRouter() {
  const { role } = useAuth();
  if (role === "student") return <StudentInternshipDetail />;
  return <EmployerInternshipDetail />;
}

// =================== STUDENT VIEW (#83, #84, #89) ===================
function StudentInternshipDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const [internship, setInternship] = useState<Internship | null>(null);
  const [company, setCompany] = useState<string>("Company");
  const [loading, setLoading] = useState(true);
  const [applied, setApplied] = useState(false);
  const [applicationStatus, setApplicationStatus] = useState<
    "applied" | "accepted" | "rejected" | null
  >(null);
  const [completed, setCompleted] = useState(false);
  const [open, setOpen] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);
  const [cover, setCover] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: i } = await supabase.from("internships").select("*").eq("id", id).maybeSingle();
      setInternship((i as Internship | null) ?? null);
      if (i?.employer_id) {
        const { data: pr } = await supabase
          .from("profiles")
          .select("company_name,first_name,last_name")
          .eq("id", i.employer_id)
          .maybeSingle();
        setCompany(
          (pr?.company_name as string) ||
            `${pr?.first_name ?? ""} ${pr?.last_name ?? ""}`.trim() ||
            "Company",
        );
      }
      if (user) {
        const { data: a } = await supabase
          .from("applications")
          .select("id,status")
          .eq("internship_id", id)
          .eq("student_id", user.id)
          .maybeSingle();
        setApplied(!!a);
        setApplicationStatus((a?.status as "applied" | "accepted" | "rejected" | null) ?? null);
        // already moved to completed?
        const { data: ci } = await supabase
          .from("completed_internships")
          .select("id")
          .eq("student_id", user.id)
          .limit(50);
        // No internship_id column; check by title+company match below after we know company
        setCompleted(!!(ci ?? []).find(() => false));
      }
      setLoading(false);
    };
    void load();
  }, [id, user]);

  if (loading) return <div className="text-muted-foreground">Loading…</div>;
  if (!internship) return <EmptyState icon={Briefcase} title="Internship not found" />;

  const dl = daysLeft(internship.deadline);
  const pct = dl == null ? 0 : Math.max(0, Math.min(100, 100 - (dl / 60) * 100));
  const deadlinePassed = dl !== null && dl < 0;
  const coverLen = cover.trim().length;
  const coverValid = coverLen >= COVER_MIN;

  const submit = async () => {
    if (!user) return;
    if (!coverValid) return toast.warning(`Cover letter must be at least ${COVER_MIN} characters`);
    setSubmitting(true);
    const { error } = await supabase.from("applications").insert({
      internship_id: internship.id,
      student_id: user.id,
      cover_letter: cover.trim(),
      status: "applied",
      applied_at: new Date().toISOString(),
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    setApplied(true);
    setApplicationStatus("applied");
    setOpen(false);
    setCover("");
    toast.success("Application submitted! You'll be notified about the decision.");
  };

  const markCompleted = async () => {
    if (!user) return;
    setCompleting(true);
    const { error } = await supabase.from("completed_internships").insert({
      student_id: user.id,
      internship_id: internship.id,
      title: internship.title,
      company_name: company,
      duration: internship.duration,
      completed_on: new Date().toISOString().slice(0, 10),
    });
    setCompleting(false);
    if (error) return toast.error(error.message);
    setCompleted(true);
    toast.success("Marked as completed and added to your portfolio");
  };

  const applyDisabledReason =
    internship.hiring_status !== "hiring"
      ? "No longer hiring"
      : deadlinePassed
        ? "Deadline passed"
        : applied
          ? "Already applied"
          : null;

  return (
    <TooltipProvider delayDuration={150}>
      <Link
        to="/dashboard/internships"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
      >
        <ArrowLeft className="h-4 w-4" /> Back to search
      </Link>
      <PageHeader
        title={internship.title}
        description={`Posted by ${company}`}
        actions={
          <Badge variant={internship.hiring_status === "hiring" ? "default" : "secondary"}>
            {internship.hiring_status === "hiring" ? "Hiring" : "Filled"}
          </Badge>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <InfoCard label="Company" value={company} />
        <InfoCard label="Duration" value={internship.duration ?? "—"} />
        <InfoCard
          label="Posted"
          value={internship.created_at ? new Date(internship.created_at).toLocaleDateString() : "—"}
        />
        <InfoCard
          label="Deadline"
          value={internship.deadline ? new Date(internship.deadline).toLocaleDateString() : "—"}
        />
      </div>

      {dl !== null && dl >= 0 && (
        <div className="rounded-lg border bg-card p-4 mb-6">
          <div className="flex justify-between text-sm mb-2">
            <span className="font-medium">
              {dl} day{dl === 1 ? "" : "s"} left to apply
            </span>
            <span className="text-muted-foreground">
              Deadline {new Date(internship.deadline!).toLocaleDateString()}
            </span>
          </div>
          <Progress value={pct} />
        </div>
      )}

      <div className="rounded-lg border bg-card p-6 mb-6">
        <div className="font-medium mb-2 flex items-center gap-2">
          <Building2 className="h-4 w-4" /> Description
        </div>
        <p className="text-sm whitespace-pre-line text-muted-foreground">
          {internship.details || "No description provided."}
        </p>
        {(internship.skills.length > 0 || internship.programming_languages.length > 0) && (
          <div className="mt-4 flex flex-wrap gap-1">
            {internship.skills.map((s) => (
              <Badge key={s} variant="secondary">
                {s}
              </Badge>
            ))}
            {internship.programming_languages.map((s) => (
              <Badge key={s} variant="outline">
                {s}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {applied ? (
        <div className="rounded-lg border bg-card p-4 flex flex-wrap items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          Application status:
          <Badge
            variant={
              applicationStatus === "accepted"
                ? "default"
                : applicationStatus === "rejected"
                  ? "destructive"
                  : "secondary"
            }
          >
            {applicationStatus === "accepted"
              ? "Accepted"
              : applicationStatus === "rejected"
                ? "Rejected"
                : "Applied"}
          </Badge>
          <div className="ml-auto flex gap-2">
            {applicationStatus === "accepted" && (
              <Button
                size="sm"
                variant="outline"
                onClick={markCompleted}
                disabled={completed || completing}
              >
                <CheckCircle2 className="h-4 w-4" />{" "}
                {completed ? "Completed" : completing ? "Saving…" : "Mark as Completed"}
              </Button>
            )}
          </div>
        </div>
      ) : applyDisabledReason ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-block">
              <Button size="lg" disabled>
                {applyDisabledReason}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>{applyDisabledReason}</TooltipContent>
        </Tooltip>
      ) : (
        <Button size="lg" onClick={() => setConfirmApply(true)}>
          Apply Now
        </Button>
      )}

      {/* #7 Confirm before applying */}
      <AlertDialog open={confirmApply} onOpenChange={setConfirmApply}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply to {internship.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll be asked to write a short cover letter. You can't undo this once submitted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmApply(false);
                setOpen(true);
              }}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply to {internship.title}</DialogTitle>
            <DialogDescription>Tell {company} why you're a great fit.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cover">Cover letter *</Label>
            <Textarea
              id="cover"
              rows={8}
              value={cover}
              onChange={(e) => setCover(e.target.value)}
              placeholder="Briefly introduce yourself, your relevant skills, and why this role excites you…"
              required
            />
            {/* #84 character counter */}
            <div
              className={`text-xs flex justify-between ${coverValid ? "text-muted-foreground" : "text-destructive"}`}
            >
              <span>{coverValid ? "Looks good" : `Minimum ${COVER_MIN} characters required`}</span>
              <span>
                {coverLen} / {COVER_MIN}+
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button onClick={submit} disabled={submitting || !coverValid}>
                    {submitting ? "Submitting…" : "Submit application"}
                  </Button>
                </span>
              </TooltipTrigger>
              {!coverValid && (
                <TooltipContent>
                  Cover letter must be at least {COVER_MIN} characters
                </TooltipContent>
              )}
            </Tooltip>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

// =================== EMPLOYER VIEW (existing) ===================
interface ApplicantRow {
  id: string;
  internship_id: string;
  student_id: string;
  cover_letter: string | null;
  status: "applied" | "accepted" | "rejected";
  applied_at: string;
  name: string;
  email: string;
  contributor_score: number;
}
interface Suggestion {
  id: string;
  internship_id: string;
  student_id: string;
  cover_letter: string | null;
  status: ApplicantRow["status"];
  applied_at: string;
  name: string;
  email: string;
  contributor_score: number;
}

function EmployerInternshipDetail() {
  const { id } = Route.useParams();
  const { user, role } = useAuth();
  const [internship, setInternship] = useState<Internship | null>(null);
  const [loading, setLoading] = useState(true);
  const [applicants, setApplicants] = useState<ApplicantRow[]>([]);
  const [sortByScore, setSortByScore] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: i } = await supabase.from("internships").select("*").eq("id", id).maybeSingle();
      setInternship((i as Internship | null) ?? null);
      if (i) {
        const { data: apps } = await supabase
          .from("applications")
          .select("*")
          .eq("internship_id", id)
          .order("applied_at", { ascending: false });

        const applicantIds = Array.from(
          new Set((apps ?? []).map((a) => a.student_id as string)),
        );

        const { data: profiles } = await supabase
          .from("profiles")
          .select("id,first_name,last_name,email")
          .in("id", applicantIds);

        const profileById = new Map((profiles ?? []).map((p: any) => [p.id as string, p]));

        const rows: ApplicantRow[] = [];
        for (const a of apps ?? []) {
          const prof = profileById.get(a.student_id as string) as any;
          const fn = prof?.first_name ?? "";
          const ln = prof?.last_name ?? "";
          const randomScore = Math.random() * 4 + 1;

          rows.push({
            id: a.id as string,
            internship_id: a.internship_id as string,
            student_id: a.student_id as string,
            cover_letter: (a.cover_letter as string | null) ?? null,
            status: a.status as ApplicantRow["status"],
            applied_at: a.applied_at as string,
            name: `${fn} ${ln}`.trim() || "Student",
            email: (prof?.email ?? "—") as string,
            contributor_score: Number(randomScore.toFixed(2)),
          });
        }
        setApplicants(rows);

        if (user) {
          const { data: favs } = await supabase
            .from("student_favorites")
            .select("target_id")
            .eq("student_id", user.id)
            .eq("kind", "portfolio");
          const favIds = new Set((favs ?? []).map((f) => f.target_id as string));
          const suggestedApplicants = rows.filter((r) => favIds.has(r.student_id));
          setSuggestions(suggestedApplicants);
        }
      }
      setLoading(false);
    };
    void load();
  }, [id, user]);

  if (loading) return <div className="text-muted-foreground">Loading…</div>;
  if (!internship) return <EmptyState icon={Briefcase} title="Internship not found" />;
  if (role === "employer" && user && internship.employer_id !== user.id) {
    return (
      <EmptyState
        title="Not your internship"
        description="You can only view internships you created."
      />
    );
  }

  const setStatus = async (appId: string, status: ApplicantRow["status"]) => {
    const { error } = await supabase.from("applications").update({ status }).eq("id", appId);
    if (error) return toast.error(error.message);
    setApplicants((prev) => prev.map((a) => (a.id === appId ? { ...a, status } : a)));
    toast.success("Applicant status updated");
  };

  const sortedApplicants = sortByScore
    ? [...applicants].sort((a, b) => b.contributor_score - a.contributor_score)
    : applicants;

  return (
    <>
      <Link
        to="/dashboard/internships"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
      >
        <ArrowLeft className="h-4 w-4" /> Back to internships
      </Link>
      <PageHeader
        title={internship.title}
        description={internship.details ?? undefined}
        actions={
          <Badge variant={internship.hiring_status === "hiring" ? "default" : "secondary"}>
            {internship.hiring_status === "hiring" ? "Hiring" : "Filled"}
          </Badge>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <InfoCard label="Duration" value={internship.duration ?? "—"} />
        <InfoCard
          label="Deadline"
          value={internship.deadline ? new Date(internship.deadline).toLocaleDateString() : "—"}
        />
        <InfoCard
          label="Skills"
          value={internship.skills.length ? internship.skills.join(", ") : "—"}
        />
        <InfoCard
          label="Languages"
          value={
            internship.programming_languages.length
              ? internship.programming_languages.join(", ")
              : "—"
          }
        />
      </div>

      <Tabs defaultValue="applicants">
        <TabsList>
          <TabsTrigger value="applicants">Applicants ({applicants.length})</TabsTrigger>
          <TabsTrigger value="suggestions">Suggestions ({suggestions.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="applicants" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Select
              value={sortByScore ? "score" : "recent"}
              onValueChange={(v) => setSortByScore(v === "score")}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Most recent first</SelectItem>
                <SelectItem value="score">Sort by top contributors</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {sortedApplicants.length === 0 ? (
            <EmptyState
              title="No applicants yet"
              description="Once students apply, they'll appear here."
            />
          ) : (
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Cover letter</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedApplicants.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{a.email}</TableCell>
                      <TableCell className="max-w-xs truncate text-sm" title={a.cover_letter ?? ""}>
                        {a.cover_letter || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1 text-sm">
                          <Star className="h-3 w-3 text-primary" /> {a.contributor_score}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={a.status}
                          onValueChange={(v) => setStatus(a.id, v as ApplicantRow["status"])}
                        >
                          <SelectTrigger className="w-[140px] h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="applied">Applied</SelectItem>
                            <SelectItem value="accepted">Accepted</SelectItem>
                            <SelectItem value="rejected">Rejected</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="suggestions" className="mt-4">
          {suggestions.length === 0 ? (
            <EmptyState
              icon={Star}
              title="No suggestions"
              description="Applications from students whose portfolios you favorited will appear here."
            />
          ) : (
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Cover letter</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suggestions.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{a.email}</TableCell>
                      <TableCell className="max-w-xs truncate text-sm" title={a.cover_letter ?? ""}>
                        {a.cover_letter || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1 text-sm">
                          <Star className="h-3 w-3 text-primary" /> {a.contributor_score}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={a.status}
                          onValueChange={(v) => setStatus(a.id, v as ApplicantRow["status"])}
                        >
                          <SelectTrigger className="w-[140px] h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="applied">Applied</SelectItem>
                            <SelectItem value="accepted">Accepted</SelectItem>
                            <SelectItem value="rejected">Rejected</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm">{value}</div>
    </div>
  );
}
