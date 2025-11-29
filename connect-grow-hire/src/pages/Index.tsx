// src/pages/Index.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Check, Send, Calendar, Handshake, BarChart, Users, Target, MessageSquare, TrendingUp, Zap, ArrowRight, Lightbulb, Heart } from 'lucide-react';import twoBillionImage from '@/assets/twobillion.jpeg';
import aiPersonalImage from '@/assets/Ai_Personal.jpeg';
import smartMatchingImage from '@/assets/SmartMatching.jpeg';
import topTierImage from '@/assets/TopTier.jpeg';
import analyticsImage from '@/assets/Analytics.jpeg';
import lockImg from "@/assets/lock.png";
import { Sparkles } from 'lucide-react';
import { BetaBadge } from '@/components/BetaBadges';
import { ThemeToggle } from '@/components/ThemeToggle';
import DylanRoby from "@/assets/DylanRoby.png";
import SaraUcuzoglu from "@/assets/SaraU.png";
import JacksonLeck from "@/assets/JacksonLeck.png";
import FiveStarReview from "@/assets/5StarReview.png";
import EliHamou from "@/assets/EliHamou.png";
import LucasTurcuato from "@/assets/LucasTurcuato.png";
import Marquee from "react-fast-marquee";
import proSearchVideo from "@/assets/Offerloop Professional Search.mp4";
import directoryVideo from "@/assets/contact directory and emails.mp4";
import OfferloopLogo from "@/assets/Offerloop-topleft.jpeg";


// Company Logos
import GoldmanSachsLogo from "@/assets/GoldmanSachs.png";
import MorganStanleyLogo from "@/assets/MorganStanley.png";
import JPMorganLogo from "@/assets/JPMorgan.png";
import BarclaysLogo from "@/assets/Barclays.png";
import EvercoreLogo from "@/assets/Evercore.png";
import BlackstoneLogo from "@/assets/Blackstone.png";
import PwCLogo from "@/assets/PwC.png";
import McKinseyLogo from "@/assets/McKinsey.png";
import BainLogo from "@/assets/McKinsey.png";
console.log({ DylanRoby, SaraUcuzoglu, JacksonLeck });


