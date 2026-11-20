import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type KeyboardEvent } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/dashboard-shell";
import { AvatarUploader } from "@/components/avatar-uploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Linkedin, X, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/profile")({
  component: ProfilePage,
});

const SEMESTERS = Array.from({ length: 12 }, (_, i) => i + 1);
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 8 }, (_, i) => CURRENT_YEAR + i - 1);

interface StudentProfileRow {
  id: string;
  major: string | null;
  skills: string[];
  semester: number | null;
  graduating_year: number | null;
  linkedin_url: string | null;
}

function normalizeLinkedin(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function ProfilePage() {
  const { user, profile, role, refresh } = useAuth();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setFirst(profile?.first_name ?? "");
    setLast(profile?.last_name ?? "");
  }, [profile]);

  if (!user || !profile) return null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: first.trim() || null,
        last_name: last.trim() || null,
      })
      .eq("id", user.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    await refresh();
    toast.success("Profile updated");
  };

  const fallback = (profile.first_name || profile.email || "U")[0];

  return (
    <>
      <PageHeader
        title="My profile"
        description="Update your personal details and profile picture."
      />
      <div className="max-w-2xl space-y-6">
        <div className="rounded-lg border bg-card p-6">
          <AvatarUploader
            userId={user.id}
            url={profile.avatar_url}
            fallback={fallback}
            label="Profile picture"
            onChange={() => {
              void refresh();
            }}
          />
        </div>

        {role !== "employer" && (
          <form onSubmit={save} className="space-y-4 rounded-lg border bg-card p-6">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="first">First name</Label>
                <Input id="first" value={first} onChange={(e) => setFirst(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="last">Last name</Label>
                <Input id="last" value={last} onChange={(e) => setLast(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Email</Label>
              <Input value={profile.email} disabled />
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </form>
        )}

        {role === "student" && (
          <StudentDetailsCard
            userId={user.id}
            email={profile.email}
            firstName={profile.first_name}
            lastName={profile.last_name}
          />
        )}
        {role === "instructor" && <InstructorDetailsCard userId={user.id} />}
      </div>
    </>
  );
}

interface InstructorRow {
  bio: string | null;
  research_interests: string[];
  education: { degree: string; institution: string; year: string }[];
}

function InstructorDetailsCard({ userId }: { userId: string }) {
  const [bio, setBio] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [interestDraft, setInterestDraft] = useState("");
  const [education, setEducation] = useState<
    { degree: string; institution: string; year: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("instructor_profiles")
      .select("bio,research_interests,education")
      .eq("id", userId)
      .maybeSingle();
    const r = data as unknown as InstructorRow | null;
    setBio(r?.bio ?? "");
    setInterests(r?.research_interests ?? []);
    setEducation(r?.education ?? []);
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, [userId]);

  const addInterest = () => {
    const v = interestDraft.trim();
    if (!v || interests.includes(v)) {
      setInterestDraft("");
      return;
    }
    setInterests([...interests, v]);
    setInterestDraft("");
  };
  const removeInterest = (v: string) => setInterests(interests.filter((x) => x !== v));

  const addEdu = () => setEducation([...education, { degree: "", institution: "", year: "" }]);
  const updateEdu = (i: number, field: "degree" | "institution" | "year", v: string) => {
    setEducation(education.map((e, idx) => (idx === i ? { ...e, [field]: v } : e)));
  };
  const removeEdu = (i: number) => setEducation(education.filter((_, idx) => idx !== i));

  const save = async () => {
    setBusy(true);
    const { error } = await supabase.from("instructor_profiles").upsert(
      {
        id: userId,
        bio: bio.trim() || null,
        research_interests: interests,
        education: education.filter((e) => e.degree.trim() || e.institution.trim()),
      },
      { onConflict: "id" },
    );
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Instructor profile saved");
    void load();
  };

  if (loading)
    return <div className="rounded-lg border bg-card p-6 text-muted-foreground">Loading…</div>;

  return (
    <div className="rounded-lg border bg-card p-6 space-y-5">
      <div>
        <h2 className="font-medium">Instructor details</h2>
        <p className="text-sm text-muted-foreground">Visible on your public instructor profile.</p>
      </div>

      <div>
        <Label htmlFor="bio">Biography</Label>
        <textarea
          id="bio"
          rows={4}
          className="mt-1 w-full rounded-md border bg-background p-2 text-sm"
          placeholder="A short bio…"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
        />
      </div>

      <div>
        <Label>Research interests</Label>
        <div className="flex flex-wrap gap-2 mt-2 min-h-[2rem]">
          {interests.length === 0 && (
            <span className="text-xs text-muted-foreground self-center">None added.</span>
          )}
          {interests.map((s) => (
            <Badge
              key={s}
              variant="secondary"
              className="gap-1 pl-3 pr-1.5 py-1 text-xs font-normal"
            >
              {s}
              <button
                type="button"
                onClick={() => removeInterest(s)}
                className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          <Input
            placeholder="e.g. Machine learning"
            value={interestDraft}
            onChange={(e) => setInterestDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addInterest();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={addInterest}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <Label>Education</Label>
          <Button type="button" size="sm" variant="outline" onClick={addEdu}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
        <div className="space-y-2 mt-2">
          {education.length === 0 && (
            <div className="text-xs text-muted-foreground">No education added.</div>
          )}
          {education.map((e, i) => (
            <div
              key={i}
              className="grid grid-cols-1 sm:grid-cols-[1fr,1fr,100px,auto] gap-2 items-end rounded-md border p-3"
            >
              <div>
                <Label className="text-xs">Degree</Label>
                <Input
                  value={e.degree}
                  onChange={(ev) => updateEdu(i, "degree", ev.target.value)}
                  placeholder="PhD Computer Science"
                />
              </div>
              <div>
                <Label className="text-xs">Institution</Label>
                <Input
                  value={e.institution}
                  onChange={(ev) => updateEdu(i, "institution", ev.target.value)}
                  placeholder="GUC"
                />
              </div>
              <div>
                <Label className="text-xs">Year</Label>
                <Input
                  value={e.year}
                  onChange={(ev) => updateEdu(i, "year", ev.target.value)}
                  placeholder="2020"
                />
              </div>
              <Button type="button" variant="ghost" onClick={() => removeEdu(i)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save details"}
        </Button>
      </div>
    </div>
  );
}

function StudentDetailsCard({
  userId,
  email,
  firstName,
  lastName,
}: {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}) {
  const [data, setData] = useState<StudentProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [major, setMajor] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [skillDraft, setSkillDraft] = useState("");
  const [semester, setSemester] = useState<string>("");
  const [year, setYear] = useState<string>("");
  const [linkedin, setLinkedin] = useState("");

  const load = async () => {
    setLoading(true);
    const { data: row } = await supabase
      .from("student_profiles")
      .select("id,major,skills,semester,graduating_year,linkedin_url")
      .eq("id", userId)
      .maybeSingle();
    const r = row as StudentProfileRow | null;
    setData(r);
    setMajor(r?.major ?? "");
    setSkills(r?.skills ?? []);
    setSemester(r?.semester ? String(r.semester) : "");
    setYear(r?.graduating_year ? String(r.graduating_year) : "");
    setLinkedin(r?.linkedin_url ?? "");
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, [userId]);

  const addSkill = () => {
    const s = skillDraft.trim();
    if (!s) return;
    if (skills.some((k) => k.toLowerCase() === s.toLowerCase())) {
      setSkillDraft("");
      return;
    }
    setSkills([...skills, s]);
    setSkillDraft("");
  };

  const onSkillKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addSkill();
    }
  };

  const removeSkill = (s: string) => setSkills(skills.filter((k) => k !== s));

  const clearLinkedin = async () => {
    setLinkedin("");
    if (!data) return;
    const { error } = await supabase
      .from("student_profiles")
      .update({ linkedin_url: null })
      .eq("id", userId);
    if (error) return toast.error(error.message);
    toast.success("LinkedIn removed");
    void load();
  };

  const save = async () => {
    setBusy(true);
    const payload = {
      id: userId,
      email,
      first_name: firstName,
      last_name: lastName,
      major: major.trim() || null,
      skills,
      semester: semester ? Number(semester) : null,
      graduating_year: year ? Number(year) : null,
      linkedin_url: normalizeLinkedin(linkedin),
    };
    const { error } = await supabase.from("student_profiles").upsert(payload, { onConflict: "id" });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Student details saved");
    void load();
  };

  if (loading)
    return <div className="rounded-lg border bg-card p-6 text-muted-foreground">Loading…</div>;

  const linkedinUrl = normalizeLinkedin(linkedin);

  return (
    <div className="rounded-lg border bg-card p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">Student details</h2>
          <p className="text-sm text-muted-foreground">
            Optional — share what you'd like instructors and employers to see.
          </p>
        </div>
        {data?.linkedin_url && (
          <a
            href={data.linkedin_url}
            target="_blank"
            rel="noreferrer"
            aria-label="View LinkedIn profile"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#0A66C2] text-white shadow-sm hover:scale-105 hover:shadow-md transition"
          >
            <Linkedin className="h-5 w-5" />
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="major">Major</Label>
          <Input
            id="major"
            placeholder="e.g. Computer Science"
            value={major}
            onChange={(e) => setMajor(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Semester</Label>
            <Select
              value={semester || "none"}
              onValueChange={(v) => setSemester(v === "none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {SEMESTERS.map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Graduating year</Label>
            <Select value={year || "none"} onValueChange={(v) => setYear(v === "none" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {YEARS.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div>
        <Label>Skills</Label>
        <div className="flex flex-wrap gap-2 mt-2 min-h-[2rem]">
          {skills.length === 0 && (
            <span className="text-xs text-muted-foreground self-center">No skills added yet.</span>
          )}
          {skills.map((s) => (
            <Badge
              key={s}
              variant="secondary"
              className="gap-1 pl-3 pr-1.5 py-1 text-xs font-normal"
            >
              {s}
              <button
                type="button"
                onClick={() => removeSkill(s)}
                aria-label={`Remove ${s}`}
                className="ml-1 inline-flex items-center justify-center rounded-full hover:bg-muted-foreground/20 p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          <Input
            placeholder="Type a skill and press Enter"
            value={skillDraft}
            onChange={(e) => setSkillDraft(e.target.value)}
            onKeyDown={onSkillKey}
          />
          <Button type="button" variant="outline" onClick={addSkill}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </div>

      <div>
        <Label htmlFor="linkedin">LinkedIn profile</Label>
        <div className="flex gap-2 mt-1">
          <Input
            id="linkedin"
            type="url"
            placeholder="linkedin.com/in/yourname"
            value={linkedin}
            onChange={(e) => setLinkedin(e.target.value)}
          />
          {data?.linkedin_url && (
            <Button
              type="button"
              variant="ghost"
              onClick={clearLinkedin}
              aria-label="Remove LinkedIn"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>
        {linkedinUrl && (
          <a
            href={linkedinUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 mt-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#0A66C2] text-white">
              <Linkedin className="h-3 w-3" />
            </span>
            Preview link
          </a>
        )}
      </div>

      <div className="flex justify-end">
        <Button type="button" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save details"}
        </Button>
      </div>
    </div>
  );
}
