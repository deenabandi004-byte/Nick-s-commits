import React from 'react';

interface LoadingBarProps {
  /** Loading bar type - indeterminate for unknown duration, determinate for known progress */
  variant?: 'indeterminate' | 'determinate';
  /** Progress value 0-100 (only used when variant is 'determinate') */
  progress?: number;
  /** Bar thickness */
  size?: 'sm' | 'md' | 'lg';
  /** Optional label text shown above the bar */
  label?: string;
  /** Show percentage text (only for determinate) */
  showPercentage?: boolean;
  /** Additional CSS classes */
  className?: string;
}

const sizeMap = {
  sm: 'h-0.5',   // 2px
  md: 'h-1',     // 4px  
  lg: 'h-1.5',   // 6px
};

export function LoadingBar({
  variant = 'indeterminate',
  progress = 0,
  size = 'md',
  label,
  showPercentage = false,
  className = '',
}: LoadingBarProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress));
  const heightClass = sizeMap[size];

  return (
    <div className={`w-full ${className}`}>
      {/* Label and percentage row */}
      {(label || (showPercentage && variant === 'determinate')) && (
        <div className="flex items-center justify-between mb-1.5">
          {label && (
            <span className="text-sm font-medium text-[#6B7280]">
              {label}
            </span>
          )}
          {showPercentage && variant === 'determinate' && (
            <span className="text-sm font-medium text-[#3B82F6]">
              {Math.round(clampedProgress)}%
            </span>
          )}
        </div>
      )}

      {/* Track */}
      <div
        className={`
          relative w-full overflow-hidden rounded-full
          bg-[rgba(59,130,246,0.10)] backdrop-blur-sm
          ${heightClass}
        `}
        role="progressbar"
        aria-valuenow={variant === 'determinate' ? clampedProgress : undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || 'Loading'}
      >
        {/* Progress bar */}
        {variant === 'indeterminate' ? (
          <div
            className={`
              absolute inset-0 rounded-full
              bg-gradient-to-r from-[#3B82F6] via-[#2563EB] to-[#3B82F6]
              bg-[length:200%_100%]
              animate-loading-shimmer
            `}
          />
        ) : (
          <div
            className={`
              ${heightClass} rounded-full
              bg-[#3B82F6]
              transition-all duration-300 ease-out
              shadow-[0_0_8px_rgba(59,130,246,0.4)]
            `}
            style={{ width: `${clampedProgress}%` }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Inline loading bar for buttons - sits at the bottom of the button
 */
interface InlineLoadingBarProps {
  isLoading: boolean;
  className?: string;
}

export function InlineLoadingBar({ isLoading, className = '' }: InlineLoadingBarProps) {
  if (!isLoading) return null;

  return (
    <div
      className={`
        absolute bottom-0 left-0 right-0 h-0.5 overflow-hidden
        rounded-b-[3px]
        ${className}
      `}
    >
      <div
        className="
          h-full w-full rounded-full
          bg-gradient-to-r from-[#3B82F6] via-[#2563EB] to-[#3B82F6]
          bg-[length:200%_100%]
          animate-loading-shimmer
        "
      />
    </div>
  );
}

/**
 * Page-level loading bar - fixed at top of viewport
 */
interface PageLoadingBarProps {
  isLoading: boolean;
}

export function PageLoadingBar({ isLoading }: PageLoadingBarProps) {
  if (!isLoading) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-1 overflow-hidden">
      <div
        className="
          h-full w-full
          bg-gradient-to-r from-[#3B82F6] via-[#2563EB] to-[#3B82F6]
          bg-[length:200%_100%]
          animate-loading-shimmer
        "
      />
    </div>
  );
}

/**
 * Stepped progress bar for multi-stage operations like Meeting Prep
 */
interface Step {
  id: string;
  label: string;
}

interface SteppedLoadingBarProps {
  steps: Step[];
  currentStepId: string;
  className?: string;
}

export function SteppedLoadingBar({ steps, currentStepId, className = '' }: SteppedLoadingBarProps) {
  const currentIndex = steps.findIndex((s) => s.id === currentStepId);
  // If step not found, default to first step (index 0) to avoid showing "Step 0"
  const validIndex = currentIndex >= 0 ? currentIndex : 0;
  const progress = ((validIndex + 1) / steps.length) * 100;
  const currentStep = steps[validIndex];

  return (
    <div className={`w-full ${className}`}>
      {/* Step indicator */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-[#0F172A]">
          {currentStep?.label || 'Processing...'}
        </span>
        <span className="text-xs text-[#6B7280]">
          Step {validIndex + 1} of {steps.length}
        </span>
      </div>

      {/* Progress track */}
      <div className="relative w-full h-1.5 overflow-hidden rounded-full bg-[rgba(59,130,246,0.10)] backdrop-blur-sm">
        {/* Completed portion */}
        <div
          className="
            h-full rounded-full
            bg-[#3B82F6]
            transition-all duration-500 ease-out
            shadow-[0_0_8px_rgba(59,130,246,0.4)]
          "
          style={{ width: `${progress}%` }}
        />
        {/* Shimmer overlay on active portion */}
        <div
          className="
            absolute top-0 left-0 h-full rounded-full
            bg-gradient-to-r from-transparent via-white/30 to-transparent
            bg-[length:200%_100%]
            animate-loading-shimmer
          "
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Step dots */}
      <div className="flex justify-between mt-2">
        {steps.map((step, index) => (
          <div
            key={step.id}
            className={`
              w-2 h-2 rounded-full transition-all duration-300
              ${index <= validIndex
                ? 'bg-[#3B82F6] shadow-[0_0_6px_rgba(59,130,246,0.5)]'
                : 'bg-[#E2E8F0]'
              }
            `}
            title={step.label}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Glass-style loading container that replaces full-page spinners
 */
interface LoadingContainerProps {
  label?: string;
  sublabel?: string;
  className?: string;
}

export function LoadingContainer({
  label = 'Loading...',
  sublabel,
  className = '',
}: LoadingContainerProps) {
  return (
    <div
      className={`
        flex flex-col items-center justify-center p-8
        ${className}
      `}
    >
      {/* Glass card */}
      <div
        className="
          flex flex-col items-center gap-4 px-8 py-6
          bg-white/80 backdrop-blur-xl
          border border-[#E2E8F0]/30
          rounded-[3px]
          shadow-[0_4px_24px_rgba(59,130,246,0.12),0_2px_8px_rgba(184,149,79,0.08)]
        "
      >
        {/* Loading bar */}
        <div className="w-48">
          <LoadingBar variant="indeterminate" size="md" />
        </div>

        {/* Labels */}
        <div className="text-center">
          <p className="text-sm font-medium text-[#0F172A]">{label}</p>
          {sublabel && (
            <p className="text-xs text-[#6B7280] mt-1">{sublabel}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default LoadingBar;

