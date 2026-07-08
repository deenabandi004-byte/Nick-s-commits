import React from 'react';
import { cn } from '@/lib/utils';

interface MainContentWrapperProps {
  children: React.ReactNode;
  className?: string;
  /** Drop the gutter + rounded-card chrome so the page surface runs edge to
   *  edge against the sidebar (used by full-bleed pages like Getting
   *  Started, where the mountain backdrop should span the whole area). */
  flush?: boolean;
}

/**
 * MainContentWrapper - White elevated container that sits on the blue app background
 *
 * This component provides:
 * - White background
 * - Large rounded corners
 * - Subtle shadow for elevation
 * - Proper spacing from viewport edges
 */
export function MainContentWrapper({ children, className, flush = false }: MainContentWrapperProps) {
  return (
    <div className={cn("flex-1 flex flex-col min-h-0", !flush && "p-1.5 sm:p-3")}>
      <div
        className={cn(
          "flex-1 flex flex-col overflow-hidden min-h-0",
          !flush && "rounded-2xl shadow-sm",
          className
        )}
        style={{ background: 'var(--elev, #FFFFFF)' }}
      >
        {children}
      </div>
    </div>
  );
}
