import { useCallback, useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';
import { Radio, Trash2, Users, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { adminService, type AdminStream } from '@/services/adminService';

/**
 * Streams moderation.
 *
 * Force-ending a live broadcast pushes an offline event to every connected peer
 * and notifies the creator; deleting removes the row (and any stored recording
 * object) for streams that should not exist at all.
 */
export default function StreamsPanel() {
  const { toast } = useToast();
  const [streams, setStreams] = useState<AdminStream[]>([]);
  const [onlyLive, setOnlyLive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (live: boolean) => {
    setLoading(true);
    setStreams(await adminService.streams({ live, limit: 50 }));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(onlyLive);
  }, [onlyLive, load]);

  const endStream = async (stream: AdminStream) => {
    const reason = window.prompt(`Reason for ending “${stream.title}”?`, 'Moderator action');
    if (reason === null) return;

    setBusyId(stream.id);
    const ok = await adminService.endStream(stream.id, reason || undefined);
    setBusyId(null);

    if (!ok) {
      toast({ title: 'Could not end the stream', variant: 'destructive' });
      return;
    }
    setStreams((current) => current.filter((item) => item.id !== stream.id || !onlyLive));
    setStreams((current) => current.map((item) => (item.id === stream.id ? { ...item, isLive: false } : item)));
    toast({ title: 'Broadcast ended', description: 'The creator was notified and viewers saw the stream go offline.' });
  };

  const deleteStream = async (stream: AdminStream) => {
    if (!window.confirm(`Delete “${stream.title}” and any stored recording? This cannot be undone.`)) return;

    setBusyId(stream.id);
    const ok = await adminService.deleteStream(stream.id);
    setBusyId(null);

    if (!ok) {
      toast({ title: 'Could not delete the stream', variant: 'destructive' });
      return;
    }
    setStreams((current) => current.filter((item) => item.id !== stream.id));
    toast({ title: 'Stream deleted' });
  };

  return (
    <Card className="rounded-2xl border-white/8 bg-card/70">
      <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Radio className="h-4 w-4" /> Broadcasts
          </CardTitle>
          <CardDescription>End a broadcast that breaks the rules, or remove it entirely.</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant={onlyLive ? 'default' : 'glass'} onClick={() => setOnlyLive(true)}>
            Live only
          </Button>
          <Button size="sm" variant={onlyLive ? 'glass' : 'default'} onClick={() => setOnlyLive(false)}>
            All
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {loading ? (
          [1, 2, 3].map((index) => <Skeleton key={index} className="h-16 w-full rounded-xl" />)
        ) : streams.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {onlyLive ? 'Nobody is broadcasting right now.' : 'No streams on record.'}
          </p>
        ) : (
          streams.map((stream) => (
            <div key={stream.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">{stream.title}</p>
                  {stream.isLive ? (
                    <Badge variant="secondary" className="gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-[hsl(349_86%_58%)]" /> live
                    </Badge>
                  ) : (
                    <Badge variant="outline">offline</Badge>
                  )}
                  {stream.userBanned && <Badge variant="destructive">banned creator</Badge>}
                </div>
                <p className="mt-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  <Link to={`/profile/${stream.username}`} className="hover:text-foreground">
                    @{stream.username}
                  </Link>
                  <span className="flex items-center gap-1">
                    <Users size={10} /> {stream.viewerCount}
                  </span>
                  <span>{formatDistanceToNow(new Date(stream.createdAt), { addSuffix: true })}</span>
                  {stream.category && <span>{stream.category}</span>}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Link to={`/watch/${stream.id}`} className="text-xs text-muted-foreground hover:text-foreground">
                  Open
                </Link>
                {stream.isLive && (
                  <Button size="sm" variant="glass" disabled={busyId === stream.id} onClick={() => void endStream(stream)}>
                    <WifiOff className="mr-1.5 h-3.5 w-3.5" /> End
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={busyId === stream.id}
                  onClick={() => void deleteStream(stream)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
