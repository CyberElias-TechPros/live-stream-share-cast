import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PageLoader } from "@/components/States";
import { useSEO } from "@/hooks/useSEO";
import { useAuth } from "@/contexts/AuthContext";
import { api, ApiError } from "@/lib/api";
import { initialsOf } from "@/hooks/useElapsedSeconds";
import { cn } from "@/lib/utils";
import type { SocialLink } from "@/types";

const AVATAR_COLORS = ["#7C5CFF", "#FF3B30", "#FF8A3C", "#2DD4BF", "#38BDF8", "#F472B6", "#A3E635", "#FACC15"];
const PLATFORMS = ["website", "github", "x", "instagram", "youtube", "twitch", "tiktok", "mastodon"];

export default function Settings() {
  useSEO({ title: "Settings", robots: "noindex" });
  const { user, setUser } = useAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarColor, setAvatarColor] = useState(AVATAR_COLORS[0]!);
  const [links, setLinks] = useState<SocialLink[]>([]);
  const [resolution, setResolution] = useState<"1080p" | "720p" | "480p">("720p");
  const [fps, setFps] = useState<"24" | "30" | "60">("30");
  const [autoRecord, setAutoRecord] = useState(false);
  const [retention, setRetention] = useState<"24" | "48" | "72" | "168">("48");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName);
    setBio(user.bio);
    setAvatarColor(user.avatarColor);
    setLinks(user.socialLinks);
    const prefs = user.preferences?.streaming;
    if (prefs?.defaultResolution) setResolution(prefs.defaultResolution);
    if (prefs?.defaultFps) setFps(String(prefs.defaultFps) as "24" | "30" | "60");
    setAutoRecord(!!prefs?.autoRecord);
    if (prefs?.recordingRetentionHours) {
      const opts = ["24", "48", "72", "168"] as const;
      setRetention((opts.find((o) => Number(o) === prefs.recordingRetentionHours) ?? "48"));
    }
  }, [user]);

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navigation />
        <PageLoader />
      </div>
    );
  }

  const save = async () => {
    setSaving(true);
    try {
      const { user: updated } = await api.patch<{ user: import("@/types").PublicUser }>("/api/users/me", {
        displayName: displayName.trim(),
        bio,
        avatarColor,
        socialLinks: links.filter((l) => l.platform.trim() && l.url.trim()),
        preferences: {
          streaming: {
            defaultResolution: resolution,
            defaultFps: Number(fps),
            autoRecord,
            recordingRetentionHours: Number(retention),
          },
        },
      });
      // Merge back into the auth state (patch returns public fields only).
      setUser({ ...user, ...updated, preferences: user.preferences });
      toast.success("Settings saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Navigation />
      <main className="container-app max-w-3xl flex-1 py-10">
        <header className="mb-8">
          <p className="micro">Account</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">Settings</h1>
        </header>

        <form
          className="space-y-8"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {/* profile */}
          <section className="panel p-6" aria-labelledby="profile-section">
            <h2 id="profile-section" className="font-display text-lg font-semibold">Public profile</h2>

            <div className="mt-5 flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarFallback style={{ background: `${avatarColor}22`, color: avatarColor }} className="text-xl">
                  {initialsOf(displayName || user.username)}
                </AvatarFallback>
              </Avatar>
              <fieldset>
                <legend className="micro mb-2">Avatar color</legend>
                <div className="flex flex-wrap gap-2">
                  {AVATAR_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={avatarColor === c}
                      aria-label={`Avatar color ${c}`}
                      onClick={() => setAvatarColor(c)}
                      className={cn(
                        "h-7 w-7 rounded-full border-2 transition-transform hover:scale-110",
                        avatarColor === c ? "border-text scale-110" : "border-transparent"
                      )}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </fieldset>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="displayName">Display name</Label>
                <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={32} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="username">Username</Label>
                <Input id="username" value={`@${user.username}`} disabled aria-describedby="username-hint" />
                <p id="username-hint" className="text-xs text-text-faint">Usernames are permanent.</p>
              </div>
            </div>

            <div className="mt-4 space-y-1.5">
              <Label htmlFor="bio">Bio</Label>
              <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} rows={3} placeholder="Tell viewers what you stream…" />
            </div>

            <div className="mt-5">
              <Label>Links</Label>
              <div className="mt-2 space-y-2">
                {links.map((link, i) => (
                  <div key={i} className="flex gap-2">
                    <Select
                      value={link.platform}
                      onValueChange={(v) => setLinks((prev) => prev.map((l, j) => (j === i ? { ...l, platform: v } : l)))}
                    >
                      <SelectTrigger className="w-36" aria-label={`Platform for link ${i + 1}`}>
                        <SelectValue placeholder="Platform" />
                      </SelectTrigger>
                      <SelectContent>
                        {PLATFORMS.map((p) => (
                          <SelectItem key={p} value={p} className="capitalize">
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={link.url}
                      onChange={(e) => setLinks((prev) => prev.map((l, j) => (j === i ? { ...l, url: e.target.value } : l)))}
                      placeholder="https://…"
                      className="flex-1"
                      aria-label={`URL for link ${i + 1}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove link ${i + 1}`}
                      onClick={() => setLinks((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                ))}
                {links.length < 6 && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setLinks((prev) => [...prev, { platform: "website", url: "" }])}>
                    <Plus className="h-4 w-4" aria-hidden="true" /> Add link
                  </Button>
                )}
              </div>
            </div>
          </section>

          {/* streaming defaults */}
          <section className="panel p-6" aria-labelledby="streaming-section">
            <h2 id="streaming-section" className="font-display text-lg font-semibold">Streaming defaults</h2>
            <p className="mt-1 text-sm text-text-muted">Pre-fills the studio every time you go live.</p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Default resolution</Label>
                <Select value={resolution} onValueChange={(v) => setResolution(v as "1080p" | "720p" | "480p")}>
                  <SelectTrigger aria-label="Default resolution"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1080p">1080p</SelectItem>
                    <SelectItem value="720p">720p</SelectItem>
                    <SelectItem value="480p">480p</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Default frame rate</Label>
                <Select value={fps} onValueChange={(v) => setFps(v as "24" | "30" | "60")}>
                  <SelectTrigger aria-label="Default frame rate"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24">24 fps</SelectItem>
                    <SelectItem value="30">30 fps</SelectItem>
                    <SelectItem value="60">60 fps</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="pref-autorec" className="text-sm">Start recording automatically</Label>
                  <p className="mt-0.5 text-xs text-text-faint">Recordings save to your device (browser storage).</p>
                </div>
                <Switch id="pref-autorec" checked={autoRecord} onCheckedChange={setAutoRecord} />
              </div>
              <Separator />
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label className="text-sm">Cloud recording retention</Label>
                  <p className="mt-0.5 text-xs text-text-faint">
                    How long uploaded recordings are kept when cloud storage is configured for this deployment.
                  </p>
                </div>
                <Select value={retention} onValueChange={(v) => setRetention(v as "24" | "48" | "72" | "168")}>
                  <SelectTrigger className="w-40" aria-label="Recording retention"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24">24 hours</SelectItem>
                    <SelectItem value="48">48 hours</SelectItem>
                    <SelectItem value="72">3 days</SelectItem>
                    <SelectItem value="168">7 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => navigate(-1)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save settings"}</Button>
          </div>
        </form>
      </main>
      <Footer />
    </div>
  );
}
