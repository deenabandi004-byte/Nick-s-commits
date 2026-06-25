// src/pages/ForStudentsPage.tsx
//
// Student-targeted landing page at /for-students. Built from the Figma
// mockup at file mzL5XPw3VFciHDs6RG7SAb, node 2081:15934
// ("V. 10 — HTML synced"). Pairs with the existing Index.tsx (for-anyone view).
//
// Iteration 3:
//   - Persona toggle lives directly in the top banner now (no separate shelf)
//   - Yeti peeks down over the top of the product mockup
//   - Soft dot grid is the real page background (no vignette mask)
//   - Mountains backdrop fades over a longer distance + continues color into
//     the trust band so the transition reads atmospheric, not abrupt
//   - Highlight wash is CSS-based so it auto-fits to each italic word
//   - Stories trimmed to the four students whose names match their photos

import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowRight, Menu, X } from 'lucide-react';
import { useFirebaseAuth } from '../contexts/FirebaseAuthContext';

import OfferloopLogo from '@/assets/offerloop_logo2.png';
import MountainsLake from '@/assets/for-students/mountains-lake.png';
import HeroProduct from '@/assets/for-students/hero-product.png';
import HeroProductVideo from '@/assets/for-students/hero-product.mp4';
import HeroYetiSide from '@/assets/for-students/hero-yeti-side.png';
import YetiPaw from '@/assets/for-students/yeti-paw.png';
import StoriesBookmark from '@/assets/for-students/stories-bookmark.png';
import SquiggleUnderline from '@/assets/for-students/squiggle-underline.png';
import LinkedInExtension from '@/assets/for-students/linkedin-extension.png';
import ScoutBadge from '@/assets/for-students/scout-badge.png';
import OpeningQuote from '@/assets/for-students/opening-quote.png';
import DoodleArcArrow from '@/assets/for-students/doodle-arc-arrow.png';
import CTAMountain from '@/assets/for-students/cta-mountain.png';
import HighlightWash from '@/assets/for-students/highlight-wash.png';
import LandingThumbtack from '@/assets/landing-thumbtack.png';

import StepFind from '@/assets/findhiringmanagerlandingpage.png';
import StepDraft from '@/assets/emailoutreach.png.png';
import StepCoffee from '@/assets/coffeechatlandingpage.png';
import StepTrack from '@/assets/findcompanylandingpage.png';

import USCLogo from '@/assets/USC-Logo.png';
import UCLALogo from '@/assets/UCLA logo.png';
import NYULogo from '@/assets/NYU Logo.png';
import StanfordLogo from '@/assets/Stanford logo.avif';
import BerkeleyLogo from '@/assets/UC Berkeley logo.png';
import MichiganLogo from '@/assets/Michigan logo.png';
import NotreDameLogo from '@/assets/Notre Dame logo.png';
import WhartonLogo from '@/assets/Wharton Logo .png';
import GeorgetownLogo from '@/assets/Georgetown logo.png';
import DartmouthLogo from '@/assets/Dartmouth logo.png';

import DavidJi from '@/assets/David-Ji.jpeg';
import JacksonLeck from '@/assets/Jackson-Leck.jpeg';
import SarahU from '@/assets/Sarah-Ucuzoglu.jpeg';
import DylanRoby from '@/assets/Dylan-Roby.jpeg';
import VibushaVadivel from '@/assets/Vibusha-Vadivel.jpeg';
import EliHamou from '@/assets/EliHamou.png';
import MatthewDolins from '@/assets/Matthew-Dolins.png';
import LukeBrooks from '@/assets/Luke-Brooks.jpeg';
import RoccoLepiane from '@/assets/Rocco-Lepiane.jpeg';
import JuliannaSeymour from '@/assets/Julianna-Seymour.jpeg';
import ReeseHafner from '@/assets/Reese-Hafner.jpeg';
import LouisFaillace from '@/assets/Louis-Faillace.jpeg';

import BlackstoneLogo from '@/assets/Blackstone.png';
import PwCLogo from '@/assets/PwC.png';
import EvercoreLogo from '@/assets/Evercore.png';
import USCSchoolLogo from '@/assets/USClogo.png';
import UCSDSchoolLogo from '@/assets/UCSDlogo.png';
import SDSUSchoolLogo from '@/assets/SDSUlogo.png';

const CHROME_EXTENSION_URL =
  'https://chromewebstore.google.com/detail/offerloop/aabnjgecmobcnnhkilbeocggbmgilpcl';

const C = {
  pageBg: '#F5F6F8',
  ink: '#003262',
  inkSubtle: '#4D619F',
  brand: '#2563EB',
  primaryBtn: '#4C62A8',
  primaryBtnHover: '#3D5293',
  body: '#475569',
  muted: '#64748B',
  cardBg: '#F7F9FE',
  cardBorder: '#E2E8F0',
  eyebrow: '#6478B4',
  divider: '#EEF2F8',
  navBlue: '#4A5E80',
  // Color sampled near the bottom of the mountain backdrop — used to continue
  // the atmospheric haze into the trust band so the transition isn't abrupt.
  mountainHaze: '#DCE6F2',
};

type StepKey = 'find' | 'draft' | 'coffee' | 'track';
type Step = {
  key: StepKey;
  n: string;
  label: string;
  title: string;
  eyebrow: string;
  description: string;
  image: string;
};

const STEPS: Step[] = [
  {
    key: 'find',
    n: '1',
    label: 'FIND',
    title: 'Find the right person',
    eyebrow: '01 FIND',
    description:
      "You tell us the company, role, or school. We find the actual people worth reaching out to and surface their contact info.",
    image: StepFind,
  },
  {
    key: 'draft',
    n: '2',
    label: 'DRAFT',
    title: 'Generate your email',
    eyebrow: '02 DRAFT',
    description:
      "We write the cold email from your resume and their background. Drafts land in your real Gmail — your account, your voice.",
    image: StepDraft,
  },
  {
    key: 'coffee',
    n: '3',
    label: 'COFFEE CHAT',
    title: 'Prep your chat',
    eyebrow: '03 COFFEE CHAT',
    description:
      "When they say yes, the prep is ready before the meeting — research, talking points, and questions worth asking.",
    image: StepCoffee,
  },
  {
    key: 'track',
    n: '4',
    label: 'TRACK',
    title: 'Track every reply',
    eyebrow: '04 TRACK',
    description:
      "The tracker advances the moment someone replies. Follow-ups draft themselves. Nothing falls through the cracks.",
    image: StepTrack,
  },
];

// Real students whose photos we have. Names + photos line up.
const STORIES = [
  {
    name: 'David Ji',
    role: 'Incoming FedEx Intern',
    photo: DavidJi,
    quote:
      "As an international student, I had no pre-existing network. Offerloop let me find and connect with professionals that turned into an offer.",
    logoText: 'FedEx',
    logoSrc: null as string | null,
  },
  {
    name: 'Jackson Leck',
    role: 'PE Intern, Blackstone',
    photo: JacksonLeck,
    quote:
      "I had so many recruiting tabs open. Now I have one. Everything I need in a single place.",
    logoText: null,
    logoSrc: BlackstoneLogo,
  },
  {
    name: 'Sarah Ucuzoglu',
    role: 'Advisory Intern, PwC',
    photo: SarahU,
    quote:
      "Automating cold outreach gave me more time face to face with professionals who could actually help.",
    logoText: null,
    logoSrc: PwCLogo,
  },
  {
    name: 'Dylan Roby',
    role: 'Incoming Analyst',
    photo: DylanRoby,
    quote:
      "Tracker kept every reply in one place. I never lost a follow-up, and the prep was ready before every meeting.",
    logoText: null,
    logoSrc: EvercoreLogo,
  },
];

