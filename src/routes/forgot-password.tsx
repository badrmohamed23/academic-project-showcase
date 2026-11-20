import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { GraduationCap } from "lucide-react";
import { toast } from "sonner";
import { PasswordInput } from "@/components/password-input";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"email" | "otp" | "password">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const sendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/forgot-password`,
      });
      if (error) throw error;
      toast.success("Code sent. Enter any 6 digits to continue.");
      setStep("otp");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send code");
    } finally {
      setBusy(false);
    }
  };

  // Accept any 6-digit code (demo flow): just advance to the password step.
  const verifyCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6) {
      toast.error("Please enter 6 digits");
      return;
    }
    setStep("password");
  };

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be ≥ 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      // Try the real recovery OTP first; if it fails, fall back to a magic-link OTP.
      let verifiedOk = false;
      const v1 = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otp,
        type: "recovery",
      });
      if (!v1.error) verifiedOk = true;
      else {
        const v2 = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: otp,
          type: "email",
        });
        if (!v2.error) verifiedOk = true;
      }
      if (!verifiedOk)
        throw new Error("Could not verify session. Please use the latest code from your email.");

      const { error: uErr } = await supabase.auth.updateUser({ password });
      if (uErr) throw uErr;
      toast.success("Password updated. You're signed in.");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reset password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <Link
          to="/"
          className="flex items-center gap-2 font-serif text-lg font-bold mb-8 justify-center"
        >
          <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
            <GraduationCap className="h-5 w-5" />
          </span>
          GUC Showcase
        </Link>
        <h1 className="font-serif text-2xl font-bold text-center">
          {step === "email"
            ? "Reset your password"
            : step === "otp"
              ? "Enter the 6-digit code"
              : "Choose a new password"}
        </h1>
        <p className="text-sm text-muted-foreground text-center mt-1">
          {step === "email"
            ? "We'll email you a 6-digit code."
            : step === "otp"
              ? `Sent to ${email}.`
              : "Enter your new password twice to confirm."}
        </p>

        {step === "email" && (
          <form onSubmit={sendOtp} className="mt-8 space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Sending…" : "Send code"}
            </Button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={verifyCode} className="mt-8 space-y-4">
            <div className="flex justify-center">
              <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                <InputOTPGroup>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <InputOTPSlot key={i} index={i} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
            <Button type="submit" className="w-full" disabled={otp.length < 6}>
              Continue
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setStep("email");
                setOtp("");
              }}
            >
              Use a different email
            </Button>
          </form>
        )}

        {step === "password" && (
          <form onSubmit={resetPassword} className="mt-8 space-y-4">
            <div>
              <Label htmlFor="np">New password</Label>
              <PasswordInput
                id="np"
                minLength={8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="cp">Confirm new password</Label>
              <PasswordInput
                id="cp"
                minLength={8}
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Updating…" : "Update password"}
            </Button>
          </form>
        )}

        <p className="mt-6 text-sm text-center text-muted-foreground">
          Remembered it?{" "}
          <Link to="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
