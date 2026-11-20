import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { isGucEmail } from "@/lib/validators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GraduationCap } from "lucide-react";
import { toast } from "sonner";
import { PasswordInput } from "@/components/password-input";
import { ThemeToggle } from "@/components/theme-toggle";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard" });
  }, [loading, user, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      // Pre-check: GUC email rule applies to non-employer logins. We allow either,
      // but we surface a friendly hint if a known GUC user typos their domain.
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      // Check active status
      const { data: prof } = await supabase
        .from("profiles")
        .select("is_active")
        .eq("id", data.user.id)
        .maybeSingle();
      if (prof && prof.is_active === false) {
        await supabase.auth.signOut();
        toast.error("Your account has been deactivated.");
        return;
      }
      // Check role + employer verification
      const { data: roleRow } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id)
        .maybeSingle();
      if (roleRow?.role === "employer") {
        const { data: emp } = await supabase
          .from("employer_profiles")
          .select("verification_status")
          .eq("id", data.user.id)
          .maybeSingle();
        const status = emp?.verification_status ?? "pending";
        if (status !== "approved") {
          await supabase.auth.signOut();
          if (status === "rejected") {
            toast.error("Your company verification was rejected. Please contact support.");
          } else {
            toast.error("Your company is awaiting administrator approval.");
          }
          return;
        }
      }
      toast.success("Welcome back!");
      navigate({ to: "/dashboard" });
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      // Map Supabase auth errors to a friendly, generic message
      const friendly =
        /invalid login credentials|invalid_credentials|invalid email or password/i.test(raw)
          ? "Incorrect username or password."
          : raw || "Incorrect username or password.";
      toast.error(friendly);
    } finally {
      setSubmitting(false);
    }
  };

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
            Welcome back to the showcase.
          </h2>
          <p className="mt-3 text-muted-foreground max-w-md">
            Sign in to manage projects, review submissions, or discover new talent.
          </p>
        </div>
        <div className="text-xs text-muted-foreground">© {new Date().getFullYear()} GUC</div>
      </div>

      <div className="flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-sm">
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
              <h1 className="font-serif text-3xl font-bold">Sign in</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Use your GUC email or your employer email.
              </p>
            </div>
            <ThemeToggle className="shrink-0" />
          </div>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {email && !isGucEmail(email) && (
                <p className="text-xs text-muted-foreground mt-1">Employer login detected.</p>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link to="/forgot-password" className="text-xs text-primary hover:underline">
                  Forgot?
                </Link>
              </div>
              <PasswordInput
                id="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-6 text-sm text-center text-muted-foreground">
            Don't have an account?{" "}
            <Link to="/register" className="text-primary hover:underline">
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
