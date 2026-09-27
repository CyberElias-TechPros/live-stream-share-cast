import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Bell, BellRing, Check, CheckCheck, Radio, Trash2, UserPlus, MessageSquare, Heart, CalendarClock, ShieldAlert } from 'lucide-react';
import Navigation from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useInbox } from '@/hooks/useNotifications';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { notificationService, DEFAULT_NOTIFICATION_PREFERENCES, type NotificationPreferences } from '@/services/notificationService';
import { initials } from '@/utils/design';
import type { AppNotification } from '@/types';
import { cn } from '@/lib/utils';

const ICONS: Record<string, typeof Bell> = {
  stream_live: Radio,
  follow: UserPlus,
  mention: MessageSquare,
  reply: MessageSquare,
  tip: Heart,
  scheduled: CalendarClock,
  moderation: ShieldAlert,
};

export default function Notifications() {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const push = usePushNotifications();

  const inbox = useInbox({ unreadOnly });

  // Load delivery preferences once the session is known.
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    void notificationService.getPreferences().then((loaded) => {
      if (cancelled) return;
      setPreferences(loaded);
      setPreferencesLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const updatePreference = async (key: keyof NotificationPreferences, value: boolean) => {
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    const saved = await notificationService.updatePreferences({ [key]: value });
    if (!saved) {
      setPreferences(preferences);
      toast({ title: 'Could not save preference', variant: 'destructive' });
    }
  };

  const openNotification = async (notification: AppNotification) => {
    if (!notification.readAt) await inbox.markRead(notification.id);
    if (notification.url) navigate(notification.url.replace(/^https?:\/\/[^/]+/, ''));
    else if (notification.streamId) navigate(`/watch/${notification.streamId}`);
    else if (notification.actorUsername) navigate(`/profile/${notification.actorUsername}`);
  };

  if (!isAuthenticated) {
    return (
      <div className="relative min-h-svh bg-background">
        <div className="grain-fixed" />
        <div className="relative z-10 flex min-h-svh flex-col">
          <Navigation />
          <main className="flex-1 container pt-28 pb-16 text-center">
            <Bell className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
            <h1 className="font-display text-3xl font-bold">Sign in to see your notifications</h1>
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
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="overline mb-3">Inbox</p>
              <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
                {user?.displayName?.split(' ')[0] || 'Your'} <span className="text-gradient">notifications</span>.
              </h1>
              <p className="mt-2 text-muted-foreground">
                {inbox.unreadCount > 0 ? `${inbox.unreadCount} unread` : 'You are all caught up.'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Tabs value={unreadOnly ? 'unread' : 'all'} onValueChange={(value) => setUnreadOnly(value === 'unread')}>
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="unread">Unread</TabsTrigger>
                </TabsList>
              </Tabs>
              <Button variant="glass" size="sm" onClick={() => void inbox.markAllRead()} disabled={inbox.unreadCount === 0}>
                <CheckCheck className="mr-2 h-4 w-4" />
                Mark all read
              </Button>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="space-y-3">
              {inbox.loading ? (
                [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)
              ) : inbox.notifications.length === 0 ? (
                <Card className="rounded-2xl border-white/8 bg-card/70">
                  <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                    <Bell className="h-10 w-10 text-muted-foreground" />
                    <p className="font-medium">Nothing here yet</p>
                    <p className="max-w-sm text-sm text-muted-foreground">
                      Follow a creator and you will hear from us the moment they go live.
                    </p>
                    <Button variant="glass" size="sm" asChild>
                      <Link to="/stream">Browse live streams</Link>
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {inbox.notifications.map((notification) => {
                    const Icon = ICONS[notification.type] ?? Bell;
                    return (
                      <button
                        key={notification.id}
                        type="button"
                        onClick={() => void openNotification(notification)}
                        className={cn(
                          'group flex w-full items-start gap-3 rounded-2xl border border-white/8 bg-card/70 p-4 text-left backdrop-blur-md transition-colors hover:border-white/20',
                          !notification.readAt && 'border-l-2 border-l-[hsl(var(--accent-mid))]',
                        )}
                      >
                        {notification.actorAvatar ? (
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={notification.actorAvatar} alt={notification.actorUsername ?? ''} />
                            <AvatarFallback className="bg-signature text-xs text-white">
                              {initials(notification.actorUsername ?? 'LSC')}
                            </AvatarFallback>
                          </Avatar>
                        ) : (
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-signature-soft text-[hsl(var(--accent-hi))] ring-1 ring-white/10">
                            <Icon className="h-4 w-4" />
                          </span>
                        )}

                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className={cn('truncate text-sm', !notification.readAt && 'font-semibold')}>{notification.title}</span>
                            {!notification.readAt && <Badge className="h-5 px-1.5 text-[10px]">New</Badge>}
                          </span>
                          {notification.body && <span className="mt-0.5 block line-clamp-2 text-sm text-muted-foreground">{notification.body}</span>}
                          <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
                            {formatDistanceToNow(notification.createdAt, { addSuffix: true })}
                          </span>
                        </span>

                        <span className="flex shrink-0 items-center gap-1">
                          {!notification.readAt && (
                            <span
                              role="button"
                              tabIndex={0}
                              aria-label="Mark as read"
                              className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-white/5 hover:text-foreground"
                              onClick={(event) => {
                                event.stopPropagation();
                                void inbox.markRead(notification.id);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.stopPropagation();
                                  void inbox.markRead(notification.id);
                                }
                              }}
                            >
                              <Check className="h-4 w-4" />
                            </span>
                          )}
                          <span
                            role="button"
                            tabIndex={0}
                            aria-label="Dismiss"
                            className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            onClick={(event) => {
                              event.stopPropagation();
                              void inbox.dismiss(notification.id);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.stopPropagation();
                                void inbox.dismiss(notification.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </span>
                        </span>
                      </button>
                    );
                  })}

                  {inbox.hasMore && (
                    <div className="pt-2 text-center">
                      <Button variant="glass" size="sm" onClick={() => void inbox.loadMore()} disabled={inbox.loadingMore}>
                        {inbox.loadingMore ? 'Loading…' : 'Load older notifications'}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="space-y-4">
              <Card className="rounded-2xl border-white/8 bg-card/70 backdrop-blur-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BellRing className="h-4 w-4 text-[hsl(var(--accent-mid))]" />
                    Delivery
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(
                    [
                      ['streamStart', 'When a channel I follow goes live'],
                      ['followers', 'New followers on my channel'],
                      ['comments', 'Replies, mentions and tips'],
                      ['email', 'Also send these by email'],
                    ] as Array<[keyof NotificationPreferences, string]>
                  ).map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between gap-3">
                      <span className="text-sm text-muted-foreground">{label}</span>
                      <Switch
                        checked={!!preferences[key]}
                        disabled={!preferencesLoaded}
                        onCheckedChange={(checked) => void updatePreference(key, checked)}
                        aria-label={label}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-white/8 bg-card/70 backdrop-blur-md">
                <CardHeader>
                  <CardTitle className="text-base">Browser push</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  {push.supported ? (
                    <>
                      <p>
                        {push.subscribed
                          ? 'Push notifications are on for this device.'
                          : 'Get a desktop notification when the creators you follow go live.'}
                      </p>
                      {push.error && <p className="text-destructive">{push.error}</p>}
                      <Button
                        variant={push.subscribed ? 'glass' : 'glow'}
                        size="sm"
                        className="w-full"
                        disabled={push.busy}
                        onClick={() => void (push.subscribed ? push.unsubscribe() : push.subscribe())}
                      >
                        {push.busy ? 'Working…' : push.subscribed ? 'Turn off push' : 'Enable push notifications'}
                      </Button>
                    </>
                  ) : (
                    <p>
                      Push is not configured on this deployment yet. Once the operator adds the VAPID keys the toggle appears here
                      automatically.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
