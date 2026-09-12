import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, Eye, EyeOff, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Brand";
import { useAuth } from "@/contexts/AuthContext";
import { useSEO } from "@/hooks/useSEO";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

const USERNAME_RE = /^[a-z0-9_]{3,24}$/;

export default function Signup() {
  useSEO({ title: "Create your account", robots: "noindex" });
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usernameValid = USERNAME_RE.test(username.toLowerCase());
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const rules = useMemo(
    () => [
      { label: "8+ characters", ok: password.length >= 8 },
      { label: "a number or symbol", ok: /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password) },
      { label: "not your username/email", ok: password.length > 0 && !password.toLowerCase().includes(username.toLowerCase()) && !password.toLowerCase().includes(email.split("@")[0]?.toLowerCase() ?? "•") },
    ],
    [password, username, email]
  );
  const passwordValid = rules.every((r) => r.ok);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !usernameValid || !emailValid || !passwordValid) return;
    setBusy(true);
    setError(null);
    try {
      await signup(username.toLowerCase(), email.trim(), password);
      toast.success("Account created", { description: "Welcome to I'm Live — your studio is ready." });
      navigate("/studio", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Signup failed. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <Link to="/" className="mb-8 block lg:hidden" aria-label="I'm Live home">
            <Logo className="text-xl" />
          </Link>

          <h1 className="font-display text-2xl font-bold tracking-tight">Create your account</h1>
          <p className="mt-1.5 text-sm text-text-muted">Free forever. Go live in the next minute.</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                placeholder="nova_streams"
                autoComplete="username"
                autoFocus
                required
                aria-invalid={username.length > 0 && !usernameValid}
                aria-describedby="username-rules"
              />
              <p id="username-rules" className={cn("text-xs", username.length === 0 ? "text-text-faint" : usernameValid ? "text-ok" : "text-warn")}>
                3–24 characters — letters, numbers, underscores. This is your public handle.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                aria-invalid={email.length > 0 && !emailValid}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-text-faint hover:text-text"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>
              <ul className="space-y-1 pt-1">
                {rules.map((rule) => (
                  <li key={rule.label} className={cn("flex items-center gap-1.5 text-xs", rule.ok ? "text-ok" : "text-text-faint")}>
                    {rule.ok ? <Check className="h-3 w-3" aria-hidden="true" /> : <X className="h-3 w-3" aria-hidden="true" />}
                    {rule.label}
                  </li>
                ))}
              </ul>
            </div>

            {error && (
              <p className="rounded-lg border border-live/30 bg-live/10 px-3.5 py-2.5 text-sm text-live" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" size="lg" variant="live" disabled={busy || !usernameValid || !emailValid || !passwordValid}>
              {busy ? "Creating…" : "Create account"}
            </Button>

            <p className="text-center text-xs text-text-faint">
              By creating an account you agree to our{" "}
              <Link to="/terms" className="underline hover:text-text">terms</Link> and{" "}
              <Link to="/privacy" className="underline hover:text-text">privacy policy</Link>.
            </p>
          </form>

          <p className="mt-6 text-center text-sm text-text-muted">
            Already streaming?{" "}
            <Link to="/login" className="font-medium text-accent hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </main>

      <aside className="noise relative hidden overflow-hidden border-l border-line lg:block" aria-hidden="true">
        <div className="grid-bg absolute inset-0" />
        <div
          className="absolute -top-24 -right-24 h-[480px] w-[480px] rounded-full blur-3xl"
          style={{ background: "radial-gradient(closest-side, hsl(var(--live)/0.16), transparent)" }}
        />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Link to="/" aria-label="I'm Live home">
            <Logo className="text-2xl" />
          </Link>
          <div>
            <p className="max-w-md font-display text-4xl font-bold leading-tight tracking-tight">
              One link. Any device. <span className="text-gradient">Zero installs.</span>
            </p>
            <ul className="mt-8 space-y-4 text-sm text-text-muted">
              {[
                "Peer-to-peer WebRTC — sub-second latency",
                "Real-time chat with your audience",
                "One-click local recording",
                "Unlisted rooms — share only with who you choose",
              ].map((item) => (
                <li key={item} className="flex items-center gap-3">
                  <span className="live-dot" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <p className="micro">Live video for the open web</p>
        </div>
      </aside>
    </div>
  );
}
