import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, Copy, Download, KeyRound, Laptop, LogOut, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { accountService, DELETION_GRACE_DAYS, type AccountSession, type ApiToken } from '@/services/accountService';
import { platformService } from '@/services/platformService';

function describeAgent(userAgent?: string | null): string {
  if (!userAgent) return 'Unknown device';
  if (/iphone|ipad|android/i.test(userAgent)) return 'Mobile browser';
  if (/firefox/i.test(userAgent)) return 'Firefox';
  if (/edg/i.test(userAgent)) return 'Edge';
  if (/chrome/i.test(userAgent)) return 'Chrome';
  if (/safari/i.test(userAgent)) return 'Safari';
  return userAgent.slice(0, 60);
}

export default function SecurityPanel() {
  const { user, logout } = useAuth();
  const { toast } = useToast();

  const [sessions, setSessions] = useState<AccountSession[]>([]);
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [newTokenSecret, setNewTokenSecret] = useState<string | null>(null);
  const [tokenName, setTokenName] = useState('');
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [deletePassword, setDeletePassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [apiTokensEnabled, setApiTokensEnabled] = useState(true);
  const [deletionEnabled, setDeletionEnabled] = useState(true);
  const [exportEnabled, setExportEnabled] = useState(true);

  useEffect(() => {
    void accountService.sessions().then(setSessions);
    void accountService.tokens().then(setTokens);
    void platformService.getConfig().then((config) => {
      if (!config) return;
      setApiTokensEnabled(config.features.apiTokens);
      setDeletionEnabled(config.features.accountDeletion);
      setExportEnabled(config.features.dataExport);
    });
  }, []);

  const copyToken = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      toast({ title: 'Token copied', description: 'Store it now — it is never shown again.' });
    } catch {
      toast({ title: 'Could not copy', variant: 'destructive' });
    }
  };

  const createToken = async () => {
    setBusy(true);
    const created = await accountService.createToken({
      name: tokenName.trim() || 'API token',
      scopes: ['read', 'write'],
      expiresInDays: 90,
    });
    setBusy(false);

    if (!created) {
      toast({ title: 'Could not create the token', variant: 'destructive' });
      return;
    }
    setTokens((current) => [created.apiToken, ...current]);
    setNewTokenSecret(created.token);
    setTokenName('');
  };

  const changePassword = async () => {
    if (passwords.next.length < 8) {
      toast({ title: 'Use at least 8 characters', variant: 'destructive' });
      return;
    }
    if (passwords.next !== passwords.confirm) {
      toast({ title: 'The new passwords do not match', variant: 'destructive' });
      return;
    }

    setBusy(true);
    const ok = await accountService.changePassword(passwords.current, passwords.next);
    setBusy(false);

    if (!ok) {
      toast({ title: 'Could not change the password', description: 'Check your current password.', variant: 'destructive' });
      return;
    }
    setPasswords({ current: '', next: '', confirm: '' });
    toast({ title: 'Password updated', description: 'Every other device has been signed out.' });
    void accountService.sessions().then(setSessions);
  };

  const deleteAccount = async () => {
    setBusy(true);
    const ok = await accountService.deleteAccount(deletePassword);
    setBusy(false);

    if (!ok) {
      toast({ title: 'Could not delete the account', description: 'The password must match exactly.', variant: 'destructive' });
      return;
    }

    toast({ title: 'Account deleted', description: 'It can be restored within 30 days by contacting support.' });
    await logout();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Laptop className="h-4 w-4" /> Active sessions
          </CardTitle>
          <CardDescription>Devices currently signed in to your account.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No other sessions.</p>
          ) : (
            sessions.map((session) => (
              <div key={session.id} className="flex items-center justify-between gap-4 rounded-xl border p-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {describeAgent(session.userAgent)}
                    {session.current && <Badge variant="secondary">This device</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {session.ip || 'unknown IP'} · started {formatDistanceToNow(session.createdAt, { addSuffix: true })}
                  </p>
                </div>
                {!session.current && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      const ok = await accountService.revokeSession(session.id);
                      if (ok) setSessions((current) => current.filter((item) => item.id !== session.id));
                      else toast({ title: 'Could not revoke session', variant: 'destructive' });
                    }}
                  >
                    Revoke
                  </Button>
                )}
              </div>
            ))
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const ok = await accountService.signOutEverywhere();
              if (ok) {
                toast({ title: 'Signed out everywhere' });
                await logout();
              } else {
                toast({ title: 'Could not sign out sessions', variant: 'destructive' });
              }
            }}
          >
            <LogOut className="mr-2 h-4 w-4" /> Sign out everywhere
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> Password
          </CardTitle>
          <CardDescription>Changing it keeps you signed in here and signs out everything else.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="current-password">Current</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={passwords.current}
              onChange={(event) => setPasswords({ ...passwords, current: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">New</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={passwords.next}
              onChange={(event) => setPasswords({ ...passwords, next: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={passwords.confirm}
              onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })}
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={() => void changePassword()} disabled={busy || !passwords.current || !passwords.next}>
            Save password
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Personal API tokens
          </CardTitle>
          <CardDescription>
            For bots and OBS-style tools. Tokens start with <code className="font-mono text-xs">lsc_</code> and are shown once.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!apiTokensEnabled ? (
            <p className="text-sm text-muted-foreground">API tokens are disabled on this deployment.</p>
          ) : (
            <>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={tokenName}
                  onChange={(event) => setTokenName(event.target.value.slice(0, 60))}
                  placeholder="Stream deck"
                />
                <Button variant="glow" onClick={() => void createToken()} disabled={busy}>
                  <Plus className="mr-2 h-4 w-4" /> Create token
                </Button>
              </div>

              {newTokenSecret && (
                <Alert className="border-[hsl(var(--accent-mid)_/_0.4)]">
                  <AlertTitle>Copy your token now</AlertTitle>
                  <AlertDescription className="space-y-2">
                    <code className="block break-all rounded bg-black/40 p-2 font-mono text-xs">{newTokenSecret}</code>
                    <div className="flex gap-2">
                      <Button size="sm" variant="glass" onClick={() => void copyToken(newTokenSecret)}>
                        <Copy className="mr-2 h-3.5 w-3.5" /> Copy
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setNewTokenSecret(null)}>
                        Done
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {tokens.length > 0 && (
                <div className="space-y-2">
                  {tokens.map((token) => (
                    <div key={token.id} className="flex items-center justify-between gap-4 rounded-xl border p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {token.name}{' '}
                          {token.revokedAt && (
                            <Badge variant="outline" className="ml-2">
                              revoked
                            </Badge>
                          )}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {token.prefix}… · {token.scopes.join(', ') || 'read'} ·{' '}
                          {token.lastUsedAt ? `last used ${formatDistanceToNow(token.lastUsedAt, { addSuffix: true })}` : 'never used'}
                        </p>
                      </div>
                      {!token.revokedAt && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={async () => {
                            const ok = await accountService.revokeToken(token.id);
                            if (ok) {
                              setTokens((current) =>
                                current.map((item) => (item.id === token.id ? { ...item, revokedAt: new Date() } : item)),
                              );
                            } else {
                              toast({ title: 'Could not revoke token', variant: 'destructive' });
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-4 w-4" /> Your data
          </CardTitle>
          <CardDescription>Download everything we store about your account as JSON.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!exportEnabled}
            onClick={async () => {
              const ok = await accountService.exportData();
              toast({ title: ok ? 'Export downloaded' : 'Could not export your data', variant: ok ? undefined : 'destructive' });
            }}
          >
            <Download className="mr-2 h-4 w-4" /> Export my data
          </Button>
          {user && !user.isStreamer && (
            <p className="self-center text-xs text-muted-foreground">Nothing is shared with third parties — exports are generated on demand.</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" /> Delete account
          </CardTitle>
          <CardDescription>
            Your profile is anonymised immediately, streams stop and sessions are revoked. Data is purged after {DELETION_GRACE_DAYS} days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-sm space-y-2">
            <Label htmlFor="delete-password">Confirm your password</Label>
            <Input
              id="delete-password"
              type="password"
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
              autoComplete="current-password"
            />
          </div>
        </CardContent>
        <CardFooter>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={!deletionEnabled || !deletePassword}>
                Delete my account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This signs you out everywhere and hides your channel. Support can restore it within {DELETION_GRACE_DAYS} days; after that
                  it is gone for good.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep my account</AlertDialogCancel>
                <AlertDialogAction onClick={() => void deleteAccount()} disabled={busy}>
                  Delete permanently
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardFooter>
      </Card>
    </div>
  );
}
