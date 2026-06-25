import React from 'react';
import { motion } from 'framer-motion';
import { ContactSearchDemoPlaceholder } from './demo/ContactSearchDemoPlaceholder';
import { FirmSearchDemoPlaceholder } from './demo/FirmSearchDemoPlaceholder';
import { CoffeeChatDemoPlaceholder } from './demo/CoffeeChatDemoPlaceholder';
import { DashboardDemoPlaceholder } from './demo/DashboardDemoPlaceholder';
import proSearchVideo from '@/assets/Offerloop Professional Search.mp4';
import scoutYetiHead from '@/assets/scouts/scout-yeti-head.png';
import dashboardVideo from '@/assets/Dashboard.mov';
import contactSearchVideo from '@/assets/Contact Search.mov';
import firmSearchVideo from '@/assets/FirmSearch.mov';
import coffeeChatVideo from '@/assets/CoffeeChat.mov';
import TextType from './TextType';
import Marquee from "react-fast-marquee";
import DylanRoby from "@/assets/DylanRoby.png";
import SaraUcuzoglu from "@/assets/SaraU.png";
import JacksonLeck from "@/assets/JacksonLeck.png";
import FiveStarReview from "@/assets/5StarReview.png";
import EliHamou from "@/assets/EliHamou.png";
import LucasTurcuato from "@/assets/LucasTurcuato.png";
import McKinseyLogo from "@/assets/McKinsey.png";
import EvercoreLogo from "@/assets/Evercore.png";
import GoldmanSachsLogo from "@/assets/GoldmanSachs.png";
import BainLogo from "@/assets/McKinsey.png";
import MorganStanleyLogo from "@/assets/MorganStanley.png";
import BlackstoneLogo from "@/assets/Blackstone.png";
import PwCLogo from "@/assets/PwC.png";
import JPMorganLogo from "@/assets/JPMorgan.png";
import BarclaysLogo from "@/assets/Barclays.png";

