import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Alert, AlertDescription } from "@/components/ui/alert";
import AuthLayout from "@/components/AuthLayout";
import ErrorBoundary from "@/components/ErrorBoundary";

const inputClass =
  "h-12 w-full rounded-xl border-white/10 bg-white/[0.04] px-4 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-[hsl(var(--accent-mid)_/_0.55)] focus:bg-white/[0.06]";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, login, isLoading } = useAuth();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      const from = (location.state as any)?.from?.pathname || "/stream";
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, location]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email || !password) {
      setErrorMessage("Please provide both email and password");
      return;
    }

    try {
      setIsSubmitting(true);
      await login(email, password);
      // The auth context will handle the navigation and toast
    } catch (error: any) {
      console.error("Login error:", error);

      if (error?.code === "email_not_confirmed") {
        setErrorMessage("Please verify your email before logging in. Check your inbox for a confirmation link.");
      } else if (error?.message) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Failed to log in. Please check your credentials and try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="grid min-h-svh place-items-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 rounded-full border-2 border-[hsl(var(--accent-mid))] border-t-transparent animate-spin" />
          <p className="font-mono text-[11px] tracking-[0.3em] text-muted-foreground uppercase">Tuning in</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <AuthLayout
        title="Welcome back."
        subtitle="Your audience keeps waiting — get back on air."
        footer={
          <>
            Don&rsquo;t have an account?{" "}
            <Link to="/signup" className="font-medium text-[hsl(var(--accent-hi))] hover:underline">
              Create one
            </Link>
          </>
        }
      >
        {errorMessage && (
          <Alert variant="destructive" className="mb-6 rounded-xl bg-destructive/10 text-destructive-foreground">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                Password
              </Label>
              <Link to="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Forgot?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              placeholder="••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSubmitting}
              required
              autoComplete="current-password"
              className={inputClass}
            />
          </div>

          <Button type="submit" variant="glow" size="lg" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Signing you in…" : "Log in"}
            {!isSubmitting && <ArrowRight className="transition-transform duration-300 group-hover/btn:translate-x-1" />}
          </Button>
        </form>
      </AuthLayout>
    </ErrorBoundary>
  );
}
