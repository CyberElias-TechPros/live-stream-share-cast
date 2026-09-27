import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Radio } from 'lucide-react';
import { searchService } from '@/services/searchService';

/**
 * Live platform activity, straight from `GET /api/search/live`.
 *
 * Used on the landing hero and the auth screens — anywhere that would
 * otherwise need a hardcoded "creators online" marketing number.
 */
function useLiveNow() {
  const { data } = useQuery({
    queryKey: ['search', 'live-now'],
    queryFn: () => searchService.liveNow(),
    refetchInterval: 60_000,
    staleTime: 45_000,
  });

  return { live: data?.live ?? 0, viewers: data?.viewers ?? 0 };
}

export default function LiveNow({ variant = 'pill' }: { variant?: 'pill' | 'card' }) {
  const { live, viewers } = useLiveNow();
  const format = (value: number) => new Intl.NumberFormat().format(value);

  if (variant === 'card') {
    return (
      <Link to="/stream" className="glass block rounded-2xl p-5 transition-colors hover:border-white/20">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-signature-soft ring-1 ring-white/10">
            <Radio className="h-4 w-4 text-[hsl(var(--accent-hi))]" />
          </span>
          <p className="text-sm text-muted-foreground">
            {live > 0 ? (
              <>
                <span className="font-semibold text-foreground">
                  {format(live)} {live === 1 ? 'channel' : 'channels'} live
                </span>{' '}
                {viewers > 0 ? `· ${format(viewers)} watching right now` : 'right now'}
              </>
            ) : (
              <>
                <span className="font-semibold text-foreground">The airwaves are open</span> — no one is broadcasting right now
              </>
            )}
          </p>
        </div>
      </Link>
    );
  }

  return (
    <Link
      to="/stream"
      className="mb-7 inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 backdrop-blur-md transition-colors hover:border-white/25"
    >
      <span className="relative flex h-2 w-2">
        {live > 0 && <span className="absolute inline-flex h-full w-full rounded-full bg-live opacity-75 animate-ping" />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${live > 0 ? 'bg-live' : 'bg-muted-foreground'}`} />
      </span>
      <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        {live > 0
          ? `${format(live)} live now · ${format(viewers)} watching`
          : 'No one is live right now — be the first'}
      </span>
    </Link>
  );
}
