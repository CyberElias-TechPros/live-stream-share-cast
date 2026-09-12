import { useEffect } from "react";

interface SeoOptions {
  title: string;
  description?: string;
  /** "noindex" for transient/private pages. Defaults to index. */
  robots?: "index" | "noindex";
  /** JSON-LD structured data object(s). */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  /** Open Graph image path (absolute URL is derived at runtime). */
  image?: string;
  type?: string;
}

const SITE_NAME = "I'm Live";
const DEFAULT_DESCRIPTION =
  "Go live from your browser in seconds. Share a link, watch anywhere, chat in real time. No downloads, no installs.";

function upsertMeta(selector: string, attrs: Record<string, string>): void {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    document.head.appendChild(el);
  }
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
}

function upsertJsonLd(data: Record<string, unknown>[]): void {
  document.head.querySelectorAll('script[data-seo-jsonld="true"]').forEach((el) => el.remove());
  for (const obj of data) {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.dataset.seoJsonld = "true";
    script.textContent = JSON.stringify(obj);
    document.head.appendChild(script);
  }
}

/**
 * Per-route document metadata: title, description, canonical, robots,
 * Open Graph / Twitter cards, and JSON-LD structured data.
 */
export function useSEO({ title, description = DEFAULT_DESCRIPTION, robots = "index", jsonLd, image = "/og-image.png", type = "website" }: SeoOptions): void {
  useEffect(() => {
    const fullTitle = title.includes(SITE_NAME) ? title : `${title} · ${SITE_NAME}`;
    document.title = fullTitle;

    const canonical = `${window.location.origin}${window.location.pathname}`;
    const imageUrl = `${window.location.origin}${image}`;

    upsertMeta('meta[name="description"]', { name: "description", content: description });
    upsertMeta('meta[name="robots"]', { name: "robots", content: robots === "noindex" ? "noindex, nofollow" : "index, follow" });

    upsertMeta('meta[property="og:title"]', { property: "og:title", content: fullTitle });
    upsertMeta('meta[property="og:description"]', { property: "og:description", content: description });
    upsertMeta('meta[property="og:type"]', { property: "og:type", content: type });
    upsertMeta('meta[property="og:url"]', { property: "og:url", content: canonical });
    upsertMeta('meta[property="og:image"]', { property: "og:image", content: imageUrl });
    upsertMeta('meta[property="og:site_name"]', { property: "og:site_name", content: SITE_NAME });

    upsertMeta('meta[name="twitter:card"]', { name: "twitter:card", content: "summary_large_image" });
    upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: fullTitle });
    upsertMeta('meta[name="twitter:description"]', { name: "twitter:description", content: description });
    upsertMeta('meta[name="twitter:image"]', { name: "twitter:image", content: imageUrl });

    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = canonical;

    if (jsonLd) {
      upsertJsonLd(Array.isArray(jsonLd) ? jsonLd : [jsonLd]);
    } else {
      upsertJsonLd([]);
    }
  }, [title, description, robots, image, type, jsonLd]);
}

export const SITE_DEFAULT_DESCRIPTION = DEFAULT_DESCRIPTION;
