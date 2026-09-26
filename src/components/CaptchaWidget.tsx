import { useEffect, useRef, useState } from 'react';
import { platformService } from '@/services/platformService';

/**
 * Turnstile / hCaptcha widget.
 *
 * The worker enforces captcha on signup and password reset **only when a
 * provider is configured**, so this component renders nothing until
 * `TURNSTILE_SITE_KEY` / `HCAPTCHA_SITE_KEY` shows up in the platform config —
 * after which the widget appears and its token is sent with the request.
 *
 * The provider script is injected on demand (`render=explicit`), so no
 * third-party JavaScript is fetched on deployments that do not use captcha.
 */

type RenderOptions = {
  sitekey: string;
  callback: (token: string) => void;
  'error-callback'?: () => void;
  'expired-callback'?: () => void;
  'timeout-callback'?: () => void;
  theme?: 'dark' | 'light' | 'auto';
};

interface CaptchaRenderer {
  render: (element: HTMLElement, options: RenderOptions) => string | number;
  reset?: (widgetId?: string | number) => void;
  remove?: (widgetId: string | number) => void;
}

declare global {
  interface Window {
    turnstile?: CaptchaRenderer;
    hcaptcha?: CaptchaRenderer;
  }
}

const SCRIPT_ID = 'lsc-captcha-script';

function loadProviderScript(provider: 'turnstile' | 'hcaptcha'): Promise<CaptchaRenderer> {
  const globalName = provider === 'turnstile' ? 'turnstile' : 'hcaptcha';
  const existing = window[globalName];
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve, reject) => {
    const previous = document.getElementById(SCRIPT_ID);
    previous?.remove();

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src =
      provider === 'turnstile'
        ? 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
        : 'https://js.hcaptcha.com/1/api.js?render=explicit';

    script.onload = () => {
      const renderer = window[globalName];
      if (renderer) resolve(renderer);
      else reject(new Error(`${globalName} did not initialise`));
    };
    script.onerror = () => reject(new Error('Captcha script failed to load'));

    document.head.appendChild(script);
  });
}

interface CaptchaWidgetProps {
  /** Receives the verification token, or null when it expires / errors. */
  onToken: (token: string | null) => void;
  className?: string;
}

export default function CaptchaWidget({ onToken, className }: CaptchaWidgetProps) {
  const holder = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | number | null>(null);
  const onTokenRef = useRef(onToken);
  const [provider, setProvider] = useState<'turnstile' | 'hcaptcha' | null>(null);
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  onTokenRef.current = onToken;

  useEffect(() => {
    let cancelled = false;
    void platformService.getConfig().then((config) => {
      if (cancelled || !config?.captcha.enabled || !config.captcha.siteKey) return;
      const name = config.captcha.provider === 'hcaptcha' ? 'hcaptcha' : 'turnstile';
      setProvider(name);
      setSiteKey(config.captcha.siteKey);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!provider || !siteKey || !holder.current) return;

    let cancelled = false;
    void loadProviderScript(provider)
      .then((renderer) => {
        if (cancelled || !holder.current || widgetId.current !== null) return;
        widgetId.current = renderer.render(holder.current, {
          sitekey: siteKey,
          theme: 'dark',
          callback: (token: string) => onTokenRef.current(token),
          'error-callback': () => {
            setFailed(true);
            onTokenRef.current(null);
          },
          'expired-callback': () => onTokenRef.current(null),
        });
      })
      .catch(() => {
        // A blocked script must not trap the user: the server only enforces the
        // check when its own keys are configured, and reports a clear error.
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      const renderer = window[provider];
      if (widgetId.current !== null && renderer?.remove) {
        try {
          renderer.remove(widgetId.current);
        } catch {
          // The provider may have already torn the widget down.
        }
      }
      widgetId.current = null;
    };
  }, [provider, siteKey]);

  if (!provider || !siteKey) return null;

  return (
    <div className={className}>
      <div ref={holder} />
      {failed && (
        <p className="mt-2 text-xs text-destructive">
          The human check could not load. Disable content blockers for this page and reload.
        </p>
      )}
    </div>
  );
}
