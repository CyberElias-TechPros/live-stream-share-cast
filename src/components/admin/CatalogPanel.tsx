import { useCallback, useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { BadgeDollarSign, FolderTree, Plus, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { adminService, type AdminCategory, type AdminPayments } from '@/services/adminService';

function money(cents: number, currency = 'usd') {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

/**
 * Catalog + revenue: the category list creators pick from, and the tip ledger
 * an operator needs when reconciling payouts.
 */
export default function CatalogPanel() {
  const { toast } = useToast();
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [payments, setPayments] = useState<AdminPayments | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({ slug: '', name: '', emoji: '', description: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [categoryList, paymentsData] = await Promise.all([adminService.categories(), adminService.payments(25)]);
    setCategories(categoryList);
    setPayments(paymentsData);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    const slug = draft.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const name = draft.name.trim();
    if (!slug || !name) {
      toast({ title: 'A slug and a name are required', variant: 'destructive' });
      return;
    }

    setSaving(true);
    const ok = await adminService.createCategory({
      slug,
      name,
      emoji: draft.emoji.trim() || undefined,
      description: draft.description.trim() || undefined,
    });
    setSaving(false);

    if (!ok) {
      toast({ title: 'Could not create the category', description: 'It may already exist.', variant: 'destructive' });
      return;
    }
    setDraft({ slug: '', name: '', emoji: '', description: '' });
    toast({ title: 'Category added', description: 'Creators can pick it immediately.' });
    await load();
  };

  const toggle = async (category: AdminCategory, isActive: boolean) => {
    const ok = await adminService.updateCategory(category.slug, { isActive });
    if (!ok) {
      toast({ title: 'Could not update the category', variant: 'destructive' });
      return;
    }
    setCategories((current) => current.map((item) => (item.slug === category.slug ? { ...item, isActive } : item)));
  };

  const rename = async (category: AdminCategory) => {
    const name = window.prompt('Category name', category.name);
    if (name === null || !name.trim() || name.trim() === category.name) return;

    const ok = await adminService.updateCategory(category.slug, { name: name.trim() });
    if (!ok) {
      toast({ title: 'Could not rename the category', variant: 'destructive' });
      return;
    }
    setCategories((current) => current.map((item) => (item.slug === category.slug ? { ...item, name: name.trim() } : item)));
    toast({ title: 'Category renamed' });
  };

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border-white/8 bg-card/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderTree className="h-4 w-4" /> Categories
          </CardTitle>
          <CardDescription>Shown on the create-stream form, the browse filters and search.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="category-slug">Slug</Label>
              <Input
                id="category-slug"
                value={draft.slug}
                placeholder="music"
                onChange={(event) => setDraft((current) => ({ ...current, slug: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category-name">Name</Label>
              <Input
                id="category-name"
                value={draft.name}
                placeholder="Music"
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category-emoji">Emoji</Label>
              <Input
                id="category-emoji"
                value={draft.emoji}
                placeholder="🎸"
                onChange={(event) => setDraft((current) => ({ ...current, emoji: event.target.value }))}
              />
            </div>
            <div className="flex items-end">
              <Button variant="glow" className="w-full" disabled={saving} onClick={() => void create()}>
                <Plus className="mr-2 h-4 w-4" /> {saving ? 'Adding…' : 'Add category'}
              </Button>
            </div>
          </div>

          {loading ? (
            [1, 2].map((index) => <Skeleton key={index} className="h-12 w-full rounded-xl" />)
          ) : categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">No categories yet — the create form falls back to free text.</p>
          ) : (
            <div className="space-y-2">
              {categories.map((category) => (
                <div key={category.slug} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {category.emoji ? `${category.emoji} ` : ''}
                      {category.name}
                      <span className="ml-2 font-mono text-[10px] text-muted-foreground">{category.slug}</span>
                    </p>
                    {category.description && <p className="mt-0.5 truncate text-xs text-muted-foreground">{category.description}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    <Button size="sm" variant="ghost" onClick={() => void rename(category)}>
                      <Save className="mr-1.5 h-3.5 w-3.5" /> Rename
                    </Button>
                    <Switch
                      checked={category.isActive}
                      aria-label={`Toggle ${category.name}`}
                      onCheckedChange={(checked) => void toggle(category, checked)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-white/8 bg-card/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BadgeDollarSign className="h-4 w-4" /> Tips ledger
          </CardTitle>
          <CardDescription>
            {payments
              ? `${payments.totals.paidCount} paid · ${payments.totals.pendingCount} pending · ${money(payments.totals.paidCents)} collected`
              : 'Payment provider is optional — the ledger stays empty until tips are enabled.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            [1, 2].map((index) => <Skeleton key={index} className="h-12 w-full rounded-xl" />)
          ) : (payments?.tips.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No tips recorded yet.</p>
          ) : (
            payments!.tips.map((tip) => (
              <div key={tip.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {money(tip.amountCents, tip.currency)} · @{tip.tipperUsername ?? 'unknown'} → @{tip.streamerUsername ?? 'unknown'}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    {formatDistanceToNow(new Date(tip.createdAt), { addSuffix: true })}
                    {tip.provider ? ` · ${tip.provider}` : ''}
                  </p>
                </div>
                <Badge variant={tip.status === 'paid' ? 'secondary' : tip.status === 'pending' ? 'outline' : 'destructive'}>{tip.status}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
