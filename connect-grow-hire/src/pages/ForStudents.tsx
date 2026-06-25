// src/pages/ForStudents.tsx
import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate, Link } from 'react-router-dom';
import { Menu, X, ArrowRight, User, Search, Briefcase, Coffee, Inbox } from 'lucide-react';
import { useFirebaseAuth } from '../contexts/FirebaseAuthContext';
import OfferloopLogo from '@/assets/offerloop_logo2.png';
import OfferloopIconLogo from '@/assets/offerloopiconlogo.png';
import uscLogo from '@/assets/USC-Logo.png';
import uclaLogo from '@/assets/UCLA logo.png';
import berkeleyLogo from '@/assets/UC Berkeley logo.png';
import stanfordLogo from '@/assets/Stanford logo.avif';
import uwLogo from '@/assets/UW Logo.png';
import nyuLogo from '@/assets/NYU Logo.png';
import georgetownLogo from '@/assets/Georgetown logo.png';
import michiganLogo from '@/assets/Michigan logo.png';
import whartonLogo from '@/assets/Wharton Logo .png';
import notreDameLogo from '@/assets/Notre Dame logo.png';
import dartmouthLogo from '@/assets/Dartmouth logo.png';
import BulletinBoard from '@/components/BulletinBoard';

const HOW_IT_WORKS_TABS = [
  {
    icon: User,
    label: 'Tell us about you',
    description:
      'Drop in your resume, school, target roles, and ideal career path. We send back tailored recommendations: alumni to talk to, roles to chase, and companies to target.',
  },
  {
    icon: Search,
    label: 'Find your people',
    description:
      "Search by company, school, title, or alumni list. Get verified emails for the people who'll actually respond, not 200 randoms scraped from LinkedIn.",
  },
  {
    icon: Briefcase,
    label: 'Find any hiring manager',
    description:
      'Paste a job URL. Get the recruiter and hiring manager for that exact role. No more applying into the black hole.',
  },
  {
    icon: Coffee,
    label: 'Walk into every meeting ready',
    description:
      "Before every call, we generate an extremely detailed PDF: their career path, commonalities between you, and exactly what to ask. Walk in like you've already met them.",
  },
  {
    icon: Inbox,
    label: 'Put your inbox on autopilot',
    description:
      'A complete email autopilot. See who opened and replied, get drafted responses ready to send, and auto-follow up so nothing goes cold.',
  },
  {
    icon: null,
    iconSrc: OfferloopIconLogo,
    label: 'Start a Loop',
    description:
      'Deploy an agent that works from your text messages. It finds people, writes the emails, follows up, and does anything you can do on the site.',
  },
];

const ROTATION_MS = 10000;

