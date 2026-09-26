import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, BadgeCheck, Loader2, MailCheck, Send } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { api, ApiRequestError } from '@/integrations/api/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

type State = 'idle' | 'verifying' | 'verified' | 'already' | 'error';

/**
 * Email verification landing page.
 *
 * Verification emails link to `/verify-email?token=…&email=…`; the token is
 * single-use and short-lived, so a stale tab shows a clear, recoverable state
 * with a "send a new link" action instead of a dead end.
 */
export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();

  const token = searchParams.get('token') ?? '';
  const email = searchParams.get('email') ?? user?.email ?? '';
  const [state, setState] = useState<State>(token ? 'verifying' : 'idle');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;

    void api
      .post<{ success: boolean; email?: string; alreadyVerified?: boolean }>('/auth/verify-email', { token }, { auth: false })
      .then((data) => {
        setState(data.alreadyVerified ? 'already' : 'verified');
        setMessage(data.email ?? email);
      })
      .catch((error) => {
        setState('error');
        setMessage(error instanceof ApiRequestError ? error.message : 'We could not verify this link.');
      });
  }, [token, email]);

  const resend = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    setSending(true);
    try {
      const data = await api.post<{ delivered?: boolean; alreadyVerified?: boolean }>('/auth/resend-verification');
      if (data.alreadyVerified) {
        setState('already');
        toast({ title: 'Already verified', description: 'This address was confirmed earlier.' });
        return;
      }
      // The outbox may be unconfigured; the API reports whether it left the building.
      toast({
        title: data.delivered ? 'Verification link sent' : 'Link queued',
        description: data.delivered
          ? 'Check your inbox — it can take a minute to arrive.'
          : 'Email delivery is not configured on this deployment yet, so the link was written to the server outbox.',
      });
    } catch (error) {
      toast({
        title: 'Could not send the link',
        description: error instanceof ApiRequestError ? error.message : 'Try again in a few minutes.',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const copy = {
    idle: {
      icon: MailCheck,
      title: 'Check your inbox',
      body: `We sent a verification link to ${email || 'your email address'}. Open it to activate everything on your account.`,
    },
    verifying: { icon: Loader2, title: 'Verifying…', body: 'One moment while we confirm this link.' },
    verified: {
      icon: BadgeCheck,
      title: 'Email verified',
      body: `Thanks — ${message || 'your address'} is confirmed. Notifications and password resets can now reach you.`,
    },
    already: { icon: BadgeCheck, title: 'Already verified', body: 'This address was confirmed earlier. Nothing else to do.' },
    error: { icon: AlertCircle, title: 'This link did not work', body: message || 'It may have expired or already been used.' },
  }[state];

  const Icon = copy.icon;

  return (
    <AuthLayout
      title={
        <>
          Confirm your <span className="text-gradient">signal</span>.
        </>
      }
      subtitle="Verifying your email keeps your account recoverable and unlocks live notifications."
    >
      <div className="space-y-6 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.03]">
          <Icon className={`h-6 w-6 text-[hsl(var(--accent-hi))] ${state === 'verifying' ? 'animate-spin' : ''}`} />
        </span>

        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight">{copy.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copy.body}</p>
        </div>

        {state === 'error' && (
          <Alert variant="destructive" className="text-left">
            <AlertTitle>Link expired or invalid</AlertTitle>
            <AlertDescription>
              Verification links are single-use and last 24 hours. Request a fresh one below.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-3">
          {state === 'verified' || state === 'already' ? (
            <Button variant="glow" size="lg" asChild>
              <Link to={isAuthenticated ? '/dashboard' : '/login'}>
                {isAuthenticated ? 'Go to your studio' : 'Log in'}
              </Link>
            </Button>
          ) : (
            <>
              <Button variant="glow" size="lg" onClick={() => void resend()} disabled={sending || !isAuthenticated}>
                {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                {sending ? 'Sending…' : 'Send a new link'}
              </Button>
              {!isAuthenticated && (
                <p className="text-xs text-muted-foreground">
                  <Link to="/login" className="text-[hsl(var(--accent-hi))] hover:underline">
                    Log in
                  </Link>{' '}
                  to request another verification email.
                </p>
              )}
              <Button variant="glass" size="sm" asChild>
                <Link to="/">Back to the streams</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </AuthLayout>
  );
}
