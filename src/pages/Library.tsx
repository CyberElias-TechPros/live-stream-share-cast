import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Clock, Film, ImagePlus, Play, Search, ShieldAlert, Trash2, Pencil, Scissors, Eye, Lock, Globe, Link2 } from 'lucide-react';
import Navigation from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { recordingService } from '@/services/recordingService';
import { watchTracker } from '@/services/analyticsService';
import type { Recording } from '@/types';

const VISIBILITY_ICON = { public: Globe, unlisted: Link2, private: Lock } as const;

function formatDuration(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`;
}

export default function Library() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();

  const [scope, setScope] = useState<'all' | 'mine'>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'recent' | 'popular' | 'oldest'>('recent');
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Recording | null>(null);
  const [editing, setEditing] = useState<Recording | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const result =
      scope === 'mine' && isAuthenticated
        ? { recordings: await recordingService.mine(), total: 0 }
        : await recordingService.browse({ search: search || undefined, sort, limit: 48 });
    setRecordings(result.recordings);
    setLoading(false);
  }, [scope, search, sort, isAuthenticated]);

  useEffect(() => {
    void load();
  }, [load]);

  // Register watch sessions while a replay is open.
  useEffect(() => {
    if (!active) return;
    let tracker: { stop(): void } | null = null;
    let cancelled = false;

    void watchTracker.start({ recordingId: active.id }).then((handle) => {
      if (cancelled) handle?.stop();
      else tracker = handle;
    });

    return () => {
      cancelled = true;
      tracker?.stop();
    };
  }, [active]);

  const totalMinutes = useMemo(() => recordings.reduce((sum, item) => sum + (item.watchMinutes || 0), 0), [recordings]);

  const handleDelete = async (recording: Recording) => {
    if (!window.confirm(`Delete “${recording.title}”? The file is removed from storage.`)) return;
    const ok = await recordingService.remove(recording.id);
    toast({
      title: ok ? 'Recording deleted' : 'Could not delete recording',
      variant: ok ? undefined : 'destructive',
    });
    if (ok) setRecordings((current) => current.filter((item) => item.id !== recording.id));
  };

  const thumbInputRef = useRef<HTMLInputElement>(null);
  const [thumbTarget, setThumbTarget] = useState<Recording | null>(null);

  const handleThumbnailPick = async (file: File | undefined) => {
    const target = thumbTarget;
    setThumbTarget(null);
    if (!file || !target) return;

    if (!file.type.startsWith('image/')) {
      toast({ title: 'Pick an image file', variant: 'destructive' });
      return;
    }

    setUploading(true);
    const url = await recordingService.uploadThumbnail(target.id, file);
    setUploading(false);

    if (!url) {
      toast({ title: 'Could not upload the thumbnail', variant: 'destructive' });
      return;
    }
    setRecordings((current) => current.map((item) => (item.id === target.id ? { ...item, thumbnail: url } : item)));
    toast({ title: 'Thumbnail updated' });
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    const updated = await recordingService.update(editing.id, {
      title: editing.title,
      description: editing.description ?? undefined,
      visibility: editing.visibility,
      tags: editing.tags,
    });
    setSaving(false);
    if (!updated) {
      toast({ title: 'Could not save changes', variant: 'destructive' });
      return;
    }
    setRecordings((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    setEditing(null);
    toast({ title: 'Recording updated' });
  };

  const handleClip = async (recording: Recording) => {
    const start = Number(window.prompt('Clip start (seconds)', '0'));
    const end = Number(window.prompt('Clip end (seconds)', String(Math.min(recording.durationSeconds ?? 60, 60))));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;

    const clip = await recordingService.createClip(recording.id, {
      title: `${recording.title} — clip`,
      startSeconds: start,
      endSeconds: end,
      visibility: 'public',
    });
    if (!clip) {
      toast({ title: 'Could not create clip', variant: 'destructive' });
      return;
    }
    setRecordings((current) => [clip, ...current]);
    toast({ title: 'Clip created' });
  };

  return (
    <div className="relative min-h-svh bg-background">
      <div className="grain-fixed" />
      <div className="relative z-10 flex min-h-svh flex-col">
        <Navigation />

        <main className="flex-1 container pt-28 pb-16">
          <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="overline mb-3">Replays</p>
              <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
                The <span className="text-gradient">library</span>.
              </h1>
              <p className="mt-2 text-muted-foreground">
                {recordings.length} recording{recordings.length === 1 ? '' : 's'} · {Math.round(totalMinutes)} minutes watched
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value.slice(0, 80))}
                  placeholder="Search recordings…"
                  className="h-9 w-56 rounded-full border-white/10 bg-white/[0.05] pl-9 text-sm"
                />
              </div>

              <Select value={sort} onValueChange={(value) => setSort(value as typeof sort)}>
                <SelectTrigger className="h-9 w-[150px] rounded-full border-white/10 bg-white/[0.05]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Newest first</SelectItem>
                  <SelectItem value="popular">Most watched</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                </SelectContent>
              </Select>

              {isAuthenticated && (
                <Tabs value={scope} onValueChange={(value) => setScope(value as typeof scope)}>
                  <TabsList>
                    <TabsTrigger value="all">Everyone</TabsTrigger>
                    <TabsTrigger value="mine">Mine</TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
            </div>
          </div>

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={index} className="h-56 w-full rounded-2xl" />
              ))}
            </div>
          ) : recordings.length === 0 ? (
            <Card className="rounded-2xl border-white/8 bg-card/70">
              <CardContent className="flex flex-col items-center gap-3 py-20 text-center">
                <Film className="h-10 w-10 text-muted-foreground" />
                <p className="font-medium">No recordings yet</p>
                <p className="max-w-md text-sm text-muted-foreground">
                  Broadcasts with recording enabled are saved here automatically for {''}
                  your retention window, then expire on their own.
                </p>
                <Button variant="glass" size="sm" asChild>
                  <Link to="/stream">Find something live</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {recordings.map((recording) => {
                const VisibilityIcon = VISIBILITY_ICON[recording.visibility] ?? Globe;
                return (
                  <Card
                    key={recording.id}
                    className="group overflow-hidden rounded-2xl border-white/8 bg-card/70 backdrop-blur-md transition-colors hover:border-white/20"
                  >
                    <button type="button" className="relative block aspect-video w-full bg-muted" onClick={() => setActive(recording)}>
                      {recording.thumbnail ? (
                        <img src={recording.thumbnail} alt={recording.title} className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <span className="grid h-full w-full place-items-center">
                          <Film className="h-10 w-10 text-muted-foreground opacity-30" />
                        </span>
                      )}
                      <span className="absolute inset-0 grid place-items-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                        <Play className="h-10 w-10 fill-white text-white" />
                      </span>
                      <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white">
                        {formatDuration(recording.durationSeconds)}
                      </span>
                      {recording.isMature && (
                        <span className="absolute left-2 top-2">
                          <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                            <ShieldAlert className="mr-1 h-3 w-3" /> 18+
                          </Badge>
                        </span>
                      )}
                      {recording.isClip && (
                        <span className="absolute right-2 top-2">
                          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                            <Scissors className="mr-1 h-3 w-3" /> Clip
                          </Badge>
                        </span>
                      )}
                    </button>

                    <CardContent className="space-y-2 pt-4">
                      <h3 className="line-clamp-2 text-sm font-semibold">{recording.title}</h3>
                      <p className="flex items-center gap-2 text-xs text-muted-foreground">
                        <VisibilityIcon className="h-3 w-3" />
                        {recording.visibility}
                        <span>·</span>
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(recording.createdAt, { addSuffix: true })}
                      </p>
                      <p className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Eye className="h-3 w-3" /> {recording.views}
                        </span>
                        {recording.username && (
                          <Link to={`/profile/${recording.username}`} className="truncate hover:text-foreground">
                            @{recording.username}
                          </Link>
                        )}
                      </p>

                      {recording.isOwner && (
                        <div className="flex gap-2 pt-1">
                          <Button variant="glass" size="sm" className="flex-1" onClick={() => setEditing(recording)}>
                            <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                          </Button>
                          <Button variant="glass" size="sm" onClick={() => void handleClip(recording)} title="Create a clip">
                            <Scissors className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="glass"
                            size="sm"
                            title="Upload a thumbnail"
                            onClick={() => {
                              setThumbTarget(recording);
                              thumbInputRef.current?.click();
                            }}
                          >
                            <ImagePlus className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="glass"
                            size="sm"
                            onClick={() => void handleDelete(recording)}
                            className="text-destructive hover:text-destructive"
                            title="Delete recording"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </main>

        <input
          ref={thumbInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            void handleThumbnailPick(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        {uploading && <span className="sr-only">Uploading thumbnail</span>}
      </div>

      {/* Player */}
      <Dialog open={!!active} onOpenChange={(open) => !open && setActive(null)}>
        <DialogContent className="max-w-4xl rounded-2xl border-white/10 bg-[hsl(252_36%_6%/0.98)]">
          <DialogHeader>
            <DialogTitle className="line-clamp-2 pr-6 text-left">{active?.title}</DialogTitle>
          </DialogHeader>
          {active?.url ? (
            <video
              key={active.id}
              src={active.url}
              poster={active.thumbnail ?? undefined}
              controls
              autoPlay
              playsInline
              className="aspect-video w-full rounded-xl bg-black"
            />
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">
              This recording is still processing — it will be playable shortly.
            </p>
          )}
          {active?.description && <p className="text-sm text-muted-foreground">{active.description}</p>}
        </DialogContent>
      </Dialog>

      {/* Editor */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="rounded-2xl border-white/10 bg-[hsl(252_36%_6%/0.98)]">
          <DialogHeader>
            <DialogTitle>Edit recording</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="recording-title">Title</Label>
                <Input
                  id="recording-title"
                  value={editing.title}
                  maxLength={140}
                  onChange={(event) => setEditing({ ...editing, title: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="recording-description">Description</Label>
                <Input
                  id="recording-description"
                  value={editing.description ?? ''}
                  maxLength={2000}
                  onChange={(event) => setEditing({ ...editing, description: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Visibility</Label>
                <Select
                  value={editing.visibility}
                  onValueChange={(value) => setEditing({ ...editing, visibility: value as Recording['visibility'] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public — listed in the library</SelectItem>
                    <SelectItem value="unlisted">Unlisted — only with the link</SelectItem>
                    <SelectItem value="private">Private — only you</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="glass" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button variant="glow" onClick={() => void handleSave()} disabled={saving}>
                  {saving ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
