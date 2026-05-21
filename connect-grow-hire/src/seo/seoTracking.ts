/*
 * SEO funnel tracking. Three events: seo_page_view, seo_cta_click, seo_attributed_signup.
 *
 * First-touch attribution: the first SEO page a visitor lands on is stored in localStorage
 * and never overwritten, so a signup days later still credits the page that brought them in.
 * Recruiting is seasonal, so the gap between landing and signup can be weeks.
 *
 * PostHog is the analytics sink (src/lib/posthog.ts). If PostHog has no env keys it is not
 * initialized and these calls no-op safely. Phase 1b of the SEO rollout.
 */
import posthog from '../lib/posthog';
import type { SeoPageMeta } from './buildCtaUrl';

const FIRST_TOUCH_KEY = 'offerloop_first_touch';

export interface SeoFirstTouch {
  utm_campaign: string;
  utm_content: string;
  landing_page: string;
  landed_at: number;
}

/** Read the stored first-touch SEO attribution, or null if the visitor never came via SEO. */
export function getSeoFirstTouch(): SeoFirstTouch | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(FIRST_TOUCH_KEY);
    return raw ? (JSON.parse(raw) as SeoFirstTouch) : null;
  } catch {
    return null;
  }
}

/**
 * Fire on mount of any SEO page. Also records first-touch attribution the first time only,
 * never overwriting an existing first-touch.
 */
export function trackSeoPageView(meta: SeoPageMeta & { pageIntentScore?: number }): void {
  if (typeof window === 'undefined') return;

  try {
    if (!localStorage.getItem(FIRST_TOUCH_KEY)) {
      const firstTouch: SeoFirstTouch = {
        utm_campaign: meta.template,
        utm_content: meta.slug,
        landing_page: window.location.pathname,
        landed_at: Date.now(),
      };
      localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(firstTouch));
    }
  } catch {
    /* localStorage unavailable (private mode, etc.), skip attribution but still track the view */
  }

  posthog.capture('seo_page_view', {
    template: meta.template,
    slug: meta.slug,
    firm: meta.firm,
    school: meta.school,
    role: meta.role,
    page_intent_score: meta.pageIntentScore,
    referrer: document.referrer || null,
  });
}

/** Fire when the visitor clicks the deep-link CTA into the product. */
export function trackSeoCtaClick(meta: SeoPageMeta, ctaDestination: string, ctaLabel: string): void {
  posthog.capture('seo_cta_click', {
    template: meta.template,
    slug: meta.slug,
    firm: meta.firm,
    school: meta.school,
    role: meta.role,
    cta_destination: ctaDestination,
    cta_label: ctaLabel,
  });
}

/**
 * Fire once when a user completes signup. Emits seo_attributed_signup only when an SEO
 * first-touch exists, so it credits exactly the SEO page that started the journey.
 * Call from the signup path (the new-user branch of the auth flow).
 */
export function trackSeoAttributedSignup(pagesViewedBeforeSignup?: number): void {
  const firstTouch = getSeoFirstTouch();
  if (!firstTouch) return; // not an SEO-sourced signup, nothing to attribute

  posthog.capture('seo_attributed_signup', {
    utm_campaign: firstTouch.utm_campaign,
    utm_content: firstTouch.utm_content,
    landing_page: firstTouch.landing_page,
    time_to_signup_seconds: Math.round((Date.now() - firstTouch.landed_at) / 1000),
    pages_viewed_before_signup: pagesViewedBeforeSignup,
  });
}
