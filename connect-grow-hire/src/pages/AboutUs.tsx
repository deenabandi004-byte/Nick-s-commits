import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate, Link } from 'react-router-dom';
import { Menu, X, ArrowRight, Linkedin } from 'lucide-react';
import { useFirebaseAuth } from '@/contexts/FirebaseAuthContext';
import OfferloopLogo from '@/assets/offerloop_logo2.png';
import MountainsLake from '@/assets/for-students/mountains-lake.png';
import CTAMountain from '@/assets/for-students/cta-mountain.png';
import NickPhoto from '@/assets/founders/Nick-Wittig.png';
import SidPhoto from '@/assets/founders/Sid-Bandi.jpg';
import RylanPhoto from '@/assets/founders/Rylan-Bohnett.jpg';

// Visual system tokens — sampled from the Figma so this page reads as the
// same surface as /for-students.
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
  mountainHaze: '#DCE6F2',
};

// Italic serif accent — same component pattern as ForStudentsPage.
const Highlight: React.FC<React.PropsWithChildren> = ({ children }) => (
  <span style={{ fontStyle: 'italic', color: C.inkSubtle }}>{children}</span>
);

const founders = [
  {
    name: 'Nick Wittig',
    role: 'CEO',
    classYear: 'USC Class of 2027',
    linkedin: 'https://www.linkedin.com/in/nicholas-wittig/',
    photo: NickPhoto,
  },
  {
    name: 'Deena Siddharth Bandi',
    role: 'CTO',
    classYear: 'USC Class of 2026',
    linkedin: 'https://www.linkedin.com/in/deena-siddharth-bandi-7489b2236/',
    photo: SidPhoto,
    photoPosition: '50% 22%',
  },
  {
    name: 'Rylan Bohnett',
    role: 'CMO',
    classYear: 'USC Class of 2027',
    linkedin: 'https://www.linkedin.com/in/the-rylan-bohnett/',
    photo: RylanPhoto,
  },
];