// Additional student stories revealed by the "Show more" button below the
// carousel. Same shape as STORIES but without firm logos (no assets yet) —
// the firm name renders as muted uppercase text via the existing fallback.
const EXTRA_STORIES = [
  {
    name: 'Vibusha Vadivel',
    role: 'Incoming SWE Intern, IBM',
    photo: VibushaVadivel,
    quote:
      "Sent 12 emails in 10 minutes. Got 4 coffee chats. One turned into my summer offer.",
    logoText: null,
    logoSrc: UCSDSchoolLogo as string | null,
  },
  {
    name: 'Eli Hamou',
    role: 'Audit Intern, Deloitte',
    photo: EliHamou,
    quote:
      "The coffee chat prep alone saved me hours. I walked into every call actually knowing what to say.",
    logoText: null,
    logoSrc: USCSchoolLogo,
  },
  {
    name: 'Matthew Dolins',
    role: 'Incoming Tax Intern, Deloitte',
    photo: MatthewDolins,
    quote:
      "Got my offer after networking with 3 people I found through Offerloop in a single afternoon.",
    logoText: null,
    logoSrc: USCSchoolLogo,
  },
  {
    name: 'Luke Brooks',
    role: 'CRE Market Research Analyst, Newmark Mountain West',
    photo: LukeBrooks,
    quote:
      "I went from spending entire weekends writing emails to having my whole outreach done before Monday.",
    logoText: 'Utah',
    logoSrc: null,
  },
  {
    name: 'Rocco Lepiane',
    role: 'Incoming Audit Intern, EY',
    photo: RoccoLepiane,
    quote:
      "Used the hiring manager finder on a real posting. Had a coffee chat within a week, offer not long after.",
    logoText: null,
    logoSrc: USCSchoolLogo,
  },
  {
    name: 'Julianna Seymour',
    role: 'Audit & Assurance Intern, EY',
    photo: JuliannaSeymour,
    quote:
      "Finally a tool that understands what students actually need during recruiting season. This is it.",
    logoText: null,
    logoSrc: SDSUSchoolLogo,
  },
  {
    name: 'Reese Hafner',
    role: 'Incoming Engineer, Raytheon',
    photo: ReeseHafner,
    quote:
      "I landed 3 coffee chats in my first week. Before Offerloop I couldn't even find the right people to email.",
    logoText: 'Florida',
    logoSrc: null,
  },
  {
    name: 'Louis Faillace',
    role: 'Incoming Sales & Trading Analyst, Deutsche Bank',
    photo: LouisFaillace,
    quote:
      "The email tracking changed everything. I knew exactly when to follow up instead of guessing.",
    logoText: null,
    logoSrc: USCSchoolLogo,
  },
];

const UNIVERSITY_LOGOS = [
  { src: BerkeleyLogo, alt: 'UC Berkeley', h: 38 },
  { src: UCLALogo, alt: 'UCLA', h: 32 },
  { src: WhartonLogo, alt: 'Wharton', h: 38 },
  { src: NotreDameLogo, alt: 'Notre Dame', h: 50 },
  { src: GeorgetownLogo, alt: 'Georgetown', h: 50 },
  { src: MichiganLogo, alt: 'Michigan', h: 50 },
  { src: DartmouthLogo, alt: 'Dartmouth', h: 50 },
  { src: NYULogo, alt: 'NYU', h: 32 },
  { src: StanfordLogo, alt: 'Stanford', h: 32 },
  { src: USCLogo, alt: 'USC', h: 32 },
];

// ─── Accent ───
// Italic serif in a muted blue. Opt-in `squiggle` prop adds the hand-drawn
// underline from Figma — currently used only on "Offer" in the hero.
// The squiggle is an absolutely-positioned overlay so it does NOT change
// line-height or push surrounding content around.
const Highlight: React.FC<React.PropsWithChildren<{ squiggle?: boolean }>> = ({
  children,
  squiggle = false,
}) => (
  <span
    style={{
      position: 'relative',
      display: squiggle ? 'inline-block' : 'inline',
      fontStyle: 'italic',
      color: C.inkSubtle,
    }}
  >
    {children}
    {squiggle && (
      <span
        aria-hidden
        className="fs-squiggle"
        style={{
          position: 'absolute',
          left: '-2%',
          right: '-2%',
          bottom: '-0.42em',
          height: '0.55em',
          // Use the squiggle PNG as a mask so we can paint it any color —
          // here brand blue — instead of the asset's native navy.
          WebkitMaskImage: `url(${SquiggleUnderline})`,
          maskImage: `url(${SquiggleUnderline})`,
          WebkitMaskSize: '100% 100%',
          maskSize: '100% 100%',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          backgroundColor: C.brand,
          opacity: 0.55,
          pointerEvents: 'none',
        }}
      />
    )}
  </span>
);

// ─── Wash ───
// Real watercolor highlight strike using the Figma asset. Used only on the
// pull-quote testimonial (where Figma actually shows it), under the phrases
// "Got my Deloitte offer" and "in a single afternoon."
const Wash: React.FC<React.PropsWithChildren> = ({ children }) => (
  <span
    style={{
      position: 'relative',
      display: 'inline',
      backgroundImage: `url(${HighlightWash})`,
      backgroundSize: '100% 70%',
      backgroundRepeat: 'no-repeat',
      backgroundPosition: '0 88%',
      padding: '0 0.05em',
    }}
  >
    {children}
  </span>
);

// Rotating example queries for the hero search input's typewriter
// placeholder. Same pattern as HeroSearchCTA but tuned to the For Students
// audience — schools, target firms, the kind of person they want to meet.
const FS_ROTATING_PLACEHOLDERS = [
  'USC alumni at Goldman Sachs in NYC',
  'McKinsey consultants from Michigan Ross',
  'PMs at Stripe who studied CS at Berkeley',
  'IB analysts at JPMorgan under 3 years out',
  'Recruiters at Meta for SWE intern roles',
];

