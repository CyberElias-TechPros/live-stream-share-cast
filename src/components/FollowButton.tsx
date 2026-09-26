import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { profileService } from '@/services/profileService';

interface FollowButtonProps {
  /** The user being followed. */
  userId: string;
  username?: string;
  size?: 'sm' | 'default' | 'lg';
  onCountChange?: (delta: number) => void;
}

/** Follow / unfollow with optimistic state, backed by `/api/users/:id/follow`. */
export default function FollowButton({ userId, username, size = 'default', onCountChange }: FollowButtonProps) {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isFollowing, setIsFollowing] = useState(false);
  const [busy, setBusy] = useState(false);

  const isSelf = !!user && user.id === userId;

  useEffect(() => {
    if (!isAuthenticated || isSelf) return;
    let cancelled = false;
    void profileService.isFollowing(user?.id ?? '', userId).then((following) => {
      if (!cancelled) setIsFollowing(following);
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isSelf, user?.id, userId]);

  if (isSelf) return null;

  const toggle = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    setBusy(true);
    const next = !isFollowing;
    setIsFollowing(next);
    const ok = next
      ? await profileService.followUser(user!.id, userId)
      : await profileService.unfollowUser(user!.id, userId);
    setBusy(false);

    if (!ok) {
      setIsFollowing(!next);
      toast({ title: next ? 'Could not follow' : 'Could not unfollow', variant: 'destructive' });
      return;
    }

    onCountChange?.(next ? 1 : -1);
    toast({
      title: next ? `Following ${username ? `@${username}` : 'channel'}` : 'Unfollowed',
      description: next ? 'You will be notified when they go live.' : undefined,
    });
  };

  return (
    <Button variant={isFollowing ? 'glass' : 'glow'} size={size} onClick={() => void toggle()} disabled={busy}>
      <Heart className={`h-4 w-4 ${isFollowing ? 'fill-current' : ''}`} />
      {isFollowing ? 'Following' : 'Follow'}
    </Button>
  );
}

/** Small inline link to a profile, used where the follow button is too wide. */
export function ProfileLink({ username }: { username: string }) {
  return (
    <Link to={`/profile/${username}`} className="hover:text-[hsl(var(--accent-hi))]">
      @{username}
    </Link>
  );
}
