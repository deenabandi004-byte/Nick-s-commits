import React, { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useOutsideClick } from "@/hooks/use-outside-click";
import lockImg from "@/assets/lock.png";

export function ExpandablePrivacyLock() {
  const [active, setActive] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const lockRef = useRef<HTMLDivElement>(null);
  const id = useId();

  // Check if URL hash is #privacy-lock and open popup
  useEffect(() => {
    const checkHash = () => {
      if (window.location.hash === '#privacy-lock') {
        // Small delay to ensure smooth scroll happens first
        setTimeout(() => {
          setActive(true);
        }, 300);
      }
    };

    // Check on mount
    checkHash();

    // Listen for hash changes
    window.addEventListener('hashchange', checkHash);
    return () => window.removeEventListener('hashchange', checkHash);
  }, []);

  // Scroll to lock when hash is present
  useEffect(() => {
    if (window.location.hash === '#privacy-lock' && lockRef.current) {
      lockRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActive(false);
        // Remove hash when closing
        if (window.location.hash === '#privacy-lock') {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
      }
    }

    if (active) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active]);

  useOutsideClick(ref, () => setActive(false));

  return (
    <>
      {/* Backdrop */}
      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm h-full w-full z-[90]"
          />
        )}
      </AnimatePresence>

      {/* Expanded Card */}
      <AnimatePresence>
        {active ? (
          <div className="fixed inset-0 grid place-items-center z-[100] p-4">
            <motion.button
              key={`button-close-${id}`}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.05 } }}
              className="flex absolute top-4 right-4 items-center justify-center bg-white/10 backdrop-blur-md rounded-full h-10 w-10 hover:bg-white/20 transition-colors z-[110]"
              onClick={() => {
                setActive(false);
                // Remove hash when closing
                if (window.location.hash === '#privacy-lock') {
                  window.history.replaceState(null, '', window.location.pathname + window.location.search);
                }
              }}
            >
              <CloseIcon />
            </motion.button>
            <motion.div
              layoutId={`privacy-card-${id}`}
              ref={ref}
              className="w-full max-w-2xl h-fit max-h-[90vh] flex flex-col glass-card rounded-3xl overflow-hidden p-8 md:p-12"
            >
              <motion.div 
                layoutId={`privacy-icon-${id}`}
                className="mx-auto mb-6"
              >
                <div className="w-32 h-32 glass-card-light rounded-2xl flex items-center justify-center">
                  <img
                    src={lockImg}
                    alt="Privacy Lock"
                    className="w-20 h-20 object-contain"
                  />
                </div>
              </motion.div>

              <div className="overflow-auto [scrollbar-width:none] [-ms-overflow-style:none] [-webkit-overflow-scrolling:touch]">
                <motion.h2
                  layoutId={`privacy-title-${id}`}
                  className="text-4xl font-bold mb-6 gradient-text-blue text-center"
                >
                  Your Privacy, Our Priority
                </motion.h2>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: { delay: 0.1 } }}
                  exit={{ opacity: 0 }}
                  className="text-gray-300 leading-relaxed space-y-4 text-lg"
                >
                  <p>
                    At Offerloop.ai, your data is yours - always. We never sell or share your information.
                  </p>
                  <p>
                    Authentication is handled securely through Google sign-in, and all data is encrypted
                    in transit and at rest.
                  </p>
                  <p>
                    You can export or delete your information at any time, giving you complete control
                    and peace of mind.
                  </p>
                  <div className="mt-8 p-6 bg-[#3B82F6]/10 border border-[#3B82F6]/30 rounded-[3px]">
                    <h3 className="text-xl font-semibold text-[#3B82F6] mb-3">Our Commitments:</h3>
                    <ul className="space-y-2 text-gray-300">
                      <li className="flex items-start gap-2">
                        <span className="text-[#3B82F6] mt-1">✓</span>
                        <span>End-to-end encryption for all your data</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[#3B82F6] mt-1">✓</span>
                        <span>No third-party data sharing or selling</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[#3B82F6] mt-1">✓</span>
                        <span>Full data export and deletion capabilities</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[#3B82F6] mt-1">✓</span>
                        <span>Secure Google OAuth authentication</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[#3B82F6] mt-1">✓</span>
                        <span>GDPR and CCPA compliant</span>
                      </li>
                    </ul>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      {/* Fixed Floating Lock Icon (Bottom Left) */}
      <div className="fixed bottom-6 left-6 z-50">
        <motion.div
          ref={lockRef}
          layoutId={`privacy-card-${id}`}
          onClick={() => setActive(true)}
          className="inline-flex items-center gap-3 cursor-pointer group"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ 
            scale: 1, 
            opacity: 1,
            transition: { type: "spring", stiffness: 260, damping: 20, delay: 0.5 }
          }}
        >
          <motion.div
            className="relative"
            animate={{
              rotate: [0, -6, 6, -6, 6, 0],
              transition: {
                repeat: Infinity,
                repeatDelay: 10,
                duration: 0.8,
                ease: "easeInOut"
              }
            }}
          >
            <motion.div
              layoutId={`privacy-icon-${id}`}
              className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg"
              whileHover={{ 
                boxShadow: "0 8px 30px rgba(0, 0, 0, 0.15)",
                scale: 1.06
              }}
            >
              <img
                src={lockImg}
                alt="Privacy Lock"
                className="w-10 h-10 object-contain"
              />
            </motion.div>
            
            {/* Pulsing ring effect */}
            <motion.div
              className="absolute inset-0 rounded-2xl border border-[#3B82F6]/30"
              animate={{
                scale: [1, 1.12, 1],
                opacity: [0.35, 0, 0.35],
              }}
              transition={{
                repeat: Infinity,
                duration: 3,
                ease: "easeInOut"
              }}
            />
          </motion.div>
          
          {/* Tooltip */}
          <motion.div
            className="absolute bottom-full left-0 mb-2 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
            initial={{ y: 10, opacity: 0 }}
            whileHover={{ y: 0, opacity: 1 }}
          >
            <div className="bg-white px-3 py-2 rounded-lg text-sm text-slate-700 shadow-lg">
              Your data is secure
            </div>
          </motion.div>
        </motion.div>
      </div>
    </>
  );
}

const CloseIcon = () => {
  return (
    <motion.svg
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.05 } }}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6 text-white"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M18 6l-12 12" />
      <path d="M6 6l12 12" />
    </motion.svg>
  );
};


