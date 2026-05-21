import React, { useState, useEffect, useRef } from 'react';
import FirmSearchImage from '@/assets/Firm_Search.png';
import ContactSearchImage from '@/assets/Contact_search.png';
import MeetingImage from '@/assets/Meeting.png';
import InterviewPrepImage from '@/assets/Interview_Prep.png';
import DashboardImage from '@/assets/Dashboard.png';

interface FeatureCard {
  number: number;
  header: string;
  headerEmphasis: string; // The phrase to emphasize
  bullets: string[];
  image: string;
  stepLabel: string;
}

const featureData: FeatureCard[] = [
  {
    number: 1,
    header: "Find the firms you want to recruit for",
    headerEmphasis: "firms you want",
    bullets: [
      "Input the industry, size, and any relevant keywords",
      "Get back a clean table of companies with all key details"
    ],
    image: FirmSearchImage,
    stepLabel: "Step 1 · Find target firms",
  },
  {
    number: 2,
    header: "Find & reach out to the people you need to talk to",
    headerEmphasis: "people you need",
    bullets: [
      "Input position, company, university, and location",
      "Get verified contacts with emails and personalized draft emails ready in Gmail"
    ],
    image: ContactSearchImage,
    stepLabel: "Step 2 · Find key people",
  },
  {
    number: 3,
    header: "Prepare for your meeting",
    headerEmphasis: "meeting",
    bullets: [
      "Enter the LinkedIn URL of the person you're speaking with",
      "Get a 2-page PDF with background, company insights, talking points, and smart questions"
    ],
    image: MeetingImage,
    stepLabel: "Step 3 · Prepare for meetings",
  },
  {
    number: 4,
    header: "Nail every interview",
    headerEmphasis: "every interview",
    bullets: [
      "Input the role and company you're interviewing for",
      "Receive a prep sheet with common questions, frameworks, company insights, and talking points"
    ],
    image: InterviewPrepImage,
    stepLabel: "Step 4 · Prepare for interviews",
  },
  {
    number: 5,
    header: "Your recruiting command center",
    headerEmphasis: "command center",
    bullets: [
      "View all activity: firm searches, contact searches, prep history, and progress",
      "Track outreach in the Outbox with follow-up suggestions and an integrated calendar"
    ],
    image: DashboardImage,
    stepLabel: "Step 5 · Track everything",
  },
];

