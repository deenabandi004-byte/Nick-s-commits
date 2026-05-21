import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import offerloopLogo from '../assets/offerloop_logo2.png';
import { getAllPosts } from '@/lib/blog';

const posts = getAllPosts();

const Blog = () => {
  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <Helmet>
        <title>Offerloop Blog - Networking &amp; Recruiting Guides for College Students</title>
        <meta name="description" content="Actionable guides on cold emailing, networking, and recruiting for college students breaking into consulting, banking, and tech. Written by the Offerloop team." />
        <link rel="canonical" href="https://offerloop.ai/blog" />
        <meta property="og:title" content="Offerloop Blog - Networking & Recruiting Guides for College Students" />
        <meta property="og:description" content="Actionable guides on cold emailing, networking, and recruiting for college students." />
        <meta property="og:url" content="https://offerloop.ai/blog" />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Blog",
          "name": "Offerloop Blog",
          "description": "Networking and recruiting guides for college students",
          "url": "https://offerloop.ai/blog",
          "publisher": {
            "@type": "Organization",
            "name": "Offerloop",
            "url": "https://offerloop.ai"
          },
          "blogPost": posts.map(p => ({
            "@type": "BlogPosting",
            "headline": p.title,
            "description": p.description,
            "datePublished": p.date,
            "url": `https://offerloop.ai/blog/${p.slug}`,
            "author": { "@type": "Organization", "name": "Offerloop Team" }
          }))
        })}</script>
      </Helmet>

      {/* Nav */}
      <nav className="w-full px-6 py-5 flex items-center justify-between" style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <Link to="/" className="text-xl font-bold" style={{ color: '#0F172A', letterSpacing: '-0.02em' }}><img src={offerloopLogo} alt="Offerloop" style={{ height: '64px', width: 'auto' }} /></Link>
        <Link to="/signin?mode=signup" className="px-5 py-2.5 rounded-[3px] text-sm font-semibold text-white" style={{ background: '#3B82F6' }}>
          Get Started Free
        </Link>
      </nav>

      {/* Hero */}
      <section className="px-6 pt-16 pb-8" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <p className="text-sm font-medium mb-4" style={{ color: '#3B82F6', letterSpacing: '0.02em' }}>BLOG</p>
        <h1 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 'clamp(36px, 5vw, 52px)', fontWeight: 400, lineHeight: 1.1, letterSpacing: '-0.025em', color: '#0F172A', marginBottom: '20px' }}>
          Networking & Recruiting Guides
        </h1>
        <p style={{ fontSize: '15px', lineHeight: 1.7, color: '#64748B', maxWidth: '680px' }}>
          Actionable guides on cold emailing, meetings, and breaking into consulting, banking, and tech. Written for college students by the Offerloop team.
        </p>
      </section>

      {/* Post Cards */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div className="space-y-6">
          {posts.map((post) => (
            <Link
              key={post.slug}
              to={`/blog/${post.slug}`}
              className="block rounded-[3px] p-6 transition-all hover:shadow-md"
              style={{ border: '1px solid #E2E8F0', background: '#FAFBFF' }}
            >
              <p className="text-xs font-medium mb-2" style={{ color: '#94A3B8' }}>
                {new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
              <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '24px', fontWeight: 400, color: '#0F172A', marginBottom: '8px', lineHeight: 1.3 }}>
                {post.title}
              </h2>
              <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#64748B' }}>
                {post.description}
              </p>
              <span className="inline-block mt-3 text-sm font-semibold" style={{ color: '#3B82F6' }}>
                Read more →
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-6" style={{ borderTop: '1px solid #E2E8F0' }}>
        <div className="flex flex-col md:flex-row justify-between items-center gap-4" style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <p className="text-sm" style={{ color: '#94A3B8' }}>&copy; 2026 Offerloop. All rights reserved.</p>
          <div className="flex gap-6">
            {[
              { label: 'About', path: '/about' },
              { label: 'Pricing', path: '/pricing' },
              { label: 'Privacy', path: '/privacy' },
              { label: 'Terms', path: '/terms-of-service' },
            ].map(link => (
              <Link key={link.path} to={link.path} className="text-sm" style={{ color: '#94A3B8' }}>{link.label}</Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Blog;
