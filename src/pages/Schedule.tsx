import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, formatDistanceToNow } from 'date-fns';
import { Bell, BellRing, CalendarClock, Clock, Plus, Radio, Trash2, Users } from 'lucide-react';
import Navigation from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { scheduleService } from '@/services/scheduleService';
import { initials } from '@/utils/design';
import type { ScheduledBroadcast } from '@/types';

function defaultSlot(): string {
  const next = new Date(Date.now() + 60 * 60 * 1000);
  next.setMinutes(0, 0, 0);
  // `datetime-local` wants a local ISO string without seconds.
  return new Date(next.getTime() - next.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export default function Schedule() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [upcoming, setUpcoming] = useState<ScheduledBroadcast[]>([]);
  const [mine, setMine] = useState<ScheduledBroadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', scheduledFor: defaultSlot(), durationMinutes: 60, tags: '' });

  const load = useCallback(async () => {
    setLoading(true);
    const [publicSlots, ownSlots] = await Promise.all([
      scheduleService.upcoming({ limit: 30 }),
      isAuthenticated ? scheduleService.mine() : Promise.resolve([]),
    ]);
    setUpcoming(publicSlots);
    setMine(ownSlots);
    setLoading(false);
  }, [isAuthenticated]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    if (!form.title.trim()) {
      toast({ title: 'Give the broadcast a title', variant: 'destructive' });
      return;
    }

    const scheduledFor = new Date(form.scheduledFor);
    if (Number.isNaN(scheduledFor.getTime())) {
      toast({ title: 'Pick a valid date and time', variant: 'destructive' });
      return;
    }

    const created = await scheduleService.create({
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      scheduledFor: scheduledFor.toISOString(),
      durationMinutes: form.durationMinutes,
      tags: form.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });

    if (!created) {
      toast({ title: 'Could not schedule the broadcast', description: 'Enable streamer mode first.', variant: 'destructive' });
      return;
    }

    setMine((current) => [created, ...current]);
    setUpcoming((current) => [created, ...current].sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime()));
    setCreating(false);
    setForm({ title: '', description: '', scheduledFor: defaultSlot(), durationMinutes: 60, tags: '' });
    toast({ title: 'Broadcast scheduled', description: 'Followers can now ask for a reminder.' });
  };

  const handleCancel = async (slot: ScheduledBroadcast) => {
    if (!window.confirm(`Cancel “${slot.title}”?`)) return;
    const ok = await scheduleService.cancel(slot.id);
    if (!ok) {
      toast({ title: 'Could not cancel', variant: 'destructive' });
      return;
    }
    setUpcoming((current) => current.filter((item) => item.id !== slot.id));
    setMine((current) => current.filter((item) => item.id !== slot.id));
  };

  const handleReminder = async (slot: ScheduledBroadcast) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    const reminded = await scheduleService.toggleReminder(slot.id);
    if (reminded === null) {
      toast({ title: 'Could not set the reminder', variant: 'destructive' });
      return;
    }
    const apply = (item: ScheduledBroadcast) =>
      item.id === slot.id ? { ...item, isReminded: reminded, reminderCount: item.reminderCount + (reminded ? 1 : -1) } : item;
    setUpcoming((current) => current.map(apply));
    toast({ title: reminded ? 'Reminder set' : 'Reminder removed' });
  };

  const handleGoLive = async (slot: ScheduledBroadcast) => {
    const result = await scheduleService.goLive(slot.id);
    if (!result?.streamId) {
      toast({ title: 'Could not open the broadcast', variant: 'destructive' });
      return;
    }
    navigate(`/stream/create?streamId=${result.streamId}`);
  };

  return (
    <div className="relative min-h-svh bg-background">
      <div className="grain-fixed" />
      <div className="relative z-10 flex min-h-svh flex-col">
        <Navigation />

        <main className="flex-1 container pt-28 pb-16">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="overline mb-3">Programming</p>
              <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
                What&rsquo;s <span className="text-gradient">next</span>.
              </h1>
              <p className="mt-2 text-muted-foreground">Scheduled broadcasts across the platform — reminders arrive 30 minutes before air.</p>
            </div>

            {isAuthenticated && user?.isStreamer && (
              <Dialog open={creating} onOpenChange={setCreating}>
                <DialogTrigger asChild>
                  <Button variant="glow">
                    <Plus className="mr-2 h-4 w-4" /> Schedule broadcast
                  </Button>
                </DialogTrigger>
                <DialogContent className="rounded-2xl border-white/10 bg-[hsl(252_36%_6%/0.98)]">
                  <DialogHeader>
                    <DialogTitle>Schedule a broadcast</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="slot-title">Title</Label>
                      <Input
                        id="slot-title"
                        value={form.title}
                        maxLength={140}
                        onChange={(event) => setForm({ ...form, title: event.target.value })}
                        placeholder="Friday night build session"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="slot-description">Description</Label>
                      <Textarea
                        id="slot-description"
                        value={form.description}
                        rows={3}
                        maxLength={2000}
                        onChange={(event) => setForm({ ...form, description: event.target.value })}
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="slot-when">Starts at</Label>
                        <Input
                          id="slot-when"
                          type="datetime-local"
                          value={form.scheduledFor}
                          onChange={(event) => setForm({ ...form, scheduledFor: event.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="slot-duration">Duration (minutes)</Label>
                        <Input
                          id="slot-duration"
                          type="number"
                          min={15}
                          max={1440}
                          value={form.durationMinutes}
                          onChange={(event) => setForm({ ...form, durationMinutes: Number(event.target.value) })}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="slot-tags">Tags (comma separated)</Label>
                      <Input id="slot-tags" value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="glass" onClick={() => setCreating(false)}>
                        Cancel
                      </Button>
                      <Button variant="glow" onClick={() => void handleCreate()}>
                        Schedule
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {loading ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {[1, 2, 3, 4].map((index) => (
                <Skeleton key={index} className="h-40 w-full rounded-2xl" />
              ))}
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
              <div className="space-y-4">
                {upcoming.length === 0 ? (
                  <Card className="rounded-2xl border-white/8 bg-card/70">
                    <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                      <CalendarClock className="h-10 w-10 text-muted-foreground" />
                      <p className="font-medium">Nothing scheduled yet</p>
                      <p className="max-w-sm text-sm text-muted-foreground">
                        {user?.isStreamer ? 'Plan your next broadcast so followers can set a reminder.' : 'Check back soon — or browse who is live now.'}
                      </p>
                      <Button variant="glass" size="sm" asChild>
                        <Link to="/stream">Browse live</Link>
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  upcoming.map((slot) => (
                    <Card key={slot.id} className="rounded-2xl border-white/8 bg-card/70 backdrop-blur-md transition-colors hover:border-white/20">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={slot.userAvatar} alt={slot.username ?? ''} />
                              <AvatarFallback className="bg-signature text-xs text-white">{initials(slot.displayName || slot.username || 'LSC')}</AvatarFallback>
                            </Avatar>
                            <div>
                              <CardTitle className="text-base">
                                <Link to={`/profile/${slot.username}`} className="hover:text-[hsl(var(--accent-hi))]">
                                  {slot.title}
                                </Link>
                              </CardTitle>
                              <p className="text-xs text-muted-foreground">
                                {slot.displayName || slot.username} · {slot.status === 'live' ? 'live now' : 'scheduled'}
                              </p>
                            </div>
                          </div>

                          <div className="text-right">
                            <p className="font-display text-sm font-semibold">{format(slot.scheduledFor, 'EEE d MMM, HH:mm')}</p>
                            <p className="text-xs text-muted-foreground">{formatDistanceToNow(slot.scheduledFor, { addSuffix: true })}</p>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {slot.description && <p className="line-clamp-2 text-sm text-muted-foreground">{slot.description}</p>}

                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {slot.durationMinutes ?? 60} min
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" /> {slot.reminderCount} reminded
                          </span>
                          {slot.tags.map((tag) => (
                            <Badge key={tag} variant="outline" className="h-5 px-1.5 text-[10px]">
                              {tag}
                            </Badge>
                          ))}
                          {slot.status === 'live' && (
                            <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                              LIVE
                            </Badge>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2 pt-1">
                          {slot.isOwner ? (
                            <>
                              <Button variant="glow" size="sm" onClick={() => void handleGoLive(slot)}>
                                <Radio className="mr-2 h-3.5 w-3.5" /> Open broadcast
                              </Button>
                              <Button variant="glass" size="sm" className="text-destructive hover:text-destructive" onClick={() => void handleCancel(slot)}>
                                <Trash2 className="mr-2 h-3.5 w-3.5" /> Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button variant={slot.isReminded ? 'glass' : 'glow'} size="sm" onClick={() => void handleReminder(slot)}>
                                {slot.isReminded ? <BellRing className="mr-2 h-3.5 w-3.5" /> : <Bell className="mr-2 h-3.5 w-3.5" />}
                                {slot.isReminded ? 'Reminder set' : 'Remind me'}
                              </Button>
                              {slot.streamId && (
                                <Button variant="glass" size="sm" asChild>
                                  <Link to={`/watch/${slot.streamId}`}>Watch</Link>
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>

              <div className="space-y-4">
                <Card className="rounded-2xl border-white/8 bg-card/70 backdrop-blur-md">
                  <CardHeader>
                    <CardTitle className="text-base">Your schedule</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {!isAuthenticated ? (
                      <p className="text-sm text-muted-foreground">
                        <Link to="/login" className="text-[hsl(var(--accent-hi))] hover:underline">
                          Sign in
                        </Link>{' '}
                        to plan broadcasts and get reminders.
                      </p>
                    ) : mine.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No broadcasts planned yet.</p>
                    ) : (
                      mine.map((slot) => (
                        <div key={slot.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{slot.title}</p>
                            <p className="text-xs text-muted-foreground">{format(slot.scheduledFor, 'd MMM, HH:mm')}</p>
                          </div>
                          <Badge variant={slot.status === 'scheduled' ? 'secondary' : 'outline'} className="capitalize">
                            {slot.status}
                          </Badge>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border-white/8 bg-card/70 backdrop-blur-md">
                  <CardHeader>
                    <CardTitle className="text-base">How reminders work</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <p>Followers press “Remind me” and receive an in-app notification plus an email 30 minutes before you go live.</p>
                    <p>The moment you start the broadcast every reminder target gets the “live now” alert instead.</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