/** Reusable, professional CTA buttons for header + hero */
const CtaButtons: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const navigate = useNavigate();
  const pad = compact ? "px-4 py-2 text-sm" : "px-6 py-3 text-base";
  const radius = "rounded-2xl";
  const base =
    `inline-flex items-center justify-center ${pad} ${radius} font-semibold ` +
    `transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ` +
    `focus-visible:ring-blue-400 focus-visible:ring-offset-gray-900`;

  return (
    <div className={`flex items-center ${compact ? "gap-3" : "gap-4"}`}>
      {/* Secondary / Sign in */}
      <button
        onClick={() => navigate("/signin?mode=signin")}
        className={`${base} bg-gray-800/70 text-gray-100 hover:bg-gray-700/80 active:scale-[0.98] border border-gray-700/70 shadow-sm`}
      >
        Sign in
      </button>

      {/* Primary / Sign up */}
      <button
        onClick={() => navigate("/signin?mode=signup")}
        className={`${base} bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white shadow-lg shadow-blue-900/30 active:scale-[0.98]`}
      >
        Sign up with Google
        <ArrowRight className="ml-2 h-4 w-4" />
      </button>
    </div>
  );
};
const ClosedBetaStrip: React.FC = () => {
  const navigate = useNavigate(); // ✅ added

  return (
    <section
      id="beta"
      className="mt-8 px-6 max-w-5xl mx-auto"
    >
      {/* Outer gradient border wrapper */}
      <div 
        className="relative rounded-3xl p-[2px]"
        style={{
          background: 'linear-gradient(135deg, #6366f1, #a855f7, #ec4899, #8b5cf6, #6366f1)',
          backgroundSize: '200% 200%',
          animation: 'ripple-gradient 8s ease infinite'
        }}
      >
        {/* Inner content with glass effect */}
        <div className="relative rounded-3xl bg-gray-800/60 backdrop-blur-xl border border-white/10">
          {/* USC emphasis row */}
          <div className="relative mb-5 flex flex-wrap items-center justify-center gap-2 pt-8">
            <span className="inline-flex items-center rounded-full bg-white text-gray-900 px-3 py-1 text-xs font-semibold">
              Closed Beta
            </span>
            <span className="text-xs text-slate-300">100 seats • 2 weeks</span>
            <span className="inline-flex items-center rounded-full border border-fuchsia-300/40 bg-fuchsia-400/10 px-3 py-1 text-xs font-semibold text-fuchsia-200">
              USC students prioritized
            </span>
          </div>

          {/* Headline + subhead */}
          <div className="relative mx-auto max-w-5xl text-center px-6">
            <h3 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-50">
              USC Closed Beta is live
            </h3>
            <p className="mt-4 text-base sm:text-lg text-slate-300 leading-relaxed">
              Validate Gmail-powered networking outreach and turn more conversations into offers—starting at USC.
              Small weekly admit batches to protect deliverability.
            </p>
          </div>

          {/* Primary actions (single CTA) */}
          <div className="relative mt-7 flex items-center justify-center px-6">
            <button
              onClick={() => navigate('/usc-beta')} // ✅ changed
              className="
                inline-flex items-center justify-center
                rounded-2xl px-7 py-3.5 text-base font-semibold text-white
                bg-gradient-to-r from-indigo-500 to-violet-500
                hover:from-indigo-600 hover:to-violet-600
                shadow-lg shadow-indigo-900/30 transition
              "
            >
              Join the USC Beta
            </button>
          </div>

          {/* Divider */}
          <div className="relative mx-auto my-12 h-px w-full bg-gradient-to-r from-transparent via-white/15 to-transparent" />

          {/* --- How it works + Benefits (Side by Side) --- */}
          <div className="relative w-full px-6">
            <h4 className="text-center text-[28px] md:text-3xl font-extrabold tracking-tight text-slate-50 mb-10">
              How it works
            </h4>

            <div className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left: Steps */}
              <div>
                <ol className="space-y-6">  
                  {[
                    {
                      title: "Request Access",
                      sub: "Tell us your use case (USC admitted first).",
                      grad: "from-indigo-500 via-violet-500 to-fuchsia-500",
                      chip: "bg-indigo-500",
                    },
                    {
                      title: "Get an Invite",
                      sub: "We admit in small weekly batches.",
                      grad: "from-violet-500 via-fuchsia-500 to-indigo-500",
                      chip: "bg-violet-500",
                    },
                    {
                      title: "Start Sending",
                      sub: "Guided setup with a safe Gmail cap during beta.",
                      grad: "from-fuchsia-500 via-indigo-500 to-violet-500",
                      chip: "bg-fuchsia-500",
                    },
                  ].map(({ title, sub, grad, chip }, i) => (
                    <li key={title} className="relative">
                      <div className={`rounded-2xl p-[1.5px] bg-gradient-to-r ${grad} shadow-[0_10px_40px_-10px_rgba(0,0,0,0.6)]`}>
                        <div className="rounded-2xl bg-slate-900/70 backdrop-blur border border-white/10 px-7 py-6">
                          <div className="flex items-start gap-5">
                            <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-white text-sm font-bold">
                              <span className={`absolute inset-0 ${chip} blur-md opacity-70`} aria-hidden />
                              <span className="relative z-[1] rounded-full bg-white/10 h-10 w-10 grid place-items-center">
                                {i + 1}
                              </span>
                            </span>

                            <div className="min-w-0">
                              <h5 className="text-[18px] font-semibold tracking-tight text-slate-100">
                                {title}
                              </h5>
                              <p className="mt-1 text-sm text-slate-400 leading-relaxed">{sub}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Right: Benefits */}
              <div className="space-y-6">
                {/* What you'll get */}
                <div className="rounded-3xl p-[1.5px] bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500">
                  <div className="rounded-3xl bg-slate-900/70 backdrop-blur border border-white/10 p-7 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.6)]">
                    <h5 className="text-center text-sm font-semibold text-slate-100 mb-3 tracking-wide">
                      What you'll get
                    </h5>
                    <ul className="mx-auto text-sm text-slate-300 leading-relaxed list-disc list-inside space-y-1.5">
                      <li>Guided onboarding tailored for USC workflows</li>
                      <li>Working Gmail outreach flow (no spray-and-pray)</li>
                      <li>Fast support + quick fixes from the core team</li>
                    </ul>
                  </div>
                </div>

                {/* What we ask */}
                <div className="rounded-3xl p-[1.5px] bg-gradient-to-r from-fuchsia-500 via-indigo-500 to-violet-500">
                  <div className="rounded-3xl bg-slate-900/70 backdrop-blur border border-white/10 p-7 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.6)]">
                    <h5 className="text-center text-sm font-semibold text-slate-100 mb-3 tracking-wide">
                      What we ask
                    </h5>
                    <ul className="mx-auto text-sm text-slate-300 leading-relaxed list-disc list-inside space-y-1.5">
                      <li>Run a real outreach use case</li>
                      <li>Share quick feedback at key moments (1–2 min)</li>
                      <li>Be patient with small rough edges — we ship weekly</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* --- Micro FAQ + footnote --- */}
          <div className="relative mt-10 mb-8 text-center px-6 max-w-7xl mx-auto">
            <details className="text-sm text-slate-300 inline-block">
              <summary className="cursor-pointer text-slate-100/90 font-medium">Why a closed beta?</summary>
              <p className="mt-1 text-slate-400">
                We're validating reliability & deliverability in real student workflows before scaling beyond USC.
              </p>
            </details>
            <p className="mt-3 text-[12px] text-slate-400/90">
              Sending is available to Closed Beta users (100 seats). Request access to join a weekly batch.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
const Index = () => {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const navigate = useNavigate();

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header - Linear Style Layout */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-md border-b border-gray-900">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          {/* Logo - Left */}
          <div 
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => navigate("/")}
          >
            <img 
              src={OfferloopLogo} 
              alt="Offerloop" 
              className="h-10"
            />
          </div>
          
          {/* Centered Navigation - Like Linear */}
          <nav className="hidden md:flex items-center gap-8 absolute left-1/2 transform -translate-x-1/2">
            <a href="#features" className="text-sm text-gray-400 hover:text-white transition-colors">Features</a>
            <a 
              href="#pricing" 
              className="text-sm text-gray-400 hover:text-white transition-colors"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              Pricing
            </a>
            <a 
              href="#privacy" 
              className="text-sm text-gray-400 hover:text-white transition-colors"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById('privacy')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              Privacy
            </a>
            <a 
              href="#about" 
              className="text-sm text-gray-400 hover:text-white transition-colors"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              About
            </a>
          </nav>
          
          {/* CTAs - Right */}
          <div className="hidden md:flex items-center gap-4">
            <ThemeToggle />
            <CtaButtons compact />
          </div>
        </div>
      </header>
 
 
      {/* Hero Section */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden bg-black">
        <div className="w-full mx-auto text-center">
          <div className="max-w-4xl mx-auto mb-8">
              <h1 className="text-8xl md:text-[7rem] font-bold mb-12 leading-tight mt-32">
              Recruiting On <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-blue-400 bg-[length:200%_auto] bg-clip-text text-transparent animate-gradient">Autopilot</span>
            </h1>
              <p className="text-xl text-gray-300 mb-8 leading-relaxed">
              We take the tedious, repetitive work out of recruiting.
            </p>
            <button
              onClick={() => navigate("/signin?mode=signup")}
              className="inline-flex items-center justify-center px-8 py-4 text-lg font-semibold rounded-2xl bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white shadow-lg shadow-blue-900/30 transition-all active:scale-[0.98] mb-16"
            >
              Try it out
              <ArrowRight className="ml-2 h-5 w-5" />
            </button>
          </div>
        </div>
        
        {/* Demo videos */}
        <div className="w-full mt-16 px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 max-w-[1800px] mx-auto">
            <figure className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/40 shadow-2xl transform hover:scale-[1.02] transition-transform">
              <video
                autoPlay
                loop
                muted
                playsInline
                className="w-full pointer-events-none"
                style={{ aspectRatio: "16 / 9" }}
              >
                <source src={proSearchVideo} type="video/mp4" />
              </video>
              <figcaption className="px-6 py-5 text-center text-xl font-semibold text-slate-200 border-t border-white/10">
                Offerloop — Professional Search
              </figcaption>
            </figure>

            <figure className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/40 shadow-2xl transform hover:scale-[1.02] transition-transform">
              <video
                autoPlay
                loop
                muted
                playsInline
                className="w-full pointer-events-none"
                style={{ aspectRatio: "16 / 9" }}
              >
                <source src={directoryVideo} type="video/mp4" />
              </video>
              <figcaption className="px-6 py-5 text-center text-xl font-semibold text-slate-200 border-t border-white/10">
                Contact Directory & Emails
              </figcaption>
            </figure>
          </div>
        </div>
      </section>
      
      <ClosedBetaStrip />
{/* Why Choose Section */}
      <section className="py-24 px-6 bg-black">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-6 flex items-center justify-center">
              Why Choose&nbsp;
            <span className="bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
              Offerloop.ai?
            </span>
            
            
            
          </h2>
            <p className="text-xl text-gray-300">
              Everything you need to streamline your recruiting process and land the best opportunities — in less time.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-16 items-center mb-20">
            <div>
              <h3 className="text-3xl font-bold mb-6 text-blue-400">Smart Matching</h3>
              <p className="text-xl text-gray-300 mb-8">
                Our AI-powered algorithm connects the right talent with the right opportunities based on skills, experience, and culture fit.
              </p>
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-8 border border-gray-700">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                    <span className="text-gray-300">Skills-based matching</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                    <span className="text-gray-300">Culture fit analysis</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-pink-500 rounded-full"></div>
                    <span className="text-gray-300">Experience alignment</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-2xl p-8 backdrop-blur-sm border border-gray-700">
              <img 
                src={smartMatchingImage} 
                alt="Smart Matching visualization" 
                className="w-full h-64 object-contain rounded-xl"
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-16 items-center mb-20">
            <div className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-2xl p-8 backdrop-blur-sm border border-gray-700 md:order-1">
              <img 
                src={topTierImage} 
                alt="Top-tier Mentorship visualization" 
                className="w-full h-64 object-contain rounded-xl"
              />
            </div>
            <div className="md:order-2">
              <h3 className="text-3xl font-bold mb-6 text-purple-400">Top-tier Mentorship</h3>
              <p className="text-xl text-gray-300 mb-8">
                Get counseling from top talent and professionals across multiple industries to maximize your opportunity at landing your dream job.
              </p>
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-gray-700">
                <p className="text-gray-300 italic">
                  "Connect with industry professionals who can guide you through the recruiting process and help you prepare for success."
                </p>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <h3 className="text-3xl font-bold mb-6 text-green-400">Analytics & Insights</h3>
              <p className="text-xl text-gray-300 mb-8">
                Track your hiring metrics, measure success rates, and optimize your recruitment process with detailed analytics.
              </p>
              <div className="space-y-4">
                <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border border-gray-700 flex items-center justify-between">
                  <span className="text-gray-300">Applications Sent</span>
                  <span className="text-green-400 text-lg font-bold">247</span>
                </div>
                <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border border-gray-700 flex items-center justify-between">
                  <span className="text-gray-300">Response Rate</span>
                  <span className="text-blue-400 text-lg font-bold">34%</span>
                </div>
                <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border border-gray-700 flex items-center justify-between">
                  <span className="text-gray-300">Interviews Scheduled</span>
                  <span className="text-purple-400 text-lg font-bold">12</span>
                </div>
              </div>
            </div>
            <div className="bg-gradient-to-br from-green-500/20 to-blue-500/20 rounded-2xl p-8 backdrop-blur-sm border border-gray-700">
              <img 
                src={analyticsImage} 
                alt="Analytics & Insights visualization" 
                className="w-full h-64 object-contain rounded-xl"
              />
            </div>
          </div>
        </div>
      </section>
      {/* Smart Filter Section */}
      <section id="features" className="py-24 px-6 bg-black">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 gap-16 items-center mb-20">
            <div>
              <h3 className="text-3xl font-bold mb-6 text-blue-400 flex items-center gap-3">
                2 Billion+ Professionals
                <BetaBadge size="xs" variant="outline" />
              </h3>
              <p className="text-xl text-gray-300 mb-8">
                Access the world's largest database of professional contacts with advanced filtering capabilities to find exactly who you're looking for.
              </p>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                  <span className="text-gray-300">Advanced search filters</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                  <span className="text-gray-300">Real-time data updates</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                  <span className="text-gray-300">Global coverage</span>
                </div>
              </div>
            </div>
            <div className="relative rounded-2xl overflow-hidden border border-blue-500/30 bg-gradient-to-br from-gray-900 to-gray-800" style={{ height: '500px' }}>
              <img 
                src={twoBillionImage} 
                alt="Global professional network visualization" 
                className="w-full h-full object-contain p-4"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-gray-900/90 via-transparent to-transparent flex items-end justify-center pb-8">
                <div className="text-center">
                  <div className="text-5xl font-bold text-white mb-2 drop-shadow-lg">2B+</div>
                  <div className="text-xl text-gray-200 drop-shadow-lg">Professional Contacts</div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div className="relative rounded-2xl overflow-hidden border border-purple-500/30 bg-gradient-to-br from-gray-900 to-gray-800" style={{ height: '500px' }}>
              <img 
                src={aiPersonalImage} 
                alt="AI-powered personalization engine visualization" 
                className="w-full h-full object-contain p-4"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-gray-900/90 via-transparent to-transparent flex items-end justify-center pb-8">
                <div className="text-center">
                  <div className="text-5xl font-bold text-white mb-2 drop-shadow-lg">AI Powered</div>
                  <div className="text-xl text-gray-200 drop-shadow-lg">Personalization Engine</div>
                </div>
              </div>
            </div>
            <div>
              <h3 className="text-3xl font-bold mb-6 text-purple-400 flex items-center gap-3">
                AI Personalizations
                <BetaBadge size="xs" variant="outline" />
              </h3>

              <p className="text-xl text-gray-300 mb-8">
                Maximize your response rate and recruitment success with hyper personalized emails curated to capture attention.
              </p>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                  <span className="text-gray-300">Personalized email generation</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                  <span className="text-gray-300">Context-aware messaging</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                  <span className="text-gray-300">Higher response rates</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      


      {/* Reviews Section */}
      <section className="py-24 px-6 md:px-12 lg:px-20 overflow-hidden bg-black">
        <div className="w-full max-w-full mx-auto">
          {/* Header */}
          <div className="text-center mb-20">
            <h2 className="text-6xl md:text-7xl font-bold mb-4 leading-relaxed">Hear from our<br /><span className="bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">Real Customers</span></h2>
            <p className="text-lg md:text-xl text-gray-500">Used by hundreds of students across the country with offers received from top tier firms</p>
          </div>

          {/* Company Logos Marquee */}
          <div className="mb-20">
            <Marquee
              gradient={true}
              gradientColor="#0a0d1a"
              gradientWidth={250}
              speed={50}
              direction="right"
            >
              <div className="flex items-center mx-12">
                <img
                  src={McKinseyLogo}
                  alt="McKinsey"
                  className="h-14 md:h-16 w-auto opacity-70"
                />
              </div>
              <div className="flex items-center mx-12">
                <img
                  src={EvercoreLogo}
                  alt="Evercore"
                  className="h-10 md:h-12 w-auto opacity-70"
                />
              </div>
              <div className="flex items-center mx-12">
                <img
                  src={GoldmanSachsLogo}
                  alt="Goldman Sachs"
                  className="h-14 md:h-16 w-auto opacity-70"
                />
              </div>
              <div className="flex items-center mx-12">
                <img
                  src={BainLogo}
                  alt="Bain"
                  className="h-14 md:h-16 w-auto opacity-70"
                />
              </div>
              <div className="flex items-center mx-12">
                <img
                  src={MorganStanleyLogo}
                  alt="Morgan Stanley"
                  className="h-14 md:h-16 w-auto opacity-70"
                />
              </div>
              <div className="flex items-center mx-12">
                <img
                  src={BlackstoneLogo}
                  alt="Blackstone"
                  className="h-14 md:h-16 w-auto opacity-70"
                />
              </div>
               <div className="flex items-center mx-8 ml-20">
                <img
                  src={PwCLogo}
                  alt="PwC"
                  className="h-14 md:h-16 w-auto opacity-70"
                />
              </div>
              <div className="flex items-center mx-12">
                <img
                  src={JPMorganLogo}
                  alt="J.P. Morgan"
                  className="h-14 md:h-16 w-auto opacity-70"
                />
              </div>
              <div className="flex items-center mx-12">
                <img
                  src={BarclaysLogo}
                  alt="Barclays"
                  className="h-10 md:h-12 w-auto opacity-70"
                />
              </div>
            </Marquee>
          </div>
          
          {/* Reviews Carousel */}
          <Marquee
            gradient={true}
            gradientColor="#0a0d1a"
            gradientWidth={343}
            speed={100}
            pauseOnHover={true}
          >
            {/* Review 1 - Dylan Roby */}
            <div className="flex flex-col justify-between bg-black/50 backdrop-blur-sm rounded-2xl p-10 border border-gray-700 mx-4 w-[480px] h-[500px]">
              <div>
                <div className="flex items-start mb-8">
                  <img
                    src={FiveStarReview}
                    alt="5 star rating"
                    className="w-[130px] h-auto object-contain"
                  />
                </div>
                <p className="text-gray-300 mb-10 italic text-xl leading-relaxed">
                  "Offerloop does the work that I had spent hundreds of hours doing to land my internship… in mere minutes. The platform is incredibly intuitive and saves me so much time during recruiting season."
                </p>
              </div>
              <div className="flex items-center gap-5">
                <img
                  src={DylanRoby}
                  alt="Dylan Roby"
                  className="w-20 h-20 rounded-full object-cover border border-gray-600 shadow-md"
                />
                <div>
                  <div className="font-semibold text-xl">Dylan Roby</div>
                  <div className="text-gray-400 text-base">Evercore, Investment Banking Analyst</div>
                </div>
              </div>
            </div>

            {/* Review 2 - Sarah Ucuzoglu */}
            <div className="flex flex-col justify-between bg-black/50 backdrop-blur-sm rounded-2xl p-10 border border-gray-700 mx-4 w-[480px] h-[500px]">
              <div>
                <div className="flex items-start mb-8">
                  <img
                    src={FiveStarReview}
                    alt="5 star rating"
                    className="w-[130px] h-auto object-contain"
                  />
                </div>
                <p className="text-gray-300 mb-10 italic text-xl leading-relaxed">
                  "Having the ability to automate the cold reach out process allows for more time spent face to face with a professional and less time behind spreadsheets. It's been a game-changer for my networking."
                </p>
              </div>
              <div className="flex items-center gap-5">
                <img
                  src={SaraUcuzoglu}
                  alt="Sarah Ucuzoglu"
                  className="w-20 h-20 rounded-full object-cover border border-gray-600 shadow-md"
                />
                <div>
                  <div className="font-semibold text-xl">Sarah Ucuzoglu</div>
                  <div className="text-gray-400 text-base">PwC, Financial Advisory Intern</div>
                </div>
              </div>
            </div>

            {/* Review 3 - Jackson Leck */}
            <div className="flex flex-col justify-between bg-black/50 backdrop-blur-sm rounded-2xl p-10 border border-gray-700 mx-4 w-[480px] h-[500px]">
              <div>
                <div className="flex items-start mb-8">
                  <img
                    src={FiveStarReview}
                    alt="5 star rating"
                    className="w-[130px] h-auto object-contain"
                  />
                </div>
                <p className="text-gray-300 mb-10 italic text-xl leading-relaxed">
                  "I would have so many recruiting tabs open with LinkedIn, Excel, Gmail, Google, Chat GPT... with Offerloop I have one. Everything I need in a single place makes my workflow so much smoother."
                </p>
              </div>
              <div className="flex items-center gap-5">
                <img
                  src={JacksonLeck}
                  alt="Jackson Leck"
                  className="w-20 h-20 rounded-full object-cover border border-gray-600 shadow-md"
                />
                <div>
                  <div className="font-semibold text-xl">Jackson Leck</div>
                  <div className="text-gray-400 text-base">Blackstone, Private Equity Intern</div>
                </div>
              </div>
            </div>

            {/* Review 4 - Eli Hamou */}
            <div className="flex flex-col justify-between bg-black/50 backdrop-blur-sm rounded-2xl p-10 border border-gray-700 mx-4 w-[480px] h-[500px]">
              <div>
                <div className="flex items-start mb-8">
                  <img
                    src={FiveStarReview}
                    alt="5 star rating"
                    className="w-[130px] h-auto object-contain"
                  />
                </div>
                <p className="text-gray-300 mb-10 italic text-xl leading-relaxed">
                  "This platform completely transformed how I approach networking. The time I save allows me to focus on what really matters—building genuine connections and preparing for interviews."
                </p>
              </div>
              <div className="flex items-center gap-5">
                <img
                  src={EliHamou}
                  alt="Eli Hamou"
                  className="w-20 h-20 rounded-full object-cover border border-gray-600 shadow-md"
                />
                <div>
                  <div className="font-semibold text-xl">Eli Hamou</div>
                  <div className="text-gray-400 text-base">Deloitte, Audit Intern</div>
                </div>
              </div>
            </div>

            {/* Review 5 - Lucas Turcuato */}
            <div className="flex flex-col justify-between bg-black/50 backdrop-blur-sm rounded-2xl p-10 border border-gray-700 mx-4 w-[480px] h-[500px]">
              <div>
                <div className="flex items-start mb-8">
                  <img
                    src={FiveStarReview}
                    alt="5 star rating"
                    className="w-[130px] h-auto object-contain"
                  />
                </div>
                <p className="text-gray-300 mb-10 italic text-xl leading-relaxed">
                  "Game changer for recruiting season. I went from stressed to organized in minutes. Highly recommend to anyone serious about landing offers at top firms. This tool is essential."
                </p>
              </div>
              <div className="flex items-center gap-5">
                <img
                  src={LucasTurcuato}
                  alt="Lucas Turcuato"
                  className="w-20 h-20 rounded-full object-cover border border-gray-600 shadow-md"
                />
                <div>
                  <div className="font-semibold text-xl">Lucas Turcuato</div>
                  <div className="text-gray-400 text-base">Barclays, Investment Banking Analyst</div>
                </div>
              </div>
            </div>
          </Marquee>
        </div>
      </section>
      
      {/* Pricing Section */}
      <section id="pricing" className="py-24 px-6 bg-black">
        <div className="max-w-6xl mx-auto">
           <div className="text-center mb-24">
            <h2 className="text-5xl lg:text-7xl font-bold mb-6">
              Start <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-blue-400 bg-[length:200%_auto] bg-clip-text text-transparent animate-gradient">Connecting</span> Today
            </h2>
          </div>


          <div className="flex justify-center">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-6xl w-full scale-110">
              {/* Free Plan */}
              <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-8 backdrop-blur-sm">
                <div className="text-center mb-8">
                  <h3 className="text-3xl font-bold mb-3 text-white">Free</h3>
                  <p className="text-gray-400">Try out platform risk free</p>
                </div>

                <div className="space-y-4 mb-8">
                  <div className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                    <span className="text-gray-300">150 credits (10 emails)</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                    <span className="text-gray-300">Estimated time saved: 250 minutes</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                    <span className="text-gray-300">Try out platform risk free</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                    <span className="text-gray-300">Limited Features</span>
                  </div>
                </div>

                <button 
                  className="w-full py-4 px-6 rounded-lg font-semibold text-white bg-slate-700 hover:bg-slate-600 transition-colors"
                  onClick={() => navigate("/signin?mode=signup")}
                >
                  Start for free
                </button>
              </div>

              {/* Pro Plan */}
              <div className="relative bg-gradient-to-br from-blue-600/20 to-purple-600/20 border-2 border-blue-500/50 rounded-xl p-8 backdrop-blur-sm">
                <div className="absolute top-4 right-4">
                  <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full font-medium">
                    RECOMMENDED
                  </span>
                </div>
                
                <div className="text-center mb-8">
                  <h3 className="text-3xl font-bold mb-3 text-blue-400">Pro</h3>
                  <div className="mb-2">
                    <span className="text-gray-500 text-xl line-through mr-2">$34.99</span>
                    <span className="text-3xl font-bold text-white">$8.99</span>
                    <span className="text-gray-400 text-lg ml-1">/month</span>
                  </div>
                  <p className="text-gray-300">1800 credits</p>
                </div>

                <div className="space-y-4 mb-8">
                  <div className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                    <span className="text-gray-300">1800 credits (120 emails) </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                    <span className="text-gray-300">Estimated time saved: 2500 minutes</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                    <span className="text-gray-300">Everything in free plus:</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                    <span className="text-gray-300">Directory permanently saves</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                    <span className="text-gray-300">Priority Support</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                    <span className="text-gray-300">Advanced features</span>
                  </div>
                </div>

                <button 
                  className="w-full py-4 px-6 rounded-lg font-semibold text-white bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 bg-[length:200%_auto] hover:from-blue-600 hover:to-purple-600 transition-all shadow-lg animate-gradient"
                  onClick={() => navigate("/signin?mode=signup")}
                >
                  Start now
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
      



      {/* About & Mission Section Preview */}
      <section id="about" className="py-24 px-6 bg-black">
        <div className="max-w-7xl mx-auto">
          {/* Mission Section */}
          <div className="mb-20">
          {/* Centered Mission Text */}
          <div className="text-center mx-auto max-w-4xl">
            <h2 className="text-4xl md:text-6xl font-bold mb-6">
              Our{" "}
              <span className="bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                Mission
              </span>
            </h2>
            <p className="text-lg md:text-xl text-gray-300 leading-relaxed mb-8">
              To make it easier for students and young professionals to connect, stand out and land better opportunities.

            </p>
            <p className="text-lg md:text-xl text-gray-300 leading-relaxed mb-8">
              By cutting down the time to send emails and prep for calls by 90%, we save our users hundreds of hours of work and stress, giving them back time to focus on what matters: learning, growing and enjoying your best years

            </p>

            
          </div>
    </div>

    {/* About / Our Story Section */}
    <div className="max-w-5xl mx-auto text-center">
      <h3 className="text-4xl md:text-5xl font-bold mb-6 text-white">
        Our Story
      </h3>
      <p className="text-lg md:text-xl text-gray-300 leading-relaxed mb-6">
        Offerloop is a platform built by students, for students and young professionals, with one goal: to make it easier to connect with professionals, stand out, and land great opportunities.
      </p>
      <p className="text-lg md:text-xl text-gray-300 leading-relaxed mb-6">
        At USC, we saw countless students spending hours filling out spreadsheets and sending emails, and we went through the same thing ourselves. With so many applicants for every competitive role, networking is essential — but the process is slow, stressful, and exhausting. Worst of all, it takes away from what’s supposed to be the most exciting time of your life.
      </p>
      <p className="text-lg md:text-xl text-gray-300 leading-relaxed mb-6">
        We built Offerloop to fix that. Our platform automates outreach and organizes your recruiting workflow, helping you spend less time on tedious work and more time building real connections and preparing for what truly matters in your career.
      </p>


      {/* Optional Call-to-Action */}
      <div className="mt-10">
        <button
          className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white px-8 py-4 rounded-2xl font-semibold text-lg transition-all transform hover:scale-105 shadow-lg shadow-blue-900/30"
        >
          Get started today →
        </button>
      </div>
    </div>
  </div>
</section>

       

      {/* Data Privacy Section */}
      <section id="privacy" className="relative py-28 bg-black">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center md:space-x-16 px-6">
    
         {/* Icon without heavy gradient */}
         <div className="flex-shrink-0 mb-10 md:mb-0">
          <div className="w-40 h-40 flex items-center justify-center rounded-2xl bg-transparent shadow-lg">
            <img 
              src={lockImg} 
              alt="Data Privacy Lock Icon" 
              className="w-24 h-24 object-contain drop-shadow-[0_4px_12px_rgba(99,102,241,0.6)]" 
            />
         </div>
        </div>

    {/* Text */}
        <div className="text-center md:text-left">
          <h2 className="text-4xl font-extrabold mb-6 bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
            Your Privacy, Our Priority
          </h2>
          <p className="text-gray-300 leading-relaxed max-w-2xl text-lg">
            At Offerloop.ai, your data is yours — always. We never sell or share your information. 
            Authentication is handled securely through Google sign-in, and all data is encrypted 
            in transit and at rest. You can export or delete your information at any time, giving 
            you complete control and peace of mind.
          </p>
        </div>
      </div>
    </section>

      {/* FAQ */}
      <section className="py-20 px-6 bg-black">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
           
          </div>

          <div className="space-y-4">
            {[
              {
                question: "How does Offerloop.ai work?",
                answer: "Offerloop.ai streamlines your job search by automating applications, tracking responses, and connecting you with relevant opportunities. Our AI matches your profile with suitable positions and handles the repetitive tasks so you can focus on preparing for interviews."
              },
              {
                question: "What makes Offerloop.ai different?",
                answer: "We focus on quality over quantity. Instead of sending generic applications everywhere, we use smart matching to connect you with roles that truly fit your skills and career goals, resulting in higher response rates and better opportunities."
              },
              {
                question: "Is my data secure?",
                answer: "Absolutely. We use enterprise-grade security measures to protect your personal information and job search data. Your privacy is our top priority, and we never share your information without your explicit consent."
              },
              {
                question: "Can I cancel anytime?",
                answer: "Yes, you can cancel your subscription at any time. There are no long-term contracts or cancellation fees. Your access will continue until the end of your current billing period."
              }
            ].map((faq, index) => (
              <div key={index} className="bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-gray-700 overflow-hidden">
                <button
                  className="w-full p-6 text-left flex items-center justify-between hover:bg-gray-700/30 transition-colors"
                  onClick={() => toggleFaq(index)}
                >
                  <span className="text-lg font-semibold">{faq.question}</span>
                  <ChevronDown 
                    className={`w-5 h-5 text-gray-400 transition-transform ${
                      openFaq === index ? 'rotate-180' : ''
                    }`} 
                  />
                </button>
                {openFaq === index && (
                  <div className="px-6 pb-6">
                    <p className="text-gray-300 leading-relaxed">{faq.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 px-6 border-t border-gray-800">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            <div className="md:col-span-2">
              <div className="flex items-center gap-4 mb-8">
                <span className="text-2xl font-bold">
                  Offer<span className="bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">loop</span>.ai
                </span>
              </div>
              
              <p className="text-gray-400 leading-relaxed mb-8">
                Fundamentally changing how you recruit by taking the tedious, repetitive work out of the process. 
                Connect with professionals and build the career you're excited about.
              </p>
              
              <div>
                <h4 className="font-semibold mb-4 text-white">Follow Us</h4>
                <div className="flex items-center gap-4">
                  <a href="#" className="w-12 h-12 bg-gray-700 hover:bg-blue-600 rounded-full flex items-center justify-center transition-colors group">
                    <svg className="w-5 h-5 text-gray-300 group-hover:text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z"/>
                    </svg>
                  </a>
                  <a href="#" className="w-12 h-12 bg-gray-700 hover:bg-blue-700 rounded-full flex items-center justify-center transition-colors group">
                    <svg className="w-5 h-5 text-gray-300 group-hover:text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                    </svg>
                  </a>
                  <a href="#" className="w-12 h-12 bg-gray-700 hover:bg-blue-600 rounded-full flex items-center justify-center transition-colors group">
                    <svg className="w-5 h-5 text-gray-300 group-hover:text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                  </a>
                  <a href="#" className="w-12 h-12 bg-gray-700 hover:bg-purple-600 rounded-full flex items-center justify-center transition-colors group">
                    <svg className="w-5 h-5 text-gray-300 group-hover:text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.59-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                    </svg>
                  </a>
                </div>
              </div>
            </div>
            
            <div>
              <h3 className="font-semibold mb-4 text-white">Company</h3>
              <ul className="space-y-3 text-gray-400">
                <li><a href="#about" className="hover:text-white transition-colors">About Us</a></li>
                <li><a href="/careers" className="hover:text-white transition-colors">Careers</a></li>
                <li><a href="/blog" className="hover:text-white transition-colors">Blog</a></li>
                <li><a href="/press" className="hover:text-white transition-colors">Press</a></li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-semibold mb-4 text-white">Support</h3>
              <ul className="space-y-3 text-gray-400">
                <li><a href="/contact" className="hover:text-white transition-colors">Contact Us</a></li>
                <li><a href="/help" className="hover:text-white transition-colors">Help Center</a></li>
                <li><a href="/privacy" className="hover:text-white transition-colors">Privacy Policy</a></li>
                <li><a href="/terms" className="hover:text-white transition-colors">Terms of Service</a></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-800 pt-8 text-center">
            <p className="text-gray-400">
              © {new Date().getFullYear()} Offerloop.ai. All rights reserved. Connecting talent with opportunity through intelligent recruiting solutions.
            </p>
          </div>
        </div>
      </footer>
      <div className="fixed bottom-6 right-6 z-50 animate-pulse">
        <div className="bg-gray-900/95 backdrop-blur-sm border-2 border-blue-400/50 rounded-full px-4 py-2 flex items-center gap-2 shadow-xl shadow-blue-500/30">
          <div className="relative">
            <div className="absolute inset-0 bg-blue-500 rounded-full blur-sm opacity-50"></div>
            <Sparkles className="relative h-4 w-4 text-blue-400" />
          </div>
          <span className="text-sm font-semibold text-blue-300">BETA</span>
        </div>
      </div>
    </div>
  );
};

export default Index;