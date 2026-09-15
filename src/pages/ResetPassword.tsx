
import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/integrations/api/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import AuthLayout from "@/components/AuthLayout";
import ErrorBoundary from "@/components/ErrorBoundary";

const inputClass =
  "h-12 w-full rounded-xl border-white/10 bg-white/[0.04] px-4 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-[hsl(var(--accent-mid)_/_0.55)] focus:bg-white/[0.06]";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  // The Worker emails `?token=<reset token>`; the legacy Supabase flow used a
  // fragment — accept either so old links keep working.
  const token =
    new URLSearchParams(window.location.search).get("token") ||
    new URLSearchParams(window.location.hash.substring(1)).get("access_token");

  useEffect(() => {
    if (!token) {
      setErrorMessage("Invalid or missing reset token. Please request a new password reset link.");
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!password) {
      setErrorMessage("Please enter a new password");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setErrorMessage("Password must be at least 8 characters long");
      return;
    }

    if (!token) {
      setErrorMessage("Invalid or missing reset token. Please request a new password reset link.");
      return;
    }

    try {
      setIsSubmitting(true);

      await api.post("/auth/reset-password", { token, password }, { auth: false });

      setIsSuccess(true);
      toast({
        title: "Password reset successful",
        description: "Your password has been updated",
      });

      // Redirect to login after successful reset
      setTimeout(() => {
        navigate("/login");
      }, 3000);
    } catch (error: any) {
      console.error("Password reset error:", error);
      setErrorMessage(error.message || "Failed to reset password. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ErrorBoundary>
      <AuthLayout
        title="Set a new password"
        subtitle="One strong passphrase, and you're back on air."
        footer={
          <>
            Remember your password?{" "}
            <Link to="/login" className="font-medium text-[hsl(var(--accent-hi))] hover:underline">
              Back to login
            </Link>
          </>
        }
      >
        {errorMessage && (
          <Alert variant="destructive" className="mb-6 rounded-xl bg-destructive/10 text-destructive-foreground">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}

        {isSuccess ? (
          <div className="text-center">
            <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-400/20">
              <CheckCircle className="h-6 w-6" />
            </div>
            <h3 className="font-display text-xl font-bold">Password updated</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              You&rsquo;ll be taken to the login page in a moment.
            </p>
            <Link to="/login" className="mt-5 inline-block">
              <Button variant="glow" size="sm">Go to login</Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="password" className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                New password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                required
                autoComplete="new-password"
                className={inputClass}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password" className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                Confirm new password
              </Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="Repeat it back"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isSubmitting}
                required
                autoComplete="new-password"
                className={inputClass}
              />
            </div>

            <Button type="submit" variant="glow" size="lg" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Updating…" : "Update password"}
            </Button>
          </form>
        )}
      </AuthLayout>
    </ErrorBoundary>
  );
}
