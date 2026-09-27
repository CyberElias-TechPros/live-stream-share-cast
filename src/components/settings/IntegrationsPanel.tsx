import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Copy, Plug, Plus, RefreshCw, Send, Trash2, Webhook } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { integrationService, type WebhookEndpoint } from '@/services/integrationService';
import { platformService } from '@/services/platformService';

/**
 * Creator integrations: signed outbound webhooks.
 *
 * Secrets are shown once (on create and on rotate) exactly like personal API
 * tokens, so the panel keeps the "copy it now" alert visible until dismissed.
 */
export default function IntegrationsPanel() {
  const { toast } = useToast();

  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [catalogue, setCatalogue] = useState<Array<{ id: string; description?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [enabledOnDeployment, setEnabledOnDeployment] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([integrationService.webhooks(), integrationService.events(), platformService.getConfig()]).then(
      ([list, events, config]) => {
        if (cancelled) return;
        setEndpoints(list);
        setCatalogue(events);
        setSelected(events.map((event) => event.id));
        setEnabledOnDeployment(config ? config.features.webhooks : true);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const reload = async () => {
    setEndpoints(await integrationService.webhooks());
  };

  const create = async () => {
    if (!/^https:\/\//i.test(url.trim())) {
      toast({ title: 'Use an https:// endpoint', variant: 'destructive' });
      return;
    }
    setCreating(true);
    const created = await integrationService.create({ url: url.trim(), events: selected });
    setCreating(false);

    if (!created) {
      toast({ title: 'Could not add the endpoint', description: 'Check the URL and try again.', variant: 'destructive' });
      return;
    }

    setEndpoints((current) => [created.endpoint, ...current]);
    setSecret(created.secret);
    setUrl('');
    toast({ title: 'Endpoint added', description: 'Copy the signing secret now — it is never shown again.' });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="h-4 w-4" /> Outbound webhooks
          </CardTitle>
          <CardDescription>
            Push platform events to Discord, Slack, Zapier, n8n or your own bot. Every request is signed with{' '}
            <code className="font-mono text-xs">X-LSC-Signature: sha256=…</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {!enabledOnDeployment && (
            <Alert>
              <Plug className="h-4 w-4" />
              <AlertTitle>Webhooks are switched off on this deployment</AlertTitle>
              <AlertDescription>An operator can enable them with FEATURE_WEBHOOKS=true.</AlertDescription>
            </Alert>
          )}

          {secret && (
            <Alert className="border-[hsl(var(--accent-mid)_/_0.4)]">
              <AlertTitle>Copy your signing secret now</AlertTitle>
              <AlertDescription className="space-y-2">
                <code className="block break-all rounded bg-black/40 p-2 font-mono text-xs">{secret}</code>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="glass"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(secret);
                        toast({ title: 'Secret copied' });
                      } catch {
                        toast({ title: 'Could not copy', variant: 'destructive' });
                      }
                    }}
                  >
                    <Copy className="mr-2 h-3.5 w-3.5" /> Copy
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSecret(null)}>
                    Done
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Verify deliveries by hashing <code className="font-mono">{'`${timestamp}.${rawBody}`'}</code> with HMAC-SHA256 and
                  comparing against the header.
                </p>
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="webhook-url">Endpoint URL</Label>
              <Input
                id="webhook-url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com/hooks/live"
                disabled={!enabledOnDeployment}
              />
            </div>

            {catalogue.length > 0 && (
              <div className="space-y-2">
                <Label>Events</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {catalogue.map((event) => (
                    <label key={event.id} className="flex items-start gap-2 rounded-lg border p-2 text-sm">
                      <Checkbox
                        checked={selected.includes(event.id)}
                        onCheckedChange={(checked) =>
                          setSelected((current) => (checked ? [...current, event.id] : current.filter((item) => item !== event.id)))
                        }
                      />
                      <span>
                        <span className="font-mono text-xs">{event.id}</span>
                        {event.description && <span className="block text-xs text-muted-foreground">{event.description}</span>}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <Button variant="glow" onClick={() => void create()} disabled={creating || !url.trim() || !enabledOnDeployment}>
              <Plus className="mr-2 h-4 w-4" /> {creating ? 'Adding…' : 'Add endpoint'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your endpoints</CardTitle>
          <CardDescription>Deliveries pause automatically after 20 consecutive failures.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            [1, 2].map((index) => <Skeleton key={index} className="h-24 w-full rounded-xl" />)
          ) : endpoints.length === 0 ? (
            <p className="text-sm text-muted-foreground">No endpoints yet.</p>
          ) : (
            endpoints.map((endpoint) => (
              <div key={endpoint.id} className="rounded-xl border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs">{endpoint.url}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {endpoint.events.length ? `${endpoint.events.length} events` : 'all events'} ·{' '}
                      {endpoint.lastDeliveryAt
                        ? `last delivery ${formatDistanceToNow(endpoint.lastDeliveryAt, { addSuffix: true })}`
                        : 'never delivered'}
                      {endpoint.lastStatus ? ` · HTTP ${endpoint.lastStatus}` : ''}
                      {endpoint.failureCount > 0 ? ` · ${endpoint.failureCount} failures` : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={endpoint.enabled}
                      aria-label={`Toggle ${endpoint.url}`}
                      onCheckedChange={async (checked) => {
                        const ok = await integrationService.update(endpoint.id, { enabled: checked });
                        if (ok) {
                          setEndpoints((current) => current.map((item) => (item.id === endpoint.id ? { ...item, enabled: checked } : item)));
                        } else {
                          toast({ title: 'Could not update the endpoint', variant: 'destructive' });
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      variant="glass"
                      onClick={async () => {
                        const result = await integrationService.test(endpoint.id);
                        await reload();
                        toast({
                          title: result.ok ? `Test delivered (HTTP ${result.status})` : 'Test delivery failed',
                          description: result.ok ? 'Your receiver accepted the payload.' : result.error ?? `HTTP ${result.status}`,
                          variant: result.ok ? undefined : 'destructive',
                        });
                      }}
                    >
                      <Send className="mr-1.5 h-3.5 w-3.5" /> Test
                    </Button>
                    <Button
                      size="sm"
                      variant="glass"
                      title="Rotate the signing secret"
                      onClick={async () => {
                        const rotated = await integrationService.rotate(endpoint.id);
                        if (rotated) setSecret(rotated);
                        else toast({ title: 'Could not rotate the secret', variant: 'destructive' });
                      }}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={async () => {
                        if (!window.confirm(`Delete the endpoint ${endpoint.url}?`)) return;
                        const ok = await integrationService.remove(endpoint.id);
                        if (ok) setEndpoints((current) => current.filter((item) => item.id !== endpoint.id));
                        else toast({ title: 'Could not delete the endpoint', variant: 'destructive' });
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payload shape</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <pre className="overflow-auto rounded-xl bg-black/40 p-3 font-mono text-[11px] leading-relaxed">
{`{
  "id": "evt_…",
  "event": "stream.live",
  "occurredAt": "2026-09-26T12:00:00.000Z",
  "data": { "streamId": "…", "title": "…", "url": "…" }
}`}
          </pre>
          <p className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-[10px]">
              X-LSC-Event
            </Badge>
            <Badge variant="outline" className="font-mono text-[10px]">
              X-LSC-Timestamp
            </Badge>
            <Badge variant="outline" className="font-mono text-[10px]">
              X-LSC-Signature
            </Badge>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