const ForStudentsPage = () => {
  const navigate = useNavigate();
  const { user } = useFirebaseAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [navbarScrolled, setNavbarScrolled] = useState(false);
  const [activeStep, setActiveStep] = useState<StepKey>('find');
  // Hero search input — single-line text box with a typewriter ghost
  // placeholder. Submitting sends the visitor to signup. The query itself
  // is intentionally not preserved across the auth handoff yet; if the
  // user wants that, hook it into the redirect param later.
  const [heroQuery, setHeroQuery] = useState('');
  const [heroFocused, setHeroFocused] = useState(false);
  const [typedPlaceholder, setTypedPlaceholder] = useState('');
  const [showAllStories, setShowAllStories] = useState(false);

  useEffect(() => {
    const handleScroll = () => setNavbarScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add('visible');
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -30px 0px' },
    );
    const els = document.querySelectorAll('.reveal');
    els.forEach((el) => observer.observe(el));
    return () => els.forEach((el) => observer.unobserve(el));
  }, []);

  // Typewriter effect for the hero search input — cycles through
  // FS_ROTATING_PLACEHOLDERS, types each out, holds, then erases. Pauses
  // when the user focuses or starts typing. Mirrors HeroSearchCTA.
  useEffect(() => {
    if (heroQuery || heroFocused) {
      setTypedPlaceholder('');
      return;
    }
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let idx = 0;
    let charIdx = 0;
    let mode: 'typing' | 'hold' | 'erasing' | 'pause' = 'typing';

    const tick = () => {
      if (cancelled) return;
      const target = FS_ROTATING_PLACEHOLDERS[idx];
      if (mode === 'typing') {
        if (charIdx < target.length) {
          charIdx++;
          setTypedPlaceholder(target.slice(0, charIdx));
          timeoutId = setTimeout(tick, 42 + Math.random() * 38);
        } else {
          mode = 'hold';
          timeoutId = setTimeout(tick, 1700);
        }
      } else if (mode === 'hold') {
        mode = 'erasing';
        timeoutId = setTimeout(tick, 30);
      } else if (mode === 'erasing') {
        if (charIdx > 0) {
          charIdx--;
          setTypedPlaceholder(target.slice(0, charIdx));
          timeoutId = setTimeout(tick, 18);
        } else {
          mode = 'pause';
          idx = (idx + 1) % FS_ROTATING_PLACEHOLDERS.length;
          timeoutId = setTimeout(tick, 360);
        }
      } else if (mode === 'pause') {
        mode = 'typing';
        tick();
      }
    };

    timeoutId = setTimeout(tick, 400);
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [heroQuery, heroFocused]);

  const goSignup = () => navigate('/signin?mode=signup');
  const currentStep = STEPS.find((s) => s.key === activeStep) ?? STEPS[0];

  // Page-wide dot pattern. Lives as a CSS data-URI background on the root so
  // every section inherits it; sections that use a full color (footer, story
  // strip) opt out via their own background.
  const dotBg = `radial-gradient(rgba(15, 37, 69, 0.13) 1.4px, transparent 1.6px)`;

  return (
    <div
      style={{
        fontFamily: "'Inter', sans-serif",
        background: `${dotBg}, ${C.pageBg}`,
        backgroundSize: '24px 24px, auto',
        backgroundPosition: '0 0, 0 0',
        position: 'relative',
        overflowX: 'hidden',
        minHeight: '100vh',
      }}
    >
      <Helmet>
        <title>Offerloop for Students: Land your next offer through real outreach.</title>
        <meta
          name="description"
          content="Built for college students recruiting for consulting, banking, and tech. Find alumni, draft personalized cold emails, and prep coffee chats — all in one place."
        />
        <link rel="canonical" href="https://offerloop.ai/for-students" />
        <meta property="og:title" content="Offerloop for Students: Your next offer starts with us." />
        <meta
          property="og:description"
          content="Just tell us who you want to meet, and we'll do the outreach. Trusted by students at USC, UCLA, NYU, Stanford, Michigan, and more."
        />
        <meta property="og:url" content="https://offerloop.ai/for-students" />
        <meta property="og:type" content="website" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Lora:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </Helmet>

      <style>{`
        @keyframes fs-logo-scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        @keyframes fs-story-scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        @keyframes fs-yeti-float { 0%, 100% { transform: translateY(0) rotate(-3deg); } 50% { transform: translateY(-6px) rotate(-3deg); } }
        @keyframes fs-pin-pulse { 0%, 100% { transform: translateX(-50%) scale(1); } 50% { transform: translateX(-50%) scale(1.05); } }

        /* Hero Yeti entrance — the body slides in from off the left edge,
           then the paw catches up a beat later so the whole thing reads as
           the Yeti reaching around the corner of the product card and
           settling into the peek pose. After settling, the body breathes
           with a subtle vertical bob so it stays alive on the page. */
        @keyframes fs-yeti-enter {
          0%   { opacity: 0; transform: translate(-70px, 6px); }
          70%  { opacity: 1; transform: translate(6px, -2px); }
          100% { opacity: 1; transform: translate(0, 0); }
        }
        @keyframes fs-yeti-breathe {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-4px); }
        }
        .fs-yeti-enter {
          opacity: 0;
          animation:
            fs-yeti-enter 1.5s cubic-bezier(0.22, 1, 0.36, 1) 0.35s forwards,
            fs-yeti-breathe 5.5s ease-in-out 2s infinite;
        }

        /* Paw entrance — slides in from the left + settles into the slight
           negative-rotate grip pose. Delayed so it lands after the body
           appears, like the Yeti planted the hand last. */
        @keyframes fs-paw-grip {
          0%   { opacity: 0; transform: translateX(-26px) rotate(-30deg); }
          70%  { opacity: 1; transform: translateX(4px)  rotate(-4deg); }
          100% { opacity: 1; transform: translateX(0)    rotate(-10deg); }
        }
        .fs-paw-grip {
          opacity: 0;
          animation: fs-paw-grip 1.4s cubic-bezier(0.22, 1, 0.36, 1) 1s forwards;
        }

        @media (prefers-reduced-motion: reduce) {
          .fs-yeti-enter, .fs-paw-grip {
            animation: none;
            opacity: 1;
          }
          .fs-paw-grip { transform: rotate(-10deg); }
        }

        /* Squiggle underline — draws itself in when the parent .reveal
           crosses into view. We hide it (clip from the right) by default
           and clear the clip when the ancestor .reveal turns .visible.
           Falls back to a fully-drawn squiggle if reduced motion is on or
           the parent isn't using the reveal observer. */
        .fs-squiggle {
          clip-path: inset(0 100% 0 0);
          -webkit-clip-path: inset(0 100% 0 0);
          transition: clip-path 0.9s cubic-bezier(0.22, 1, 0.36, 1),
                      -webkit-clip-path 0.9s cubic-bezier(0.22, 1, 0.36, 1);
          transition-delay: 0.25s;
        }
        .reveal.visible .fs-squiggle,
        .reveal.visible.fs-yeti-enter ~ * .fs-squiggle {
          clip-path: inset(0 0 0 0);
          -webkit-clip-path: inset(0 0 0 0);
        }
        /* Headings that aren't wrapped in .reveal — show the squiggle by
           default. The selector below targets squiggles whose nearest
           positioned ancestor inside .reveal exists; everything else gets
           the fully-drawn fallback. */
        :not(.reveal) > .fs-squiggle,
        :not(.reveal) > * > .fs-squiggle {
          clip-path: inset(0 0 0 0);
          -webkit-clip-path: inset(0 0 0 0);
        }
        @media (prefers-reduced-motion: reduce) {
          .fs-squiggle {
            clip-path: inset(0 0 0 0) !important;
            -webkit-clip-path: inset(0 0 0 0) !important;
            transition: none;
          }
        }

        .fs-logo-track {
          display: flex;
          gap: clamp(40px, 5vw, 76px);
          align-items: center;
          width: max-content;
          animation: fs-logo-scroll 38s linear infinite;
        }
        .fs-logo-track:hover { animation-play-state: paused; }

        .fs-story-track {
          display: flex;
          gap: 24px;
          width: max-content;
          padding: 12px 4px 24px;
          animation: fs-story-scroll 38s linear infinite;
        }
        .fs-story-track:hover { animation-play-state: paused; }

        .fs-mask-edges {
          -webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 8%, #000 92%, transparent 100%);
                  mask-image: linear-gradient(90deg, transparent 0%, #000 8%, #000 92%, transparent 100%);
        }

        .fs-btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: ${C.primaryBtn};
          color: #fff;
          font-family: 'Inter', sans-serif;
          font-size: 16px;
          font-weight: 600;
          padding: 14px 28px;
          border-radius: 10px;
          border: none;
          cursor: pointer;
          text-decoration: none;
          box-shadow: 0 1px 1px rgba(0,0,0,0.1), 0 6px 18px rgba(76, 98, 168, 0.18);
          transition: background 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease;
        }
        .fs-btn-primary:hover {
          background: ${C.primaryBtnHover};
          transform: translateY(-1.5px);
          box-shadow: 0 1px 1px rgba(0,0,0,0.1), 0 14px 28px rgba(76, 98, 168, 0.28);
        }
        .fs-btn-primary:active { transform: translateY(0); }

        .fs-card {
          transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1),
                      box-shadow 0.25s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .fs-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 1px 2px rgba(15,37,69,0.04), 0 14px 36px rgba(37,99,235,0.10), 0 28px 64px rgba(15,23,42,0.10);
        }

        .fs-step-btn {
          all: unset;
          width: 100%;
          display: flex;
          gap: 16px;
          align-items: flex-start;
          padding: 18px 0;
          border-bottom: 2px solid ${C.cardBorder};
          cursor: pointer;
          opacity: 0.42;
          transition: opacity 0.2s ease, transform 0.2s ease;
        }
        .fs-step-btn:hover { opacity: 0.7; transform: translateX(2px); }
        .fs-step-btn.is-active { opacity: 1; transform: translateX(0); }
        .fs-step-btn:focus-visible { outline: 2px solid ${C.brand}; outline-offset: 4px; border-radius: 6px; }

        .fs-avatar-cluster img {
          border: 3px solid #fff;
          border-radius: 50%;
          box-shadow: 0 4px 14px rgba(15,37,69,0.16);
        }

        /* Persona toggle — inline text links meshed into the banner, Clado-style */
        .fs-nav-link {
          position: relative;
          font-family: 'Libre Baskerville', Georgia, serif;
          font-size: 13px;
          font-weight: 600;
          text-decoration: none;
          color: ${C.navBlue};
          padding: 4px 2px;
          transition: color 0.15s ease;
        }
        .fs-nav-link::after {
          content: '';
          position: absolute;
          left: 0;
          right: 0;
          bottom: -2px;
          height: 2px;
          background: ${C.brand};
          transform: scaleX(0);
          transform-origin: center;
          transition: transform 0.2s ease;
        }
        .fs-nav-link:hover { color: #0F172A; }
        .fs-nav-link:hover::after { transform: scaleX(0.5); }
        .fs-nav-link.is-active { color: ${C.brand}; }
        .fs-nav-link.is-active::after { transform: scaleX(1); }
      `}</style>

      {/* ═══════════════ NAVBAR (persona toggle lives inside) ═══════════════ */}
      <div
        className="fixed top-0 left-0 right-0 z-50 flex justify-center"
        style={{ padding: '12px 24px 8px' }}
      >
        <header
          className="flex items-center justify-between w-full h-12 px-5 md:px-6"
          style={{
            maxWidth: '860px',
            width: '100%',
            boxSizing: 'border-box',
            background: navbarScrolled
              ? 'rgba(255,255,255,0.96)'
              : 'rgba(255,255,255,0.88)',
            backdropFilter: 'blur(16px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(16px) saturate(1.4)',
            border: '1px solid rgba(37,99,235,0.1)',
            borderRadius: '100px',
            boxShadow: navbarScrolled
              ? '0 2px 16px rgba(37,99,235,0.08)'
              : '0 1px 8px rgba(0,0,0,0.03)',
            transition: 'all 0.3s ease',
          }}
        >
          <div className="flex items-center">
            <img
              src={OfferloopLogo}
              alt="Offerloop"
              className="h-16 cursor-pointer"
              onClick={() => navigate('/')}
            />
          </div>

          <nav
            className="hidden md:flex items-center"
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              gap: 32,
            }}
          >
            <Link to="/for-students" className="fs-nav-link is-active" aria-current="page">
              For Students
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
              <Link to="/pricing" className="fs-nav-link">
                Pricing
              </Link>
              <Link to="/about" className="fs-nav-link">
                About
              </Link>
            </div>
          </nav>

          <div className="hidden md:flex items-center" style={{ marginLeft: 'auto' }}>
            {user ? (
              <button
                onClick={() => navigate('/find')}
                className="btn-ghost"
                style={{ fontSize: '13px', fontWeight: 700, padding: '8px 16px' }}
              >
                Find people
              </button>
            ) : (
              <button
                onClick={() => navigate('/signin')}
                style={{
                  background: C.brand,
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: 600,
                  fontFamily: "'Libre Baskerville', Georgia, serif",
                  padding: '8px 20px',
                  borderRadius: '100px',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease, transform 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#1D4ED8';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = C.brand;
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                Sign in
              </button>
            )}
          </div>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2"
            style={{ color: C.navBlue }}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </header>
      </div>

      {mobileMenuOpen && (
        <div
          className="fixed top-[72px] left-4 right-4 md:hidden z-40"
          style={{
            background: 'rgba(255,255,255,0.98)',
            border: '1px solid rgba(37,99,235,0.1)',
            borderRadius: '16px',
            boxShadow: '0 4px 24px rgba(37,99,235,0.08)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <nav className="flex flex-col p-3 gap-1">
            <Link
              to="/for-students"
              onClick={() => setMobileMenuOpen(false)}
              className="text-left px-4 py-3 text-sm font-semibold rounded-lg"
              style={{
                color: '#fff',
                background: C.brand,
                fontFamily: "'Libre Baskerville', Georgia, serif",
                textDecoration: 'none',
              }}
            >
              For Students
            </Link>
            <Link
              to="/pricing"
              onClick={() => setMobileMenuOpen(false)}
              className="text-left px-4 py-3 text-sm font-medium rounded-lg hover:bg-gray-50"
              style={{
                color: C.navBlue,
                fontFamily: "'Libre Baskerville', Georgia, serif",
                textDecoration: 'none',
              }}
            >
              Pricing
            </Link>
            <Link
              to="/about"
              onClick={() => setMobileMenuOpen(false)}
              className="text-left px-4 py-3 text-sm font-medium rounded-lg hover:bg-gray-50"
              style={{
                color: C.navBlue,
                fontFamily: "'Libre Baskerville', Georgia, serif",
                textDecoration: 'none',
              }}
            >
              About
            </Link>
            <div
              className="border-t mt-2 pt-2"
              style={{ borderColor: 'rgba(37,99,235,0.08)' }}
            >
              <button
                onClick={() => {
                  navigate('/signin');
                  setMobileMenuOpen(false);
                }}
                className="w-full text-center py-3 text-sm font-semibold"
                style={{
                  background: C.brand,
                  color: '#fff',
                  borderRadius: '100px',
                  fontFamily: "'Libre Baskerville', Georgia, serif",
                }}
              >
                Sign in
              </button>
            </div>
          </nav>
        </div>
      )}

      <div className="h-14" />

      {/* ═══════════════ HERO ═══════════════ */}
      <section
        style={{
          position: 'relative',
          padding: '96px 32px 80px',
          overflow: 'hidden',
          zIndex: 1,
        }}
      >
        {/* Mountains + lake backdrop — runs longer and bleeds into the next
            section via a slow gradient fade. The trust band below picks up
            the same haze color so there's no visible seam. */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 360,
            left: 0,
            right: 0,
            height: 780,
            backgroundImage: `url(${MountainsLake})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center top',
            backgroundRepeat: 'no-repeat',
            opacity: 0.78,
            pointerEvents: 'none',
            zIndex: 0,
            maskImage:
              'linear-gradient(180deg, transparent 0%, #000 18%, #000 52%, rgba(0,0,0,0.55) 78%, transparent 100%)',
            WebkitMaskImage:
              'linear-gradient(180deg, transparent 0%, #000 18%, #000 52%, rgba(0,0,0,0.55) 78%, transparent 100%)',
          }}
        />
        {/* Soft tinted gradient that picks up where the mountain mask
            dissolves, so the eye stays in atmosphere instead of slamming
            back into flat page bg. */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 900,
            left: 0,
            right: 0,
            height: 380,
            background: `linear-gradient(180deg, ${C.mountainHaze} 0%, rgba(220, 230, 242, 0.55) 50%, transparent 100%)`,
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />

        <div style={{ position: 'relative', zIndex: 2, maxWidth: 1180, margin: '0 auto' }}>
          <h1
            style={{
              fontFamily: "'Libre Baskerville', Georgia, serif",
              fontSize: 'clamp(40px, 5.2vw, 60px)',
              fontWeight: 400,
              lineHeight: 1.1,
              letterSpacing: '-0.015em',
              color: C.ink,
              textAlign: 'center',
              margin: '0 0 16px',
            }}
          >
            Your next <Highlight squiggle>Offer</Highlight> starts with us
          </h1>

          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 'clamp(16px, 1.5vw, 20px)',
              lineHeight: 1.6,
              color: C.body,
              textAlign: 'center',
              letterSpacing: '0.04em',
              margin: '0 auto 32px',
              maxWidth: 720,
            }}
          >
            Just tell us who you want to meet, and we'll do the outreach.
          </p>

          {/* Hero CTA — one-line search box + Sign up with Google button.
              Typing into the input and hitting Enter (or submitting the
              form) sends the visitor to signup, same as the button. */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              goSignup();
            }}
            className="fs-hero-cta"
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'stretch',
              maxWidth: 640,
              margin: '0 auto 56px',
              borderRadius: 10,
              boxShadow: heroFocused
                ? '0 0 0 6px rgba(37, 99, 235, 0.10), 0 10px 24px rgba(37, 99, 235, 0.14)'
                : '0 2px 8px rgba(15, 37, 69, 0.05), 0 14px 30px rgba(15, 37, 69, 0.06)',
              transition: 'box-shadow 0.18s ease',
            }}
          >
            <input
              type="text"
              value={heroQuery}
              onChange={(e) => setHeroQuery(e.target.value)}
              onFocus={() => setHeroFocused(true)}
              onBlur={() => setHeroFocused(false)}
              placeholder={typedPlaceholder || (heroFocused ? 'Describe who you want to meet…' : '')}
              aria-label="Describe who you want to meet"
              style={{
                flex: '1 1 280px',
                minWidth: 0,
                fontFamily: "'Inter', sans-serif",
                fontSize: 16,
                lineHeight: 1.5,
                color: C.ink,
                background: '#ffffff',
                border: `1.5px solid ${heroFocused ? C.brand : 'rgba(15, 37, 69, 0.10)'}`,
                borderRight: 'none',
                borderRadius: '10px 0 0 10px',
                padding: '14px 18px',
                outline: 'none',
                transition: 'border-color 0.18s ease',
              }}
            />
            <button
              type="submit"
              className="fs-btn-primary"
              style={{
                borderRadius: '0 10px 10px 0',
                boxShadow: 'none',
                flexShrink: 0,
              }}
            >
              Sign up with Google
              <ArrowRight size={16} strokeWidth={2.3} />
            </button>
          </form>

          {/* Product mockup with the side-view Yeti riding alongside the
              left edge of the card — most of the body sits in the left
              margin, the inner shoulder/arm slips behind the card edge.
              A separate paw is drawn ON TOP of the card edge so the Yeti
              reads as "pulling itself around" the card to peek over. */}
          <div style={{ position: 'relative', maxWidth: 1000, margin: '0 auto' }}>
            <img
              src={HeroYetiSide}
              alt=""
              aria-hidden
              className="hidden lg:block fs-yeti-enter"
              style={{
                position: 'absolute',
                top: '24%',
                left: -150,
                width: 200,
                pointerEvents: 'none',
                zIndex: 0,
              }}
            />
            {/* Paw gripping the card edge — sits above the card so it
                paints in front of the rim, giving the illusion the Yeti
                is hooking its fingers over to lean around. The rotate
                pose is owned by the .fs-paw-grip animation's final
                keyframe, so no inline transform here. */}
            <img
              src={YetiPaw}
              alt=""
              aria-hidden
              className="hidden lg:block fs-paw-grip"
              style={{
                position: 'absolute',
                top: '39%',
                left: -22,
                width: 44,
                pointerEvents: 'none',
                zIndex: 2,
                transformOrigin: '100% 50%',
              }}
            />

            <div
              style={{
                position: 'relative',
                zIndex: 1,
                borderRadius: 12,
                boxShadow:
                  '0 15px 19px -3px rgba(0,0,0,0.1), 0 6px 8px -4px rgba(0,0,0,0.1)',
                overflow: 'hidden',
                background: '#ffffff',
              }}
            >
              <video
                src={HeroProductVideo}
                poster={HeroProduct}
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                aria-label="Offerloop product preview"
                style={{ display: 'block', width: '100%', height: 'auto' }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ UNIVERSITY TRUST BAND (carousel) ═══════════════ */}
      <section
        style={{
          position: 'relative',
          padding: '40px 0 64px',
          // Picks up the haze color so the mountain backdrop blends in.
          background: `linear-gradient(180deg, transparent 0%, ${C.mountainHaze}66 60%, transparent 100%)`,
          zIndex: 1,
        }}
      >
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 32px' }}>
          <h2
            className="reveal"
            style={{
              fontFamily: "'Libre Baskerville', Georgia, serif",
              fontSize: 'clamp(22px, 3vw, 32px)',
              fontWeight: 400,
              lineHeight: 1.15,
              letterSpacing: '-.02em',
              color: C.ink,
              textAlign: 'center',
              whiteSpace: 'nowrap',
              margin: '0 0 36px',
            }}
          >
            Trusted by students at the country&apos;s top universities
          </h2>
        </div>

        <div className="fs-mask-edges" style={{ overflow: 'hidden' }}>
          <div className="fs-logo-track">
            {[...UNIVERSITY_LOGOS, ...UNIVERSITY_LOGOS, ...UNIVERSITY_LOGOS].map(
              (logo, i) => (
                <img
                  key={`${logo.alt}-${i}`}
                  src={logo.src}
                  alt={logo.alt}
                  style={{
                    height: logo.h,
                    width: 'auto',
                    objectFit: 'contain',
                    flexShrink: 0,
                  }}
                />
              ),
            )}
          </div>
        </div>
      </section>

      {/* ═══════════════ BIG PULL QUOTE ═══════════════ */}
      <section
        style={{
          position: 'relative',
          padding: '88px 32px 120px',
          borderTop: `1px solid ${C.divider}`,
          overflow: 'visible',
          zIndex: 1,
        }}
      >
        <div style={{ maxWidth: 1200, margin: '0 auto', position: 'relative' }}>
          {/* Big quote-mark decoration — hand-drawn paired opening quote
              from Figma node 1899:10622 (Primary Filled Opening Quote). */}
          <div style={{ textAlign: 'center', margin: '0 0 12px' }}>
            <img
              src={OpeningQuote}
              alt=""
              aria-hidden
              style={{
                display: 'inline-block',
                width: 64,
                height: 'auto',
                userSelect: 'none',
              }}
            />
          </div>
          <div
            className="reveal"
            style={{
              maxWidth: 720,
              margin: '0 auto',
              textAlign: 'center',
              position: 'relative',
              zIndex: 2,
            }}
          >
            <p
              style={{
                fontFamily: "'Libre Baskerville', Georgia, serif",
                fontSize: 'clamp(26px, 3vw, 36px)',
                lineHeight: 1.35,
                color: C.ink,
                letterSpacing: '0.03em',
                margin: '0 0 24px',
              }}
            >
              <Wash>Got my Deloitte offer</Wash> after networking with 3 consultants I
              found through Offerloop <Wash>in a single afternoon.</Wash>
            </p>
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 22,
                color: C.body,
                letterSpacing: '0.04em',
                margin: '0 0 4px',
              }}
            >
              Jordan W.
            </p>
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 17,
                color: C.muted,
                margin: 0,
              }}
            >
              Incoming consultant, Deloitte
            </p>
          </div>

          {/* Scout lanyard badge — single Figma asset (node 2025:16161)
              that already bakes in the "Offerloop" header, the Scout Yeti
              tile, the SCOUT footer, and the lanyard clip. Rotated a touch
              so it reads as casually pinned in place. */}
          <img
            src={ScoutBadge}
            alt="Scout"
            className="reveal hidden lg:block"
            style={{
              position: 'absolute',
              top: -16,
              right: 8,
              width: 200,
              height: 'auto',
              transform: 'rotate(8deg)',
              transformOrigin: '50% 0%',
              zIndex: 1,
              pointerEvents: 'none',
              filter: 'drop-shadow(0 16px 24px rgba(15, 37, 69, 0.18))',
            }}
          />
        </div>
      </section>

      {/* ═══════════════ HOW IT WORKS (interactive) ═══════════════ */}
      <section
        style={{
          padding: '60px 32px 100px',
          position: 'relative',
          zIndex: 1,
          borderTop: '1px solid #9EACC0',
          // Same radial backdrop the For Anyone "Outreach, end to end."
          // section uses so the two pages feel like one design system.
          background:
            'radial-gradient(ellipse 90% 60% at 50% 40%, #E8F1FB 0%, #DCE7F7 100%)',
          overflow: 'hidden',
        }}
      >
        {/* Soft ambient blue/indigo glows behind the section, ported
            from the For Anyone equivalent. */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: '10%',
            left: '-12%',
            width: '50%',
            height: '60%',
            background:
              'radial-gradient(ellipse, rgba(37, 99, 235, 0.10), transparent 65%)',
            filter: 'blur(60px)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            bottom: '5%',
            right: '-15%',
            width: '55%',
            height: '70%',
            background:
              'radial-gradient(ellipse, rgba(129, 140, 248, 0.10), transparent 65%)',
            filter: 'blur(64px)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 1280, margin: '0 auto' }}>
          <div className="reveal" style={{ textAlign: 'center', maxWidth: 820, margin: '0 auto 56px' }}>
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: '0.18em',
                color: C.eyebrow,
                textTransform: 'uppercase',
                margin: '0 0 16px',
              }}
            >
              How it works
            </p>
            <h2
              style={{
                fontFamily: "'Libre Baskerville', Georgia, serif",
                fontSize: 'clamp(32px, 4.5vw, 48px)',
                fontWeight: 400,
                lineHeight: 1.1,
                color: C.ink,
                margin: '0 0 16px',
              }}
            >
              Let us handle the <Highlight>busy work.</Highlight>
            </h2>
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 20,
                lineHeight: 1.5,
                color: C.body,
                letterSpacing: '0.02em',
                margin: 0,
              }}
            >
              From finding the right person to hitting send in just 4 steps.
            </p>
          </div>

          <div
            className="reveal"
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(280px, 340px) minmax(0, 1fr)',
              gap: 64,
              alignItems: 'start',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                paddingLeft: 8,
                borderLeft: `2px solid ${C.cardBorder}`,
              }}
            >
              {STEPS.map((step) => {
                const isActive = step.key === activeStep;
                return (
                  <button
                    key={step.key}
                    type="button"
                    className={`fs-step-btn ${isActive ? 'is-active' : ''}`}
                    onClick={() => setActiveStep(step.key)}
                    onMouseEnter={() => setActiveStep(step.key)}
                    aria-pressed={isActive}
                  >
                    <div
                      style={{
                        width: 50,
                        height: 50,
                        borderRadius: 10,
                        background: isActive ? '#E0E7FF' : '#F1F5F9',
                        border: `1px solid ${isActive ? '#A5B4FC' : C.cardBorder}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        transition: 'background 0.2s ease, border-color 0.2s ease',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "'Libre Baskerville', Georgia, serif",
                          fontSize: 26,
                          color: '#192E50',
                        }}
                      >
                        {step.n}
                      </span>
                    </div>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <p
                        style={{
                          fontFamily: "'Inter', sans-serif",
                          fontSize: 18,
                          fontWeight: isActive ? 700 : 500,
                          letterSpacing: '0.08em',
                          color: C.eyebrow,
                          margin: '0 0 6px',
                        }}
                      >
                        {step.label}
                      </p>
                      <p
                        style={{
                          fontFamily: "'Libre Baskerville', Georgia, serif",
                          fontSize: 17,
                          color: C.ink,
                          margin: 0,
                        }}
                      >
                        {step.title}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            <div>
              <div
                key={currentStep.key}
                style={{
                  borderRadius: 16,
                  overflow: 'hidden',
                  border: `1px solid ${C.cardBorder}`,
                  boxShadow: '0 20px 25px -5px rgba(0,0,0,0.06)',
                  marginBottom: 28,
                  background: '#ffffff',
                }}
              >
                <img
                  src={currentStep.image}
                  alt={currentStep.title}
                  style={{ display: 'block', width: '100%', height: 'auto' }}
                />
              </div>
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 18,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: C.eyebrow,
                  margin: '0 0 18px',
                }}
              >
                {currentStep.eyebrow}
              </p>
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 22,
                  lineHeight: 1.55,
                  color: C.body,
                  margin: 0,
                  maxWidth: 720,
                }}
              >
                {currentStep.description}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ THE MATH (20 minutes) ═══════════════ */}
      <section style={{ padding: '80px 32px', position: 'relative', zIndex: 1, borderTop: '1px solid #9EACC0' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', textAlign: 'center' }}>
          <p
            className="reveal"
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: '0.18em',
              color: C.eyebrow,
              textTransform: 'uppercase',
              margin: '0 0 16px',
            }}
          >
            The math
          </p>
          <h2
            className="reveal"
            style={{
              fontFamily: "'Libre Baskerville', Georgia, serif",
              fontSize: 'clamp(32px, 4.5vw, 48px)',
              fontWeight: 400,
              lineHeight: 1.1,
              color: C.ink,
              margin: '0 0 16px',
            }}
          >
            What you can do in <Highlight>20 minutes</Highlight>
          </h2>
          <p
            className="reveal"
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 20,
              lineHeight: 1.5,
              color: C.body,
              letterSpacing: '0.04em',
              margin: '0 0 80px',
            }}
          >
            Same 20 minutes. A hundred more conversations.
          </p>

          <div
            className="reveal"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              alignItems: 'stretch',
              gap: 56,
              position: 'relative',
            }}
          >
            {/* Hand-drawn loop arrow accent emphasizing the jump from
                "Without" → "With" Offerloop. Sits above and between the
                two cards on lg+; hidden on smaller screens where the
                cards stack and the arrow would point the wrong way. */}
            <img
              src={DoodleArcArrow}
              alt=""
              aria-hidden
              className="hidden lg:block"
              style={{
                position: 'absolute',
                top: -64,
                left: '50%',
                transform: 'translateX(-50%) rotate(-4deg)',
                width: 180,
                height: 'auto',
                pointerEvents: 'none',
                zIndex: 2,
                opacity: 0.85,
              }}
            />
            <div
              className="fs-card"
              style={{
                flex: '1 1 380px',
                maxWidth: 426,
                background: C.cardBg,
                border: `1px solid ${C.cardBorder}`,
                borderRadius: 32,
                padding: '56px 32px',
                boxShadow: '0 10px 7.5px rgba(0,0,0,0.05), 0 4px 3px rgba(0,0,0,0.05)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 32,
              }}
            >
              <div style={{ width: '100%' }}>
                <p
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 22,
                    color: '#4A60A8',
                    letterSpacing: '0.08em',
                    margin: '0 0 18px',
                  }}
                >
                  Without Offerloop
                </p>
                <div style={{ height: 1, background: C.cardBorder, width: '100%' }} />
              </div>
              <CompareStat label="Find" value="1" sublabel="professional contacts" muted />
              <CompareStat label="Write" value="2" sublabel="emails" muted />
            </div>

            <div
              className="fs-card"
              style={{
                flex: '1 1 380px',
                maxWidth: 447,
                background: C.cardBg,
                border: '5px solid #96A8D8',
                borderRadius: 28,
                padding: '56px 32px',
                boxShadow: '0 9px 7px rgba(0,0,0,0.08), 0 4px 3px rgba(0,0,0,0.08)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 32,
                position: 'relative',
              }}
            >
              <img
                src={LandingThumbtack}
                alt=""
                aria-hidden
                style={{
                  position: 'absolute',
                  top: -52,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 86,
                  height: 'auto',
                  pointerEvents: 'none',
                  animation: 'fs-pin-pulse 4s ease-in-out infinite',
                }}
              />
              <div style={{ width: '100%' }}>
                <p
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 22,
                    color: '#4A60A8',
                    letterSpacing: '0.08em',
                    margin: '0 0 18px',
                  }}
                >
                  With Offerloop
                </p>
                <div style={{ height: 1, background: C.cardBorder, width: '100%' }} />
              </div>
              <CompareStat label="Find" value="200" sublabel="Verified professional contacts" italicSub />
              <CompareStat label="Write" value="120" sublabel="Personalized emails" italicSub />
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ CHROME EXTENSION ═══════════════ */}
      <section style={{ padding: '80px 32px', position: 'relative', zIndex: 1 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', textAlign: 'center' }}>
          <p
            className="reveal"
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: '0.18em',
              color: C.eyebrow,
              textTransform: 'uppercase',
              margin: '0 0 12px',
            }}
          >
            Extension
          </p>
          <h2
            className="reveal"
            style={{
              fontFamily: "'Libre Baskerville', Georgia, serif",
              fontSize: 'clamp(30px, 4.5vw, 48px)',
              fontWeight: 400,
              lineHeight: 1.15,
              color: C.ink,
              letterSpacing: '0.03em',
              margin: '0 0 12px',
            }}
          >
            <Highlight>Offerloop</Highlight> works inside LinkedIn
          </h2>
          <p
            className="reveal"
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 20,
              lineHeight: 1.5,
              color: C.body,
              letterSpacing: '0.04em',
              margin: '0 auto 32px',
              maxWidth: 760,
            }}
          >
            Find the email, prep the coffee chat, and draft the message — all with
            one extension.
          </p>
          <a
            href={CHROME_EXTENSION_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="fs-btn-primary reveal"
            style={{ marginBottom: 56 }}
          >
            Add to Chrome — it's free
          </a>

          <div
            className="reveal"
            style={{
              maxWidth: 1140,
              margin: '0 auto',
              borderRadius: 14,
              overflow: 'hidden',
              boxShadow:
                '0 20px 25px -5px rgba(0,0,0,0.10), 0 8px 10px -6px rgba(0,0,0,0.08)',
              background: '#ffffff',
              border: `1px solid ${C.cardBorder}`,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 16px',
                background: '#F1F5F9',
                borderBottom: `1px solid ${C.cardBorder}`,
              }}
            >
              <span style={{ width: 12, height: 12, borderRadius: 6, background: '#FF5F57' }} />
              <span style={{ width: 12, height: 12, borderRadius: 6, background: '#FEBC2E' }} />
              <span style={{ width: 12, height: 12, borderRadius: 6, background: '#28C840' }} />
              <div
                style={{
                  marginLeft: 20,
                  flex: 1,
                  height: 24,
                  borderRadius: 6,
                  background: '#ffffff',
                  border: `1px solid ${C.cardBorder}`,
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: 12,
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 11,
                  color: C.muted,
                  letterSpacing: '0.02em',
                }}
              >
                linkedin.com/in/...
              </div>
            </div>
            <img
              src={LinkedInExtension}
              alt="Offerloop Chrome extension on LinkedIn"
              style={{ display: 'block', width: '100%', height: 'auto' }}
            />
          </div>
        </div>
      </section>

      {/* ═══════════════ STORIES (carousel) ═══════════════ */}
      <section
        style={{
          padding: '72px 0 96px',
          background: '#ffffff',
          borderTop: '1px solid #9EACC0',
          borderBottom: '1px solid #9EACC0',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Hand-drawn navy bookmark hanging from the section's top edge —
            matches Figma node 2081:15807. Positioned in the upper-right
            quadrant so it doesn't compete with the centered title. */}
        <img
          src={StoriesBookmark}
          alt=""
          aria-hidden
          style={{
            position: 'absolute',
            top: -2,
            right: '14%',
            width: 56,
            height: 'auto',
            pointerEvents: 'none',
            zIndex: 2,
            filter: 'drop-shadow(0 4px 8px rgba(15, 37, 69, 0.10))',
          }}
        />

        <div style={{ maxWidth: 1320, margin: '0 auto', padding: '0 32px' }}>
          <div className="reveal" style={{ textAlign: 'center', margin: '0 auto 48px' }}>
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: '0.18em',
                color: C.eyebrow,
                textTransform: 'uppercase',
                margin: '0 0 16px',
              }}
            >
              Stories
            </p>
            <h2
              style={{
                fontFamily: "'Libre Baskerville', Georgia, serif",
                fontSize: 'clamp(32px, 4.5vw, 48px)',
                fontWeight: 400,
                lineHeight: 1.1,
                color: C.ink,
                letterSpacing: '0.03em',
                margin: 0,
              }}
            >
              From students who got <Highlight>the offer</Highlight>
            </h2>
          </div>
        </div>

        <div className="fs-mask-edges" style={{ overflow: 'hidden' }}>
          <div className="fs-story-track">
            {[...STORIES, ...STORIES, ...STORIES].map((card, i) => (
              <article
                key={`${card.name}-${i}`}
                className="fs-card"
                style={{
                  flex: '0 0 460px',
                  background: C.cardBg,
                  borderRadius: 28,
                  padding: 32,
                  boxShadow:
                    '0 10px 7.5px rgba(0,0,0,0.05), 0 4px 3px rgba(0,0,0,0.05)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: 380,
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      gap: 18,
                      alignItems: 'center',
                      marginBottom: 24,
                    }}
                  >
                    <img
                      src={card.photo}
                      alt={card.name}
                      style={{
                        width: 72,
                        height: 72,
                        borderRadius: '50%',
                        border: '5px solid #ffffff',
                        objectFit: 'cover',
                        boxShadow:
                          '0 4px 6px -1px rgba(0,0,0,0.08), 0 2px 4px -2px rgba(0,0,0,0.08)',
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          fontFamily: "'Inter', sans-serif",
                          fontSize: 20,
                          color: '#000',
                          letterSpacing: '0.04em',
                          margin: '0 0 4px',
                        }}
                      >
                        {card.name}
                      </p>
                      <p
                        style={{
                          fontFamily: "'Inter', sans-serif",
                          fontSize: 15,
                          color: C.body,
                          margin: 0,
                        }}
                      >
                        {card.role}
                      </p>
                    </div>
                  </div>
                  <p
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 18,
                      lineHeight: 1.5,
                      color: C.body,
                      margin: 0,
                    }}
                  >
                    "{card.quote}"
                  </p>
                </div>
                <div style={{ marginTop: 24, minHeight: 32 }}>
                  {card.logoSrc ? (
                    <img
                      src={card.logoSrc}
                      alt=""
                      style={{
                        height: 32,
                        width: 'auto',
                        objectFit: 'contain',
                      }}
                    />
                  ) : card.logoText === 'FedEx' ? (
                    <span
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 22,
                        fontWeight: 800,
                        letterSpacing: '-0.02em',
                        fontStyle: 'italic',
                      }}
                    >
                      <span style={{ color: '#4D148C' }}>Fed</span>
                      <span style={{ color: '#FF6600' }}>Ex</span>
                    </span>
                  ) : (
                    <span
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 15,
                        fontWeight: 600,
                        color: C.muted,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {card.logoText}
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>

        {/* Show-more reveal: surfaces the bulletin-board reviews
            (Vibusha, Eli, Matthew, Luke, Rocco, Julianna, Reese, Louis)
            in a static grid under the auto-scrolling carousel. */}
        <div
          style={{
            maxWidth: 1320,
            margin: '0 auto',
            padding: '0 32px',
            textAlign: 'center',
          }}
        >
          {showAllStories && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: 24,
                marginTop: 48,
                textAlign: 'left',
              }}
            >
              {EXTRA_STORIES.map((card) => (
                <article
                  key={card.name}
                  style={{
                    background: C.cardBg,
                    borderRadius: 28,
                    padding: 32,
                    boxShadow:
                      '0 10px 7.5px rgba(0,0,0,0.05), 0 4px 3px rgba(0,0,0,0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: 320,
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        gap: 18,
                        alignItems: 'center',
                        marginBottom: 24,
                      }}
                    >
                      <img
                        src={card.photo}
                        alt={card.name}
                        style={{
                          width: 64,
                          height: 64,
                          borderRadius: '50%',
                          border: '4px solid #ffffff',
                          objectFit: 'cover',
                          boxShadow:
                            '0 4px 6px -1px rgba(0,0,0,0.08), 0 2px 4px -2px rgba(0,0,0,0.08)',
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                          style={{
                            fontFamily: "'Inter', sans-serif",
                            fontSize: 18,
                            color: '#000',
                            letterSpacing: '0.04em',
                            margin: '0 0 4px',
                          }}
                        >
                          {card.name}
                        </p>
                        <p
                          style={{
                            fontFamily: "'Inter', sans-serif",
                            fontSize: 14,
                            color: C.body,
                            margin: 0,
                          }}
                        >
                          {card.role}
                        </p>
                      </div>
                    </div>
                    <p
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 16,
                        lineHeight: 1.5,
                        color: C.body,
                        margin: 0,
                      }}
                    >
                      "{card.quote}"
                    </p>
                  </div>
                  <div style={{ marginTop: 20, minHeight: 36, display: 'flex', alignItems: 'center' }}>
                    {card.logoSrc ? (
                      <img
                        src={card.logoSrc}
                        alt=""
                        style={{
                          height: 32,
                          width: 'auto',
                          objectFit: 'contain',
                        }}
                      />
                    ) : card.logoText === 'Utah' ? (
                      <span
                        style={{
                          fontFamily: "'Libre Baskerville', Georgia, serif",
                          fontSize: 22,
                          fontWeight: 700,
                          color: '#CC0000',
                          letterSpacing: '0.04em',
                        }}
                      >
                        Utah
                      </span>
                    ) : card.logoText === 'Florida' ? (
                      <span
                        style={{
                          fontFamily: "'Libre Baskerville', Georgia, serif",
                          fontSize: 22,
                          fontWeight: 700,
                          letterSpacing: '0.04em',
                        }}
                      >
                        <span style={{ color: '#FA4616' }}>U</span>
                        <span style={{ color: '#0021A5' }}>F</span>
                      </span>
                    ) : (
                      <span
                        style={{
                          fontFamily: "'Inter', sans-serif",
                          fontSize: 13,
                          fontWeight: 600,
                          color: C.muted,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {card.logoText}
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowAllStories((v) => !v)}
            style={{
              marginTop: showAllStories ? 40 : 48,
              padding: '14px 28px',
              fontFamily: "'Inter', sans-serif",
              fontSize: 15,
              fontWeight: 600,
              color: C.primaryBtn,
              background: 'transparent',
              border: `1.5px solid ${C.primaryBtn}`,
              borderRadius: 999,
              cursor: 'pointer',
              letterSpacing: '0.02em',
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = C.primaryBtn;
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = C.primaryBtn;
            }}
          >
            {showAllStories ? 'Show fewer stories' : 'Show more stories'}
          </button>
        </div>
      </section>

      {/* ═══════════════ FINAL CTA ═══════════════ */}
      <section
        style={{
          padding: '88px 32px 120px',
          textAlign: 'center',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <img
            src={CTAMountain}
            alt=""
            aria-hidden
            style={{
              display: 'block',
              width: 'min(560px, 100%)',
              height: 'auto',
              margin: '0 auto 32px',
            }}
          />
          <h2
            style={{
              fontFamily: "'Libre Baskerville', Georgia, serif",
              fontSize: 'clamp(36px, 5vw, 56px)',
              fontWeight: 400,
              lineHeight: 1.1,
              color: C.ink,
              margin: '0 0 16px',
            }}
          >
            Land your <Highlight>next Offer.</Highlight>
          </h2>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 20,
              lineHeight: 1.5,
              color: C.body,
              letterSpacing: '0.04em',
              margin: '0 0 32px',
            }}
          >
            You've made it this far. The summit's right there.
          </p>
          <button onClick={goSignup} className="fs-btn-primary">
            Get started
          </button>
        </div>
      </section>

      {/* ═══════════════ FOOTER (dark, matches Figma) ═══════════════ */}
      <footer style={{ background: '#0F172A', position: 'relative', zIndex: 1 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '64px 32px 0' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(220px, 280px) repeat(3, minmax(0, 1fr))',
              gap: 48,
              alignItems: 'start',
            }}
          >
            {/* Brand block */}
            <div>
              <p
                style={{
                  fontFamily: "'Lora', Georgia, serif",
                  fontSize: 38,
                  fontWeight: 500,
                  color: '#ffffff',
                  margin: '0 0 8px',
                  cursor: 'pointer',
                }}
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              >
                Offerloop
              </p>
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 16,
                  color: '#D9D9D9',
                  margin: '0 0 24px',
                  lineHeight: 1.5,
                  letterSpacing: '0.04em',
                }}
              >
                Your next offer{' '}
                <span style={{ color: '#60A5FA' }}> </span>starts with us
              </p>
              <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                <SocialIcon href="https://www.instagram.com/offerloop" label="Instagram">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                </SocialIcon>
                <SocialIcon href="https://www.linkedin.com/company/offerloop" label="LinkedIn">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </SocialIcon>
                <SocialIcon href="https://twitter.com/offerloop" label="X / Twitter">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </SocialIcon>
                <SocialIcon href="https://www.tiktok.com/@offerloop" label="TikTok">
                  <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.46V13a8.28 8.28 0 005.58 2.17V11.7a4.85 4.85 0 01-3.77-1.85V6.69h3.77z" />
                </SocialIcon>
              </div>
            </div>

            <DarkFooterColumn
              title="Company"
              links={[
                { label: 'About', path: '/about' },
                { label: 'Blog', path: '/blog' },
                { label: 'Contact Us', path: '/contact-us' },
                { label: 'Privacy', path: '/privacy' },
                { label: 'Terms of Service', path: '/terms-of-service' },
              ]}
            />

            <DarkFooterColumn
              title="Resources"
              links={[
                { label: 'Networking Guides', path: '/networking/goldman-sachs' },
                { label: 'Meeting Prep', path: '/meeting/bain' },
                { label: 'Cold Email Guides', path: '/cold-email/investment-banking' },
                { label: 'Alumni Directory', path: '/alumni/usc' },
                { label: 'Compare Offerloop', path: '/compare/linkedin' },
              ]}
            />

            <DarkFooterColumn
              title="Features"
              links={[
                { label: 'Find People', path: '/find' },
                { label: 'Meeting Prep', path: '/meeting-prep' },
                { label: 'Chrome Extension', href: CHROME_EXTENSION_URL },
                { label: 'Job Board', path: '/job-board' },
                { label: 'Pricing', path: '/pricing' },
              ]}
            />
          </div>

          <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '48px 0 20px' }} />

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              paddingBottom: 32,
            }}
          >
            <span
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 14,
                color: '#C4C4C4',
              }}
            >
              © 2026 Offerloop. All rights reserved.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
};

