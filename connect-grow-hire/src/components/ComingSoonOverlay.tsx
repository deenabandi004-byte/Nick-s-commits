import React from 'react';
import { Sparkles, Rocket, Star, LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ComingSoonOverlayProps {
  title: string;
  description: string;
  icon: LucideIcon;
}

/**
 * ComingSoonOverlay - Reusable "Coming Soon" placeholder component
 * Used for features that are planned but not yet implemented
 * NOW WITH CLEAN DESIGN SYSTEM (solid purple, no gradients)
 */
export const ComingSoonOverlay: React.FC<ComingSoonOverlayProps> = ({ 
  title, 
  description, 
  icon: Icon
}) => (
  <div className="absolute inset-0 z-10 flex items-center justify-center backdrop-blur-md bg-black/90 rounded-lg">
    <div className="text-center px-6 py-8 max-w-md">
      {/* Icon - Solid purple background */}
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-[hsl(var(--accent-solid))] mb-6 animate-pulse">
        <Icon className="h-10 w-10 text-white" />
      </div>
      
      {/* Badge - Solid purple */}
      <div className="mb-4">
        <Badge className="bg-[hsl(var(--accent-solid))] text-white border-none px-4 py-1 text-sm font-semibold mb-3">
          <Sparkles className="h-3 w-3 mr-1 inline" />
          Coming Soon
        </Badge>
      </div>
      
      {/* Title - Solid purple text */}
      <h3 className="text-2xl font-bold text-white mb-3">
        <span className="text-[hsl(var(--accent-solid))]">{title}</span>
      </h3>
      
      <p className="text-gray-300 mb-6 leading-relaxed">
        {description}
      </p>
      
      <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
        <Rocket className="h-4 w-4 text-[hsl(var(--accent-solid))]" />
        <span>Launching soon - stay tuned!</span>
      </div>
      
      {/* Stars - Keep yellow for visual interest */}
      <div className="mt-6 flex justify-center gap-1">
        {[...Array(5)].map((_, i) => (
          <Star key={i} className="h-4 w-4 text-yellow-400 fill-yellow-400" />
        ))}
      </div>
    </div>
  </div>
);

