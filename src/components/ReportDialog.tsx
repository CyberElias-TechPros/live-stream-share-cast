import { useState } from 'react';
import { Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { moderationService, REPORT_REASONS, type ReportReason } from '@/services/moderationService';

interface ReportDialogProps {
  targetType: 'user' | 'stream' | 'chat_message' | 'recording';
  targetId: string;
  label?: string;
  variant?: 'ghost' | 'glass' | 'outline';
  iconOnly?: boolean;
}

const REASON_LABELS: Record<ReportReason, string> = {
  spam: 'Spam or scam',
  harassment: 'Harassment or bullying',
  hate_speech: 'Hate speech',
  violence: 'Violence or threats',
  sexual_content: 'Sexual content',
  copyright: 'Copyright infringement',
  impersonation: 'Impersonation',
  other: 'Something else',
};

export default function ReportDialog({ targetType, targetId, label = 'Report', variant = 'ghost', iconOnly = false }: ReportDialogProps) {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>('spam');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!isAuthenticated) {
      toast({ title: 'Sign in to report content', variant: 'destructive' });
      return;
    }

    setBusy(true);
    const ok = await moderationService.report({ targetType, targetId, reason, details: details.trim() || undefined });
    setBusy(false);

    if (!ok) {
      toast({ title: 'Could not submit the report', description: 'It may already be under review.', variant: 'destructive' });
      return;
    }

    setOpen(false);
    setDetails('');
    toast({ title: 'Report submitted', description: 'Our moderators will review it shortly.' });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={iconOnly ? 'icon' : 'default'} className={iconOnly ? 'rounded-full' : undefined} aria-label={label}>
          <Flag className="h-4 w-4" />
          {!iconOnly && <span className="ml-2">{label}</span>}
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-2xl border-white/10 bg-[hsl(252_36%_6%/0.98)]">
        <DialogHeader>
          <DialogTitle>Report {targetType.replace(/_/g, ' ')}</DialogTitle>
          <DialogDescription>Reports are anonymous to the person you are reporting.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Reason</Label>
            <Select value={reason} onValueChange={(value) => setReason(value as ReportReason)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPORT_REASONS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {REASON_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="report-details">Details (optional)</Label>
            <Textarea
              id="report-details"
              value={details}
              rows={3}
              maxLength={2000}
              onChange={(event) => setDetails(event.target.value)}
              placeholder="Anything that helps us review faster."
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="glass" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="glow" onClick={() => void submit()} disabled={busy}>
              {busy ? 'Sending…' : 'Submit report'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