export const ProductTour: React.FC = () => {
  const cardVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <section id="features" className="py-32 px-6 overflow-visible relative" style={{ marginTop: '-275px' }}>
      <div className="max-w-7xl mx-auto overflow-visible">
        {/* Feature 1: Dashboard - Text on Left, Video on Right */}
        <motion.div
          variants={cardVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="mb-32"
        >
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Text - Left Side */}
            <div className="space-y-6">
              <h3 className="text-4xl font-bold text-section-heading mb-4">Dashboard</h3>
              <p className="text-xl text-section-body leading-relaxed">
                Your recruiting command center. View all activity: firm searches, contact searches, prep history, and progress. Track outreach in the Inbox with follow-up suggestions and an integrated calendar.
              </p>
            </div>
            
            {/* Video - Right Side */}
            <div className="relative">
              <div className="aspect-video rounded-[3px] overflow-hidden border border-[#3B82F6]/20 border-[#3B82F6]/60 bg-gradient-to-br from-[#3B82F6]/5 to-[#2563EB]/5 from-[#FAFBFF]/80 to-[#FAFBFF]/80 shadow-lg shadow-[#E2E8F0]/50">
                <video
                  src={dashboardVideo}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute -bottom-4 -left-4 w-24 h-24 bg-[#3B82F6]/10 bg-[#E2E8F0]/40 rounded-full blur-3xl"></div>
            </div>
          </div>
        </motion.div>

        {/* Feature 2: Contact Search - Text on Right, Video on Left */}
        <motion.div
          variants={cardVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="mb-32"
        >
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Video - Left Side */}
            <div className="relative">
              <div className="aspect-video rounded-[3px] overflow-hidden border border-[#3B82F6]/20 border-[#3B82F6]/60 bg-gradient-to-br from-[#3B82F6]/5 to-[#3B82F6]/5 from-[#FAFBFF]/80 to-[#FAFBFF]/80 shadow-lg shadow-[#E2E8F0]/50">
                <video
                  src={contactSearchVideo}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-[#3B82F6]/10 bg-[#E2E8F0]/40 rounded-full blur-3xl"></div>
            </div>
            
            {/* Text - Minimal */}
            <div className="space-y-6">
              <h3 className="text-4xl font-bold text-section-heading mb-4">Contact Search</h3>
              <p className="text-xl text-section-body leading-relaxed">
                Turn "who should I reach out to?" into a real list — in one click.
              </p>
            </div>
          </div>
        </motion.div>

        {/* Feature 3: Firm Search - Text on Left, Video on Right */}
        <motion.div
          variants={cardVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="mb-32"
        >
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Text - Left Side */}
            <div className="space-y-6">
              <h3 className="text-4xl font-bold text-section-heading mb-4">Firm Search</h3>
              <p className="text-xl text-section-body leading-relaxed">
                Find the firms you want to recruit for. Input the industry, size, and any relevant keywords to get back a clean table of companies with all key details.
              </p>
            </div>
            
            {/* Video - Right Side */}
            <div className="relative">
              <div className="aspect-video rounded-[3px] overflow-hidden border border-emerald-500/20 border-emerald-300/60 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 from-emerald-50/80 to-teal-50/80 shadow-lg shadow-emerald-100/50">
                <video
                  src={firmSearchVideo}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute -bottom-4 -left-4 w-24 h-24 bg-emerald-500/10 bg-emerald-200/40 rounded-full blur-3xl"></div>
            </div>
          </div>
        </motion.div>

        {/* Feature 5: Coffee Chat Prep - Text on Left, Video on Right */}
        <motion.div
          variants={cardVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="mb-32"
        >
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Text - Left Side */}
            <div className="space-y-6">
              <h3 className="text-4xl font-bold text-section-heading mb-4">Coffee Chat Prep</h3>
              <p className="text-xl text-section-body leading-relaxed">
                Prepare for your coffee chat. Enter the LinkedIn URL of the person you're speaking with and get a 2-page PDF with background, company insights, talking points, and smart questions.
              </p>
            </div>
            
            {/* Video - Right Side */}
            <div className="relative">
              <div className="aspect-video rounded-[3px] overflow-hidden border border-purple-500/20 border-purple-300/50 shadow-lg shadow-purple-100/40">
                <video
                  src={coffeeChatVideo}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute -top-6 -left-6 w-32 h-32 bg-purple-500/10 bg-purple-200/40 rounded-full blur-3xl"></div>
            </div>
          </div>
        </motion.div>

      </div>
      {/* End max-w-7xl container */}

      {/* Testimonials Section - Full Width */}
      <div className="bg-white" style={{ marginTop: '20px', marginBottom: '20px', paddingTop: '20px', paddingBottom: '20px', marginLeft: '-50px', marginRight: '-50px', paddingLeft: '50px', paddingRight: '50px', width: 'calc(100% + 100px)' }}>
        <section 
          className="py-24 px-6 overflow-hidden"
        >
          <div className="max-w-full mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-display-lg mb-4 text-section-heading">
                Hear from our <span className="gradient-text-teal">Real Customers</span>
              </h2>
              <p className="text-xl text-section-body">
                Used by hundreds of students across the country with offers received from top tier firms
              </p>
            </div>

            {/* Company Logos */}
            <div className="mb-16">
              <Marquee 
                gradient={true} 
                gradientColor="#ffffff" 
                gradientWidth={200} 
                speed={50} 
                direction="right"
              >
                {[
                  { src: McKinseyLogo, alt: 'McKinsey' },
                  { src: EvercoreLogo, alt: 'Evercore' },
                  { src: GoldmanSachsLogo, alt: 'Goldman Sachs' },
                  { src: BainLogo, alt: 'Bain' },
                  { src: MorganStanleyLogo, alt: 'Morgan Stanley' },
                  { src: BlackstoneLogo, alt: 'Blackstone' },
                  { src: PwCLogo, alt: 'PwC' },
                  { src: JPMorganLogo, alt: 'J.P. Morgan' },
                  { src: BarclaysLogo, alt: 'Barclays' },
                ].map(({ src, alt }) => (
                  <div key={alt} className="flex items-center mx-12">
                    <img src={src} alt={alt} className="h-12 md:h-14 w-auto opacity-60 hover:opacity-100 transition-opacity" />
                  </div>
                ))}
              </Marquee>
            </div>

            {/* Reviews */}
            <Marquee 
              gradient={true} 
              gradientColor="#ffffff" 
              gradientWidth={300} 
              speed={80} 
              pauseOnHover={true}
            >
              {[
                { name: 'Dylan Roby', role: 'Evercore, Investment Banking Analyst', img: DylanRoby, quote: "Offerloop does the work that I had spent hundreds of hours doing to land my internship… in mere minutes." },
                { name: 'Sarah Ucuzoglu', role: 'PwC, Financial Advisory Intern', img: SaraUcuzoglu, quote: "Having the ability to automate the cold reach out process allows for more time spent face to face with a professional." },
                { name: 'Jackson Leck', role: 'Blackstone, Private Equity Intern', img: JacksonLeck, quote: "I would have so many recruiting tabs open... with Offerloop I have one. Everything I need in a single place." },
                { name: 'Eli Hamou', role: 'Deloitte, Audit Intern', img: EliHamou, quote: "This platform completely transformed how I approach networking. The time I save allows me to focus on what really matters." },
                { name: 'Lucas Turcuato', role: 'Barclays, Investment Banking Analyst', img: LucasTurcuato, quote: "Game changer for recruiting season. I went from stressed to organized in minutes." },
              ].map(({ name, role, img, quote }) => {
                // All testimonials use the same blue color scheme
                const color = { light: 'rgba(59, 130, 246, 0.08)', border: 'rgba(59, 130, 246, 0.25)', class: 'testimonial-blue' };
                return (
                <div 
                  key={name} 
                  className={`glass-card rounded-[3px] p-8 mx-4 w-[420px] h-[380px] flex flex-col justify-between relative overflow-hidden ${color.class}`}
                  style={{
                    borderColor: color.border,
                  }}
                >
                  {/* Color accent overlay */}
                  {(
                    <div 
                      className="absolute inset-0 pointer-events-none rounded-[3px]"
                      style={{
                        background: `linear-gradient(135deg, ${color.light} 0%, transparent 50%)`,
                      }}
                    />
                  )}
                  <div className="relative z-10 flex flex-col h-full">
                    <div className="flex-1">
                      <img src={FiveStarReview} alt="5 star rating" className="w-24 mb-4" />
                      <p className="text-section-body italic text-lg leading-relaxed">"{quote}"</p>
                    </div>
                    <div className="flex items-center gap-4 mt-auto pt-6">
                      <img 
                        src={img} 
                        alt={name} 
                        className="w-14 h-14 rounded-full object-cover border"
                        style={{
                          borderColor: color.border,
                        }}
                      />
                      <div>
                        <div className="font-semibold text-section-heading">{name}</div>
                        <div className="text-sm text-section-body">{role}</div>
                      </div>
                    </div>
                  </div>
                </div>
                );
              })}
            </Marquee>
          </div>
        </section>
      </div>

      {/* Reopen max-w-7xl container for Scout section */}
      <div className="max-w-7xl mx-auto">
        {/* Scout - Enhanced with Video and Speech Bubble */}
        <motion.div
          variants={cardVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="max-w-5xl mx-auto"
        >
          <div className="flex flex-col md:flex-row items-center md:items-start gap-8 p-8">
            {/* Scout Video - Left side on desktop, top on mobile */}
            <div className="flex-shrink-0 w-[28rem] h-[32rem] md:w-[32rem] md:h-[36rem] relative overflow-hidden rounded-[3px]">
              <img
                src={scoutYetiHead}
                alt=""
                className="w-full h-full"
                style={{
                  objectFit: 'contain',
                  objectPosition: 'center center',
                }}
                aria-hidden="true"
              />
            </div>

            {/* Text and Speech Bubble - Right side on desktop, below on mobile */}
            <div className="flex-1 space-y-6">
              <div>
                <h4 className="text-3xl md:text-4xl font-bold mb-3">
                  <span className="text-section-heading">Meet </span>
                  <motion.span
                    className="gradient-text-teal inline-block"
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{
                      type: "spring",
                      stiffness: 200,
                      damping: 15,
                      delay: 0.3
                    }}
                  >
                    Scout
                  </motion.span>
                </h4>
                <p className="text-lg text-section-body leading-relaxed">
                  Your built-in guide when you're stuck — Scout suggests prompts and helps you decide what to type at every step.
                </p>
              </div>

              {/* Speech Bubble */}
              <div className="relative">
                {/* Speech bubble tail/pointer */}
                <div 
                  className="absolute -left-4 top-6 w-0 h-0 border-t-[12px] border-t-transparent border-r-[12px] border-b-[12px] border-b-transparent"
                  style={{
                    borderRightColor: 'rgba(255, 255, 255, 0.95)'
                  }}
                />
                
                {/* Speech bubble content */}
                <div 
                  className="relative p-5 rounded-[3px] shadow-lg"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid rgba(59, 130, 246, 0.2)',
                    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.1)'
                  }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-sm font-medium text-muted-foreground">Scout</span>
                  </div>
                  <p className="text-base text-foreground leading-relaxed">
                    Try searching for{' '}
                    <TextType
                      as="span"
                      text={[
                        '"Investment Banking Analyst at Goldman Sachs"',
                        '"Software Engineer at Google"',
                        '"Consultant at McKinsey"',
                        '"Product Manager at Apple"',
                        '"Data Scientist at Meta"',
                        '"Private Equity Analyst at Blackstone"'
                      ]}
                      typingSpeed={30}
                      deletingSpeed={20}
                      pauseDuration={2500}
                      loop={true}
                      showCursor={true}
                      cursorCharacter="|"
                      className="inline"
                      startOnVisible={true}
                    />
                    {' '}to get started.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
