import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import AuthLayout from "@/components/AuthLayout";
import {
  isValidEmail,
  isValidUsername,
  validatePasswordStrength,
  sanitizeInput
} from "@/utils/validationUtils";

const inputClass =
  "h-12 w-full rounded-xl border-white/10 bg-white/[0.04] px-4 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-[hsl(var(--accent-mid)_/_0.55)] focus:bg-white/[0.06]";

const labelClass =
  "font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground";

export default function Signup() {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const { toast } = useToast();
  const navigate = useNavigate();
  const { isAuthenticated, signup, isLoading } = useAuth();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      navigate("/stream", { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  // Real-time validation
  useEffect(() => {
    const errors: Record<string, string> = {};

    if (username && !isValidUsername(username)) {
      errors.username = "Username can only contain letters, numbers and underscores (3-30 chars)";
    }

    if (email && !isValidEmail(email)) {
      errors.email = "Please enter a valid email address";
    }

    if (password) {
      const passwordValidation = validatePasswordStrength(password);
      if (!passwordValidation.isValid) {
        errors.password = passwordValidation.errors[0];
      }
    }

    if (confirmPassword && password && password !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match";
    }

    setFieldErrors(errors);
  }, [username, email, password, confirmPassword]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const sanitizedName = name ? sanitizeInput(name) : "";
      const sanitizedUsername = sanitizeInput(username);
      const sanitizedEmail = sanitizeInput(email);

      if (!sanitizedUsername || !sanitizedEmail || !password || !confirmPassword) {
        toast({
          title: "Error",
          description: "Please fill in all required fields",
          variant: "destructive",
        });
        return;
      }

      if (Object.keys(fieldErrors).length > 0) {
        toast({
          title: "Error",
          description: "Please fix the validation errors",
          variant: "destructive",
        });
        return;
      }

      setIsSubmitting(true);
      await signup(sanitizedUsername, sanitizedEmail, password);
      // The auth context will handle navigation and toast on success
    } catch (error: any) {
      console.error("Signup error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show loading while checking auth status
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
        title="Claim your channel."
        subtitle="Your name on the airwaves — in about sixty seconds."
        footer={
          <>
            Already have an account?{" "}
            <Link to="/login" className="font-medium text-[hsl(var(--accent-hi))] hover:underline">
              Log in
            </Link>
          </>
        }
      >
        <form onSubmit={handleSignup} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name" className={labelClass}>Full name · optional</Label>
            <Input
              id="name"
              type="text"
              placeholder="Enter your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
              autoComplete="name"
              maxLength={100}
              className={inputClass}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="username" className={labelClass}>Username *</Label>
            <Input
              id="username"
              type="text"
              placeholder="your_channel"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isSubmitting}
              required
              autoComplete="username"
              maxLength={30}
              className={fieldErrors.username ? "border-destructive" : inputClass}
            />
            {fieldErrors.username && (
              <p className="text-xs text-destructive">{fieldErrors.username}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className={labelClass}>Email *</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@broadcast.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSubmitting}
              required
              autoComplete="email"
              className={fieldErrors.email ? "border-destructive" : inputClass}
            />
            {fieldErrors.email && (
              <p className="text-xs text-destructive">{fieldErrors.email}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className={labelClass}>Password *</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Create a strong password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                required
                autoComplete="new-password"
                className={fieldErrors.password ? `border-destructive pr-12` : `${inputClass} pr-12`}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1 h-10 w-10 rounded-full text-muted-foreground hover:bg-white/5"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isSubmitting}
                aria-label="Toggle password visibility"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {fieldErrors.password && (
              <p className="text-xs text-destructive">{fieldErrors.password}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className={labelClass}>Confirm password *</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isSubmitting}
                required
                autoComplete="new-password"
                className={fieldErrors.confirmPassword ? `border-destructive pr-12` : `${inputClass} pr-12`}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1 h-10 w-10 rounded-full text-muted-foreground hover:bg-white/5"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                disabled={isSubmitting}
                aria-label="Toggle confirm password visibility"
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {fieldErrors.confirmPassword && (
              <p className="text-xs text-destructive">{fieldErrors.confirmPassword}</p>
            )}
          </div>

          <Button
            type="submit"
            variant="glow"
            size="lg"
            className="w-full"
            disabled={isSubmitting || Object.keys(fieldErrors).length > 0}
          >
            {isSubmitting ? "Creating your channel…" : "Create account"}
            {!isSubmitting && <ArrowRight className="transition-transform duration-300 group-hover/btn:translate-x-1" />}
          </Button>
        </form>
      </AuthLayout>
    </ErrorBoundary>
  );
}
