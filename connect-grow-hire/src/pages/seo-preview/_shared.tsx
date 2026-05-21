/*
 * Shared layout for SEO product-led preview pages. Not linked, not in sitemap.
 * House style: no em dashes, no sparkle icons.
 */
import { ReactNode, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import offerloopLogo from '../../assets/offerloop_logo2.png';

export const BRAND = '#3B82F6';
export const BRAND_DARK = '#2563EB';
export const INK = '#0F172A';
export const serif = "'Libre Baskerville', Georgia, serif";

export const h2Style: React.CSSProperties = { fontFamily: serif, fontSize: '30px', fontWeight: 400, color: INK, marginBottom: '14px', letterSpacing: '-0.02em' };
export const pStyle: React.CSSProperties = { fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '14px' };
export const kicker: React.CSSProperties = { fontSize: '12px', fontWeight: 700, color: BRAND, letterSpacing: '0.06em' };

export const gridLayer = (color: string, fade: string): React.CSSProperties => ({
  position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
  backgroundImage: `linear-gradient(to right, ${color} 1px, transparent 1px), linear-gradient(to bottom, ${color} 1px, transparent 1px)`,
  backgroundSize: '56px 56px',
  maskImage: fade, WebkitMaskImage: fade,
});

export const PreviewNav = () => (
  <nav className="w-full px-6 py-5 flex items-center justify-between" style={{ maxWidth: '1100px', margin: '0 auto', position: 'relative', zIndex: 2 }}>
    <Link to="/"><img src={offerloopLogo} alt="Offerloop" style={{ height: '64px', width: 'auto' }} /></Link>
    <Link to="/signin?mode=signup" className="px-5 py-2.5 rounded-[3px] text-sm font-semibold text-white" style={{ background: BRAND }}>
      Get Started Free
    </Link>
  </nav>
);

export const PreviewFooter = () => (
  <footer className="py-10 px-6" style={{ borderTop: '1px solid #E2E8F0' }}>
    <div className="flex flex-col md:flex-row justify-between items-center gap-4" style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <p className="text-sm" style={{ color: '#94A3B8' }}>&copy; 2026 Offerloop. All rights reserved.</p>
      <div className="flex gap-6">
        {[{ label: 'About', path: '/about' }, { label: 'Pricing', path: '/pricing' }, { label: 'Privacy', path: '/privacy' }, { label: 'Terms', path: '/terms-of-service' }].map(link => (
          <Link key={link.path} to={link.path} className="text-sm" style={{ color: '#94A3B8' }}>{link.label}</Link>
        ))}
      </div>
    </div>
  </footer>
);

interface HeroProps {
  EyebrowIcon: LucideIcon;
  eyebrow: string;
  line1: ReactNode;
  line2: string;
  lead: string;
  chips: string[];
}
export const PreviewHero = ({ EyebrowIcon, eyebrow, line1, line2, lead, chips }: HeroProps) => (
  <section style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid #F1F5F9' }}>
    <div style={gridLayer('rgba(15,23,42,0.045)', 'radial-gradient(ellipse 75% 70% at 50% 0%, #000 30%, transparent 75%)')} />
    <div style={{ position: 'absolute', top: '-260px', left: '50%', transform: 'translateX(-50%)', width: '1000px', height: '560px', zIndex: 0, pointerEvents: 'none', background: 'radial-gradient(circle, rgba(59,130,246,0.16), transparent 70%)' }} />
    <div className="px-6 pt-16 pb-20 text-center" style={{ maxWidth: '800px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
      <span className="inline-flex items-center gap-1.5 mb-6" style={{ background: '#EFF5FF', border: '1px solid #DBEAFE', color: BRAND_DARK, fontSize: '12.5px', fontWeight: 600, padding: '5px 12px', borderRadius: '999px' }}>
        <EyebrowIcon className="w-3.5 h-3.5" /> {eyebrow}
      </span>
      <h1 style={{ fontFamily: serif, fontWeight: 400, lineHeight: 1.08, letterSpacing: '-0.03em', color: INK, marginBottom: '20px' }}>
        <span style={{ display: 'block', fontSize: 'clamp(40px, 5.4vw, 60px)' }}>{line1}</span>
        <span style={{ display: 'block', fontSize: 'clamp(20px, 2.7vw, 31px)', color: '#475569', marginTop: '14px', lineHeight: 1.28, letterSpacing: '-0.02em' }}>{line2}</span>
      </h1>
      <p style={{ fontSize: '18px', lineHeight: 1.65, color: '#64748B', maxWidth: '640px', margin: '0 auto' }}>{lead}</p>
      <div className="flex items-center justify-center gap-2 flex-wrap mt-7">
        {chips.map((t) => (
          <span key={t} style={{ fontSize: '13px', fontWeight: 600, color: '#475569', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '3px', padding: '6px 12px' }}>{t}</span>
        ))}
      </div>
    </div>
  </section>
);

export const ProblemSection = ({ heading, children }: { heading: string; children: ReactNode }) => (
  <section className="px-6 py-14" style={{ maxWidth: '800px', margin: '0 auto' }}>
    <h2 style={h2Style}>{heading}</h2>
    <p style={pStyle}>{children}</p>
  </section>
);

// Unique, keyword-matched data per page. The anti-doorway-page signal: real facts
// specific to this firm/school/role, not boilerplate with a name swapped.
export const StatStrip = ({ heading, stats }: { heading: string; stats: { value: string; label: string }[] }) => (
  <section className="px-6" style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '44px' }}>
    <p style={{ ...kicker, marginBottom: '14px' }}>{heading}</p>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {stats.map((s, i) => (
        <div key={i} className="rounded-[4px]" style={{ background: '#FAFBFF', border: '1px solid #E2E8F0', padding: '16px 18px' }}>
          <p style={{ fontFamily: serif, fontSize: '26px', fontWeight: 400, color: BRAND_DARK, lineHeight: 1.15, marginBottom: '5px' }}>{s.value}</p>
          <p style={{ fontSize: '12.5px', lineHeight: 1.5, color: '#64748B' }}>{s.label}</p>
        </div>
      ))}
    </div>
  </section>
);

export const ShowcaseSection = ({ heading, intro, caption, children }: { heading: string; intro: string; caption: string; children: ReactNode }) => (
  <section className="px-6 py-16" style={{ background: '#FAFBFF', borderTop: '1px solid #F1F5F9', borderBottom: '1px solid #F1F5F9' }}>
    <div style={{ maxWidth: '820px', margin: '0 auto' }}>
      <h2 style={h2Style}>{heading}</h2>
      <p style={pStyle}>{intro}</p>
      {children}
      <p style={{ fontSize: '12.5px', color: '#94A3B8', marginTop: '12px' }}>{caption}</p>
    </div>
  </section>
);

interface Step { Icon: LucideIcon; t: string; d: string; }
export const HowItWorks = ({ heading, steps }: { heading: string; steps: Step[] }) => (
  <section className="px-6 py-16" style={{ maxWidth: '800px', margin: '0 auto' }}>
    <h2 style={h2Style}>{heading}</h2>
    <div style={{ position: 'relative', marginTop: '24px' }}>
      <div style={{ position: 'absolute', left: '19px', top: '20px', bottom: '20px', width: '2px', background: '#DBEAFE' }} />
      {steps.map((s, i) => (
        <div key={i} className="flex gap-4" style={{ position: 'relative', marginBottom: i < steps.length - 1 ? '14px' : 0 }}>
          <div className="flex-shrink-0 flex items-center justify-center" style={{ width: '40px', height: '40px', borderRadius: '50%', background: BRAND, boxShadow: '0 6px 16px -4px rgba(59,130,246,0.5)', zIndex: 1 }}>
            <s.Icon className="text-white" style={{ width: '18px', height: '18px' }} />
          </div>
          <div className="rounded-[4px] p-4 flex-1" style={{ background: '#fff', border: '1px solid #E2E8F0' }}>
            <p className="text-sm font-bold mb-1" style={{ color: INK }}>{i + 1}. {s.t}</p>
            <p style={{ fontSize: '13px', lineHeight: 1.6, color: '#64748B' }}>{s.d}</p>
          </div>
        </div>
      ))}
    </div>
  </section>
);

export const FAQ = ({ items }: { items: { q: string; a: string }[] }) => (
  <section className="px-6 py-16" style={{ maxWidth: '800px', margin: '0 auto', background: '#FAFBFF', borderTop: '1px solid #F1F5F9' }}>
    <h2 style={{ fontFamily: serif, fontSize: '26px', fontWeight: 400, marginBottom: '24px', color: INK }}>Frequently Asked Questions</h2>
    {items.map((f, i) => (
      <div key={i} style={{ marginBottom: '20px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px', color: INK }}>{f.q}</h3>
        <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#4a5568' }}>{f.a}</p>
      </div>
    ))}
  </section>
);

interface CTAProps { eyebrow: string; headline: string; subhead: string; buttonText: string; to: string; footnote: string; }
export const PreviewCTA = ({ eyebrow, headline, subhead, buttonText, to, footnote }: CTAProps) => (
  <section style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(140deg, #1D4ED8 0%, #2563EB 50%, #3B82F6 100%)' }}>
    <div style={gridLayer('rgba(255,255,255,0.07)', 'radial-gradient(ellipse 80% 80% at 50% 50%, #000, transparent 75%)')} />
    <div style={{ position: 'absolute', top: '-180px', right: '-120px', width: '520px', height: '520px', zIndex: 0, pointerEvents: 'none', background: 'radial-gradient(circle, rgba(255,255,255,0.22), transparent 65%)' }} />
    <div className="px-6 py-24 text-center" style={{ maxWidth: '640px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
      <p style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.08em', color: '#BFDBFE', marginBottom: '16px' }}>{eyebrow}</p>
      <h2 style={{ fontFamily: serif, fontSize: 'clamp(30px, 4.2vw, 44px)', fontWeight: 400, lineHeight: 1.12, color: '#fff', marginBottom: '14px', letterSpacing: '-0.02em' }}>{headline}</h2>
      <p style={{ fontSize: '16px', color: '#DBEAFE', marginBottom: '32px', lineHeight: 1.6 }}>{subhead}</p>
      <Link to={to} className="inline-flex items-center gap-2.5 transition-transform duration-150 hover:-translate-y-0.5" style={{ background: '#fff', color: BRAND_DARK, fontWeight: 700, fontSize: '16px', padding: '17px 34px', borderRadius: '4px', boxShadow: '0 16px 40px -12px rgba(2,6,23,0.55)' }}>
        {buttonText} <ArrowRight className="w-4 h-4" />
      </Link>
      <p style={{ fontSize: '12.5px', color: '#93C5FD', marginTop: '16px' }}>{footnote}</p>
    </div>
  </section>
);

/*
 * Email capture: the second-chance layer for the not-yet-ready visitor.
 * Never competes with the product CTA. Two forms only: one quiet inline block
 * placed low on the page, and an exit-intent popup. No scroll/timer popups.
 * `cluster` (banking | consulting | student) tags the subscriber for segmented nurture.
 */
export interface EmailCapture {
  eyebrow: string;
  heading: string;
  subtext: string;
  buttonText: string;
  cluster: string;
}

const captureInput: React.CSSProperties = {
  fontSize: '14px', padding: '11px 14px', borderRadius: '4px',
  border: '1px solid #CBD5E1', outline: 'none', color: INK,
};
const captureButton: React.CSSProperties = {
  background: BRAND, color: '#fff', fontWeight: 700, fontSize: '14px',
  padding: '11px 22px', borderRadius: '4px', border: 'none', cursor: 'pointer',
};

export const InlineEmailCapture = ({ eyebrow, heading, subtext, buttonText, cluster }: EmailCapture) => {
  const [done, setDone] = useState(false);
  return (
    <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div className="rounded-[6px]" style={{ background: 'linear-gradient(135deg, #F0F6FF, #FAFBFF)', border: '1px solid #DBEAFE', padding: '26px 30px' }}>
        <p style={{ ...kicker, marginBottom: '8px' }}>{eyebrow}</p>
        <h3 style={{ fontFamily: serif, fontSize: '23px', fontWeight: 400, color: INK, marginBottom: '6px', letterSpacing: '-0.01em' }}>{heading}</h3>
        <p style={{ fontSize: '14px', lineHeight: 1.65, color: '#475569', marginBottom: '16px' }}>{subtext}</p>
        {done ? (
          <p style={{ fontSize: '14px', fontWeight: 600, color: '#15803D' }}>You're on the list. Watch your inbox.</p>
        ) : (
          <div className="flex gap-2 flex-wrap">
            <input type="email" placeholder="you@university.edu" aria-label="Email address" data-cluster={cluster}
              style={{ ...captureInput, flex: '1 1 240px' }} />
            <button onClick={() => setDone(true)} style={captureButton}>{buttonText}</button>
          </div>
        )}
      </div>
    </section>
  );
};

export const ExitIntentCapture = ({ heading, subtext, buttonText, cluster }: EmailCapture) => {
  const [show, setShow] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || localStorage.getItem('seo_exit_capture_shown')) return;
    const onLeave = (e: MouseEvent) => {
      if (e.clientY <= 0) {
        setShow(true);
        localStorage.setItem('seo_exit_capture_shown', '1');
        document.removeEventListener('mouseout', onLeave);
      }
    };
    document.addEventListener('mouseout', onLeave);
    return () => document.removeEventListener('mouseout', onLeave);
  }, []);
  if (!show) return null;
  return (
    <div onClick={() => setShow(false)} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div onClick={(e) => e.stopPropagation()} className="rounded-[8px]" style={{ background: '#fff', maxWidth: '430px', width: '100%', padding: '32px', position: 'relative', boxShadow: '0 30px 70px -18px rgba(2,6,23,0.5)' }}>
        <button onClick={() => setShow(false)} aria-label="Close" style={{ position: 'absolute', top: '12px', right: '14px', background: 'none', border: 'none', fontSize: '22px', lineHeight: 1, color: '#94A3B8', cursor: 'pointer' }}>&times;</button>
        <p style={{ ...kicker, marginBottom: '8px' }}>BEFORE YOU GO</p>
        <h3 style={{ fontFamily: serif, fontSize: '24px', fontWeight: 400, color: INK, marginBottom: '8px', letterSpacing: '-0.01em' }}>{heading}</h3>
        <p style={{ fontSize: '14px', lineHeight: 1.65, color: '#475569', marginBottom: '18px' }}>{subtext}</p>
        {done ? (
          <p style={{ fontSize: '14px', fontWeight: 600, color: '#15803D' }}>You're on the list. Watch your inbox.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <input type="email" placeholder="you@university.edu" aria-label="Email address" data-cluster={cluster} style={captureInput} />
            <button onClick={() => setDone(true)} style={{ ...captureButton, padding: '12px' }}>{buttonText}</button>
          </div>
        )}
      </div>
    </div>
  );
};