const FeatureCards: React.FC = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const prevIndexRef = useRef(0);

  const handleNext = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    prevIndexRef.current = activeIndex;
    setIsTransitioning(true);
    setActiveIndex((prev) => (prev + 1) % featureData.length);
    setTimeout(() => setIsTransitioning(false), 400);
    if (!isPaused) {
      setTimeout(() => {
        if (!isPaused && !intervalRef.current) {
          intervalRef.current = setInterval(() => {
            prevIndexRef.current = activeIndex;
            setIsTransitioning(true);
            setActiveIndex((prev) => (prev + 1) % featureData.length);
            setTimeout(() => setIsTransitioning(false), 400);
          }, 4000);
        }
      }, 100);
    }
  };

  const handlePrev = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    prevIndexRef.current = activeIndex;
    setIsTransitioning(true);
    setActiveIndex((prev) => (prev - 1 + featureData.length) % featureData.length);
    setTimeout(() => setIsTransitioning(false), 400);
    if (!isPaused) {
      setTimeout(() => {
        if (!isPaused && !intervalRef.current) {
          intervalRef.current = setInterval(() => {
            prevIndexRef.current = activeIndex;
            setIsTransitioning(true);
            setActiveIndex((prev) => (prev + 1) % featureData.length);
            setTimeout(() => setIsTransitioning(false), 400);
          }, 4000);
        }
      }, 100);
    }
  };

  // Auto-play effect
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!isPaused) {
      intervalRef.current = setInterval(() => {
        prevIndexRef.current = activeIndex;
        setIsTransitioning(true);
        setActiveIndex((prev) => (prev + 1) % featureData.length);
        setTimeout(() => setIsTransitioning(false), 400);
      }, 4000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPaused]);
  

  return (
    <div className="w-full max-w-[1150px] mx-auto px-5 pt-4 pb-12 -mt-40">
      <div 
        className="relative w-full"
        style={{ height: '540px' }}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        {featureData.map((card, index) => {
          const offset = (index - activeIndex + featureData.length) % featureData.length;
          const isActive = offset === 0;
          
          // Base position for stacked cards
          const translateX = offset * 12;
          const translateY = offset * 12;
          const opacity = offset > 3 ? 0 : 1 - offset * 0.15;
          
          return (
            <div
              key={`card-${index}`}
              className="glass-card rounded-[3px] overflow-hidden"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                transform: `translateX(${translateX}px) translateY(${translateY}px) scale(${1 - offset * 0.02})`,
                zIndex: featureData.length - offset,
                opacity: opacity,
                pointerEvents: isActive ? 'auto' : 'none',
                transition: isTransitioning && isActive ? 'opacity 0.4s ease-out, transform 0.4s ease-out' : 'none',
              }}
            >
              <div className="flex items-center h-full px-12 py-12">
                <div className="flex-1 min-w-0" style={{ marginTop: '-40px' }}>
                  {/* Step Label */}
                  <div 
                    className="mb-3 inline-block px-3 py-1 rounded-full text-xs font-medium text-slate-500 bg-slate-100"
                    style={{
                      opacity: isActive ? 1 : 0,
                      transform: isActive ? 'translateY(0)' : 'translateY(-10px)',
                      transition: isActive ? 'opacity 0.5s ease-out 0.1s, transform 0.5s ease-out 0.1s' : 'none',
                    }}
                  >
                    {card.stepLabel}
                  </div>
                  
                  {/* Header with emphasis */}
                  <h3 
                    className="text-[28px] font-semibold text-section-heading mb-6"
                    style={{
                      opacity: isActive ? 1 : 0,
                      transform: isActive ? 'translateY(0)' : 'translateY(10px)',
                      transition: isActive ? 'opacity 0.5s ease-out 0.2s, transform 0.5s ease-out 0.2s' : 'none',
                    }}
                  >
                    {card.header.split(card.headerEmphasis).map((part, i, arr) => (
                      <React.Fragment key={i}>
                        {part}
                        {i < arr.length - 1 && (
                          <span className="font-bold text-[#3B82F6]">
                            {card.headerEmphasis}
                          </span>
                        )}
                      </React.Fragment>
                    ))}
                  </h3>
                  
                  {/* Bullets with staggered animation */}
                  <ul className="list-disc pl-5 m-0">
                    {card.bullets.map((bullet, i) => (
                      <li 
                        key={i} 
                        className="text-base text-section-body mb-2 leading-relaxed"
                        style={{
                          opacity: isActive ? 1 : 0,
                          transform: isActive ? 'translateY(0)' : 'translateY(15px)',
                          transition: isActive 
                            ? `opacity 0.5s ease-out ${0.3 + i * 0.1}s, transform 0.5s ease-out ${0.3 + i * 0.1}s` 
                            : 'none',
                        }}
                      >
                        {bullet}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Screenshot with shadow, glow, and layering */}
                <div className="flex-shrink-0 ml-16 relative" style={{ width: '600px', height: '360px' }}>
                  {card.image ? (
                    <div className="w-full h-full relative">
                      {/* Background layer for depth effect */}
                      <div 
                        className="absolute inset-0 rounded-[3px] bg-slate-200"
                        style={{
                          transform: 'translate(3px, 3px)',
                          opacity: 0.3,
                          zIndex: 0,
                          filter: 'blur(2px)',
                        }}
                      />
                      {/* Main screenshot container with shadow/glow */}
                      <div 
                        className="w-full h-full rounded-[3px] overflow-hidden bg-slate-100 flex items-center justify-center relative z-10"
                        style={{
                          boxShadow: '0 8px 32px rgba(59, 130, 246, 0.15), 0 4px 16px rgba(0, 0, 0, 0.1)',
                        }}
                      >
                        <img 
                          src={card.image} 
                          alt={card.header} 
                          className="max-w-full max-h-full object-contain rounded-[3px]"
                          style={{
                            opacity: isActive ? 1 : 0,
                            transform: isActive ? 'scale(1)' : 'scale(0.95)',
                            transition: isActive ? 'opacity 0.6s ease-out 0.4s, transform 0.6s ease-out 0.4s' : 'none',
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-full bg-slate-100 rounded-[3px] flex items-center justify-center">
                      <span className="text-slate-400 text-sm font-medium">
                        Screenshot {card.number}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Navigation - Outside and below the cards */}
      <div className="flex items-center justify-center gap-3 mt-12">
        <button 
          onClick={handlePrev}
          className="w-10 h-10 rounded-full border border-slate-200 bg-white cursor-pointer flex items-center justify-center text-slate-700 hover:bg-slate-50 transition-all"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span className="text-sm text-slate-600 font-medium">
          {activeIndex + 1} / {featureData.length}
        </span>
        <button 
          onClick={handleNext}
          className="w-10 h-10 rounded-full border border-slate-200 bg-white cursor-pointer flex items-center justify-center text-slate-700 hover:bg-slate-50 transition-all"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default FeatureCards;
