import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate, Link } from 'react-router-dom';
import { Menu, X, Linkedin } from 'lucide-react';
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import OfferloopLogo from '@/assets/offerloop_logo2.png';

const founders = [
  {
    name: 'Nick Wittig',
    role: 'CEO',
    classYear: 'USC Class of 2027',
    linkedin: 'https://www.linkedin.com/in/nicholas-wittig/',
  },
  {
    name: 'Deena Siddharth Bandi',
    role: 'CTO',
    classYear: 'USC Class of 2026',
    linkedin: 'https://www.linkedin.com/in/deena-siddharth-bandi-7489b2236/',
  },
  {
    name: 'Rylan Bohnett',
    role: 'CMO',
    classYear: 'USC Class of 2027',
    linkedin: 'https://www.linkedin.com/in/the-rylan-bohnett/',
  },
];

const tractionStats = [
  { value: '300+', label: 'Active student users' },
  { value: '41', label: 'Paying subscribers' },
  { value: '22%', label: 'Free-to-paid conversion' },
  { value: '$0', label: 'Customer acquisition cost' },
  { value: '6+', label: 'Universities represented' },
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
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -30px 0px' }
    );
    const elements = document.querySelectorAll('.reveal');
    elements.forEach((el) => observer.observe(el));
    return () => { elements.forEach((el) => observer.unobserve(el)); };
  }, []);

  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'Inter', sans-serif", background: '#FFFFFF' }}>
      <Helmet>
        <title>About Offerloop: AI Networking Platform for College Students</title>
        <meta name="description" content="Offerloop was founded in 2025 by USC students to help college students network into consulting, investment banking, and tech. Meet the team." />
        <link rel="canonical" href="https://offerloop.ai/about" />
        <meta property="og:title" content="About Offerloop: AI Networking Platform for College Students" />
        <meta property="og:description" content="Founded in 2025 by USC students. 300+ users across 6+ universities. Meet the team behind Offerloop." />
        <meta property="og:url" content="https://offerloop.ai/about" />
        <meta property="og:type" content="website" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          "name": "Offerloop",
          "url": "https://offerloop.ai",
          "logo": "https://offerloop.ai/logo.png",
          "description": "AI-powered networking platform for college students recruiting in consulting, investment banking, and tech.",
          "foundingDate": "2025",
          "founders": [
            {
              "@type": "Person",
              "name": "Deena Siddharth Bandi",
              "jobTitle": "CTO",
              "alumniOf": { "@type": "CollegeOrUniversity", "name": "University of Southern California" },
              "sameAs": "https://www.linkedin.com/in/deena-siddharth-bandi-7489b2236/"
            },
            {
              "@type": "Person",
              "name": "Nick Wittig",
              "jobTitle": "CEO",
              "alumniOf": { "@type": "CollegeOrUniversity", "name": "University of Southern California" },
              "sameAs": "https://www.linkedin.com/in/nicholas-wittig/"
            },
            {
              "@type": "Person",
              "name": "Rylan Bohnett",
              "jobTitle": "CMO",
              "alumniOf": { "@type": "CollegeOrUniversity", "name": "University of Southern California" },
              "sameAs": "https://www.linkedin.com/in/the-rylan-bohnett/"
            }
          ],
          "sameAs": [
            "https://www.linkedin.com/company/offerloop",
            "https://twitter.com/offerloop"
          ]
        })}</script>
        {founders.map((f, i) => (
          <script key={i} type="application/ld+json">{JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Person",
            "name": f.name,
            "jobTitle": f.role,
            "worksFor": { "@type": "Organization", "name": "Offerloop", "url": "https://offerloop.ai" },
            "alumniOf": { "@type": "CollegeOrUniversity", "name": "University of Southern California" },
            "sameAs": f.linkedin
          })}</script>
        ))}
      </Helmet>

      {/* NAVBAR: centered pill, matches landing page */}
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
              className="h-16 cursor-pointer logo-animate"
              onClick={() => navigate('/')}
            />
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-5" style={{ flexShrink: 1, minWidth: 0 }}>
            <Link to="/for-students" className="nav-link text-sm relative" style={{ color: '#4A5E80', fontFamily: "'Libre Baskerville', Georgia, serif", fontWeight: 600, textDecoration: 'none' }}>
              For Students
            </Link>
            <Link to="/pricing" className="nav-link text-sm relative" style={{ color: '#4A5E80', fontFamily: "'Libre Baskerville', Georgia, serif", fontWeight: 600, textDecoration: 'none' }}>
              Pricing
            </Link>
            <Link to="/about" className="nav-link text-sm relative" style={{ color: '#2563EB', fontFamily: "'Libre Baskerville', Georgia, serif", fontWeight: 600, textDecoration: 'none' }}>
              About
            </Link>
          </nav>

          {/* Desktop CTA */}
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
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.03)'; e.currentTarget.style.borderColor = 'rgba(37,99,235,0.35)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(37,99,235,0.2)'; }}
                >
                  Sign in
                </button>
                <button
                  onClick={() => navigate('/signin?mode=signup')}
                  style={{ background: '#2563EB', color: '#fff', fontSize: '13px', fontWeight: 600, fontFamily: "'Libre Baskerville', Georgia, serif", padding: '8px 20px', borderRadius: '3px', border: 'none', cursor: 'pointer', transition: 'background 0.15s ease', flexShrink: 0, whiteSpace: 'nowrap' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#1D4ED8'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#2563EB'; }}
                >
                  Create account
                </button>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2" style={{ color: '#4A5E80' }}>
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </header>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="fixed top-[72px] left-4 right-4 md:hidden z-40" style={{ background: 'rgba(255,255,255,0.98)', border: '1px solid rgba(37,99,235,0.1)', borderRadius: '16px', boxShadow: '0 4px 24px rgba(37,99,235,0.08)', backdropFilter: 'blur(16px)' }}>
          <nav className="flex flex-col p-3 gap-1">
            <Link to="/for-students" onClick={() => setMobileMenuOpen(false)} className="text-left px-4 py-3 text-sm font-medium rounded-lg hover:bg-gray-50" style={{ color: '#4A5E80', fontFamily: "'Libre Baskerville', Georgia, serif", textDecoration: 'none' }}>For Students</Link>
            <Link to="/pricing" onClick={() => setMobileMenuOpen(false)} className="text-left px-4 py-3 text-sm font-medium rounded-lg hover:bg-gray-50" style={{ color: '#4A5E80', fontFamily: "'Libre Baskerville', Georgia, serif", textDecoration: 'none' }}>Pricing</Link>
            <Link to="/about" onClick={() => setMobileMenuOpen(false)} className="text-left px-4 py-3 text-sm font-medium rounded-lg hover:bg-gray-50" style={{ color: '#2563EB', fontFamily: "'Libre Baskerville', Georgia, serif", textDecoration: 'none' }}>About</Link>
            <div className="border-t mt-2 pt-2" style={{ borderColor: 'rgba(37,99,235,0.08)' }}>
              {user ? (
                <button onClick={() => { navigate('/find'); setMobileMenuOpen(false); }} className="btn-primary-lg w-full" style={{ borderRadius: '3px' }}>Find people</button>
              ) : (
                <button onClick={() => { navigate('/signin?mode=signup'); setMobileMenuOpen(false); }} className="w-full text-center py-3 text-sm font-semibold" style={{ background: '#2563EB', color: '#fff', borderRadius: '3px', fontFamily: "'Libre Baskerville', Georgia, serif" }}>Create account</button>
              )}
            </div>
          </nav>
        </div>
      )}

      {/* Spacer to clear fixed header */}
      <div className="h-20" />

      {/* HERO */}
      <section className="relative py-[100px] px-6 md:px-12" style={{ background: '#FFFFFF' }}>
        <div className="max-w-7xl mx-auto">
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, rgba(37, 99, 235, 0.08) 0%, transparent 70%)', transform: 'scale(1.3)', filter: 'blur(40px)', zIndex: 0 }} />
          <div className="relative z-10 text-center max-w-[820px] mx-auto reveal">
            <h1 style={{ fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: 'clamp(36px, 5.5vw, 56px)', fontWeight: 400, letterSpacing: '-0.025em', color: '#0f2545', marginBottom: '24px', lineHeight: 1.15 }}>
              Opportunity moves through people. <span style={{ color: '#2563EB' }}>We make them reachable.</span>
            </h1>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '18px', lineHeight: 1.65, color: '#4A5E80', maxWidth: '640px', margin: '0 auto' }}>
              We met in college chasing exactly that, and built Offerloop so getting to the right person doesn't have to be slow, manual, or left to chance.
            </p>
          </div>
        </div>
      </section>

      {/* WHY WE BUILT THIS: founder story */}
      <section className="py-[90px] px-6 md:px-12" style={{ background: '#FFFFFF' }}>
        <div className="max-w-[680px] mx-auto reveal">
          <p style={{ fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: '13px', fontWeight: 700, color: '#2563EB', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '16px' }}>
            Why we built this
          </p>
          <h2 className="mb-10" style={{ fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 400, letterSpacing: '-0.025em', color: '#0f2545', lineHeight: 1.2 }}>
            We built the tool we couldn't find.
          </h2>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '17px', lineHeight: 1.75, color: '#4A5E80', marginBottom: '22px' }}>
            We met in college, all chasing goals that came down to the same thing: getting in front of the right people. So we did what everyone does. We scrolled LinkedIn for hours hunting for the right person. We guessed at email addresses. We wrote outreach one message at a time and tracked it in spreadsheets that fell apart by week two.
          </p>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '17px', lineHeight: 1.75, color: '#4A5E80', marginBottom: '22px' }}>
            It worked, barely. But it was slow, and the tools were never built for it. LinkedIn won't give you an email. Handshake only lists jobs. Sales platforms like Apollo cost hundreds a month and are built for enterprise teams, not people. Nothing helped you do the whole thing in one place: find the right person, reach them well, and keep track.
          </p>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '17px', lineHeight: 1.75, color: '#4A5E80', marginBottom: '22px' }}>
            The more people we talked to, the clearer it got. Thousands of students, recruiters, founders, and salespeople, all fighting the same broken process. Getting to the right person is one of the highest-leverage things you can do, and almost no one has good tools for it.
          </p>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '17px', lineHeight: 1.75, color: '#4A5E80' }}>
            So we built Offerloop: one place to find the right person, reach them with a message worth replying to, and keep the relationship moving. We started with students because that's who we were. But the problem belongs to anyone who's ever needed to reach someone.
          </p>
        </div>
      </section>

      {/* FOUNDERS: names, roles, LinkedIn */}
      <section className="py-[90px] px-6 md:px-12" style={{ background: 'rgba(248, 250, 255, 0.5)' }}>
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14 reveal">
            <p style={{ fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: '13px', fontWeight: 700, color: '#2563EB', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '12px' }}>
              The team
            </p>
            <h2 style={{ fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 400, letterSpacing: '-0.025em', color: '#0f2545' }}>
              Founders
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-[900px] mx-auto">
            {founders.map((founder, i) => (
              <div key={i} className="reveal rounded-[16px] text-center transition-all" style={{ background: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(8px)', border: '1px solid rgba(37, 99, 235, 0.10)', padding: '36px 28px' }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 36px rgba(37, 99, 235, 0.10)'; e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.22)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.10)'; }}
              >
                <a href={founder.linkedin} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                  <h3 style={{ fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: '20px', fontWeight: 700, color: '#0f2545', letterSpacing: '-0.01em', marginBottom: '6px' }}>
                    {founder.name}
                  </h3>
                </a>
                <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '14px', fontWeight: 600, color: '#2563EB', marginBottom: '16px' }}>
                  {founder.role}
                </p>
                <a href={founder.linkedin} target="_blank" rel="noopener noreferrer" aria-label={`${founder.name} on LinkedIn`} style={{ color: '#94A3B8', display: 'inline-block', transition: 'color 0.2s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#2563EB'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#94A3B8'; }}
                >
                  <Linkedin className="w-[18px] h-[18px]" />
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TRACTION */}
      <section className="py-[90px] px-6 md:px-12" style={{ background: '#FFFFFF' }}>
        <div className="max-w-[900px] mx-auto">
          <div className="text-center mb-12 reveal">
            <p style={{ fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: '13px', fontWeight: 700, color: '#2563EB', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '12px' }}>
              Where we are
            </p>
            <h2 style={{ fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 400, letterSpacing: '-0.025em', color: '#0f2545' }}>
              The numbers, honestly.
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6 reveal">
            {tractionStats.map((stat, i) => (
              <div key={i} className="text-center">
                <p style={{ fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: 'clamp(28px, 3.5vw, 36px)', fontWeight: 400, color: '#2563EB', marginBottom: '6px', lineHeight: 1.1 }}>
                  {stat.value}
                </p>
                <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', color: '#64748b', lineHeight: 1.4 }}>
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
          <p className="text-center mt-10 reveal" style={{ fontFamily: "'Inter', sans-serif", fontSize: '14px', color: '#94A3B8' }}>
            Students at USC, UCLA, University of Michigan, NYU, Georgetown, and UPenn. No paid ads.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-[100px] pb-[110px] px-6 md:px-12" style={{ background: '#FFFFFF' }}>
        <div className="max-w-[640px] mx-auto">
          <div className="relative rounded-[20px] transition-all reveal" style={{ background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.04) 0%, rgba(59, 130, 246, 0.06) 50%, rgba(37, 99, 235, 0.04) 100%)', border: '1px solid rgba(37, 99, 235, 0.12)', padding: '72px 48px', textAlign: 'center', maxWidth: '640px', margin: '0 auto', position: 'relative', overflow: 'hidden' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.22)'; e.currentTarget.style.boxShadow = '0 12px 48px rgba(37, 99, 235, 0.14)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.12)'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            <div className="absolute pointer-events-none" style={{ width: '80px', height: '80px', border: '1.5px solid rgba(37, 99, 235, 0.15)', borderRadius: '50%', opacity: 0.4, top: '-30px', right: '-30px', background: 'radial-gradient(circle, rgba(37, 99, 235, 0.05) 0%, transparent 70%)' }} />
            <div className="absolute pointer-events-none" style={{ width: '60px', height: '60px', border: '1.5px solid rgba(59, 130, 246, 0.15)', borderRadius: '50%', opacity: 0.4, bottom: '-25px', left: '-25px', background: 'radial-gradient(circle, rgba(59, 130, 246, 0.05) 0%, transparent 70%)' }} />
            <h2 style={{ fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: 'clamp(28px, 4vw, 38px)', fontWeight: 400, letterSpacing: '-0.025em', color: '#0f2545', marginBottom: '14px', lineHeight: 1.2 }}>
              Start free in two minutes.
            </h2>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '15px', color: '#4A5E80', marginBottom: '32px' }}>
              300 free credits. No credit card.
            </p>
            <div>
              <button onClick={() => navigate('/signin?mode=signup')} className="btn-primary-lg btn-pulse" style={{ background: '#2563EB', fontFamily: "'Libre Baskerville', Georgia, serif" }}>
                Create free account
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 md:px-12" style={{ background: '#FFFFFF', borderTop: '1px solid rgba(37, 99, 235, 0.08)' }}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', color: '#94A3B8' }}>
            &copy; 2026 Offerloop. All rights reserved.
          </p>
          <div className="flex gap-6">
            {[
              { label: 'About', path: '/about' },
              { label: 'Pricing', path: '/pricing' },
              { label: 'Contact', path: '/contact-us' },
              { label: 'Privacy', path: '/privacy' },
              { label: 'Terms', path: '/terms-of-service' },
            ].map((link) => (
              <Link key={link.path} to={link.path} style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', color: '#64748b', textDecoration: 'none', transition: 'color .15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#2563EB'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#64748b'; }}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
};

export default AboutUs;
