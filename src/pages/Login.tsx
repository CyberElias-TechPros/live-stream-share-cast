import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Radio } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Brand";
import { useAuth } from "@/contexts/AuthContext";
import { useSEO } from "@/hooks/useSEO";
import { ApiError } from "@/lib/api";

export default function Login() {
  useSEO({ title: "Sign in", robots: "noindex" });
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/dashboard";

  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await login(identity.trim(), password);
      toast.success("Welcome back");
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign in failed. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      {/* brand panel */}
      <aside className="noise relative hidden overflow-hidden border-r border-line lg:block" aria-hidden="true">
        <div className="grid-bg absolute inset-0" />
        <div
          className="absolute -bottom-40 -left-24 h-[480px] w-[480px] rounded-full blur-3xl"
          style={{ background: "radial-gradient(closest-side, hsl(var(--accent)/0.18), transparent)" }}
        />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Link to="/" aria-label="I'm Live home">
            <Logo className="text-2xl" />
          </Link>
          <div>
            <span className="live-dot mb-6 inline-flex" />
            <p className="max-w-md font-display text-4xl font-bold leading-tight tracking-tight">
              The room is waiting for your camera.
            </p>
            <p className="mt-4 max-w-sm text-text-muted">
              Sign in to open the studio, go live in one click, and see your audience arrive in real time.
            </p>
          </div>
          <p className="micro">Live video for the open web</p>
        </div>
      </aside>

      {/* form panel */}
      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <Link to="/" className="mb-8 block lg:hidden" aria-label="I'm Live home">
            <Logo className="text-xl" />
          </Link>

          <h1 className="font-display text-2xl font-bold tracking-tight">Sign in</h1>
          <p className="mt-1.5 text-sm text-text-muted">Pick up where you left off.</p>

          <form onSubmit={submit} className="mt-8 space-y-4" noValidate={false}>
            <div className="space-y-1.5">
              <Label htmlFor="identity">Email or username</Label>
              <Input
                id="identity"
                value={identity}
                onChange={(e) => setIdentity(e.target.value)}
                autoComplete="username"
                autoFocus
                required
                aria-invalid={!!error}
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
                  autoComplete="current-password"
                  required
                  className="pr-10"
                  aria-invalid={!!error}
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
            </div>

            {error && (
              <p className="rounded-lg border border-live/30 bg-live/10 px-3.5 py-2.5 text-sm text-live" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" size="lg" disabled={busy || !identity.trim() || !password}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-text-muted">
            New here?{" "}
            <Link to="/signup" className="font-medium text-accent hover:underline">
              Create an account
            </Link>
          </p>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-text-faint">
            <Radio className="h-3 w-3" aria-hidden="true" />
            No account needed to watch — browse <Link to="/browse" className="underline">live streams</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
