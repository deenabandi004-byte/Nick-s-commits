import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Mail,
  Phone,
  Clock,
  Send,
  CheckCircle,
  X,
  ChevronDown,
  ChevronRight,
  MapPin,
  ArrowLeft,
} from "lucide-react";
import OfferloopLogo from '@/assets/offerloop_logo2.png';

const ContactUs = () => {
  const navigate = useNavigate();
  const [navbarScrolled, setNavbarScrolled] = useState(false);
  
  // Form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');

  const canSubmit = firstName && lastName && email && subject && message && message.length <= 1000;

  // Navbar scroll behavior
  useEffect(() => {
    const handleScroll = () => {
      setNavbarScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Scroll reveal animations
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

    return () => {
      elements.forEach((el) => observer.unobserve(el));
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    
    setIsSubmitting(true);
    setSubmittedEmail(email);
    
    // Simulate API call - replace with actual API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    setIsSubmitting(false);
    setFormSubmitted(true);
    
    // Reset form
    setFirstName('');
    setLastName('');
    setEmail('');
    setSubject('');
    setMessage('');
  };

  return (
    <div className="min-h-screen w-full" style={{ fontFamily: 'var(--font-body)', background: 'var(--bg-white)' }}>
      {/* NAVBAR */}
      <header
        className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center justify-between px-6 md:px-12"
        style={{
          background: navbarScrolled
            ? 'rgba(248, 250, 255, 0.96)'
            : 'rgba(248, 250, 255, 0.88)',
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
            className="h-16 cursor-pointer logo-animate"
            onClick={() => navigate('/')}
          />
        </div>
      </header>

      {/* Spacer after navbar */}
      <div className="h-16" />

      {/* Back to home */}
      <div className="px-6 md:px-12 pt-8">
        <div className="max-w-7xl mx-auto">
          <button
            onClick={() => navigate('/')}
            style={{
              background: '#1E40AF',
              color: '#FFFFFF',
              fontSize: '14px',
              fontWeight: 500,
              fontFamily: 'var(--font-body)',
              padding: '10px 18px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#1E3A8A'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#1E40AF'; }}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </button>
        </div>
      </div>

      {/* Hero Section */}
      <section
        className="relative pt-[40px] pb-[32px] px-6 md:px-12"
        style={{ background: 'var(--bg-white)' }}
      >
        <div className="max-w-7xl mx-auto">
          {/* Subtle radial glow */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at center, rgba(37, 99, 235, 0.08) 0%, transparent 70%)',
              transform: 'scale(1.3)',
              filter: 'blur(40px)',
              zIndex: 0,
            }}
          />

          <div className="relative z-10 text-center max-w-[820px] mx-auto reveal">
            <h1
              style={{
                fontFamily: "'Lora', Georgia, serif",
                fontSize: 'clamp(52px, 7vw, 84px)',
                fontWeight: 400,
                letterSpacing: '-0.02em',
                color: 'var(--text-primary)',
                marginBottom: '16px',
                lineHeight: 1.05,
              }}
            >
              Get in <span style={{ color: '#3B82F6' }}>touch</span>
            </h1>
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '17px',
                lineHeight: 1.7,
                color: 'var(--text-secondary)',
                maxWidth: '480px',
                margin: '0 auto',
              }}
            >
              Have questions about Offerloop? We'd love to hear from you. Send us a message and we'll respond within 1 business day.
            </p>
          </div>
        </div>
      </section>

      {/* Main Content - Two Column Layout */}
      <section
        className="pt-[16px] pb-[64px] px-6 md:px-12"
        style={{ background: 'var(--bg-white)' }}
      >
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            
            {/* Left Column - Contact Form (3/5 width) */}
            <div className="lg:col-span-3 reveal">
              <div
                className="rounded-[14px]"
                style={{
                  border: '1px solid var(--border-light)',
                  background: 'var(--bg-white)',
                  padding: '32px',
                }}
              >
                <h2
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '15px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    marginBottom: '24px',
                  }}
                >
                  Send us a message
                </h2>
                
                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* Name Fields */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontFamily: 'var(--font-body)',
                          fontSize: '13px',
                          fontWeight: 500,
                          color: 'var(--text-secondary)',
                          marginBottom: '8px',
                        }}
                      >
                        First Name <span style={{ color: '#DC2626' }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="John"
                        required
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          border: '1px solid var(--border)',
                          borderRadius: '10px',
                          fontFamily: 'var(--font-body)',
                          fontSize: '14px',
                          color: 'var(--text-primary)',
                          outline: 'none',
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = '#3B82F6';
                          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.08)';
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = 'var(--border)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      />
                    </div>
                    
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontFamily: 'var(--font-body)',
                          fontSize: '13px',
                          fontWeight: 500,
                          color: 'var(--text-secondary)',
                          marginBottom: '8px',
                        }}
                      >
                        Last Name <span style={{ color: '#DC2626' }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Doe"
                        required
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          border: '1px solid var(--border)',
                          borderRadius: '10px',
                          fontFamily: 'var(--font-body)',
                          fontSize: '14px',
                          color: 'var(--text-primary)',
                          outline: 'none',
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = '#3B82F6';
                          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.08)';
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = 'var(--border)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      />
                    </div>
                  </div>
                  
                  {/* Email */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontFamily: 'var(--font-body)',
                        fontSize: '13px',
                        fontWeight: 500,
                        color: 'var(--text-secondary)',
                        marginBottom: '8px',
                      }}
                    >
                      Email <span style={{ color: '#DC2626' }}>*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Mail className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
                      </div>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="john@example.com"
                        required
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          paddingLeft: '48px',
                          border: '1px solid var(--border)',
                          borderRadius: '10px',
                          fontFamily: 'var(--font-body)',
                          fontSize: '14px',
                          color: 'var(--text-primary)',
                          outline: 'none',
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = '#3B82F6';
                          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.08)';
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = 'var(--border)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      />
                    </div>
                  </div>
                  
                  {/* Subject */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontFamily: 'var(--font-body)',
                        fontSize: '13px',
                        fontWeight: 500,
                        color: 'var(--text-secondary)',
                        marginBottom: '8px',
                      }}
                    >
                      Subject <span style={{ color: '#DC2626' }}>*</span>
                    </label>
                    <div className="relative">
                      <select
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        required
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          paddingRight: '40px',
                          border: '1px solid var(--border)',
                          borderRadius: '10px',
                          fontFamily: 'var(--font-body)',
                          fontSize: '14px',
                          color: 'var(--text-primary)',
                          outline: 'none',
                          appearance: 'none',
                          cursor: 'pointer',
                          background: 'var(--bg-white)',
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = '#3B82F6';
                          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.08)';
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = 'var(--border)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
                        <option value="">Select a topic...</option>
                        <option value="general">General Inquiry</option>
                        <option value="support">Technical Support</option>
                        <option value="billing">Billing & Subscription</option>
                        <option value="feedback">Feedback & Suggestions</option>
                        <option value="partnership">Partnership Opportunities</option>
                        <option value="bug">Report a Bug</option>
                        <option value="other">Other</option>
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none" style={{ color: 'var(--text-tertiary)' }} />
                    </div>
                  </div>
                  
                  {/* Message */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontFamily: 'var(--font-body)',
                        fontSize: '13px',
                        fontWeight: 500,
                        color: 'var(--text-secondary)',
                        marginBottom: '8px',
                      }}
                    >
                      Message <span style={{ color: '#DC2626' }}>*</span>
                    </label>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value.slice(0, 1000))}
                      placeholder="How can we help you?"
                      rows={5}
                      required
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        border: '1px solid var(--border)',
                        borderRadius: '10px',
                        fontFamily: 'var(--font-body)',
                        fontSize: '14px',
                        color: 'var(--text-primary)',
                        outline: 'none',
                        resize: 'none',
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = '#3B82F6';
                        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.08)';
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    />
                    <p
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '12px',
                        color: message.length >= 900 ? '#F59E0B' : 'var(--text-tertiary)',
                        textAlign: 'right',
                        marginTop: '8px',
                      }}
                    >
                      {message.length}/1000 characters
                    </p>
                  </div>
                  
                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={isSubmitting || !canSubmit}
                    className="btn-primary-lg w-full"
                    style={{
                      background: !canSubmit || isSubmitting ? 'var(--border-light)' : '#1E40AF',
                      color: !canSubmit || isSubmitting ? 'var(--text-tertiary)' : 'white',
                      cursor: !canSubmit || isSubmitting ? 'not-allowed' : 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      if (canSubmit && !isSubmitting) e.currentTarget.style.background = '#1E3A8A';
                    }}
                    onMouseLeave={(e) => {
                      if (canSubmit && !isSubmitting) e.currentTarget.style.background = '#1E40AF';
                    }}
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="w-5 h-5" />
                        Send Message
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>
            
            {/* Right Column - Contact Info (2/5 width) */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Get in Touch Card */}
              <div
                className="reveal rounded-[14px]"
                style={{
                  border: '1px solid var(--border-light)',
                  background: 'var(--bg-white)',
                  padding: '24px',
                }}
              >
                <h3
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '15px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    marginBottom: '20px',
                  }}
                >
                  Get in Touch
                </h3>
                
                <div className="space-y-4">
                  {/* Support Email */}
                  <a 
                    href="mailto:support@offerloop.ai"
                    className="flex items-center gap-4 p-4 rounded-[10px] transition-all"
                    style={{
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-off)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.18)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-light)';
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: '10px',
                        background: 'rgba(59, 130, 246, 0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Mail className="w-5 h-5" style={{ color: '#1E40AF' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: '14px',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          marginBottom: '2px',
                        }}
                      >
                        Support
                      </p>
                      <p
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: '13px',
                          color: 'var(--text-secondary)',
                        }}
                        className="truncate"
                      >
                        support@offerloop.ai
                      </p>
                    </div>
                  </a>
                  
                  {/* Phone */}
                  <a 
                    href="tel:+15036161981"
                    className="flex items-center gap-4 p-4 rounded-[10px] transition-all"
                    style={{
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-off)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.18)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-light)';
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: '10px',
                        background: 'rgba(59, 130, 246, 0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Phone className="w-5 h-5" style={{ color: '#1E40AF' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: '14px',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          marginBottom: '2px',
                        }}
                      >
                        Phone
                      </p>
                      <p
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: '13px',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        (503) 616-1981
                      </p>
                    </div>
                  </a>
                  
                  {/* Response Time */}
                  <div className="flex items-center gap-4 p-4 rounded-[10px]" style={{ background: 'var(--bg-off)' }}>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: '10px',
                        background: 'rgba(59, 130, 246, 0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Clock className="w-5 h-5" style={{ color: '#1E40AF' }} />
                    </div>
                    <div>
                      <p
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: '14px',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          marginBottom: '2px',
                        }}
                      >
                        Response Time
                      </p>
                      <p
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: '13px',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        We typically reply within 1 business day
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Connect with Us Card */}
              <div
                className="reveal rounded-[14px]"
                style={{
                  border: '1px solid var(--border-light)',
                  background: 'var(--bg-white)',
                  padding: '24px',
                }}
              >
                <h3
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '15px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    marginBottom: '12px',
                  }}
                >
                  Connect with Us
                </h3>
                <p
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                    marginBottom: '20px',
                  }}
                >
                  Follow us for updates and insights about recruiting and career development.
                </p>
                
                <div className="flex items-center gap-3">
                  {/* LinkedIn */}
                  <a 
                    href="https://linkedin.com/company/offerloop-ai"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: '10px',
                      background: 'var(--border-light)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-tertiary)',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(59, 130, 246, 0.08)';
                      e.currentTarget.style.color = '#3B82F6';
                      e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.18)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'var(--border-light)';
                      e.currentTarget.style.color = 'var(--text-tertiary)';
                      e.currentTarget.style.borderColor = 'transparent';
                    }}
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                    </svg>
                  </a>
                  
                  {/* Instagram */}
                  <a 
                    href="https://instagram.com/offerloop.ai"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: '10px',
                      background: 'var(--border-light)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-tertiary)',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(59, 130, 246, 0.08)';
                      e.currentTarget.style.color = '#3B82F6';
                      e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.18)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'var(--border-light)';
                      e.currentTarget.style.color = 'var(--text-tertiary)';
                      e.currentTarget.style.borderColor = 'transparent';
                    }}
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                    </svg>
                  </a>
                  
                  {/* Twitter/X */}
                  <a 
                    href="https://twitter.com/offerloop"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: '10px',
                      background: 'var(--border-light)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-tertiary)',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(59, 130, 246, 0.08)';
                      e.currentTarget.style.color = '#3B82F6';
                      e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.18)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'var(--border-light)';
                      e.currentTarget.style.color = 'var(--text-tertiary)';
                      e.currentTarget.style.borderColor = 'transparent';
                    }}
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                  </a>
                  
                  {/* TikTok */}
                  <a 
                    href="https://tiktok.com/@offerloop"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: '10px',
                      background: 'var(--border-light)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-tertiary)',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(59, 130, 246, 0.08)';
                      e.currentTarget.style.color = '#3B82F6';
                      e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.18)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'var(--border-light)';
                      e.currentTarget.style.color = 'var(--text-tertiary)';
                      e.currentTarget.style.borderColor = 'transparent';
                    }}
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/>
                    </svg>
                  </a>
                </div>
              </div>
              
              {/* Quick Help Card */}
              <div
                className="reveal rounded-[14px]"
                style={{
                  border: '1px solid var(--border-light)',
                  background: 'var(--bg-white)',
                  padding: '24px',
                }}
              >
                <h3
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '15px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    marginBottom: '12px',
                  }}
                >
                  Quick Help
                </h3>
                
                <p
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                    marginBottom: '16px',
                  }}
                >
                  Find answers to common questions before reaching out.
                </p>
                
                <div className="space-y-2">
                  <button 
                    onClick={() => navigate('/pricing')}
                    className="flex items-center justify-between w-full p-3 rounded-[10px] transition-all text-left"
                    style={{
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-off)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.18)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-light)';
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '13px',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      Pricing & Plans
                    </span>
                    <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                  </button>
                  
                  <button 
                    onClick={() => navigate('/about')}
                    className="flex items-center justify-between w-full p-3 rounded-[10px] transition-all text-left"
                    style={{
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-off)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.18)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-light)';
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '13px',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      About Offerloop
                    </span>
                    <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                  </button>
                  
                  <button 
                    onClick={() => navigate('/privacy')}
                    className="flex items-center justify-between w-full p-3 rounded-[10px] transition-all text-left"
                    style={{
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-off)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.18)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-light)';
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '13px',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      Privacy & Security
                    </span>
                    <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                  </button>
                </div>
              </div>
              
            </div>
          </div>
        </div>
      </section>

      {/* Location Section */}
      <section
        className="py-[100px] px-6 md:px-12"
        style={{ background: 'var(--bg-off)' }}
      >
        <div className="max-w-7xl mx-auto">
          <div
            className="reveal rounded-[14px]"
            style={{
              border: '1px solid var(--border-light)',
              background: 'var(--bg-white)',
              padding: '32px',
            }}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Map Placeholder */}
              <div
                className="rounded-[10px] flex items-center justify-center"
                style={{
                  background: 'var(--bg-off)',
                  minHeight: '200px',
                }}
              >
                <div className="text-center">
                  <MapPin className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--text-tertiary)' }} />
                  <p
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '13px',
                      color: 'var(--text-tertiary)',
                    }}
                  >
                    Map coming soon
                  </p>
                </div>
              </div>
              
              {/* Location Info */}
              <div>
                <h3
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '15px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    marginBottom: '16px',
                  }}
                >
                  Our Location
                </h3>
                
                <p
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '15px',
                    lineHeight: 1.7,
                    color: 'var(--text-secondary)',
                    marginBottom: '20px',
                  }}
                >
                  We're based in sunny Los Angeles, building the future of recruiting from the USC campus.
                </p>
                
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <MapPin className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--text-tertiary)' }} />
                    <div>
                      <p
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: '14px',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          marginBottom: '2px',
                        }}
                      >
                        University of Southern California
                      </p>
                      <p
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: '13px',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        Los Angeles, CA 90007
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="mt-6 pt-6 border-t" style={{ borderColor: 'var(--border-light)' }}>
                  <p
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '13px',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    We're a remote-first team, but love meeting up for coffee in LA!
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer
        className="py-12 px-6 md:px-12"
        style={{
          background: 'var(--bg-white)',
          borderTop: '1px solid var(--border-light)',
        }}
      >
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <p
            className="text-sm"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '13px',
              color: 'var(--text-tertiary)',
            }}
          >
            © 2025 Offerloop. All rights reserved.
          </p>
          <div className="flex gap-6">
            {[
              { label: 'About', path: '/about' },
              { label: 'Contact', path: '/contact-us' },
              { label: 'Privacy', path: '/privacy' },
              { label: 'Terms', path: '/terms-of-service' },
            ].map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className="footer-link text-sm relative"
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '13px',
                  color: 'var(--text-tertiary)',
                }}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
      
      {/* Success Modal */}
      {formSubmitted && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{
            background: 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            className="relative rounded-[14px] max-w-md w-full mx-4"
            style={{
              background: 'var(--bg-white)',
              border: '1px solid var(--border-light)',
              boxShadow: '0 16px 48px rgba(0, 0, 0, 0.12)',
              padding: '32px',
            }}
          >
            {/* Close button */}
            <button 
              onClick={() => setFormSubmitted(false)}
              className="absolute top-4 right-4"
              style={{
                color: 'var(--text-tertiary)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-tertiary)';
              }}
            >
              <X className="w-5 h-5" />
            </button>
            
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: 'rgba(59, 130, 246, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px',
              }}
            >
              <CheckCircle className="w-10 h-10" style={{ color: '#1E40AF' }} />
            </div>
            
            <h3
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '24px',
                fontWeight: 400,
                color: 'var(--text-primary)',
                textAlign: 'center',
                marginBottom: '12px',
              }}
            >
              Message Sent!
            </h3>
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '15px',
                lineHeight: 1.7,
                color: 'var(--text-secondary)',
                textAlign: 'center',
                marginBottom: '24px',
              }}
            >
              Thanks for reaching out. We've received your message and will get back to you within 1 business day.
            </p>
            
            <div
              style={{
                background: 'rgba(37, 99, 235, 0.04)',
                borderRadius: '10px',
                border: '1px solid rgba(37, 99, 235, 0.08)',
                padding: '16px',
                marginBottom: '24px',
              }}
            >
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '13px',
                  color: '#3B82F6',
                  textAlign: 'center',
                }}
              >
                We've sent a confirmation to <span style={{ fontWeight: 500 }}>{submittedEmail}</span>
              </p>
            </div>
            
            <button 
              onClick={() => setFormSubmitted(false)}
              className="btn-primary-lg w-full"
              style={{
                background: '#3B82F6',
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContactUs;
