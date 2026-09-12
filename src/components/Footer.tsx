import { Link } from "react-router-dom";
import { Logo } from "@/components/Brand";

export default function Footer() {
  return (
    <footer className="border-t border-line bg-bg-raised/40">
      <div className="container-app grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo className="text-xl" />
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-text-muted">
            Instant live video from your browser. Go live in one click, share a link, and talk with your audience in
            real time.
          </p>
        </div>
        <nav aria-label="Product">
          <h3 className="micro mb-3">Product</h3>
          <ul className="space-y-2 text-sm text-text-muted">
            <li><Link to="/browse" className="link-underline hover:text-text transition-colors">Browse live</Link></li>
            <li><Link to="/studio" className="link-underline hover:text-text transition-colors">Start streaming</Link></li>
            <li><Link to="/signup" className="link-underline hover:text-text transition-colors">Create account</Link></li>
            <li><Link to="/dashboard" className="link-underline hover:text-text transition-colors">Dashboard</Link></li>
          </ul>
        </nav>
        <nav aria-label="Legal">
          <h3 className="micro mb-3">Legal</h3>
          <ul className="space-y-2 text-sm text-text-muted">
            <li><Link to="/privacy" className="link-underline hover:text-text transition-colors">Privacy policy</Link></li>
            <li><Link to="/terms" className="link-underline hover:text-text transition-colors">Terms of service</Link></li>
            <li>
              <a href="mailto:hello@imlive.app" className="link-underline hover:text-text transition-colors">
                Contact
              </a>
            </li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-line">
        <div className="container-app flex flex-col items-center justify-between gap-2 py-5 text-xs text-text-faint sm:flex-row">
          <span>© {new Date().getFullYear()} I'm Live. Broadcast responsibly.</span>
          <span className="micro">Made for the open web</span>
        </div>
      </div>
    </footer>
  );
}
