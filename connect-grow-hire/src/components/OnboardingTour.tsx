import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { TOUR_STEPS, TourStep } from '@/config/onboardingTour';
import { useFirebaseAuth } from '@/contexts/FirebaseAuthContext';
import { cn } from '@/lib/utils';

interface OnboardingTourProps {
  autoStart?: boolean;
  onComplete?: () => void;
  onSkip?: () => void;
}

export const OnboardingTour: React.FC<OnboardingTourProps> = ({
  autoStart = false,
  onComplete,
  onSkip,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number; side: 'top' | 'bottom' | 'left' | 'right' } | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, markTourComplete } = useFirebaseAuth();

  // Filter steps based on current route and conditions
  const getAvailableSteps = useCallback((): TourStep[] => {
    return TOUR_STEPS
      .filter(step => {
        // Filter by route if specified
        if (step.route && step.route !== location.pathname) {
          return false;
        }
        // Filter by conditional if specified
        if (step.conditional && !step.conditional()) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.order - b.order);
  }, [location.pathname]);

  const [availableSteps, setAvailableSteps] = useState<TourStep[]>(getAvailableSteps);

  useEffect(() => {
    setAvailableSteps(getAvailableSteps());
  }, [getAvailableSteps]);

  // Auto-start tour if needed
  useEffect(() => {
    if (autoStart && user && !user.hasSeenOnboardingTour && availableSteps.length > 0) {
      // Small delay to ensure page is rendered
      const timer = setTimeout(() => {
        setIsOpen(true);
        setCurrentStepIndex(0);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [autoStart, user, availableSteps.length]);

  // Update tooltip position when step changes
  useEffect(() => {
    if (!isOpen || availableSteps.length === 0) return;

    const currentStep = availableSteps[currentStepIndex];
    if (!currentStep) return;

    let retryTimer: NodeJS.Timeout | null = null;
    const currentIndex = currentStepIndex; // Capture for closures
    
    const updatePosition = () => {
      const anchor = getAnchorElement(currentStep.anchorSelector);
      if (!anchor) {
        // If anchor not found, try again after a short delay (element might still be loading)
        retryTimer = setTimeout(() => {
          const retryAnchor = getAnchorElement(currentStep.anchorSelector);
          if (retryAnchor) {
            updatePosition();
          } else {
            // If still not found after retry, skip to next step or hide tooltip
            console.warn(`Tour anchor not found: ${currentStep.anchorSelector}`);
            setTooltipPosition(null);
            // Auto-advance to next step if available
            if (currentIndex < availableSteps.length - 1) {
              setTimeout(() => {
                setCurrentStepIndex(currentIndex + 1);
              }, 1000);
            }
          }
        }, 500);
        return;
      }

      const rect = anchor.getBoundingClientRect();
      const placement = currentStep.placement || 'bottom';
      const offset = 12;

      let top = 0;
      let left = 0;
      let side: 'top' | 'bottom' | 'left' | 'right' = placement;

      switch (placement) {
        case 'bottom':
          top = rect.bottom + offset;
          left = rect.left + rect.width / 2;
          break;
        case 'top':
          top = rect.top - offset;
          left = rect.left + rect.width / 2;
          break;
        case 'right':
          top = rect.top + rect.height / 2;
          left = rect.right + offset;
          break;
        case 'left':
          top = rect.top + rect.height / 2;
          left = rect.left - offset;
          break;
      }

      // Adjust if tooltip would overflow viewport
      // Use estimated tooltip size if ref not available yet
      const estimatedTooltipWidth = 320; // w-80 = 320px
      const estimatedTooltipHeight = 200; // rough estimate
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Check horizontal overflow
      if (left + estimatedTooltipWidth / 2 > viewportWidth) {
        left = viewportWidth - estimatedTooltipWidth / 2 - 16;
      } else if (left - estimatedTooltipWidth / 2 < 0) {
        left = estimatedTooltipWidth / 2 + 16;
      }

      // Check vertical overflow
      if (top + estimatedTooltipHeight > viewportHeight) {
        top = rect.top - estimatedTooltipHeight - offset;
        side = 'top';
      } else if (top < 0) {
        top = rect.bottom + offset;
        side = 'bottom';
      }

      // Fine-tune with actual tooltip rect if available
      if (tooltipRef.current) {
        const tooltipRect = tooltipRef.current.getBoundingClientRect();
        if (left + tooltipRect.width / 2 > viewportWidth) {
          left = viewportWidth - tooltipRect.width / 2 - 16;
        } else if (left - tooltipRect.width / 2 < 0) {
          left = tooltipRect.width / 2 + 16;
        }
        if (top + tooltipRect.height > viewportHeight) {
          top = rect.top - tooltipRect.height - offset;
          side = 'top';
        } else if (top < 0) {
          top = rect.bottom + offset;
          side = 'bottom';
        }
      }

      setTooltipPosition({ top, left, side });
    };

    // Initial position - delay slightly to ensure DOM is ready
    const initTimer = setTimeout(() => {
      updatePosition();
    }, 100);

    // Update on resize
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      clearTimeout(initTimer);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, [isOpen, currentStepIndex, availableSteps]);

  const getAnchorElement = (selector: string | (() => HTMLElement | null)): HTMLElement | null => {
    if (typeof selector === 'function') {
      return selector();
    }
    try {
      return document.querySelector(selector);
    } catch {
      return null;
    }
  };

  const highlightAnchor = (selector: string | (() => HTMLElement | null)) => {
    const anchor = getAnchorElement(selector);
    if (anchor) {
      anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Add temporary highlight class
      anchor.classList.add('tour-highlight');
      setTimeout(() => anchor.classList.remove('tour-highlight'), 300);
    }
  };

  const handleBack = useCallback(() => {
    if (currentStepIndex > 0) {
      const prevStep = availableSteps[currentStepIndex - 1];
      if (!prevStep) return;
      
      const prevIndex = currentStepIndex - 1;
      
      // Navigate if needed
      if (prevStep.route && prevStep.route !== location.pathname) {
        navigate(prevStep.route);
        setTimeout(() => {
          setCurrentStepIndex(prevIndex);
          setTimeout(() => {
            if (availableSteps[prevIndex]) {
              highlightAnchor(availableSteps[prevIndex].anchorSelector);
            }
          }, 100);
        }, 300);
      } else {
        setCurrentStepIndex(prevIndex);
        setTimeout(() => {
          highlightAnchor(prevStep.anchorSelector);
        }, 100);
      }
    }
  }, [currentStepIndex, availableSteps, location.pathname, navigate]);

  const handleComplete = useCallback(async () => {
    setIsOpen(false);
    if (user && markTourComplete) {
      await markTourComplete();
    }
    // Also save to localStorage as fallback
    localStorage.setItem('onboardingTourSeen', 'true');
    
    // Navigate back to home page after tour completion
    if (location.pathname !== '/home') {
      navigate('/home');
    }
    
    onComplete?.();
  }, [user, markTourComplete, onComplete, location.pathname, navigate]);

  const handleSkip = useCallback(() => {
    setIsOpen(false);
    if (user && markTourComplete) {
      markTourComplete();
    }
    localStorage.setItem('onboardingTourSeen', 'true');
    onSkip?.();
  }, [user, markTourComplete, onSkip]);

  // handleNext needs to reference handleComplete, so we define it after
  const handleNext = useCallback(() => {
    if (currentStepIndex < availableSteps.length - 1) {
      const nextStep = availableSteps[currentStepIndex + 1];
      const nextIndex = currentStepIndex + 1;
      
      // Navigate if needed
      if (nextStep.route && nextStep.route !== location.pathname) {
        navigate(nextStep.route);
        // Wait for navigation then move to next step
        setTimeout(() => {
          setCurrentStepIndex(nextIndex);
          setTimeout(() => {
            highlightAnchor(nextStep.anchorSelector);
          }, 100);
        }, 300);
      } else {
        setCurrentStepIndex(nextIndex);
        setTimeout(() => {
          highlightAnchor(nextStep.anchorSelector);
        }, 100);
      }
    } else {
      handleComplete();
    }
  }, [currentStepIndex, availableSteps, location.pathname, navigate, handleComplete]);

  const startTour = () => {
    setCurrentStepIndex(0);
    setIsOpen(true);
    if (availableSteps.length > 0) {
      highlightAnchor(availableSteps[0].anchorSelector);
    }
  };

  // Expose startTour function globally for help button
  useEffect(() => {
    const startTourFn = () => {
      setCurrentStepIndex(0);
      setIsOpen(true);
      // Highlight first anchor after a short delay to ensure DOM is ready
      setTimeout(() => {
        if (availableSteps.length > 0) {
          highlightAnchor(availableSteps[0].anchorSelector);
        }
      }, 100);
    };
    
    (window as any).startOnboardingTour = startTourFn;
    return () => {
      delete (window as any).startOnboardingTour;
    };
  }, [availableSteps]);

  if (!isOpen || availableSteps.length === 0) return null;

  const currentStep = availableSteps[currentStepIndex];
  if (!currentStep) return null;

  const progress = ((currentStepIndex + 1) / availableSteps.length) * 100;
  const progressDots = availableSteps.length;

  return (
    <>
      {/* Overlay Backdrop */}
      <div
        ref={overlayRef}
        className="fixed inset-0 bg-black/50 z-40 animate-in fade-in-0"
        onClick={(e) => {
          // Don't close on overlay click - require explicit skip/close
          e.stopPropagation();
        }}
      />

      {/* Tooltip */}
      {tooltipPosition && (
        <div
          ref={tooltipRef}
          className="fixed z-50 w-80 rounded-lg border bg-background p-6 shadow-lg animate-in fade-in-0 zoom-in-95"
          style={{
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
            transform: 'translate(-50%, 0)',
          }}
        >
          {/* Close Button */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2 h-6 w-6"
            onClick={handleSkip}
          >
            <X className="h-4 w-4" />
          </Button>

          {/* Title */}
          <h3 className="text-lg font-semibold mb-2 pr-6">{currentStep.title}</h3>

          {/* Body */}
          <p className="text-sm text-muted-foreground mb-4">{currentStep.body}</p>

          {/* Progress Dots */}
          <div className="flex items-center justify-center gap-1.5 mb-4">
            {Array.from({ length: progressDots }).map((_, index) => (
              <div
                key={index}
                className={cn(
                  'h-2 w-2 rounded-full transition-colors',
                  index === currentStepIndex
                    ? 'bg-primary'
                    : index < currentStepIndex
                    ? 'bg-primary/50'
                    : 'bg-muted'
                )}
              />
            ))}
          </div>

          {/* Navigation Buttons */}
          <div className="flex items-center justify-between gap-2">
            <div>
              {currentStepIndex > 0 && (
                <Button variant="outline" size="sm" onClick={handleBack}>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {currentStep.optional && (
                <Button variant="ghost" size="sm" onClick={handleSkip}>
                  Skip
                </Button>
              )}
              <Button size="sm" onClick={handleNext}>
                {currentStepIndex === availableSteps.length - 1 ? 'Finish' : 'Next'}
                {currentStepIndex < availableSteps.length - 1 && (
                  <ChevronRight className="h-4 w-4 ml-1" />
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Highlight style */}
      <style>{`
        .tour-highlight {
          outline: 2px solid hsl(var(--primary));
          outline-offset: 2px;
          transition: outline 0.3s ease;
        }
      `}</style>
    </>
  );
};

// Export a hook to programmatically start the tour
export const useOnboardingTour = () => {
  const startTour = useCallback(() => {
    if ((window as any).startOnboardingTour) {
      (window as any).startOnboardingTour();
    }
  }, []);

  return { startTour };
};

