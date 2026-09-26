import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LifeBuoy, Mail, ScrollText, ShieldCheck } from 'lucide-react';
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { platformService } from '@/services/platformService';
import { DELETION_GRACE_DAYS } from '@/services/accountService';
import type { PlatformConfig } from '@/types';

type Kind = 'terms' | 'privacy' | 'help';

const HEADINGS: Record<Kind, { overline: string; title: string; lead: string; icon: typeof ScrollText }> = {
  terms: {
    overline: 'Legal',
    title: 'Terms of Service',
    lead: 'The rules that keep the platform usable for everyone.',
    icon: ScrollText,
  },
  privacy: {
    overline: 'Legal',
    title: 'Privacy Policy',
    lead: 'What we store, why we store it, and how to take it with you or delete it.',
    icon: ShieldCheck,
  },
  help: {
    overline: 'Support',
    title: 'Help & Contact',
    lead: 'Answers to the common questions, plus how to reach a human.',
    icon: LifeBuoy,
  },
};

/**
 * Terms / Privacy / Help.
 *
 * The text is generated from live deployment configuration (brand, retention
 * windows, support address, legal entity and jurisdiction), so a self-hosted
 * operator gets accurate policy text without editing the app.
 */
export default function Legal({ kind }: { kind: Kind }) {
  const [config, setConfig] = useState<PlatformConfig | null>(null);
  const heading = HEADINGS[kind];
  const Icon = heading.icon;

  useEffect(() => {
    void platformService.getConfig().then(setConfig);
  }, []);

  const support = config?.brand.supportEmail;
  const retentionHours = config?.limits.recordingRetentionHours ?? 6;
  const brandName = config?.brand.name ?? "I'm Live";
  const entity = config?.brand.legalEntity;
  const jurisdiction = config?.brand.jurisdiction;
  const termsVersion = config?.brand.termsVersion ?? '2026-01-01';
  const privacyVersion = config?.brand.privacyVersion ?? '2026-01-01';

  return (
    <div className="relative min-h-svh bg-background">
      <div className="grain-fixed" />
      <div className="relative z-10 flex min-h-svh flex-col">
        <Navigation />

        <main className="flex-1 container max-w-3xl pt-28 pb-16">
          <p className="overline mb-3 flex items-center gap-2">
            <Icon size={13} className="text-[hsl(var(--accent-mid))]" />
            {heading.overline}
          </p>
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">{heading.title}</h1>
          <p className="mt-3 text-muted-foreground">
            {heading.lead} {kind !== 'help' && <span className="text-muted-foreground/70">Version {kind === 'terms' ? termsVersion : privacyVersion}.</span>}
          </p>

          <div className="mt-10 space-y-6 text-sm leading-relaxed text-muted-foreground">
            {kind === 'terms' && (
              <>
                <Card className="rounded-2xl border-white/8 bg-card/70">
                  <CardHeader>
                    <CardTitle className="text-base">1. Your account</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p>
                      You are responsible for the credentials on your account, for the content you broadcast and for the people you invite to
                      moderate your chat. Keep your password and any personal API tokens private — anyone holding them can act as you.
                    </p>
                    <p>
                      You must be old enough to consent to data processing in your jurisdiction. Do not impersonate others, and do not use the
                      service to break the law or to harm people.
                    </p>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border-white/8 bg-card/70">
                  <CardHeader>
                    <CardTitle className="text-base">2. Content and moderation</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p>
                      You keep ownership of everything you broadcast. You grant {brandName} only the permissions needed to operate the service:
                      store your recordings, deliver them to the viewers you allow, and show thumbnails in the directory.
                    </p>
                    <p>
                      Broadcasters and their moderators set their own chat rules (followers-only, slow mode, word filters, timeouts and bans).
                      Platform operators can additionally remove content and suspend accounts that break these terms or the law.
                    </p>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border-white/8 bg-card/70">
                  <CardHeader>
                    <CardTitle className="text-base">3. Availability and liability</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p>
                      The service is provided as-is. Recordings expire automatically after the retention window you (or the operator) set —
                      currently {retentionHours} hour{retentionHours === 1 ? '' : 's'} — so keep your own copies of anything you need to keep.
                    </p>
                    <p>
                      Live connections use peer-to-peer WebRTC between the broadcaster and viewers. Some networks require a relay, and quality
                      depends on bandwidth outside our control.
                    </p>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border-white/8 bg-card/70">
                  <CardHeader>
                    <CardTitle className="text-base">4. Ending the agreement</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p>
                      You can delete your account at any time from Settings → Security. Your profile is anonymised immediately and the data is
                      purged {DELETION_GRACE_DAYS} days later. We may suspend accounts that violate these terms, with a reason given in your notifications.
                    </p>
                    {entity && (
                      <p>
                        This service is operated by {entity}
                        {jurisdiction ? `, governed by the laws of ${jurisdiction}` : ''}.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </>
            )}

            {kind === 'privacy' && (
              <>
                <Card className="rounded-2xl border-white/8 bg-card/70">
                  <CardHeader>
                    <CardTitle className="text-base">What we store</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p>
                      <strong className="text-foreground">Account:</strong> username, display name, email, a salted PBKDF2 hash of your password,
                      avatar, bio, social links and your preferences. Your email is only ever used for verification, security notices and the
                      notifications you opt into.
                    </p>
                    <p>
                      <strong className="text-foreground">Broadcasts:</strong> stream titles, descriptions, categories, tags, chat messages,
                      tips metadata, scheduled slots and viewer counts. Recordings are stored in object storage and auto-deleted after{' '}
                      {retentionHours} hour{retentionHours === 1 ? '' : 's'} unless you keep them longer.
                    </p>
                    <p>
                      <strong className="text-foreground">Watch analytics:</strong> anonymous watch sessions (timestamps, duration, device class,
                      country from the request headers and the referring host). Creator dashboards only ever see aggregates.
                    </p>
                    <p>
                      <strong className="text-foreground">Safety and security:</strong> sign-in attempts and IP addresses (to stop credential
                      stuffing), audit entries for moderation actions, reports and block lists, and — if you press Send on a crash — client error
                      reports with the page you were on.
                    </p>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border-white/8 bg-card/70">
                  <CardHeader>
                    <CardTitle className="text-base">What we never do</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p>
                      We do not sell personal data, we do not run third-party ad trackers inside the app, and media streams travel directly
                      between peers — the server only carries signalling and the data above.
                    </p>
                    <p>
                      Product analytics and error tracking are disabled by default and only activate if the operator configures a provider; when
                      they do, this page and the admin console list exactly which integration is live.
                    </p>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border-white/8 bg-card/70">
                  <CardHeader>
                    <CardTitle className="text-base">Your controls</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p>
                      Settings → Security gives you a one-click export of everything tied to your account, a list of active sessions you can
                      revoke, and account deletion. Notification categories can be muted per channel type in Notifications → Delivery.
                    </p>
                    <p>
                      Personal API tokens are hashed at rest and shown once; revoke any token from the same screen and it stops working
                      immediately.
                    </p>
                    {support && (
                      <p>
                        Questions about your data? Email{' '}
                        <a href={`mailto:${support}`} className="text-[hsl(var(--accent-hi))] hover:underline">
                          {support}
                        </a>
                        .
                      </p>
                    )}
                  </CardContent>
                </Card>
              </>
            )}

            {kind === 'help' && (
              <>
                {[
                  {
                    q: 'Going live',
                    a: 'Enable streamer mode in Settings → Profile, then use “Go live”. Your browser asks for camera and microphone access; pick local network for same-network delivery or internet for viewers anywhere. Add TURN keys if viewers behind strict networks cannot connect.',
                  },
                  {
                    q: 'Viewers cannot see or hear me',
                    a: 'Check the browser permissions first, then the stream state on the dashboard. Peer-to-peer connections need a relay on mobile networks — the operator can add TURN credentials and the player picks them up automatically.',
                  },
                  {
                    q: 'Chat rules',
                    a: 'Broadcasters manage followers-only mode, slow mode, blocked words and minimum account age in Moderation → Chat rules. Timeouts and bans are issued from the message menu while you are live.',
                  },
                  {
                    q: 'Recordings and clips',
                    a: `Recordings upload automatically when recording is on, and expire after your retention window (currently ${retentionHours}h). Manage, retitle, hide or clip them from the Library.`,
                  },
                  {
                    q: 'Tips and donations',
                    a: 'If the operator has not connected a payment provider, add your own support link in Dashboard → Earnings so viewers still have a way to chip in.',
                  },
                  {
                    q: 'Notifications',
                    a: 'Choose which categories reach your inbox, and enable browser push for the moment a channel you follow goes live. Email delivery respects the same switches.',
                  },
                ].map((item) => (
                  <Card key={item.q} className="rounded-2xl border-white/8 bg-card/70">
                    <CardHeader>
                      <CardTitle className="text-base">{item.q}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p>{item.a}</p>
                    </CardContent>
                  </Card>
                ))}

                <Card className="rounded-2xl border-white/8 bg-card/70">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Mail className="h-4 w-4" /> Still stuck?
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p>
                      {support
                        ? `Email ${support} with the page you were on and what you expected to happen — client errors from the app reach the operator automatically.`
                        : 'This deployment has not published a support address yet. Platform operators can set SUPPORT_EMAIL to show it here and in the footer.'}
                    </p>
                    <div className="flex flex-wrap gap-3">
                      {support && (
                        <Button variant="glow" asChild>
                          <a href={`mailto:${support}`}>Contact support</a>
                        </Button>
                      )}
                      <Button variant="glass" asChild>
                        <Link to="/notifications">Notification settings</Link>
                      </Button>
                      <Button variant="glass" asChild>
                        <Link to="/settings">Account settings</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            <p className="pt-4 text-xs text-muted-foreground/70">
              {kind === 'help' ? 'Last reviewed' : 'Effective'} {new Date().toISOString().slice(0, 10)} ·{' '}
              <Link to="/terms" className="hover:text-foreground">
                Terms
              </Link>{' '}
              ·{' '}
              <Link to="/privacy" className="hover:text-foreground">
                Privacy
              </Link>{' '}
              ·{' '}
              <Link to="/help" className="hover:text-foreground">
                Help
              </Link>
            </p>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}
