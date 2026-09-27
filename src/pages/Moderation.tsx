import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Ban, Flag, MessageSquare, Shield, ShieldAlert, ShieldCheck, Trash2, UserX } from 'lucide-react';
import Navigation from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { moderationService, REPORT_REASONS, type ChatRules } from '@/services/moderationService';
import { profileService } from '@/services/profileService';
import type { BlockedUser, ContentReport, Stream } from '@/types';

export default function Moderation() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();

  const [reports, setReports] = useState<ContentReport[]>([]);
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [selectedStreamId, setSelectedStreamId] = useState<string>('');
  const [rules, setRules] = useState<ChatRules | null>(null);
  const [blockedWords, setBlockedWords] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [myReports, myBlocks, myStreams] = await Promise.all([
      moderationService.myReports(),
      moderationService.blockedUsers(),
      user ? profileService.getUserStreams(user.id) : Promise.resolve([]),
    ]);
    setReports(myReports);
    setBlocked(myBlocks);
    const moderatable = myStreams.slice(0, 20);
    setStreams(moderatable);
    setSelectedStreamId((current) => current || moderatable[0]?.id || '');
    setLoading(false);
  }, [isAuthenticated, user]);

  useEffect(() => {
    void load();
  }, [load]);

  // Load the chat rules for whichever broadcast is selected.
  useEffect(() => {
    if (!selectedStreamId) {
      setRules(null);
      return;
    }
    let cancelled = false;
    void moderationService.chatSettings(selectedStreamId).then((settings) => {
      if (cancelled) return;
      setRules(settings);
      setBlockedWords((settings?.blockedWords ?? []).join(', '));
    });
    return () => {
      cancelled = true;
    };
  }, [selectedStreamId]);

  const stats = useMemo(
    () => ({
      open: reports.filter((report) => report.status === 'open' || report.status === 'reviewing').length,
      resolved: reports.filter((report) => report.status === 'resolved' || report.status === 'dismissed').length,
    }),
    [reports],
  );

  const saveRules = async (patch: Partial<ChatRules>) => {
    if (!selectedStreamId) return;
    setSaving(true);
    const updated = await moderationService.updateChatSettings(selectedStreamId, patch);
    setSaving(false);
    if (!updated) {
      toast({ title: 'Could not save chat rules', variant: 'destructive' });
      return;
    }
    setRules(updated);
    setBlockedWords((updated.blockedWords ?? []).join(', '));
    toast({ title: 'Chat rules updated' });
  };

  if (!isAuthenticated) {
    return (
      <div className="relative min-h-svh bg-background">
        <div className="grain-fixed" />
        <div className="relative z-10 flex min-h-svh flex-col">
          <Navigation />
          <main className="flex-1 container pt-28 pb-16 text-center">
            <Shield className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
            <h1 className="font-display text-3xl font-bold">Sign in to manage moderation</h1>
            <Button variant="glow" className="mt-6" asChild>
              <Link to="/login">Log in</Link>
            </Button>
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
            <p className="overline mb-3">Trust &amp; safety</p>
            <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
              Keep it <span className="text-gradient">civil</span>.
            </h1>
            <p className="mt-2 text-muted-foreground">
              Your reports, your block list and the rules that apply to your own chat room.
            </p>
          </div>

          <Tabs defaultValue="reports" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3 sm:w-[420px]">
              <TabsTrigger value="reports">Reports</TabsTrigger>
              <TabsTrigger value="blocks">Blocked</TabsTrigger>
              <TabsTrigger value="chat">Chat rules</TabsTrigger>
            </TabsList>

            <TabsContent value="reports" className="space-y-4">
              <div className="flex gap-3 text-sm text-muted-foreground">
                <Badge variant="secondary">{stats.open} open</Badge>
                <Badge variant="outline">{stats.resolved} closed</Badge>
              </div>

              {loading ? (
                [1, 2, 3].map((index) => <Skeleton key={index} className="h-24 w-full rounded-2xl" />)
              ) : reports.length === 0 ? (
                <Card className="rounded-2xl border-white/8 bg-card/70">
                  <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
                    <ShieldCheck className="h-10 w-10 text-muted-foreground" />
                    <p className="font-medium">You have not reported anything</p>
                    <p className="max-w-sm text-sm text-muted-foreground">
                      Use the flag button on any stream, profile, message or replay and it will appear here.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                reports.map((report) => (
                  <Card key={report.id} className="rounded-2xl border-white/8 bg-card/70">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-4">
                        <CardTitle className="flex items-center gap-2 text-base capitalize">
                          <Flag className="h-4 w-4 text-[hsl(349_86%_65%)]" />
                          {report.reason.replace(/_/g, ' ')}
                        </CardTitle>
                        <Badge variant={report.status === 'resolved' || report.status === 'dismissed' ? 'outline' : 'secondary'} className="capitalize">
                          {report.status}
                        </Badge>
                      </div>
                      <CardDescription>
                        {report.targetType.replace(/_/g, ' ')} · {formatDistanceToNow(report.createdAt, { addSuffix: true })}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm text-muted-foreground">
                      {report.details && <p>{report.details}</p>}
                      {report.resolution && <p className="text-foreground">Moderator note: {report.resolution}</p>}
                      {report.targetUsername && (
                        <Link to={`/profile/${report.targetUsername}`} className="text-[hsl(var(--accent-hi))] hover:underline">
                          View @{report.targetUsername}
                        </Link>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="blocks" className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Blocked accounts cannot follow you, comment on your chat or send you notifications.
              </p>

              {blocked.length === 0 ? (
                <Card className="rounded-2xl border-white/8 bg-card/70">
                  <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
                    <UserX className="h-10 w-10 text-muted-foreground" />
                    <p className="font-medium">Nobody is blocked</p>
                    <p className="max-w-sm text-sm text-muted-foreground">Block someone from their profile or from a chat message.</p>
                  </CardContent>
                </Card>
              ) : (
                blocked.map((entry) => (
                  <Card key={entry.id} className="rounded-2xl border-white/8 bg-card/70">
                    <CardContent className="flex items-center justify-between gap-4 pt-6">
                      <div>
                        <p className="font-medium">@{entry.username}</p>
                        <p className="text-xs text-muted-foreground">
                          Blocked {formatDistanceToNow(entry.createdAt, { addSuffix: true })}
                        </p>
                      </div>
                      <Button
                        variant="glass"
                        size="sm"
                        onClick={async () => {
                          const ok = await moderationService.unblock(entry.userId);
                          if (ok) setBlocked((current) => current.filter((item) => item.id !== entry.id));
                          else toast({ title: 'Could not unblock', variant: 'destructive' });
                        }}
                      >
                        Unblock
                      </Button>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="chat" className="space-y-4">
              {streams.length === 0 ? (
                <Card className="rounded-2xl border-white/8 bg-card/70">
                  <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
                    <MessageSquare className="h-10 w-10 text-muted-foreground" />
                    <p className="font-medium">No broadcast to moderate yet</p>
                    <p className="max-w-sm text-sm text-muted-foreground">Create a stream and its chat rules appear here.</p>
                    <Button variant="glass" size="sm" asChild>
                      <Link to="/stream/create">Create a stream</Link>
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className="max-w-sm space-y-2">
                    <Label>Broadcast</Label>
                    <Select value={selectedStreamId} onValueChange={setSelectedStreamId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pick a broadcast" />
                      </SelectTrigger>
                      <SelectContent>
                        {streams.map((stream) => (
                          <SelectItem key={stream.id} value={stream.id}>
                            {stream.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {rules ? (
                    <Card className="rounded-2xl border-white/8 bg-card/70">
                      <CardHeader>
                        <CardTitle className="text-base">Chat rules</CardTitle>
                        <CardDescription>Changes apply immediately for everyone in that room.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-5">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium">Followers only</p>
                            <p className="text-xs text-muted-foreground">Only accounts following the channel can send messages.</p>
                          </div>
                          <Switch
                            checked={rules.followersOnly}
                            disabled={saving}
                            onCheckedChange={(checked) => void saveRules({ followersOnly: checked })}
                          />
                        </div>

                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium">Allow links</p>
                            <p className="text-xs text-muted-foreground">When off, URLs are stripped from messages before they appear.</p>
                          </div>
                          <Switch
                            checked={rules.linksAllowed}
                            disabled={saving}
                            onCheckedChange={(checked) => void saveRules({ linksAllowed: checked })}
                          />
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="slow-mode">Slow mode (seconds between messages)</Label>
                            <Input
                              id="slow-mode"
                              type="number"
                              min={0}
                              max={600}
                              defaultValue={rules.slowModeSeconds}
                              onBlur={(event) => {
                                const value = Number(event.target.value);
                                if (Number.isFinite(value) && value !== rules.slowModeSeconds) void saveRules({ slowModeSeconds: value });
                              }}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="min-age">Minimum account age (minutes)</Label>
                            <Input
                              id="min-age"
                              type="number"
                              min={0}
                              max={43200}
                              defaultValue={rules.minAccountAgeMinutes}
                              onBlur={(event) => {
                                const value = Number(event.target.value);
                                if (Number.isFinite(value) && value !== rules.minAccountAgeMinutes) void saveRules({ minAccountAgeMinutes: value });
                              }}
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="blocked-words">Blocked words (comma separated)</Label>
                          <Input
                            id="blocked-words"
                            value={blockedWords}
                            onChange={(event) => setBlockedWords(event.target.value)}
                            placeholder="spoiler, scam, …"
                          />
                          <Button
                            variant="glow"
                            size="sm"
                            disabled={saving}
                            onClick={() =>
                              void saveRules({
                                blockedWords: blockedWords
                                  .split(',')
                                  .map((word) => word.trim())
                                  .filter(Boolean),
                              })
                            }
                          >
                            Save word filter
                          </Button>
                        </div>

                        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3 text-xs text-muted-foreground">
                          {rules.moderators.length} moderator{rules.moderators.length === 1 ? '' : 's'} can also mute or ban in this room.
                          Timeouts and bans are issued from the chat overlay while you are live.
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <Skeleton className="h-64 w-full rounded-2xl" />
                  )}

                  <Card className="rounded-2xl border-white/8 bg-card/70">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <ShieldAlert className="h-4 w-4 text-[hsl(349_86%_65%)]" />
                        While you are live
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm text-muted-foreground">
                      <p className="flex items-center gap-2">
                        <Ban className="h-3.5 w-3.5" /> Right-click (or use the ⋯ menu on) any message to delete it or timeout the author.
                      </p>
                      <p className="flex items-center gap-2">
                        <Trash2 className="h-3.5 w-3.5" /> Deleted messages stay in the moderation log for 30 days.
                      </p>
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
}
