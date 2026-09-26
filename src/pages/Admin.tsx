/**
 * Operator console — only reachable for accounts with `isAdmin`.
 *
 * Everything it calls lives under `/api/admin` and is re-checked server-side,
 * so hiding the route is purely cosmetic.
 */

import { useCallback, useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, Bug, CheckCircle2, Gauge, Plug, ScrollText, ShieldBan, ShieldOff, Users } from 'lucide-react';
import Navigation from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { adminService, type AdminBan, type AdminError, type AdminOutbox, type AdminOverview, type AdminReport, type AdminUser } from '@/services/adminService';
import StreamsPanel from '@/components/admin/StreamsPanel';
import CatalogPanel from '@/components/admin/CatalogPanel';

export default function Admin() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [bans, setBans] = useState<AdminBan[]>([]);
  const [errors, setErrors] = useState<AdminError[]>([]);
  const [flags, setFlags] = useState<Array<{ key: string; enabled: boolean; description?: string | null }>>([]);
  const [audit, setAudit] = useState<Array<{ id: string; action: string; targetType?: string | null; createdAt: string }>>([]);
  const [userSearch, setUserSearch] = useState('');
  const [people, setPeople] = useState<AdminUser[]>([]);
  const [outbox, setOutbox] = useState<AdminOutbox | null>(null);
  const [testEmailTo, setTestEmailTo] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [overviewData, reportList, banList, errorList, flagList, auditList, outboxData] = await Promise.all([
      adminService.overview(),
      adminService.reports('open'),
      adminService.bans(),
      adminService.errors(25),
      adminService.flags(),
      adminService.audit(25),
      adminService.outbox('all', 25),
    ]);
    setOverview(overviewData);
    setReports(reportList);
    setBans(banList);
    setErrors(errorList);
    setFlags(flagList);
    setAudit(auditList);
    setOutbox(outboxData);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAuthenticated && user?.isAdmin) void load();
  }, [isAuthenticated, user?.isAdmin, load]);

  const searchUsers = async () => {
    setPeople(await adminService.users(userSearch.trim(), 25));
  };

  if (!isAuthenticated || !user?.isAdmin) {
    return (
      <div className="relative min-h-svh bg-background">
        <div className="grain-fixed" />
        <div className="relative z-10 flex min-h-svh flex-col">
          <Navigation />
          <main className="flex-1 container pt-28 pb-16 text-center">
            <ShieldOff className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
            <h1 className="font-display text-3xl font-bold">Administrator access required</h1>
            <p className="mt-2 text-muted-foreground">This console is limited to platform operators.</p>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-svh bg-background">
      <div className="grain-fixed" />
      <div className="relative z-10 flex min-h-svh flex-col">
        <Navigation />

        <main className="flex-1 container pt-28 pb-16">
          <div className="mb-8">
            <p className="overline mb-3">Operations</p>
            <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
              Admin <span className="text-gradient">console</span>.
            </h1>
            <p className="mt-2 text-muted-foreground">
              {overview ? `${overview.environment} · v${overview.version}` : 'Loading deployment details…'}
            </p>
          </div>

          {loading ? (
            <div className="grid gap-4">
              <Skeleton className="h-32 w-full rounded-2xl" />
              <Skeleton className="h-96 w-full rounded-2xl" />
            </div>
          ) : (
            <>
              <div className="mb-8 grid gap-4 md:grid-cols-4">
                {[
                  { label: 'Open reports', value: overview?.storage.openReports ?? reports.length, icon: AlertTriangle },
                  { label: 'VODs ready', value: overview?.storage.vods ?? 0, icon: Gauge },
                  { label: 'Recordings', value: overview?.storage.recordings ?? 0, icon: Users },
                  { label: 'Active bans', value: bans.length, icon: ShieldBan },
                ].map((item) => (
                  <Card key={item.label} className="rounded-2xl border-white/8 bg-card/70 backdrop-blur-md">
                    <CardContent className="flex items-center justify-between pt-6">
                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/70 mb-1.5">{item.label}</p>
                        <p className="font-display text-3xl font-bold">{item.value}</p>
                      </div>
                      <item.icon className="h-5 w-5 text-muted-foreground" />
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Tabs defaultValue="moderation" className="space-y-6">
                <TabsList className="grid w-full grid-cols-4 sm:w-[820px] sm:grid-cols-7">
                  <TabsTrigger value="moderation">Moderation</TabsTrigger>
                  <TabsTrigger value="streams">Streams</TabsTrigger>
                  <TabsTrigger value="people">People</TabsTrigger>
                  <TabsTrigger value="catalog">Catalog</TabsTrigger>
                  <TabsTrigger value="health">Integrations</TabsTrigger>
                  <TabsTrigger value="flags">Flags</TabsTrigger>
                  <TabsTrigger value="audit">Audit</TabsTrigger>
                </TabsList>

                <TabsContent value="streams" className="space-y-6">
                  <StreamsPanel />
                </TabsContent>

                <TabsContent value="catalog" className="space-y-6">
                  <CatalogPanel />
                </TabsContent>

                <TabsContent value="moderation" className="space-y-6">
                  <Card className="rounded-2xl border-white/8 bg-card/70">
                    <CardHeader>
                      <CardTitle className="text-base">Open reports</CardTitle>
                      <CardDescription>Resolve or dismiss what viewers flagged.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {reports.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nothing waiting on you.</p>
                      ) : (
                        reports.map((report) => (
                          <div key={report.id} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <p className="text-sm font-medium capitalize">
                                  {report.reason.replace(/_/g, ' ')}{' '}
                                  <span className="text-muted-foreground">· {report.targetType.replace(/_/g, ' ')}</span>
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  reported by @{report.reporterUsername ?? 'unknown'} ·{' '}
                                  {formatDistanceToNow(new Date(report.createdAt), { addSuffix: true })}
                                </p>
                                {report.details && <p className="mt-1 text-sm text-muted-foreground">{report.details}</p>}
                              </div>
                              <div className="flex shrink-0 gap-2">
                                <Button
                                  size="sm"
                                  variant="glass"
                                  onClick={async () => {
                                    const ok = await adminService.resolveReport(report.id, 'resolved');
                                    if (ok) setReports((current) => current.filter((item) => item.id !== report.id));
                                    toast({ title: ok ? 'Report resolved' : 'Could not update the report', variant: ok ? undefined : 'destructive' });
                                  }}
                                >
                                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Resolve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={async () => {
                                    const ok = await adminService.resolveReport(report.id, 'dismissed');
                                    if (ok) setReports((current) => current.filter((item) => item.id !== report.id));
                                  }}
                                >
                                  Dismiss
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>

                  <Card className="rounded-2xl border-white/8 bg-card/70">
                    <CardHeader>
                      <CardTitle className="text-base">Active bans &amp; timeouts</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {bans.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No active restrictions.</p>
                      ) : (
                        bans.map((ban) => (
                          <div key={ban.id} className="flex items-center justify-between gap-4 rounded-xl border border-white/8 bg-white/[0.02] p-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium">
                                @{ban.username} <Badge variant="outline" className="ml-2 capitalize">{ban.kind}</Badge>
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {ban.reason} · {ban.expiresAt ? `until ${new Date(ban.expiresAt).toLocaleString()}` : 'permanent'}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="glass"
                              onClick={async () => {
                                const ok = await adminService.liftBan(ban.id);
                                if (ok) setBans((current) => current.filter((item) => item.id !== ban.id));
                                toast({ title: ok ? 'Restriction lifted' : 'Could not lift the ban', variant: ok ? undefined : 'destructive' });
                              }}
                            >
                              Lift
                            </Button>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>

                  <Card className="rounded-2xl border-white/8 bg-card/70">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Bug className="h-4 w-4" /> Client errors
                      </CardTitle>
                      <CardDescription>Fingerprinted and de-duplicated — highest counts first.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {errors.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No client errors reported.</p>
                      ) : (
                        errors.map((error) => (
                          <div key={error.id} className="flex items-start justify-between gap-4 rounded-xl border border-white/8 bg-white/[0.02] p-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{error.message}</p>
                              <p className="text-xs text-muted-foreground">
                                {error.occurrences}× · {error.url ?? 'unknown page'} ·{' '}
                                {error.updatedAt ? formatDistanceToNow(new Date(error.updatedAt), { addSuffix: true }) : ''}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={async () => {
                                const ok = await adminService.dismissError(error.id);
                                if (ok) setErrors((current) => current.filter((item) => item.id !== error.id));
                              }}
                            >
                              Clear
                            </Button>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="people" className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      value={userSearch}
                      onChange={(event) => setUserSearch(event.target.value)}
                      placeholder="Search by username or email…"
                      className="max-w-sm"
                    />
                    <Button variant="glass" onClick={() => void searchUsers()}>
                      Search
                    </Button>
                  </div>

                  {people.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Search for an account to ban, unban or verify.</p>
                  ) : (
                    people.map((person) => (
                      <Card key={person.id} className="rounded-2xl border-white/8 bg-card/70">
                        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">
                              @{person.username} {person.isAdmin && <Badge variant="secondary" className="ml-2">admin</Badge>}
                              {person.isBanned && <Badge variant="destructive" className="ml-2">banned</Badge>}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {person.email} · {person.followers} followers · joined{' '}
                              {formatDistanceToNow(new Date(person.createdAt), { addSuffix: true })}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            {person.isBanned ? (
                              <Button
                                size="sm"
                                variant="glass"
                                onClick={async () => {
                                  const ok = await adminService.unbanUser(person.id);
                                  if (ok) setPeople((current) => current.map((item) => (item.id === person.id ? { ...item, isBanned: false } : item)));
                                }}
                              >
                                Unban
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="glass"
                                className="text-destructive hover:text-destructive"
                                disabled={person.isAdmin}
                                onClick={async () => {
                                  const reason = window.prompt('Reason for the ban', 'Violation of the community guidelines');
                                  if (!reason) return;
                                  const ok = await adminService.banUser(person.id, { reason });
                                  if (ok) setPeople((current) => current.map((item) => (item.id === person.id ? { ...item, isBanned: true } : item)));
                                  toast({ title: ok ? 'Account banned' : 'Could not ban the account', variant: ok ? undefined : 'destructive' });
                                }}
                              >
                                Ban
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </TabsContent>

                <TabsContent value="health" className="space-y-4">
                  <Card className="rounded-2xl border-white/8 bg-card/70">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Plug className="h-4 w-4" /> Integration readiness
                      </CardTitle>
                      <CardDescription>
                        Exactly which keys still need to be added — everything else is already deployed.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {(overview?.integrations ?? []).map((integration) => (
                        <div key={integration.id} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium">{integration.label}</p>
                            <Badge variant={integration.configured ? 'secondary' : 'outline'}>
                              {integration.configured ? 'configured' : 'needs keys'}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{integration.requiredFor.join(' · ')}</p>
                          {integration.envVars.length > 0 && (
                            <p className="mt-1 font-mono text-[10px] text-muted-foreground/80">{integration.envVars.join(', ')}</p>
                          )}
                          {integration.notes && <p className="mt-1 text-xs text-muted-foreground">{integration.notes}</p>}
                        </div>
                      ))}

                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3">
                        <p className="text-sm">
                          Email outbox provider: <span className="font-mono text-xs">{overview?.email.provider}</span>
                          {outbox && Object.keys(outbox.counts).length > 0 && (
                            <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                              {Object.entries(outbox.counts)
                                .map(([status, count]) => `${status} ${count}`)
                                .join(' · ')}
                            </span>
                          )}
                        </p>
                        <div className="flex items-center gap-2">
                          <Input
                            value={testEmailTo}
                            onChange={(event) => setTestEmailTo(event.target.value)}
                            placeholder="you@example.com"
                            className="h-9 w-48"
                            aria-label="Test email recipient"
                          />
                          <Button
                            size="sm"
                            variant="glass"
                            disabled={sendingTest}
                            onClick={async () => {
                              setSendingTest(true);
                              const result = await adminService.testEmail(testEmailTo.trim() || undefined);
                              setSendingTest(false);
                              toast({
                                title: result.ok ? 'Test email sent' : 'Test email failed',
                                description: result.ok
                                  ? `The provider (${result.provider}) accepted the message.`
                                  : result.error ?? 'No provider is configured yet.',
                                variant: result.ok ? undefined : 'destructive',
                              });
                              setOutbox(await adminService.outbox('all', 25));
                            }}
                          >
                            {sendingTest ? 'Sending…' : 'Send test'}
                          </Button>
                          <Button
                            size="sm"
                            variant="glass"
                            onClick={async () => {
                              const ok = await adminService.flushEmail();
                              toast({ title: ok ? 'Outbox flush queued' : 'Could not flush the outbox', variant: ok ? undefined : 'destructive' });
                              setOutbox(await adminService.outbox('all', 25));
                            }}
                          >
                            Flush outbox
                          </Button>
                        </div>
                      </div>

                      {(outbox?.emails.length ?? 0) > 0 && (
                        <div className="space-y-2">
                          {outbox!.emails.slice(0, 8).map((mail) => (
                            <div key={mail.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/8 bg-white/[0.02] p-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm">
                                  <span className="font-mono text-xs">{mail.template}</span> → {mail.to}
                                </p>
                                <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                                  {formatDistanceToNow(new Date(mail.createdAt), { addSuffix: true })}
                                  {mail.attempts ? ` · ${mail.attempts} attempt${mail.attempts === 1 ? '' : 's'}` : ''}
                                  {mail.lastError ? ` · ${mail.lastError}` : ''}
                                </p>
                              </div>
                              <Badge variant={mail.status === 'sent' ? 'secondary' : mail.status === 'failed' ? 'destructive' : 'outline'}>
                                {mail.status}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="flags" className="space-y-4">
                  <Card className="rounded-2xl border-white/8 bg-card/70">
                    <CardHeader>
                      <CardTitle className="text-base">Feature flags</CardTitle>
                      <CardDescription>Database-level overrides applied without a redeploy.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {flags.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No database flags set — the deployment env vars are in charge.</p>
                      ) : (
                        flags.map((flag) => (
                          <div key={flag.key} className="flex items-center justify-between gap-4 rounded-xl border border-white/8 bg-white/[0.02] p-3">
                            <div>
                              <p className="font-mono text-sm">{flag.key}</p>
                              {flag.description && <p className="text-xs text-muted-foreground">{flag.description}</p>}
                            </div>
                            <Switch
                              checked={flag.enabled}
                              onCheckedChange={async (checked) => {
                                const ok = await adminService.setFlag(flag.key, checked);
                                if (ok) setFlags((current) => current.map((item) => (item.key === flag.key ? { ...item, enabled: checked } : item)));
                              }}
                            />
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="audit" className="space-y-4">
                  <Card className="rounded-2xl border-white/8 bg-card/70">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <ScrollText className="h-4 w-4" /> Audit trail
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {audit.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No audited actions yet.</p>
                      ) : (
                        audit.map((entry) => (
                          <div key={entry.id} className="flex items-center justify-between gap-4 rounded-xl border border-white/8 bg-white/[0.02] p-3">
                            <p className="font-mono text-xs">{entry.action}</p>
                            <p className="text-xs text-muted-foreground">
                              {entry.targetType ?? 'platform'} · {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                            </p>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
