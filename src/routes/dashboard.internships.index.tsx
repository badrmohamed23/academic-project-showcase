// Role-aware internships index. Employer = manage own internships.
// Student (#79, #80, #81, #82) = search/filter/sort internships across all employers.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Briefcase,
  Plus,
  Pencil,
  Trash2,
  Archive,
  ArchiveRestore,
  ExternalLink,
  Users,
  Search,
  Building2,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/internships/")({
  component: InternshipsRouter,
});

export interface Internship {
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

const splitList = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
function isPastDeadline(deadline: string | null): boolean {
  if (!deadline) return false;
  // Compare YYYY-MM-DD strings to avoid timezone off-by-one. A deadline is
  // "past" once today's date is strictly greater than the deadline date.
  const todayStr = new Date().toISOString().slice(0, 10);
  const dl = deadline.slice(0, 10);
  return todayStr > dl;
}
function daysLeft(deadline: string | null): number | null {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function InternshipsRouter() {
  const { role } = useAuth();
  if (role === "student") return <StudentSearch />;
  return <EmployerInternships />;
}

// =================== STUDENT SEARCH (#79–#82) ===================
function StudentSearch() {
  const { user } = useAuth();
  const [items, setItems] = useState<(Internship & { company: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [company, setCompany] = useState("all");
  const [duration, setDuration] = useState("all");
  const [sort, setSort] = useState<"recent" | "oldest">("recent");
  const [appliedStatuses, setAppliedStatuses] = useState<
    Map<string, "applied" | "accepted" | "rejected">
  >(new Map());

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      // Only "hiring" + not archived
      const { data: ints, error } = await supabase
        .from("internships")
        .select("*")
        .eq("hiring_status", "hiring")
        .eq("archived", false)
        .order("created_at", { ascending: false });
      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }
      const employerIds = Array.from(new Set((ints ?? []).map((i) => i.employer_id as string)));
      const companyMap: Record<string, string> = {};
      if (employerIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id,company_name,first_name,last_name")
          .in("id", employerIds);
        for (const p of profs ?? []) {
          companyMap[p.id as string] =
            (p.company_name as string) ??
            `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() ??
            "Unknown";
        }
      }
      setItems(
        ((ints ?? []) as Internship[]).map((i) => ({
          ...i,
          company: companyMap[i.employer_id] ?? "Company",
        })),
      );

      if (user) {
        const { data: apps } = await supabase
          .from("applications")
          .select("internship_id,status")
          .eq("student_id", user.id);
        const statusMap = new Map<string, "applied" | "accepted" | "rejected">();
        (apps ?? []).forEach((a) => {
          statusMap.set(a.internship_id as string, a.status as "applied" | "accepted" | "rejected");
        });
        setAppliedStatuses(statusMap);
      }
      setLoading(false);
    };
    void load();
  }, [user]);

  const companies = useMemo(() => Array.from(new Set(items.map((i) => i.company))).sort(), [items]);
  const durations = useMemo(
    () => Array.from(new Set(items.map((i) => i.duration).filter(Boolean) as string[])).sort(),
    [items],
  );

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    let list = items.filter((i) => {
      if (ql && !i.title.toLowerCase().includes(ql) && !i.company.toLowerCase().includes(ql))
        return false;
      if (company !== "all" && i.company !== company) return false;
      if (duration !== "all" && i.duration !== duration) return false;
      return true;
    });
    list = list.sort((a, b) => {
      const da = new Date(a.created_at ?? 0).getTime();
      const db = new Date(b.created_at ?? 0).getTime();
      return sort === "recent" ? db - da : da - db;
    });
    return list;
  }, [items, q, company, duration, sort]);

  return (
    <>
      <PageHeader
        title="Internship Search"
        description="Find an internship that matches your goals."
      />
      <div className="grid gap-3 md:grid-cols-4 mb-6">
        <div className="md:col-span-2 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          {/* #79 search by title or company */}
          <Input
            className="pl-9"
            placeholder="Search by title or company…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {/* #80 filter by company */}
        <Select value={company} onValueChange={setCompany}>
          <SelectTrigger>
            <SelectValue placeholder="Company" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All companies</SelectItem>
            {companies.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* #80 filter by duration */}
        <Select value={duration} onValueChange={setDuration}>
          <SelectTrigger>
            <SelectValue placeholder="Duration" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any duration</SelectItem>
            {durations.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-between items-center mb-4">
        <div className="text-sm text-muted-foreground">{filtered.length} hiring</div>
        {/* #82 sort by date posted */}
        <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Most recent first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Briefcase} title="No results found" />
      ) : (
        // #81 list of internships
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((i) => {
            const dl = daysLeft(i.deadline);
            const pct = dl == null ? 0 : Math.max(0, Math.min(100, 100 - (dl / 60) * 100));
            const applicationStatus = appliedStatuses.get(i.id);
            const applied = !!applicationStatus;
            return (
              <div key={i.id} className="rounded-lg border bg-card p-4 flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{i.title}</div>
                    <div className="text-sm text-muted-foreground flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5" />
                      {i.company}
                    </div>
                  </div>
                  <Badge variant="default" className="shrink-0">
                    Hiring
                  </Badge>
                </div>
                {i.details && (
                  <p className="text-sm mt-2 text-muted-foreground line-clamp-3">{i.details}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {i.duration && (
                    <Badge variant="outline">
                      <Clock className="h-3 w-3 mr-1" />
                      {i.duration}
                    </Badge>
                  )}
                  {dl !== null && (
                    <Badge variant={dl < 0 ? "destructive" : "secondary"}>
                      {dl < 0 ? "Closed" : `${dl} day${dl === 1 ? "" : "s"} left`}
                    </Badge>
                  )}
                </div>
                {i.created_at && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    Posted {new Date(i.created_at).toLocaleDateString()}
                  </div>
                )}
                {dl !== null && dl >= 0 && (
                  <div className="mt-3">
                    <Progress value={pct} />
                  </div>
                )}
                <div className="mt-4 flex gap-2">
                  <Button asChild size="sm" variant="outline" className="flex-1">
                    {/* #83 view details */}
                    <Link to="/dashboard/internships/$id" params={{ id: i.id }}>
                      View Details
                    </Link>
                  </Button>
                  <Button asChild size="sm" className="flex-1" disabled={applied}>
                    <Link to="/dashboard/internships/$id" params={{ id: i.id }}>
                      {applied
                        ? applicationStatus === "accepted"
                          ? "Accepted"
                          : applicationStatus === "rejected"
                            ? "Rejected"
                            : "Applied"
                        : "Apply Now"}
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

// =================== EMPLOYER MANAGE (existing) ===================
function EmployerInternships() {
  const { user, role } = useAuth();
  const [items, setItems] = useState<Internship[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Internship | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("internships")
      .select("*")
      .eq("employer_id", user.id)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setItems((data ?? []) as Internship[]);
    setLoading(false);
  };

  useEffect(() => {
    void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [user]);

  const active = useMemo(() => items.filter((i) => !i.archived), [items]);
  const archived = useMemo(() => items.filter((i) => i.archived), [items]);

  if (role !== "employer" && role !== "admin") {
    return (
      <EmptyState
        title="Employers only"
        description="Only employer accounts can manage internships."
      />
    );
  }

  const setStatus = async (id: string, hiring_status: "hiring" | "filled") => {
    const { error } = await supabase.from("internships").update({ hiring_status }).eq("id", id);
    if (error) return toast.error(error.message);
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, hiring_status } : i)));
    toast.success("Hiring status updated");
  };

  const setArchived = async (id: string, archived: boolean) => {
    const { error } = await supabase.from("internships").update({ archived }).eq("id", id);
    if (error) return toast.error(error.message);
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, archived } : i)));
    toast.success(archived ? "Archived" : "Unarchived");
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this internship? Applicants will be removed too.")) return;
    const { error } = await supabase.from("internships").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setItems((prev) => prev.filter((i) => i.id !== id));
    toast.success("Internship deleted");
  };

  return (
    <>
      <PageHeader
        title="Internships"
        description="Post internships, change hiring status, and review applicants."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> New internship
          </Button>
        }
      />

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
          <TabsTrigger value="archived">Archived ({archived.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          <InternshipTable
            loading={loading}
            items={active}
            onEdit={(i) => {
              setEditing(i);
              setOpen(true);
            }}
            onDelete={remove}
            onStatusChange={setStatus}
            onArchiveChange={setArchived}
          />
        </TabsContent>

        <TabsContent value="archived" className="mt-4">
          <InternshipTable
            loading={loading}
            items={archived}
            onEdit={(i) => {
              setEditing(i);
              setOpen(true);
            }}
            onDelete={remove}
            onStatusChange={setStatus}
            onArchiveChange={setArchived}
            archivedView
          />
        </TabsContent>
      </Tabs>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setEditing(null);
        }}
      >
        <InternshipDialog
          key={editing?.id ?? "new"}
          internship={editing}
          employerId={user!.id}
          onClose={() => {
            setOpen(false);
            setEditing(null);
            void load();
          }}
        />
      </Dialog>
    </>
  );
}

function InternshipTable({
  loading,
  items,
  onEdit,
  onDelete,
  onStatusChange,
  onArchiveChange,
  archivedView,
}: {
  loading: boolean;
  items: Internship[];
  onEdit: (i: Internship) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, s: "hiring" | "filled") => void;
  onArchiveChange: (id: string, archived: boolean) => void;
  archivedView?: boolean;
}) {
  if (loading) return <div className="text-muted-foreground">Loading…</div>;
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Briefcase}
        title={archivedView ? "Nothing archived" : "No internships yet"}
        description={
          archivedView
            ? "Archived internships will appear here."
            : "Create your first internship to start receiving applications."
        }
      />
    );
  }
  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Deadline</TableHead>
            <TableHead>Hiring status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((i) => {
            const past = isPastDeadline(i.deadline);
            return (
              <TableRow key={i.id}>
                <TableCell>
                  <Link
                    to="/dashboard/internships/$id"
                    params={{ id: i.id }}
                    className="font-medium hover:underline inline-flex items-center gap-1"
                  >
                    {i.title} <ExternalLink className="h-3 w-3" />
                  </Link>
                  {past && !i.archived && (
                    <Badge variant="outline" className="ml-2 text-[10px]">
                      Deadline passed
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {i.deadline ? new Date(i.deadline).toLocaleDateString() : "—"}
                </TableCell>
                <TableCell>
                  <Select
                    value={i.hiring_status}
                    onValueChange={(v) => onStatusChange(i.id, v as "hiring" | "filled")}
                  >
                    <SelectTrigger className="w-[130px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hiring">Hiring</SelectItem>
                      <SelectItem value="filled">Filled</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="outline" asChild title="View applicants">
                      <Link to="/dashboard/internships/$id" params={{ id: i.id }}>
                        <Users className="h-4 w-4" /> View applicants
                      </Link>
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onEdit(i)} title="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {i.archived ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onArchiveChange(i.id, false)}
                        title="Unarchive"
                      >
                        <ArchiveRestore className="h-4 w-4" />
                      </Button>
                    ) : past ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onArchiveChange(i.id, true)}
                        title="Archive"
                      >
                        <Archive className="h-4 w-4" />
                      </Button>
                    ) : null}
                    <Button size="sm" variant="ghost" onClick={() => onDelete(i.id)} title="Delete">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function InternshipDialog({
  internship,
  employerId,
  onClose,
}: {
  internship: Internship | null;
  employerId: string;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(internship?.title ?? "");
  const [details, setDetails] = useState(internship?.details ?? "");
  const [skills, setSkills] = useState((internship?.skills ?? []).join(", "));
  const [langs, setLangs] = useState((internship?.programming_languages ?? []).join(", "));
  const [duration, setDuration] = useState(() => {
    const m = (internship?.duration ?? "").match(/\d+/);
    return m ? m[0] : "";
  });
  const [deadline, setDeadline] = useState(internship?.deadline ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return toast.error("Title is required");
    setBusy(true);
    const payload = {
      employer_id: employerId,
      title: title.trim(),
      details: details.trim() || null,
      skills: splitList(skills),
      programming_languages: splitList(langs),
      duration: duration.trim()
        ? `${duration.trim()} month${duration.trim() === "1" ? "" : "s"}`
        : null,
      deadline: deadline || null,
      hiring_status: "hiring",
      archived: false,
    };
    const res = internship
      ? await supabase.from("internships").update(payload).eq("id", internship.id)
      : await supabase.from("internships").insert(payload);
    setBusy(false);
    if (res.error) return toast.error(res.error.message);
    toast.success(internship ? "Internship updated" : "Internship created");
    onClose();
  };

  return (
    <DialogContent className="max-w-xl">
      <DialogHeader>
        <DialogTitle>{internship ? "Edit internship" : "New internship"}</DialogTitle>
        <DialogDescription>
          Fields marked with comma-separated values accept multiple entries.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="t">Title *</Label>
          <Input
            id="t"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
          />
        </div>
        <div>
          <Label htmlFor="d">Details</Label>
          <Textarea
            id="d"
            rows={4}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            maxLength={2000}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="dur">Duration (months)</Label>
            <div className="relative">
              <Input
                id="dur"
                type="number"
                min={1}
                max={36}
                step={1}
                placeholder="e.g. 3"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                months
              </span>
            </div>
          </div>
          <div>
            <Label htmlFor="dl">Deadline</Label>
            <Input
              id="dl"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="sk">Skills (comma-separated)</Label>
          <Input
            id="sk"
            placeholder="React, Communication, Git"
            value={skills}
            onChange={(e) => setSkills(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="pl">Programming languages (comma-separated)</Label>
          <Input
            id="pl"
            placeholder="TypeScript, Python"
            value={langs}
            onChange={(e) => setLangs(e.target.value)}
          />
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
