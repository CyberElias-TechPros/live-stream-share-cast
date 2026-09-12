import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { useSEO } from "@/hooks/useSEO";

function LegalShell({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Navigation />
      <main className="container-app max-w-3xl flex-1 py-12">
        <p className="micro">Legal</p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-xs text-text-faint">Last updated: {updated}</p>
        <div className="prose prose-invert mt-8 max-w-none prose-headings:font-display prose-a:text-accent">{children}</div>
      </main>
      <Footer />
    </div>
  );
}

export function PrivacyPolicy() {
  useSEO({
    title: "Privacy policy",
    description: "How I'm Live handles your data: what we store, what we never do, and how peer-to-peer streaming works.",
  });
  return (
    <LegalShell title="Privacy policy" updated="September 2026">
      <p>
        I'm Live is built to broadcast with minimal data collection. This page explains what we store, why, and what we
        deliberately don't do.
      </p>
      <h2>What we store</h2>
      <ul>
        <li><strong>Account:</strong> your username, email address, hashed password (PBKDF2), display name, bio, avatar color, and any links you add to your profile.</li>
        <li><strong>Streams:</strong> titles, descriptions, categories, tags, and broadcast statistics (viewer counts, session durations, peak viewers).</li>
        <li><strong>Chat:</strong> messages sent to stream chats, attached to your username.</li>
        <li><strong>Sessions:</strong> a session cookie (HttpOnly) that keeps you signed in, plus the IP address and user agent recorded at sign-in for abuse prevention.</li>
      </ul>
      <h2>What we don't do</h2>
      <ul>
        <li>No third-party analytics or advertising trackers.</li>
        <li>No selling or sharing of personal data.</li>
        <li>No cookies used for cross-site tracking.</li>
      </ul>
      <h2>How streaming works</h2>
      <p>
        Broadcasts use peer-to-peer WebRTC: your camera's video travels directly between you and your viewers, and is not
        routed through or stored on our servers. If you record a broadcast, the recording is saved locally in your browser
        unless you explicitly upload it to cloud storage (where enabled by the operator).
      </p>
      <h2>Data retention</h2>
      <p>
        Broadcast statistics are pruned after 7 days. Login abuse counters are pruned after 48 hours. Expired sessions are
        purged automatically. You can delete your streams at any time from the dashboard.
      </p>
      <h2>Your choices</h2>
      <p>
        You can update or clear your profile information in Settings at any time. For deletion requests, contact the site
        operator at the address listed on this deployment.
      </p>
    </LegalShell>
  );
}

export function TermsOfService() {
  useSEO({
    title: "Terms of service",
    description: "The rules of the road for using I'm Live: what you may broadcast, what's prohibited, and disclaimers.",
  });
  return (
    <LegalShell title="Terms of service" updated="September 2026">
      <p>Welcome to I'm Live. By creating an account or using the service you agree to these terms.</p>
      <h2>Your content</h2>
      <p>
        You own what you broadcast. You're responsible for having the rights to everything you stream — including music,
        footage, and the participation of everyone on camera. Don't broadcast content that is illegal, harassing, or that
        invades others' privacy.
      </p>
      <h2>Acceptable use</h2>
      <ul>
        <li>Don't use the service to harass, dox, or threaten anyone.</li>
        <li>Don't attempt to break, overload, or gain unauthorized access to the service.</li>
        <li>Don't use the service for unlawful activity or to distribute malware.</li>
        <li>Operators may suspend accounts that violate these rules.</li>
      </ul>
      <h2>Availability</h2>
      <p>
        The service is provided "as is," without warranties of any kind. Live video depends on networks and browsers we
        don't control — outages happen. We aim for reliability but don't guarantee uninterrupted service.
      </p>
      <h2>Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, the operators of I'm Live are not liable for indirect or consequential
        damages arising from your use of the service.
      </p>
      <h2>Changes</h2>
      <p>We may update these terms as the product evolves. Material changes will be announced on this page.</p>
    </LegalShell>
  );
}
