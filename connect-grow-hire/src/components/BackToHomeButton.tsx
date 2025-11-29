import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

/**
 * BackToHomeButton - Reusable component for navigating back to home
 * Used across all feature pages (Firm Search, Contact Search, Coffee Chat Prep, Interview Prep)
 */
export const BackToHomeButton: React.FC = () => {
  const navigate = useNavigate();

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => navigate('/home')}
      className="gap-2 text-foreground font-bold text-base hover:text-foreground hover:bg-accent"
    >
      <ArrowLeft className="h-5 w-5" />
      Back to Home
    </Button>
  );
};

