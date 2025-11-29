import React from 'react';
import { Button } from '@/components/ui/button';
import { HelpCircle } from 'lucide-react';
import { useOnboardingTour } from './OnboardingTour';

interface OnboardingTourTriggerProps {
  className?: string;
}

export const OnboardingTourTrigger: React.FC<OnboardingTourTriggerProps> = ({
  className,
}) => {
  const { startTour } = useOnboardingTour();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={startTour}
      className={className}
      title="Start onboarding tour"
      aria-label="Start onboarding tour"
    >
      <HelpCircle className="h-5 w-5" />
    </Button>
  );
};

