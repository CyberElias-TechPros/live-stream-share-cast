import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Clock, Eye, Pencil, Play, Radio, Trash2, Video } from "lucide-react";
import { toast } from "sonner";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, PageLoader } from "@/components/States";
import { useSEO } from "@/hooks/useSEO";
import { useAuth } from "@/contexts/AuthContext";
import { api, absoluteUrl, ApiError } from "@/lib/api";
import { formatCount, formatDate } from "@/hooks/useElapsedSeconds";
import { cn } from "@/lib/utils";
import type { BroadcastSession, StreamWithLastSession } from "@/types";

const CATEGORIES = ["Gaming", "Music", "Talk", "Tech", "Art", "Sports", "Education", "IRL", "Other"];

export default function Dashboard() {
  useSEO({ title: "Dashboard", robots: "noindex" });
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | "live" | "offline">("all");

  const streamsQuery = useQuery({
    queryKey: ["streams", "mine"],
    queryFn: () => api.get<{ streams: StreamWithLastSession[] }>("/api/streams/mine"),
    select: (d) => d.streams,
  });

  const sessionsQuery = useQuery({
    queryKey: ["sessions", "mine"],
    queryFn: () => api.get<{ sessions: BroadcastSession[] }>("/api/sessions"),
    select: (d) => d.sessions,
  });

  const streams = streamsQuery.data ?? [];
  const filtered = streams.filter((s) =>
    filter === "all" ? true : filter === "live" ? s.isLive : !s.isLive
  );

  const liveNow = streams.filter((s) => s.isLive).length;
  const totalBroadcasts = sessionsQuery.data?.length ?? 0;
  const peakEver = Math.max(0, ...sessionsQuery.data?.map((s) => s.peakViewers) ?? [], ...streams.map((s) => s.peakViewers));
  const totalSeconds = sessionsQuery.data?.reduce((acc, s) => acc + (s.durationSeconds ?? 0), 0) ?? 0;

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/streams/${id}`),
    onSuccess: () => {
      toast.success("Stream deleted");
      void queryClient.invalidateQueries({ queryKey: ["streams", "mine"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Delete failed"),
  });

  if (streamsQuery.isLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navigation />
        <PageLoader label="Loading your studio" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navigation />
      <main className="container-app flex-1 py-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="micro">Creator dashboard</p>
            <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">
              Welcome back, {user?.displayName?.split(" ")[0] ?? "streamer"}
            </h1>
          </div>
          <Button asChild variant="live">
            <Link to="/studio">
              <Video className="h-4 w-4" aria-hidden="true" /> New broadcast
            </Link>
          </Button>
        </header>

        {/* stats */}
        <dl className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon={<Radio className="h-4 w-4" aria-hidden="true" />} label="Live right now" value={String(liveNow)} accent={liveNow > 0} />
          <StatCard icon={<Play className="h-4 w-4" aria-hidden="true" />} label="Total broadcasts" value={String(totalBroadcasts)} />
          <StatCard icon={<Eye className="h-4 w-4" aria-hidden="true" />} label="Peak viewers" value={formatCount(peakEver)} />
          <StatCard icon={<Clock className="h-4 w-4" aria-hidden="true" />} label="Time on air" value={formatCount(totalSeconds / 60) + "m"} />
        </dl>

        {/* streams */}
        <section className="mt-12" aria-labelledby="your-streams">
          <div className="flex items-center justify-between">
            <h2 id="your-streams" className="font-display text-xl font-semibold">
              Your streams
            </h2>
            <div className="flex gap-1 rounded-lg border border-line p-1">
              {(["all", "live", "offline"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  aria-pressed={filter === f}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors",
                    filter === f ? "bg-panel-2 text-text" : "text-text-faint hover:text-text"
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              className="mt-6"
              icon={<Video className="h-6 w-6" aria-hidden="true" />}
              title={filter === "all" ? "No streams yet" : `No ${filter} streams`}
              description="Your broadcasts live here — create your first stream and share the link with anyone."
              action={
                <Button asChild variant="live">
                  <Link to="/studio">Create a stream</Link>
                </Button>
              }
            />
          ) : (
            <ul className="mt-6 space-y-3">
              {filtered.map((stream) => (
                <li
                  key={stream.id}
                  className="panel flex flex-col gap-4 p-4 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {stream.isLive ? <Badge variant="live">Live</Badge> : <Badge>Offline</Badge>}
                      <h3 className="truncate font-display font-semibold">{stream.title}</h3>
                    </div>
                    <p className="mt-1 text-xs text-text-faint">
                      {stream.category} · created {formatDate(stream.createdAt)}
                      {stream.lastSession.peakViewers !== null && ` · last peak ${stream.lastSession.peakViewers} viewers`}
                      {stream.lastSession.durationSeconds !== null && ` · ${formatCount(stream.lastSession.durationSeconds / 60)}m on air`}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Copy link to ${stream.title}`}
                      onClick={async () => {
                        await navigator.clipboard.writeText(absoluteUrl(`/watch/${stream.id}`)).catch(() => {});
                        toast.success("Link copied");
                      }}
                    >
                      <Copy className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <EditStreamButton stream={stream} onSaved={() => queryClient.invalidateQueries({ queryKey: ["streams", "mine"] })} />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${stream.title}`}
                      className="text-live hover:bg-live/10"
                      disabled={stream.isLive}
                      onClick={() => {
                        if (window.confirm(`Delete "${stream.title}"? This can't be undone.`)) {
                          deleteMutation.mutate(stream.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    {stream.isLive ? (
                      <Button variant="live" size="sm" onClick={() => navigate("/studio")}>
                        Open studio
                      </Button>
                    ) : (
                      <Button asChild variant="outline" size="sm">
                        <Link to="/studio">Go live</Link>
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* broadcast history */}
        <section className="mt-12" aria-labelledby="history">
          <h2 id="history" className="font-display text-xl font-semibold">
            Broadcast history
          </h2>
          {sessionsQuery.data?.length ? (
            <ul className="panel mt-6 divide-y divide-line overflow-hidden">
              {sessionsQuery.data.slice(0, 10).map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium text-text">{s.streamTitle}</span>
                  <span className="text-text-faint tnum">{formatDate(s.startedAt)}</span>
                  <span className="text-text-muted tnum">
                    {s.durationSeconds !== null ? formatCount(s.durationSeconds / 60) + "m" : "live now"}
                  </span>
                  <span className="text-text-muted tnum">peak {s.peakViewers}</span>
                  <Button asChild variant="ghost" size="sm">
                    <Link to={`/watch/${s.streamId}`}>View</Link>
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-text-faint">Your broadcast history will appear after your first session.</p>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <div className={cn("panel p-4", accent && "border-live/30 bg-live/5")}>
      <dt className="micro flex items-center gap-1.5">
        <span className={accent ? "text-live" : ""}>{icon}</span>
        {label}
      </dt>
      <dd className="mt-2 font-display text-2xl font-bold tnum">{value}</dd>
    </div>
  );
}

function EditStreamButton({ stream, onSaved }: { stream: StreamWithLastSession; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(stream.title);
  const [description, setDescription] = useState(stream.description);
  const [category, setCategory] = useState(stream.category);
  const [tags, setTags] = useState(stream.tags.join(", "));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/api/streams/${stream.id}`, {
        title: title.trim(),
        description,
        category,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 10),
      });
      toast.success("Stream updated");
      setOpen(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button variant="ghost" size="icon" aria-label={`Edit ${stream.title}`} onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit stream</DialogTitle>
            <DialogDescription>Changes apply immediately — even mid-broadcast.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-title">Title</Label>
              <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-desc">Description</Label>
              <Textarea id="edit-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-tags">Tags</Label>
                <Input id="edit-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving || title.trim().length < 3}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
