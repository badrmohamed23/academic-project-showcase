import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isGucEmail, isStudentEmail, isInstructorEmail } from "@/lib/validators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GraduationCap, FileText } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { PasswordInput } from "@/components/password-input";
import { ThemeToggle } from "@/components/theme-toggle";

export const Route = createFileRoute("/register")({
  component: RegisterPage,
});

function RegisterPage() {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex hero-gradient flex-col justify-between p-12">
        <Link to="/" className="flex items-center gap-2 font-serif text-lg font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
            <GraduationCap className="h-5 w-5" />
          </span>
          GUC Showcase
        </Link>
        <div>
          <h2 className="font-serif text-4xl font-bold text-balance">
            Join the showcase community.
          </h2>
          <p className="mt-3 text-muted-foreground max-w-md">
            Students and instructors register with their GUC email. Employers verify their company
            with official documents.
          </p>
        </div>
        <div className="text-xs text-muted-foreground">© {new Date().getFullYear()} GUC</div>
      </div>

      <div className="flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-md">
          <Link
            to="/"
            className="lg:hidden flex items-center gap-2 font-serif text-lg font-bold mb-8"
          >
            <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
              <GraduationCap className="h-5 w-5" />
            </span>
            GUC Showcase
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="font-serif text-3xl font-bold">Create an account</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Choose your account type to get started.
              </p>
            </div>
            <ThemeToggle className="shrink-0" />
          </div>

          <Tabs defaultValue="student" className="mt-6">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="student">Student</TabsTrigger>
              <TabsTrigger value="instructor">Instructor</TabsTrigger>
              <TabsTrigger value="employer">Employer</TabsTrigger>
            </TabsList>
            <TabsContent value="student" className="pt-4">
              <UniversityForm role="student" />
            </TabsContent>
            <TabsContent value="instructor" className="pt-4">
              <UniversityForm role="instructor" />
            </TabsContent>
            <TabsContent value="employer" className="pt-4">
              <EmployerForm />
            </TabsContent>
          </Tabs>

          <p className="mt-6 text-sm text-center text-muted-foreground">
            Already registered?{" "}
            <Link to="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function UniversityForm({ role }: { role: "student" | "instructor" }) {
  const navigate = useNavigate();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (role === "student" && !isStudentEmail(email)) {
      toast.error("Students must register with a @student.guc.edu.eg email.");
      return;
    }
    if (role === "instructor" && !isInstructorEmail(email)) {
      toast.error("Instructors must register with a @guc.edu.eg email (not @student.guc.edu.eg).");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
          data: { first_name: first.trim(), last_name: last.trim(), role },
        },
      });
      if (error) throw error;
      toast.success("Account created — welcome!");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="first">First name</Label>
          <Input id="first" required value={first} onChange={(e) => setFirst(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="last">Last name</Label>
          <Input id="last" required value={last} onChange={(e) => setLast(e.target.value)} />
        </div>
      </div>
      <div>
        <Label htmlFor="email">{role === "student" ? "Student email" : "GUC email"}</Label>
        <Input
          id="email"
          type="email"
          placeholder={role === "student" ? "you@student.guc.edu.eg" : "you@guc.edu.eg"}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <p className="text-xs text-muted-foreground mt-1">
          {role === "student"
            ? "Use your @student.guc.edu.eg address."
            : "Use your @guc.edu.eg faculty address."}
        </p>
      </div>
      <div>
        <Label htmlFor="pwd">Password</Label>
        <PasswordInput
          id="pwd"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Min. 8 characters. You can upload a profile picture from your dashboard.
        </p>
      </div>
      <div>
        <Label htmlFor="pwd-confirm">Re-enter password</Label>
        <PasswordInput
          id="pwd-confirm"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Creating…" : `Create ${role} account`}
      </Button>
    </form>
  );
}

function EmployerForm() {
  const navigate = useNavigate();
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [taxDoc, setTaxDoc] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Employers can register with any email — no domain restriction.
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    if (!taxDoc) {
      toast.error("Please upload your tax certificate (PDF) to verify your company.");
      return;
    }
    if (taxDoc.type !== "application/pdf") {
      toast.error("Tax certificate must be a PDF file.");
      return;
    }
    if (taxDoc.size > 10 * 1024 * 1024) {
      toast.error("Tax certificate must be smaller than 10 MB.");
      return;
    }
    setBusy(true);
    try {
      const { data: signUp, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
          data: { company_name: company.trim(), role: "employer" },
        },
      });
      if (error) throw error;
      const userId = signUp.user?.id;
      if (!userId)
        throw new Error("Account created — please sign in to upload your tax certificate.");

      // Upload tax document (private bucket, scoped to user folder)
      const path = `${userId}/tax-${Date.now()}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("employer-documents")
        .upload(path, taxDoc, {
          contentType: "application/pdf",
        });
      if (upErr) throw upErr;

      // Create the employer_profile in pending state. This requires an active session.
      // If email confirmation is required, signUp will not return a session — we instruct the user accordingly.
      if (signUp.session) {
        const { error: profErr } = await supabase
          .from("employer_profiles")
          .upsert(
            {
              id: userId,
              tax_document_path: path,
              verification_status: "pending",
            },
            { onConflict: "id" },
          );
        if (profErr) throw profErr;
      }

      toast.success("Application submitted. An administrator will review your company shortly.");
      // Sign out to enforce the pending gate from a clean state
      await supabase.auth.signOut();
      navigate({ to: "/login" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label htmlFor="company">Company name</Label>
        <Input id="company" required value={company} onChange={(e) => setCompany(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="cemail">Company email</Label>
        <Input
          id="cemail"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="cpwd">Password</Label>
        <PasswordInput
          id="cpwd"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="cpwd-confirm">Re-enter password</Label>
        <PasswordInput
          id="cpwd-confirm"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="taxdoc">Tax certificate (PDF)</Label>
        <div className="mt-1 flex items-center gap-2 rounded-md border border-dashed bg-muted/30 px-3 py-3">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <Input
            id="taxdoc"
            type="file"
            accept="application/pdf"
            required
            onChange={(e) => setTaxDoc(e.target.files?.[0] ?? null)}
            className="border-0 bg-transparent p-0 file:mr-3 file:rounded file:border file:bg-background file:px-2 file:py-1 file:text-xs"
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Required to verify your company. An administrator must approve before you can sign in.
        </p>
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Submitting…" : "Submit for verification"}
      </Button>
    </form>
  );
}