const AboutUs = () => {
  const navigate = useNavigate();
  const { user } = useFirebaseAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [navbarScrolled, setNavbarScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setNavbarScrolled(window.scrollY > 50);
    };
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
    const elements = document.querySelectorAll('.reveal');
    elements.forEach((el) => observer.observe(el));
    return () => {
      elements.forEach((el) => observer.unobserve(el));
    };
  }, []);

  const goSignup = () => navigate('/signin?mode=signup');

  return (
    <div
      className="min-h-screen w-full"
      style={{
        fontFamily: "'Inter', sans-serif",
        background: C.pageBg,
        color: C.ink,
      }}
    >
      <Helmet>
        <title>About Offerloop — AI Networking Platform for College Students</title>
        <meta
          name="description"
          content="Offerloop was founded in 2025 by USC students to help college students network into consulting, investment banking, and tech. Meet the team."
        />
        <link rel="canonical" href="https://offerloop.ai/about" />
        <meta property="og:title" content="About Offerloop — AI Networking Platform for College Students" />
        <meta property="og:description" content="Founded in 2025 by USC students. 300+ users across 6+ universities. Meet the team behind Offerloop." />
        <meta property="og:url" content="https://offerloop.ai/about" />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">{JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: 'Offerloop',
          url: 'https://offerloop.ai',
          logo: 'https://offerloop.ai/logo.png',
          description: 'AI-powered networking platform for college students recruiting in consulting, investment banking, and tech.',
          foundingDate: '2025',
          founders: [
            {
              '@type': 'Person',
              name: 'Deena Siddharth Bandi',
              jobTitle: 'CTO',
              alumniOf: { '@type': 'CollegeOrUniversity', name: 'University of Southern California' },
              sameAs: 'https://www.linkedin.com/in/deena-siddharth-bandi-7489b2236/',
            },
            {
              '@type': 'Person',
              name: 'Nick Wittig',
              jobTitle: 'CEO',
              alumniOf: { '@type': 'CollegeOrUniversity', name: 'University of Southern California' },
              sameAs: 'https://www.linkedin.com/in/nicholas-wittig/',
            },
            {
              '@type': 'Person',
              name: 'Rylan Bohnett',
              jobTitle: 'CMO',
              alumniOf: { '@type': 'CollegeOrUniversity', name: 'University of Southern California' },
              sameAs: 'https://www.linkedin.com/in/the-rylan-bohnett/',
            },
          ],
          sameAs: [
            'https://www.linkedin.com/company/offerloop',
            'https://twitter.com/offerloop',
          ],
        })}</script>
        {founders.map((f, i) => (
          <script key={i} type="application/ld+json">{JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Person',
            name: f.name,
            jobTitle: f.role,
            worksFor: { '@type': 'Organization', name: 'Offerloop', url: 'https://offerloop.ai' },
            alumniOf: { '@type': 'CollegeOrUniversity', name: 'University of Southern California' },
            sameAs: f.linkedin,
          })}</script>
        ))}
      </Helmet>

      {/* ═══════════════ PAGE-SCOPED STYLES ═══════════════ */}
      <style>{`
        .au-nav-link {
          position: relative;
          font-family: 'Libre Baskerville', Georgia, serif;
          font-size: 13px;
          font-weight: 600;
          text-decoration: none;
          color: ${C.navBlue};
          padding: 4px 2px;
          transition: color 0.15s ease;
        }
        .au-nav-link::after {
          content: '';
          position: absolute;
          left: 0; right: 0; bottom: -2px;
          height: 2px;
          background: ${C.brand};
          transform: scaleX(0);
          transform-origin: center;
          transition: transform 0.2s ease;
        }
        .au-nav-link:hover { color: #0F172A; }
        .au-nav-link:hover::after { transform: scaleX(0.5); }
        .au-nav-link.is-active { color: ${C.brand}; }
        .au-nav-link.is-active::after { transform: scaleX(1); }

        .au-btn-primary {
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
        .au-btn-primary:hover {
          background: ${C.primaryBtnHover};
          transform: translateY(-1px);
          box-shadow: 0 1px 1px rgba(0,0,0,0.1), 0 10px 24px rgba(76, 98, 168, 0.24);
        }

        .au-founder-card {
          position: relative;
          background: #ffffff;
          border: 1px solid ${C.cardBorder};
          border-radius: 14px;
          padding: 36px 28px 28px;
          text-align: center;
          box-shadow:
            0 1px 2px rgba(15,37,69,.04),
            0 12px 22px -8px rgba(15,37,69,.10),
            0 4px 8px -4px rgba(15,37,69,.06);
          transition: transform .25s ease, box-shadow .25s ease, border-color .25s ease;
        }
        .au-founder-card:hover {
          transform: translateY(-3px);
          border-color: rgba(37, 99, 235, 0.22);
          box-shadow:
            0 1px 2px rgba(15,37,69,.04),
            0 18px 30px -10px rgba(15,37,69,.14),
            0 6px 12px -4px rgba(15,37,69,.08);
        }

        .reveal { opacity: 0; transform: translateY(16px); transition: opacity .55s ease, transform .55s ease; }
        .reveal.visible { opacity: 1; transform: translateY(0); }

        .au-page-dotgrid {
          background-image: radial-gradient(rgba(15, 37, 69, 0.13) 1.4px, transparent 1.6px);
          background-size: 24px 24px;
        }
      `}</style>

      {/* ═══════════════ NAVBAR (matches Index / ForStudents pattern) ═══════════════ */}
      <header
        className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center justify-between px-6 md:px-12 relative"
        style={{
          background: navbarScrolled ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.88)',
          backdropFilter: 'blur(16px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(16px) saturate(1.4)',
          borderBottom: `1px solid ${navbarScrolled ? 'rgba(214, 222, 240, 0.8)' : 'rgba(214, 222, 240, 0.6)'}`,
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
          <Link to="/for-students" className="au-nav-link">For Students</Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <Link to="/pricing" className="au-nav-link">Pricing</Link>
            <Link to="/about" className="au-nav-link is-active" aria-current="page">About</Link>
          </div>
        </nav>

        <div className="hidden md:flex items-center" style={{ marginLeft: 'auto', flexShrink: 0 }}>
          {user ? (
            <button
              onClick={() => navigate('/find')}
              className="btn-ghost"
              style={{ fontSize: 13, fontWeight: 700, padding: '8px 16px' }}
            >
              Find people
            </button>
          ) : (
            <button
              onClick={() => navigate('/signin')}
              style={{
                background: C.brand,
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: "'Libre Baskerville', Georgia, serif",
                padding: '8px 20px',
                borderRadius: 100,
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

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div
          className="fixed top-[72px] left-4 right-4 md:hidden z-40"
          style={{
            background: 'rgba(255,255,255,0.98)',
            border: '1px solid rgba(37,99,235,0.1)',
            borderRadius: 16,
            boxShadow: '0 4px 24px rgba(37,99,235,0.08)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <nav className="flex flex-col p-3 gap-1">
            <Link
              to="/for-students"
              onClick={() => setMobileMenuOpen(false)}
              className="text-left px-4 py-3 text-sm font-medium rounded-lg hover:bg-gray-50"
              style={{ color: C.navBlue, fontFamily: "'Libre Baskerville', Georgia, serif", textDecoration: 'none' }}
            >
              For Students
            </Link>
            <Link
              to="/pricing"
              onClick={() => setMobileMenuOpen(false)}
              className="text-left px-4 py-3 text-sm font-medium rounded-lg hover:bg-gray-50"
              style={{ color: C.navBlue, fontFamily: "'Libre Baskerville', Georgia, serif", textDecoration: 'none' }}
            >
              Pricing
            </Link>
            <Link
              to="/about"
              onClick={() => setMobileMenuOpen(false)}
              className="text-left px-4 py-3 text-sm font-semibold rounded-lg"
              style={{ color: '#fff', background: C.brand, fontFamily: "'Libre Baskerville', Georgia, serif", textDecoration: 'none' }}
            >
              About
            </Link>
            <div className="border-t mt-2 pt-2" style={{ borderColor: 'rgba(37,99,235,0.08)' }}>
              <button
                onClick={() => { navigate('/signin'); setMobileMenuOpen(false); }}
                className="w-full text-center py-3 text-sm font-semibold"
                style={{ background: C.brand, color: '#fff', borderRadius: 100, fontFamily: "'Libre Baskerville', Georgia, serif" }}
              >
                Sign in
              </button>
            </div>
          </nav>
        </div>
      )}

      <div className="h-14" />

      {/* ═══════════════ HERO with mountains backdrop ═══════════════ */}
      <section
        className="au-page-dotgrid"
        style={{
          position: 'relative',
          padding: '96px 32px 80px',
          // Intentionally NOT clipping with overflow:hidden — the hero's
          // content is short, so the 720px-tall mountain backdrop needs to
          // bleed down into the Our Story section to dissolve naturally
          // via its mask fade instead of cutting on a hard horizontal line.
          zIndex: 1,
        }}
      >
        {/* Mountains + lake backdrop — runs longer and bleeds out via a slow
            gradient fade. Same treatment as the For Students hero. */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 320,
            left: 0,
            right: 0,
            height: 720,
            backgroundImage: `url(${MountainsLake})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center top',
            backgroundRepeat: 'no-repeat',
            opacity: 0.62,
            pointerEvents: 'none',
            zIndex: 0,
            maskImage:
              'linear-gradient(180deg, transparent 0%, #000 18%, #000 52%, rgba(0,0,0,0.55) 78%, transparent 100%)',
            WebkitMaskImage:
              'linear-gradient(180deg, transparent 0%, #000 18%, #000 52%, rgba(0,0,0,0.55) 78%, transparent 100%)',
          }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 860,
            left: 0,
            right: 0,
            height: 360,
            background: `linear-gradient(180deg, ${C.mountainHaze} 0%, rgba(220, 230, 242, 0.55) 50%, transparent 100%)`,
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />

        <div className="reveal" style={{ position: 'relative', zIndex: 2, maxWidth: 820, margin: '0 auto', textAlign: 'center' }}>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: '0.18em',
              color: C.eyebrow,
              textTransform: 'uppercase',
              margin: '0 0 18px',
            }}
          >
            About Offerloop
          </p>
          <h1
            style={{
              fontFamily: "'Libre Baskerville', Georgia, serif",
              fontSize: 'clamp(40px, 5.2vw, 60px)',
              fontWeight: 400,
              lineHeight: 1.1,
              letterSpacing: '-0.015em',
              color: C.ink,
              margin: '0 0 20px',
            }}
          >
            Built by students, <Highlight>for students</Highlight>
          </h1>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 'clamp(16px, 1.4vw, 19px)',
              lineHeight: 1.7,
              color: C.body,
              letterSpacing: '0.02em',
              margin: '0 auto',
              maxWidth: 680,
            }}
          >
            Offerloop is a networking and outreach platform — not an email
            provider. Founded in 2025 at the University of Southern California
            by three students frustrated with the manual grind of recruiting,
            we built the tool we wished we had.
          </p>
        </div>
      </section>

      {/* ═══════════════ OUR STORY ═══════════════ */}
      <section style={{ padding: '40px 32px 80px', position: 'relative', zIndex: 1 }}>
        <div className="reveal" style={{ maxWidth: 720, margin: '0 auto' }}>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: '0.18em',
              color: C.eyebrow,
              textTransform: 'uppercase',
              margin: '0 0 14px',
              textAlign: 'center',
            }}
          >
            Our Story
          </p>
          <h2
            style={{
              fontFamily: "'Libre Baskerville', Georgia, serif",
              fontSize: 'clamp(30px, 4vw, 42px)',
              fontWeight: 400,
              lineHeight: 1.15,
              color: C.ink,
              margin: '0 0 32px',
              textAlign: 'center',
            }}
          >
            It started in a <Highlight>dorm room</Highlight> at USC
          </h2>

          {[
            "During recruiting season at USC, we spent hundreds of hours doing the same thing every other student was doing — searching for professionals on LinkedIn, guessing email addresses, writing personalized outreach messages one by one, and tracking everything in messy spreadsheets. It was exhausting, inefficient, and it took away from the experiences that make college worth it.",
            "We realized the tools that existed — LinkedIn, Handshake, Apollo — weren't built for students. LinkedIn doesn't give you email addresses. Handshake only has job postings. Apollo costs $50–500/month and is designed for enterprise sales teams. There was nothing that helped a college student find the right person, write a great email, send it, and track the response — all in one place.",
            "So we built Offerloop. What started as a side project in a dorm room in 2025 is now used by students at USC, UCLA, Michigan, NYU, Georgetown, UPenn, and more. We're still students ourselves, which means we use Offerloop every day and understand the challenges firsthand.",
          ].map((p, i) => (
            <p
              key={i}
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 17,
                lineHeight: 1.75,
                color: C.body,
                margin: i === 0 ? '0 0 22px' : '0 0 22px',
              }}
            >
              {p}
            </p>
          ))}
        </div>
      </section>

      {/* ═══════════════ TEAM ═══════════════ */}
      <section style={{ padding: '60px 32px 100px', position: 'relative', zIndex: 1, background: '#FBFCFE', borderTop: `1px solid ${C.divider}`, borderBottom: `1px solid ${C.divider}` }}>
        <div className="reveal" style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto 48px' }}>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: '0.18em',
              color: C.eyebrow,
              textTransform: 'uppercase',
              margin: '0 0 14px',
            }}
          >
            The Team
          </p>
          <h2
            style={{
              fontFamily: "'Libre Baskerville', Georgia, serif",
              fontSize: 'clamp(30px, 4vw, 42px)',
              fontWeight: 400,
              lineHeight: 1.15,
              color: C.ink,
              margin: 0,
            }}
          >
            Meet the <Highlight>founders</Highlight>
          </h2>
        </div>

        <div
          className="reveal"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 28,
            maxWidth: 980,
            margin: '0 auto',
          }}
        >
          {founders.map((founder) => (
            <article key={founder.name} className="au-founder-card">
              <a href={founder.linkedin} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'block' }}>
                <img
                  src={founder.photo}
                  alt={founder.name}
                  style={{
                    width: 96,
                    height: 96,
                    borderRadius: '50%',
                    border: '4px solid #ffffff',
                    objectFit: 'cover',
                    objectPosition: founder.photoPosition ?? '50% 50%',
                    boxShadow:
                      '0 6px 12px -2px rgba(15, 37, 69, 0.12), 0 3px 6px -2px rgba(15, 37, 69, 0.08)',
                    marginBottom: 20,
                    display: 'block',
                  }}
                />
                <h3
                  style={{
                    fontFamily: "'Libre Baskerville', Georgia, serif",
                    fontSize: 22,
                    fontWeight: 400,
                    color: C.ink,
                    letterSpacing: '-0.01em',
                    margin: '0 0 8px',
                  }}
                >
                  {founder.name}
                </h3>
              </a>
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: C.eyebrow,
                  margin: '0 0 6px',
                }}
              >
                {founder.role}
              </p>
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 13,
                  color: C.muted,
                  margin: '0 0 18px',
                }}
              >
                {founder.classYear}
              </p>
              <a
                href={founder.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${founder.name} on LinkedIn`}
                style={{
                  color: C.muted,
                  display: 'inline-flex',
                  transition: 'color 0.2s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = C.brand; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = C.muted; }}
              >
                <Linkedin className="w-[18px] h-[18px]" />
              </a>
            </article>
          ))}
        </div>
      </section>

      {/* ═══════════════ MISSION ═══════════════ */}
      <section style={{ padding: '88px 32px', position: 'relative', zIndex: 1 }}>
        <div className="reveal" style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: '0.18em',
              color: C.eyebrow,
              textTransform: 'uppercase',
              margin: '0 0 14px',
            }}
          >
            Our Mission
          </p>
          <h2
            style={{
              fontFamily: "'Libre Baskerville', Georgia, serif",
              fontSize: 'clamp(30px, 4vw, 42px)',
              fontWeight: 400,
              lineHeight: 1.15,
              color: C.ink,
              margin: '0 0 28px',
            }}
          >
            Networking shouldn&apos;t be a <Highlight>grind</Highlight>
          </h2>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 18,
              lineHeight: 1.75,
              color: C.body,
              margin: 0,
            }}
          >
            Make professional networking accessible to every college student.
            Recruiting for competitive roles in consulting, investment banking,
            and tech shouldn&apos;t require hundreds of hours of manual work.
            Offerloop automates the busywork — finding contacts, writing emails,
            tracking conversations — so students can focus on building real
            relationships and preparing for the opportunities that matter.
          </p>
        </div>
      </section>



      {/* ═══════════════ FINAL CTA with cta-mountain ═══════════════ */}
      <section
        style={{
          padding: '96px 32px 120px',
          textAlign: 'center',
          position: 'relative',
          zIndex: 1,
          overflow: 'hidden',
        }}
      >
        <div style={{ maxWidth: 760, margin: '0 auto', position: 'relative', zIndex: 2 }}>
          <img
            src={CTAMountain}
            alt=""
            aria-hidden
            style={{
              display: 'block',
              width: 'clamp(220px, 28vw, 320px)',
              height: 'auto',
              margin: '0 auto 28px',
              pointerEvents: 'none',
            }}
          />
          <h2
            className="reveal"
            style={{
              fontFamily: "'Libre Baskerville', Georgia, serif",
              fontSize: 'clamp(32px, 4.6vw, 48px)',
              fontWeight: 400,
              lineHeight: 1.1,
              letterSpacing: '-0.015em',
              color: C.ink,
              margin: '0 0 18px',
            }}
          >
            Land your <Highlight>next Offer</Highlight>
          </h2>
          <p
            className="reveal"
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 17,
              lineHeight: 1.65,
              color: C.body,
              letterSpacing: '0.02em',
              margin: '0 auto 32px',
              maxWidth: 540,
            }}
          >
            Join 300+ students from USC, Georgetown, NYU, and more. Free to
            start. Set up in under two minutes.
          </p>
          <button onClick={goSignup} className="au-btn-primary reveal">
            Create free account
            <ArrowRight size={16} strokeWidth={2.3} />
          </button>
        </div>
      </section>

      {/* ═══════════════ DARK NAVY FOOTER (matches ForStudents) ═══════════════ */}
      <footer
        style={{
          background: '#0F172A',
          color: '#94A3B8',
          padding: '56px 32px 32px',
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 36,
          }}
        >
          <div>
            <p
              style={{
                fontFamily: "'Lora', Georgia, serif",
                fontSize: 22,
                color: '#fff',
                margin: '0 0 12px',
                letterSpacing: '-0.01em',
              }}
            >
              Offerloop
            </p>
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                lineHeight: 1.6,
                color: '#94A3B8',
                margin: 0,
                maxWidth: 260,
              }}
            >
              Built by students, for students. Networking, automated.
            </p>
          </div>

          <div>
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.16em',
                color: '#E2E8F0',
                textTransform: 'uppercase',
                margin: '0 0 14px',
              }}
            >
              Company
            </p>
            {[
              { label: 'About', path: '/about' },
              { label: 'Pricing', path: '/pricing' },
              { label: 'Contact', path: '/contact-us' },
            ].map((l) => (
              <Link
                key={l.path}
                to={l.path}
                style={{
                  display: 'block',
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 13,
                  color: '#94A3B8',
                  textDecoration: 'none',
                  margin: '0 0 10px',
                  transition: 'color 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#94A3B8'; }}
              >
                {l.label}
              </Link>
            ))}
          </div>

          <div>
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.16em',
                color: '#E2E8F0',
                textTransform: 'uppercase',
                margin: '0 0 14px',
              }}
            >
              Resources
            </p>
            {[
              { label: 'For Students', path: '/for-students' },
              { label: 'Privacy', path: '/privacy' },
              { label: 'Terms', path: '/terms-of-service' },
            ].map((l) => (
              <Link
                key={l.path}
                to={l.path}
                style={{
                  display: 'block',
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 13,
                  color: '#94A3B8',
                  textDecoration: 'none',
                  margin: '0 0 10px',
                  transition: 'color 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#94A3B8'; }}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>

        <div
          style={{
            maxWidth: 1200,
            margin: '40px auto 0',
            paddingTop: 24,
            borderTop: '1px solid rgba(148, 163, 184, 0.18)',
            fontFamily: "'Inter', sans-serif",
            fontSize: 12,
            color: '#64748B',
          }}
        >
          © 2026 Offerloop. All rights reserved.
        </div>
      </footer>
    </div>
  );
};

export default AboutUs;