const CompareStat: React.FC<{
  label: string;
  value: string;
  sublabel: string;
  muted?: boolean;
  italicSub?: boolean;
}> = ({ label, value, sublabel, muted, italicSub }) => (
  <div style={{ textAlign: 'center', width: '100%' }}>
    <p
      style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 22,
        color: '#6478B4',
        letterSpacing: '0.08em',
        margin: '0 0 8px',
      }}
    >
      {label}
    </p>
    <p
      style={{
        fontFamily: "'Lora', Georgia, serif",
        fontSize: 90,
        fontWeight: 400,
        lineHeight: 1,
        color: muted ? '#6478B4' : C.ink,
        margin: '0 0 12px',
      }}
    >
      {value}
    </p>
    <p
      style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 18,
        color: '#6478B4',
        letterSpacing: '0.08em',
        fontStyle: italicSub ? 'italic' : 'normal',
        margin: 0,
      }}
    >
      {sublabel}
    </p>
  </div>
);

type FooterLink =
  | { label: string; path: string; href?: undefined }
  | { label: string; href: string; path?: undefined };

const SocialIcon: React.FC<React.PropsWithChildren<{ href: string; label: string }>> = ({
  href,
  label,
  children,
}) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    aria-label={label}
    style={{ color: '#D9D9D9', transition: 'color 0.15s ease', display: 'inline-flex' }}
    onMouseEnter={(e) => {
      e.currentTarget.style.color = '#60A5FA';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.color = '#D9D9D9';
    }}
  >
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      {children}
    </svg>
  </a>
);

