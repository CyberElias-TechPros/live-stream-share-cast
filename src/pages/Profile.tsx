import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ExternalLink, Radio, UserCheck, UserPlus, Video } from "lucide-react";
import { toast } from "sonner";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { StreamCard } from "@/components/StreamCard";
import { EmptyState, ErrorState, PageLoader } from "@/components/States";
import { useSEO } from "@/hooks/useSEO";
import { useAuth } from "@/contexts/AuthContext";
import { api, ApiError } from "@/lib/api";
import { formatCount, formatDate, initialsOf } from "@/hooks/useElapsedSeconds";
import type { Profile as ProfileType, Stream } from "@/types";

export default function Profile() {
  const { username = "" } = useParams<{ username: string }>();
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  useSEO({
    title: `${username} on I'm Live`,
    description: `Watch ${username}'s streams and follow them on I'm Live — instant browser-based live video.`,
    image: "/og-profile.png",
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["profile-full", username],
    queryFn: () => api.get<{ profile: ProfileType; streams: Stream[] }>(`/api/users/${username}`),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });

  const profile = data?.profile;
  const streams = data?.streams ?? [];
  const liveStreams = streams.filter((s) => s.isLive);
  const offlineStreams = streams.filter((s) => !s.isLive);

  const [busy, setBusy] = useState(false);

  const toggleFollow = async () => {
    if (!profile || busy) return;
    if (!isAuthenticated) {
      toast("Sign in to follow streamers");
      return;
    }
    setBusy(true);
    try {
      const res = profile.isFollowing
        ? await api.delete<{ following: boolean }>(`/api/users/${profile.username}/follow`)
        : await api.post<{ following: boolean }>(`/api/users/${profile.username}/follow`);
      toast.success(res.following ? `Following ${profile.displayName}` : `Unfollowed ${profile.displayName}`);
      void queryClient.invalidateQueries({ queryKey: ["profile-full", username] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update follow");
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navigation />
        <PageLoader label="Loading profile" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navigation />
        <main className="container-app flex flex-1 items-center justify-center py-16">
          <ErrorState
            title="Profile not found"
            message="This streamer doesn't exist (yet). Usernames are unique — check the spelling."
            action={
              <Button asChild variant="outline">
                <Link to="/browse">Browse live streams</Link>
              </Button>
            }
          />
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navigation />
      <main className="flex-1">
        {/* header band */}
        <section
          className="relative overflow-hidden border-b border-line"
          style={{
            background: `linear-gradient(180deg, ${profile.avatarColor}14 0%, transparent 70%)`,
          }}
          aria-label={`${profile.displayName} profile`}
        >
          <div className="grid-bg absolute inset-0 opacity-50" aria-hidden="true" />
          <div className="container-app relative flex flex-col gap-6 py-12 sm:flex-row sm:items-center">
            <Avatar className="h-24 w-24 border-2">
              <AvatarFallback style={{ background: `${profile.avatarColor}22`, color: profile.avatarColor }} className="text-3xl font-display">
                {initialsOf(profile.displayName || profile.username)}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-display text-3xl font-bold tracking-tight">{profile.displayName}</h1>
                {liveStreams.length > 0 && (
                  <Link to={`/watch/${liveStreams[0]!.id}`}>
                    <Badge variant="live" className="animate-pulse-soft">● Live now</Badge>
                  </Link>
                )}
              </div>
              <p className="mt-0.5 text-sm text-text-muted">@{profile.username}</p>
              {profile.bio && <p className="mt-3 max-w-xl text-sm leading-relaxed text-text-muted">{profile.bio}</p>}

              <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
                <div className="flex gap-1.5">
                  <dt className="text-text-faint">Followers</dt>
                  <dd className="font-semibold tnum">{formatCount(profile.followersCount)}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-text-faint">Broadcasts</dt>
                  <dd className="font-semibold tnum">{formatCount(profile.broadcastCount)}</dd>
                </div>
                <div className="flex items-center gap-1.5 text-text-faint">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                  <dd>Joined {formatDate(profile.createdAt)}</dd>
                </div>
              </dl>

              {profile.socialLinks.length > 0 && (
                <ul className="mt-4 flex flex-wrap gap-2" aria-label="External links">
                  {profile.socialLinks.map((link) => (
                    <li key={link.url}>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs text-text-muted transition-colors hover:border-line-strong hover:text-text"
                      >
                        <span className="capitalize">{link.platform}</span>
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {!profile.isSelf && (
              <div className="sm:self-center">
                <Button
                  variant={profile.isFollowing ? "outline" : "accent"}
                  onClick={() => void toggleFollow()}
                  disabled={busy}
                >
                  {profile.isFollowing ? (
                    <>
                      <UserCheck className="h-4 w-4" aria-hidden="true" /> Following
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4" aria-hidden="true" /> Follow
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </section>

        {/* streams */}
        <div className="container-app py-10">
          {liveStreams.length > 0 && (
            <section aria-labelledby="live-now">
              <h2 id="live-now" className="micro mb-4 flex items-center gap-2">
                <span className="live-dot" aria-hidden="true" /> Live now
              </h2>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {liveStreams.map((s) => (
                  <StreamCard key={s.id} stream={s} />
                ))}
              </div>
            </section>
          )}

          <section className={liveStreams.length > 0 ? "mt-12" : ""} aria-labelledby="all-streams">
            <h2 id="all-streams" className="micro mb-4">Streams</h2>
            {offlineStreams.length > 0 ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {offlineStreams.map((s) => (
                  <StreamCard key={s.id} stream={s} />
                ))}
              </div>
            ) : liveStreams.length === 0 ? (
              <EmptyState
                icon={<Video className="h-6 w-6" aria-hidden="true" />}
                title="No streams yet"
                description="When this streamer creates broadcasts, they'll show up here."
                action={
                  profile.isSelf ? (
                    <Button asChild variant="live">
                      <Link to="/studio">
                        <Radio className="h-4 w-4" aria-hidden="true" /> Go live
                      </Link>
                    </Button>
                  ) : undefined
                }
              />
            ) : null}
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
