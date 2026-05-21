import React, { useState, useRef, useEffect } from 'react';
import chromeExtensionWalkthrough from '@/assets/Chrome extension walkthrough.mp4';
import coverletter2 from '@/assets/coverletter2.mp4';
import hiringmanager2 from '@/assets/hiringmanager2.mp4';
import interviewprep from '@/assets/interviewprep.mp4';
import meeting2extension from '@/assets/meeting2extension.mp4';

interface Feature {
  id: number;
  text: string;
  videoSrc: string;
  color: string;
}

const features: Feature[] = [
  {
    id: 0,
    text: 'Find & Send Email',
    videoSrc: chromeExtensionWalkthrough,
    color: '#0F172A', // blue
  },
  {
    id: 1,
    text: 'Write Cover Letter',
    videoSrc: coverletter2,
    color: '#8B5CF6', // purple
  },
  {
    id: 2,
    text: 'Find & Email Hiring Manager',
    videoSrc: hiringmanager2,
    color: '#EF4444', // red
  },
  {
    id: 3,
    text: "Learn What's on Your Interview",
    videoSrc: interviewprep,
    color: '#22C55E', // green
  },
  {
    id: 4,
    text: "Prepare for Convo's",
    videoSrc: meeting2extension,
    color: '#F97316', // orange
  },
];

const ExtensionShowcase: React.FC = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const [dots, setDots] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);

  const activeFeature = features[activeIndex];

  // Typewriter animation for dots
  useEffect(() => {
    const dotSequence = ['', '.', '..', '...'];
    let index = 0;
    
    const interval = setInterval(() => {
      index = (index + 1) % dotSequence.length;
      setDots(dotSequence[index]);
    }, 400); // 400ms between each dot
    
    return () => clearInterval(interval);
  }, []);

  // Handle video end - trigger transition to next video
  const handleVideoEnd = () => {
    // Start fade out
    setIsVisible(false);
    
    // After fade out completes, switch to next and fade in
    setTimeout(() => {
      setActiveIndex((prev) => (prev + 1) % features.length);
      setIsVisible(true);
    }, 1000); // Wait for fade out to complete
  };

  // Auto-play video when activeIndex changes
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.load();
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch((e) => console.log('Autoplay prevented:', e));
      }
    }
  }, [activeIndex]);

  return (
    <section className="py-20 px-5 bg-gradient-to-b from-[#FAFBFF] to-[rgba(59,130,246,0.10)] w-full">
      <h2 className="text-center text-[70px] md:text-[84px] lg:text-[96px] font-bold mb-12 font-instrument" style={{ color: '#0F172A', lineHeight: '1.1', letterSpacing: '-0.02em' }}>
        Extension Out Now!
      </h2>
      
      <div className="flex items-center justify-center gap-16 max-w-6xl mx-auto flex-col md:flex-row">
        {/* Left Column - Feature List */}
        <div className="flex flex-col gap-4 min-w-[280px] md:items-start items-center">
          <p className="text-5xl md:text-6xl font-bold italic text-gray-800 mb-8">In 1 click{dots}</p>
          
          <div className="relative min-h-[250px] w-full">
            <p
              className="text-5xl md:text-6xl font-semibold my-2 leading-tight max-w-md"
              style={{ 
                color: activeFeature.color,
                opacity: isVisible ? 1 : 0,
                transition: 'opacity 1s ease-in-out',
                position: 'relative',
                pointerEvents: 'none',
                width: '100%',
                textAlign: 'left',
              }}
            >
              {activeFeature.text}
            </p>
          </div>
        </div>

        {/* Right Column - Video Player */}
        <div className="flex flex-col items-center gap-6">
          <div
            className="rounded-3xl overflow-hidden shadow-2xl bg-white"
            style={{ 
              border: `4px solid ${activeFeature.color}`,
            }}
          >
            <video
              ref={videoRef}
              className="block w-[650px] max-w-[90vw] h-auto"
              style={{
                opacity: isVisible ? 1 : 0,
                transition: 'opacity 1s ease-in-out',
              }}
              muted
              playsInline
              onEnded={handleVideoEnd}
            >
              <source src={activeFeature.videoSrc} type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          </div>
        </div>
      </div>

      {/* Centered Download Button - OUTSIDE the columns */}
      <div className="flex justify-center mt-10">
        <a
          href="https://chrome.google.com/webstore/detail/offerloop/your-extension-id"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-3 px-8 py-4 text-white rounded-full font-semibold text-lg transition-colors hover:opacity-90"
          style={{ backgroundColor: '#0F172A' }}
        >
          <svg
            className="w-6 h-6"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
            <circle cx="12" cy="12" r="4" fill="currentColor" />
            <path d="M12 2C6.48 2 2 6.48 2 12h10l5-8.66A9.95 9.95 0 0012 2z" fill="#EA4335" />
            <path d="M2 12c0 5.52 4.48 10 10 10l5-8.66L12 12H2z" fill="#34A853" />
            <path d="M12 22c5.52 0 10-4.48 10-10h-10l-5 8.66c1.47.86 3.18 1.34 5 1.34z" fill="#FBBC05" />
            <path d="M22 12c0-5.52-4.48-10-10-10v10h10z" fill="#4285F4" />
            <circle cx="12" cy="12" r="4" fill="white" />
          </svg>
          <span>Download</span>
        </a>
      </div>

      {/* Progress dots - centered below button */}
      <div className="flex justify-center gap-3 mt-6">
        {features.map((feature, index) => (
          <button
            key={feature.id}
            className={`w-3 h-3 rounded-full border-none cursor-pointer transition-all duration-200 hover:scale-125 ${
              index === activeIndex ? 'scale-125' : ''
            }`}
            style={{
              backgroundColor: index === activeIndex ? feature.color : '#D1D5DB',
            }}
            onClick={() => {
              setIsVisible(false);
              setTimeout(() => {
                setActiveIndex(index);
                setIsVisible(true);
              }, 1000);
            }}
            aria-label={`View ${feature.text} demo`}
          />
        ))}
      </div>
    </section>
  );
};

export default ExtensionShowcase;