const DarkFooterColumn: React.FC<{ title: string; links: FooterLink[] }> = ({
  title,
  links,
}) => (
  <div>
    <p
      style={{
        fontFamily: "'Lora', Georgia, serif",
        fontSize: 22,
        fontWeight: 500,
        color: '#ffffff',
        marginBottom: 18,
      }}
    >
      {title}
    </p>
    {links.map((link) =>
      'href' in link && link.href ? (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'block',
            fontFamily: "'Inter', sans-serif",
            fontSize: 15,
            color: '#D9D9D9',
            textDecoration: 'none',
            marginBottom: 12,
            transition: 'color 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#ffffff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#D9D9D9';
          }}
        >
          {link.label}
        </a>
      ) : (
        <Link
          key={link.label}
          to={link.path!}
          style={{
            display: 'block',
            fontFamily: "'Inter', sans-serif",
            fontSize: 15,
            color: '#D9D9D9',
            textDecoration: 'none',
            marginBottom: 12,
            transition: 'color 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#ffffff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#D9D9D9';
          }}
        >
          {link.label}
        </Link>
      ),
    )}
  </div>
);

const FooterColumn: React.FC<{ title: string; links: FooterLink[] }> = ({
  title,
  links,
}) => (
  <div>
    <p
      style={{
        fontFamily: "'Libre Baskerville', Georgia, serif",
        fontSize: 13,
        fontWeight: 700,
        color: '#0F2545',
        marginBottom: 16,
      }}
    >
      {title}
    </p>
    {links.map((link) =>
      'href' in link && link.href ? (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'block',
            fontFamily: "'Libre Baskerville', Georgia, serif",
            fontSize: 13,
            color: '#64748B',
            textDecoration: 'none',
            marginBottom: 12,
          }}
        >
          {link.label}
        </a>
      ) : (
        <Link
          key={link.label}
          to={link.path!}
          style={{
            display: 'block',
            fontFamily: "'Libre Baskerville', Georgia, serif",
            fontSize: 13,
            color: '#64748B',
            textDecoration: 'none',
            marginBottom: 12,
          }}
        >
          {link.label}
        </Link>
      ),
    )}
  </div>
);

export default ForStudentsPage;