const ForStudents = () => {
  const navigate = useNavigate();
  const { user } = useFirebaseAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [navbarScrolled, setNavbarScrolled] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    const onScroll = () => setNavbarScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setActiveTab((prev) => (prev + 1) % HOW_IT_WORKS_TABS.length);
    }, ROTATION_MS);
    return () => clearInterval(interval);
  }, [isPaused, activeTab]);

  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'Inter', sans-serif", background: '#FFFFFF' }}>
      <Helmet>
        <title>Offerloop for Students: the outreach tool we wish we had.</title>
        <meta name="description" content="We built this as students. Find verified alumni, write cold emails they'll open, and track every reply. Built for students breaking into IB, consulting, and tech." />
        <link rel="canonical" href="https://offerloop.ai/for-students" />
        <meta property="og:title" content="Offerloop for Students: the outreach tool we wish we had." />
        <meta property="og:description" content="We built this as students. Find verified alumni, write cold emails they'll open, and track every reply." />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet" />
      </Helmet>

      {/* Page-level keyframes */}
      <style>{`
        @keyframes ofloopProgressFill {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
        @keyframes ofloopLogoScrollRight {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(0); }
        }
        .logo-carousel-track {
          animation: ofloopLogoScrollRight 40s linear infinite;
        }
      `}</style>

      {/* NAVBAR - centered pill, matches landing */}
      <div className="fixed top-0 left-0 right-0 z-50 flex justify-center" style={{ padding: '12px 24px 8px' }}>
        <header
          className="flex items-center justify-between w-full h-12 px-5 md:px-6"
          style={{
            maxWidth: '860px',
            width: '100%',
            boxSizing: 'border-box',
            marginBottom: '4px',
            background: navbarScrolled ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.88)',
            backdropFilter: 'blur(16px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(16px) saturate(1.4)',
            border: '1px solid rgba(37,99,235,0.1)',
            borderRadius: '100px',
            boxShadow: navbarScrolled ? '0 2px 16px rgba(37,99,235,0.08)' : '0 1px 8px rgba(0,0,0,0.03)',
            transition: 'all 0.3s ease',
            overflow: 'visible',
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

          <nav className="hidden md:flex items-center gap-5" style={{ flexShrink: 1, minWidth: 0 }}>
            <Link to="/for-students" className="nav-link text-sm relative" style={{ color: '#2563EB', fontFamily: "'Libre Baskerville', Georgia, serif", fontWeight: 600, textDecoration: 'none' }}>
              For Students
            </Link>
            <Link to="/pricing" className="nav-link text-sm relative" style={{ color: '#4A5E80', fontFamily: "'Libre Baskerville', Georgia, serif", fontWeight: 600, textDecoration: 'none' }}>
              Pricing
            </Link>
            <Link to="/about" className="nav-link text-sm relative" style={{ color: '#4A5E80', fontFamily: "'Libre Baskerville', Georgia, serif", fontWeight: 600, textDecoration: 'none' }}>
              About
            </Link>
          </nav>

          <div className="hidden md:flex items-center gap-3" style={{ flexShrink: 0 }}>
            {user ? (
              <button onClick={() => navigate('/find')} className="btn-ghost" style={{ fontSize: '13px', fontWeight: 700, padding: '8px 16px' }}>
                Find people
              </button>
            ) : (
              <>
                <button
                  onClick={() => navigate('/signin?mode=signin')}
                  style={{ background: 'transparent', color: '#0F172A', fontSize: '13px', fontWeight: 600, fontFamily: "'Libre Baskerville', Georgia, serif", padding: '8px 20px', borderRadius: '100px', border: '1px solid rgba(37,99,235,0.2)', cursor: 'pointer', transition: 'all 0.15s ease' }}
                >
                  Sign in
                </button>
                <button
                  onClick={() => navigate('/signin?mode=signup')}
                  style={{ background: '#2563EB', color: '#fff', fontSize: '13px', fontWeight: 600, fontFamily: "'Libre Baskerville', Georgia, serif", padding: '8px 20px', borderRadius: '3px', border: 'none', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}
                >
                  Create account
                </button>
              </>
            )}
          </div>

          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2" style={{ color: '#4A5E80' }}>
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </header>
      </div>

      {mobileMenuOpen && (
        <div className="fixed top-[72px] left-4 right-4 md:hidden z-40" style={{ background: 'rgba(255,255,255,0.98)', border: '1px solid rgba(37,99,235,0.1)', borderRadius: '16px', boxShadow: '0 4px 24px rgba(37,99,235,0.08)', backdropFilter: 'blur(16px)' }}>
          <nav className="flex flex-col p-3 gap-1">
            <Link to="/for-students" onClick={() => setMobileMenuOpen(false)} className="text-left px-4 py-3 text-sm font-medium rounded-lg hover:bg-gray-50" style={{ color: '#4A5E80', fontFamily: "'Libre Baskerville', Georgia, serif", textDecoration: 'none' }}>For Students</Link>
            <Link to="/pricing" onClick={() => setMobileMenuOpen(false)} className="text-left px-4 py-3 text-sm font-medium rounded-lg hover:bg-gray-50" style={{ color: '#4A5E80', fontFamily: "'Libre Baskerville', Georgia, serif", textDecoration: 'none' }}>Pricing</Link>
            <Link to="/about" onClick={() => setMobileMenuOpen(false)} className="text-left px-4 py-3 text-sm font-medium rounded-lg hover:bg-gray-50" style={{ color: '#4A5E80', fontFamily: "'Libre Baskerville', Georgia, serif", textDecoration: 'none' }}>About</Link>
            <button onClick={() => { navigate('/signin?mode=signup'); setMobileMenuOpen(false); }} className="text-left px-4 py-3 text-sm font-medium rounded-lg hover:bg-gray-50" style={{ color: '#4A5E80', fontFamily: "'Libre Baskerville', Georgia, serif" }}>Get started</button>
          </nav>
        </div>
      )}

      <div className="h-14" />

      {/* ═══════════════ 1. HERO ═══════════════ */}
      <section
        style={{
          padding: '120px 32px 96px',
          background: 'radial-gradient(ellipse 90% 70% at 50% 35%, #EEF4FD 0%, #E5EFFB 60%, #DCE7F7 100%)',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          <h1
            style={{
              fontFamily: "'Libre Baskerville', Georgia, serif",
              fontSize: 'clamp(40px, 5.2vw, 68px)',
              fontWeight: 400,
              lineHeight: 1.08,
              letterSpacing: '-0.025em',
              color: '#0f2545',
              margin: '0 0 32px',
            }}
          >
            We built the outreach tool we wish we had.
          </h1>

          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 18,
              lineHeight: 1.65,
              color: '#475569',
              maxWidth: 640,
              margin: '0 auto 40px',
            }}
          >
            We built this as students. We know the loop: scrolling LinkedIn for names, writing cold emails, logging it in a spreadsheet, tracking who replied. Repeated for every single contact. Slow. Boring. So we built this so no one has to do it again.
          </p>

          <button
            onClick={() => navigate('/signin?mode=signup')}
            style={{
              background: '#2563EB',
              color: '#fff',
              fontFamily: "'Libre Baskerville', Georgia, serif",
              fontSize: 15,
              fontWeight: 600,
              padding: '14px 32px',
              borderRadius: 3,
              border: 'none',
              cursor: 'pointer',
              transition: 'background 0.15s ease',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#1D4ED8'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#2563EB'; }}
          >
            Try it free
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      {/* ═══════════════ 2. HOW IT WORKS FOR YOU ═══════════════ */}
      <section style={{ background: '#ffffff', padding: '120px 32px 96px', borderTop: '1px solid #EEF2F8' }}>
        <div style={{ maxWidth: 1140, margin: '0 auto' }}>
          <h2
            style={{
              fontFamily: "'Libre Baskerville', Georgia, serif",
              fontSize: 'clamp(32px, 4.5vw, 48px)',
              fontWeight: 400,
              fontStyle: 'italic',
              lineHeight: 1.15,
              letterSpacing: '-.02em',
              color: '#0f2545',
              textAlign: 'center',
              margin: '0 0 72px',
            }}
          >
            How it works for you.
          </h2>

          <div
            className="how-it-works-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr',
              gap: 48,
              alignItems: 'start',
            }}
          >
            {/* Left: vertical tab list */}
            <div
              onMouseEnter={() => setIsPaused(true)}
              onMouseLeave={() => setIsPaused(false)}
              style={{ display: 'flex', flexDirection: 'column' }}
            >
              {HOW_IT_WORKS_TABS.map((tab, idx) => {
                const Icon = tab.icon;
                const isActive = activeTab === idx;
                return (
                  <button
                    key={tab.label}
                    onClick={() => setActiveTab(idx)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      borderBottom: '1px solid #EEF2F8',
                      textAlign: 'left',
                      padding: isActive ? '20px 0 22px' : '18px 0',
                      cursor: 'pointer',
                      position: 'relative',
                      width: '100%',
                      transition: 'padding 0.2s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      {tab.iconSrc ? (
                        <img
                          src={tab.iconSrc}
                          alt=""
                          style={{
                            width: 20,
                            height: 20,
                            flexShrink: 0,
                            objectFit: 'contain',
                            opacity: isActive ? 1 : 0.45,
                            filter: isActive ? 'none' : 'grayscale(60%)',
                            transition: 'opacity 0.2s ease, filter 0.2s ease',
                          }}
                        />
                      ) : Icon ? (
                        <Icon
                          size={20}
                          style={{
                            color: isActive ? '#2563EB' : '#94a3b8',
                            flexShrink: 0,
                            transition: 'color 0.2s ease',
                          }}
                        />
                      ) : null}
                      <span
                        style={{
                          fontFamily: "'Libre Baskerville', Georgia, serif",
                          fontSize: 19,
                          fontWeight: isActive ? 700 : 400,
                          color: isActive ? '#0f2545' : '#94a3b8',
                          transition: 'color 0.2s ease, font-weight 0.2s ease',
                          letterSpacing: '-0.005em',
                        }}
                      >
                        {tab.label}
                      </span>
                    </div>
                    {isActive && (
                      <p
                        style={{
                          fontFamily: "'Inter', sans-serif",
                          fontSize: 14.5,
                          lineHeight: 1.6,
                          color: '#475569',
                          margin: '12px 0 0 34px',
                          maxWidth: 460,
                        }}
                      >
                        {tab.description}
                      </p>
                    )}
                    {isActive && (
                      <div
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          bottom: -1,
                          height: 2,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          key={`progress-${activeTab}`}
                          style={{
                            height: '100%',
                            width: '100%',
                            background: '#2563EB',
                            transform: 'scaleX(0)',
                            transformOrigin: 'left',
                            animation: `ofloopProgressFill ${ROTATION_MS}ms linear forwards`,
                            animationPlayState: isPaused ? 'paused' : 'running',
                          }}
                        />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Right: product preview placeholder (grey rectangle for now) */}
            <div
              onMouseEnter={() => setIsPaused(true)}
              onMouseLeave={() => setIsPaused(false)}
              style={{
                background: '#F1F5F9',
                border: '1px solid #E2E8F0',
                borderRadius: 14,
                aspectRatio: '16 / 11',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 12px rgba(15, 37, 69, 0.04), 0 20px 44px rgba(15, 37, 69, 0.06)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  textAlign: 'center',
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 13,
                  color: '#94a3b8',
                  letterSpacing: '.04em',
                  textTransform: 'uppercase',
                }}
              >
                {HOW_IT_WORKS_TABS[activeTab].label}
                <div style={{ marginTop: 6, fontSize: 12, letterSpacing: 0, textTransform: 'none', color: '#cbd5e1' }}>
                  product preview placeholder
                </div>
              </div>
            </div>
          </div>

          {/* Scout always-on callout */}
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 14,
              color: '#94a3b8',
              textAlign: 'center',
              fontStyle: 'italic',
              margin: '72px 0 0',
            }}
          >
            And Scout, your AI assistant, is one tap away at every step.
          </p>
        </div>

        {/* Inline responsive layout - flips to 2 columns on desktop */}
        <style>{`
          @media (min-width: 900px) {
            .how-it-works-grid {
              grid-template-columns: 1fr 1.4fr !important;
              gap: 80px !important;
            }
          }
        `}</style>
      </section>

      {/* ═══════════════ TESTIMONIALS ═══════════════ */}
      <section style={{ background: '#ffffff', padding: '96px 32px 64px', borderTop: '1px solid #EEF2F8' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', maxWidth: 820, margin: '0 auto 56px' }}>
            <h2
              style={{
                fontFamily: "'Libre Baskerville', Georgia, serif",
                fontSize: 'clamp(32px, 5vw, 52px)',
                fontWeight: 400,
                lineHeight: 1.1,
                letterSpacing: '-.025em',
                color: '#0f2545',
                margin: '0 0 16px',
              }}
            >
              Hear from other students that have already had success.
            </h2>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 17, lineHeight: 1.6, color: '#475569', margin: 0 }}>
              Real conversations. Real meetings. Real offers.
            </p>
          </div>
          <BulletinBoard />
        </div>
      </section>

      {/* ═══════════════ FOUNDER STORY ═══════════════ */}
      <section style={{ background: '#fafbfd', padding: '120px 32px', borderTop: '1px solid #EEF2F8' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <h2
            style={{
              fontFamily: "'Libre Baskerville', Georgia, serif",
              fontSize: 'clamp(36px, 5vw, 52px)',
              fontWeight: 400,
              lineHeight: 1.1,
              letterSpacing: '-.025em',
              color: '#0f2545',
              margin: '0 0 40px',
            }}
          >
            Why we built this.
          </h2>

          <div
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 18,
              lineHeight: 1.7,
              color: '#334155',
            }}
          >
            <p style={{ margin: '0 0 22px' }}>
              Scrolling LinkedIn for alumni. Guessing emails. Writing the same intro 40 different ways. Tracking it in a spreadsheet that was always out of date.
            </p>
            <p style={{ margin: '0 0 22px' }}>
              We hated it.
            </p>
            <p style={{ margin: '0 0 22px' }}>
              Then we'd walk into the library and see everyone else doing the same thing. Same tabs open. Same look on their face. Hundreds of hours of tedious work just to land a few meetings.
            </p>
            <p style={{ margin: '0 0 22px' }}>
              So we built this.
            </p>
            <p style={{ margin: 0 }}>
              The job market is rough right now. Internships are harder to get than they've ever been. We built Offerloop to save you the hours we wasted and help you land the job, without spending every Saturday on a laptop.
            </p>
          </div>
        </div>
      </section>

      {/* ═══════════════ TRUST BAND (header copy to be revised next pass) ═══════════════ */}
      <section style={{ background: '#ffffff', padding: '80px 0 80px', borderTop: '1px solid #EEF2F8', textAlign: 'center', overflow: 'hidden' }}>
        <div style={{ maxWidth: 700, margin: '0 auto', padding: '0 24px', marginBottom: 56 }}>
          <h2 style={{ fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: 'clamp(28px, 4.5vw, 44px)', fontWeight: 400, lineHeight: 1.2, color: '#0f2545', margin: 0 }}>
            Used across 30 campuses and growing.
          </h2>
        </div>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 220, background: 'linear-gradient(90deg, #ffffff 20%, transparent)', zIndex: 1, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 220, background: 'linear-gradient(270deg, #ffffff 20%, transparent)', zIndex: 1, pointerEvents: 'none' }} />
          <div className="logo-carousel" style={{ display: 'flex', gap: 20, width: 'max-content' }}>
            {[...Array(2)].map((_, setIdx) => (
              <div key={setIdx} className="logo-carousel-track" style={{ display: 'flex', gap: 20, flexShrink: 0 }}>
                {([
                  { name: 'USC', logo: uscLogo },
                  { name: 'UCLA', logo: uclaLogo },
                  { name: 'UC Berkeley', logo: berkeleyLogo },
                  { name: 'Stanford', logo: stanfordLogo },
                  { name: 'UW', logo: uwLogo },
                  { name: 'NYU', logo: nyuLogo },
                  { name: 'Georgetown', logo: georgetownLogo },
                  { name: 'Michigan', logo: michiganLogo },
                  { name: 'Wharton', logo: whartonLogo },
                  { name: 'Notre Dame', logo: notreDameLogo },
                  { name: 'Dartmouth', logo: dartmouthLogo },
                ] as const).map((school) => (
                  <div key={`${setIdx}-${school.name}`} style={{ borderRadius: 12, border: '0.5px solid #e5e7eb', padding: '12px 20px', background: '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 160, height: 72 }}>
                    <img src={school.logo} alt={school.name} style={{ maxHeight: 44, maxWidth: 120, width: 'auto', height: 'auto', objectFit: 'contain', display: 'block' }} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ FINAL CTA ═══════════════ */}
      <section
        style={{
          background: 'radial-gradient(ellipse 90% 70% at 50% 50%, #EEF4FD 0%, #DCE7F7 100%)',
          borderTop: '1px solid #EEF2F8',
          padding: '120px 32px',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <h2
            style={{
              fontFamily: "'Libre Baskerville', Georgia, serif",
              fontSize: 'clamp(40px, 6vw, 64px)',
              fontWeight: 400,
              lineHeight: 1.1,
              letterSpacing: '-.025em',
              color: '#0f2545',
              margin: '0 0 24px',
            }}
          >
            Start your first search.
          </h2>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 18, lineHeight: 1.55, color: '#475569', margin: '0 auto 40px', maxWidth: 540 }}>
            Type the kind of person you want to meet. We do the rest.
          </p>
          <button
            onClick={() => navigate('/signin?mode=signup')}
            style={{
              background: '#2563EB',
              color: '#fff',
              fontFamily: "'Libre Baskerville', Georgia, serif",
              fontSize: 15,
              fontWeight: 600,
              padding: '14px 32px',
              borderRadius: 3,
              border: 'none',
              cursor: 'pointer',
              transition: 'background 0.15s ease',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#1D4ED8'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#2563EB'; }}
          >
            Try it free
            <ArrowRight className="h-4 w-4" />
          </button>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#64748b', margin: '20px 0 0' }}>
            Free. No credit card. 5 contacts in your first search.
          </p>
        </div>
      </section>

      {/* ═══════════════ FOOTER ═══════════════ */}
      <footer style={{ background: '#ffffff', borderTop: '1px solid #EEF2F8' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '64px 32px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 32 }}>
            <div>
              <img src={OfferloopLogo} alt="Offerloop" style={{ height: 100, cursor: 'pointer' }} onClick={() => navigate('/')} />
              <p style={{ fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: 14, color: '#64748b', margin: '8px 0 0', maxWidth: 280, lineHeight: 1.5 }}>
                Find them. Reach them. Hear back.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 48 }}>
              <div>
                <p style={{ fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: 13, fontWeight: 700, color: '#0f2545', marginBottom: 16 }}>Product</p>
                <Link to="/" style={{ display: 'block', fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: 13, color: '#64748b', textDecoration: 'none', marginBottom: 12 }}>Home</Link>
                <Link to="/about" style={{ display: 'block', fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: 13, color: '#64748b', textDecoration: 'none', marginBottom: 12 }}>About</Link>
                <Link to="/pricing" style={{ display: 'block', fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: 13, color: '#64748b', textDecoration: 'none', marginBottom: 12 }}>Pricing</Link>
              </div>
              <div>
                <p style={{ fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: 13, fontWeight: 700, color: '#0f2545', marginBottom: 16 }}>Legal</p>
                <Link to="/privacy" style={{ display: 'block', fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: 13, color: '#64748b', textDecoration: 'none', marginBottom: 12 }}>Privacy</Link>
                <Link to="/terms-of-service" style={{ display: 'block', fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: 13, color: '#64748b', textDecoration: 'none', marginBottom: 12 }}>Terms</Link>
                <Link to="/contact-us" style={{ display: 'block', fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: 13, color: '#64748b', textDecoration: 'none', marginBottom: 12 }}>Contact</Link>
              </div>
            </div>
          </div>
          <div style={{ height: 1, background: '#EEF2F8', margin: '32px 0 16px' }} />
          <p style={{ fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: 12, color: '#CBD5E1', textAlign: 'center' }}>
            © 2026 Offerloop. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default ForStudents;
