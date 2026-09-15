
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MailCheck, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/integrations/api/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import AuthLayout from "@/components/AuthLayout";
import ErrorBoundary from "@/components/ErrorBoundary";

const inputClass =
  "h-12 w-full rounded-xl border-white/10 bg-white/[0.04] px-4 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-[hsl(var(--accent-mid)_/_0.55)] focus:bg-white/[0.06]";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email) {
      setErrorMessage("Please enter your email address");
      return;
    }

    try {
      setIsSubmitting(true);

      const data = await api.post<{ message?: string; devToken?: string; resetUrl?: string }>(
        "/auth/forgot-password",
        { email },
        { auth: false },
      );

      setIsSuccess(true);
      toast({
        title: "Reset link created",
        description: data.message || "Check your inbox for a password reset link",
      });

      // Locally the Worker hands the token straight back (no mail server wired up).
      if (data.resetUrl) {
        console.info("[auth] password reset link:", data.resetUrl);
        setDevResetUrl(data.resetUrl);
      }
    } catch (error: any) {
      console.error("Reset password error:", error);
      setErrorMessage(error.message || "Failed to send password reset email. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ErrorBoundary>
      <AuthLayout
        title="Lost the password?"
        subtitle="We'll beam you a reset link. Check the inbox."
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
            <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-signature-soft text-[hsl(var(--accent-hi))] ring-1 ring-white/10">
              <MailCheck className="h-6 w-6" />
            </div>
            <h3 className="font-display text-xl font-bold">Check your email</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              We&rsquo;ve sent a reset link to{" "}
              <span className="font-medium text-foreground">{email}</span>.
            </p>
            {devResetUrl && (
              <p className="mt-3 text-xs text-muted-foreground/80">
                Local dev link (no mail server configured):{" "}
                <a href={devResetUrl} className="text-[hsl(var(--accent-hi))] hover:underline">
                  open reset page
                </a>
              </p>
            )}
            <p className="mt-4 text-xs text-muted-foreground/70">
              Didn&rsquo;t receive it? Check spam, or{" "}
              <button onClick={handleSubmit} className="text-[hsl(var(--accent-hi))] hover:underline" disabled={isSubmitting}>
                try again
              </button>
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@broadcast.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
                required
                autoComplete="email"
                className={inputClass}
              />
            </div>

            <Button type="submit" variant="glow" size="lg" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Sending link…" : "Send reset link"}
            </Button>
          </form>
        )}
      </AuthLayout>
    </ErrorBoundary>
  );
}
