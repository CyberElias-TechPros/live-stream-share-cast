import { useEffect, useState } from 'react';
import { ExternalLink, Heart, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { tipService } from '@/services/tipService';
import type { TipConfig } from '@/types';

interface TipButtonProps {
  streamerId: string;
  streamerName?: string;
  streamId?: string;
  recordingId?: string;
  size?: 'sm' | 'default' | 'lg';
  variant?: 'glow' | 'glass' | 'outline';
}

function formatCents(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

/**
 * Tip / donate button.
 *
 * When the operator has configured a payment provider the button opens a
 * checkout; otherwise it falls back to the creator's external donation link so
 * creators can still be supported before keys are added.
 */
export default function TipButton({ streamerId, streamerName, streamId, recordingId, size = 'default', variant = 'glass' }: TipButtonProps) {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();

  const [config, setConfig] = useState<TipConfig | null>(null);
  const [open, setOpen] = useState(false);
  const [presets, setPresets] = useState<number[]>([]);
  const [amountCents, setAmountCents] = useState(500);
  const [customAmount, setCustomAmount] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [donationUrl, setDonationUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([tipService.config(), tipService.presets(), tipService.creatorDonationLink(streamerId)]).then(
      ([loadedConfig, loadedPresets, link]) => {
        if (cancelled) return;
        setConfig(loadedConfig);
        setPresets(loadedPresets.presets);
        setDonationUrl(link);
        setAmountCents(loadedPresets.presets[1] ?? loadedPresets.presets[0] ?? 500);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [streamerId]);

  // Nothing to offer when tips are off and the creator has no donation link.
  if (config && !config.enabled && !donationUrl) return null;

  const currency = config?.currency ?? 'USD';

  const submit = async () => {
    if (!isAuthenticated) {
      toast({ title: 'Sign in to send a tip', variant: 'destructive' });
      return;
    }

    const cents = customAmount ? Math.round(Number(customAmount) * 100) : amountCents;
    if (!Number.isFinite(cents) || cents < (config?.minTipCents ?? 100)) {
      toast({ title: `Minimum tip is ${formatCents(config?.minTipCents ?? 100, currency)}`, variant: 'destructive' });
      return;
    }

    setBusy(true);
    const result = await tipService.sendTip({ streamerId, amountCents: cents, message: message.trim() || undefined, streamId, recordingId });
    setBusy(false);

    if (!result) {
      toast({ title: 'Could not start the payment', variant: 'destructive' });
      return;
    }

    if (result.checkoutUrl) {
      window.open(result.checkoutUrl, '_blank', 'noopener');
      setOpen(false);
      toast({ title: 'Checkout opened', description: 'Complete the payment in the new tab — the alert lands in chat automatically.' });
      return;
    }

    setOpen(false);
    toast({ title: 'Tip recorded', description: 'It will appear once the provider confirms the payment.' });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size}>
          <Heart className="h-4 w-4" />
          <span className="ml-2">Tip</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-2xl border-white/10 bg-[hsl(252_36%_6%/0.98)]">
        <DialogHeader>
          <DialogTitle>Support {streamerName || 'this creator'}</DialogTitle>
          <DialogDescription>
            {config?.enabled
              ? 'Tips are processed by our payment provider and announced in the chat.'
              : 'Card payments are not enabled on this deployment yet.'}
          </DialogDescription>
        </DialogHeader>

        {config?.enabled ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {(presets.length ? presets : [200, 500, 1000, 2500, 5000]).map((cents) => (
                <Button
                  key={cents}
                  variant={!customAmount && amountCents === cents ? 'glow' : 'glass'}
                  size="sm"
                  onClick={() => {
                    setAmountCents(cents);
                    setCustomAmount('');
                  }}
                >
                  {formatCents(cents, currency)}
                </Button>
              ))}
            </div>

            <div className="space-y-2">
              <Label htmlFor="tip-custom">Custom amount ({currency})</Label>
              <Input
                id="tip-custom"
                type="number"
                min={((config?.minTipCents ?? 100) / 100).toFixed(2)}
                step="0.01"
                value={customAmount}
                onChange={(event) => setCustomAmount(event.target.value)}
                placeholder="10.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tip-message">Message (optional)</Label>
              <Textarea
                id="tip-message"
                rows={2}
                maxLength={280}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Great stream!"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="glass" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="glow" onClick={() => void submit()} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className="h-4 w-4" />}
                <span className="ml-2">Send {customAmount ? formatCents(Math.round(Number(customAmount) * 100) || 0, currency) : formatCents(amountCents, currency)}</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {streamerName || 'This creator'} accepts support through their own page instead.
            </p>
            {donationUrl ? (
              <Button variant="glow" className="w-full" asChild>
                <a href={donationUrl} target="_blank" rel="noreferrer noopener">
                  <ExternalLink className="mr-2 h-4 w-4" /> Open donation page
                </a>
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Subscribe and share the stream — that support counts just as much today.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
