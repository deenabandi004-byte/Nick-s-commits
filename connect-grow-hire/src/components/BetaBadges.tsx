import React from 'react';
import { FlaskConical, Zap } from 'lucide-react';

// Reusable Beta Badge Component
type BadgeSize = 'xs' | 'sm' | 'md' | 'lg';
type BadgeVariant = 'gradient' | 'outline' | 'subtle' | 'glow';

interface BetaBadgeProps {
  size?: BadgeSize;
  variant?: BadgeVariant;
}

export const BetaBadge: React.FC<BetaBadgeProps> = ({ size = 'sm', variant = 'gradient' }) => {
  const sizes: Record<BadgeSize, string> = {
    xs: 'text-[10px] px-1.5 py-0.5',
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-3 py-1.5',
    lg: 'text-base px-4 py-2'
  };

  const variants: Record<BadgeVariant, string> = {
    gradient: 'bg-gradient-to-r from-[#3B82F6] to-[#2563EB] text-white',
    outline: 'bg-transparent border-2 border-[#3B82F6] text-[#3B82F6]',
    subtle: 'bg-[#3B82F6]/20 text-[#3B82F6] border border-[#3B82F6]/30',
    glow: 'bg-gradient-to-r from-[#3B82F6] to-[#2563EB] text-white shadow-lg shadow-[#3B82F6]/50'
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded-md font-semibold ${sizes[size]} ${variants[variant]}`}>
      <FlaskConical className="h-3 w-3" />
      BETA
    </span>
  );
};

// Corner Beta Ribbon
export const BetaRibbon = () => {
  return (
    <div className="fixed top-0 right-0 z-50 overflow-hidden pointer-events-none">
      <div className="relative">
        <div className="absolute top-0 right-0 w-32 h-32">
          <div className="absolute transform rotate-45 bg-gradient-to-r from-[#3B82F6] to-[#2563EB] text-white text-center font-bold py-1 right-[-35px] top-[32px] w-[170px] shadow-lg">
            <FlaskConical className="inline h-3 w-3 mr-1" />
            BETA
          </div>
        </div>
      </div>
    </div>
  );
};

// Floating Beta Pill (subtle, bottom corner)
export const BetaFloatingPill = () => {
  return (
    <div className="fixed bottom-4 left-4 z-40 pointer-events-none">
      <div className="bg-gray-900/90 backdrop-blur-sm border border-[#3B82F6] rounded-full px-4 py-2 flex items-center gap-2 shadow-xl shadow-[#3B82F6]/20">
        <div className="relative">
          <div className="absolute inset-0 bg-[#3B82F6] rounded-full blur-sm opacity-50 animate-pulse"></div>
          <FlaskConical className="relative h-4 w-4 text-[#3B82F6]" />
        </div>
        <span className="text-sm font-semibold text-[#3B82F6]">BETA</span>
      </div>
    </div>
  );
};

// Demo Preview
export default function BetaComponentsDemo() {
  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto space-y-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Beta Badge Components</h1>
          <p className="text-gray-400">Copy these components to your project</p>
        </div>

        {/* Implementation Instructions */}
        <div className="bg-gradient-to-r from-[#3B82F6]/10 to-[#2563EB]/10 border border-[#3B82F6]/30 rounded-[3px] p-8">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <FlaskConical className="h-6 w-6 text-[#3B82F6]" />
            Implementation Guide
          </h2>
          
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-[#3B82F6] mb-3">Step 1: Create the components file</h3>
              <div className="bg-gray-800/50 rounded-lg p-4 font-mono text-sm text-gray-300">
                <p>Create: <span className="text-[#3B82F6]">src/components/BetaBadges.tsx</span></p>
                <p className="mt-2 text-gray-400">Copy all the component code above into this file</p>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-purple-300 mb-3">Step 2: For Home.tsx</h3>
              <div className="bg-gray-800/50 rounded-lg p-4 space-y-3">
                <p className="text-sm text-gray-300"><strong className="text-purple-400">Line 1:</strong> Add import:</p>
                <code className="block bg-gray-900 p-2 rounded text-xs text-green-400">
                  import &#123; BetaBadge, BetaBanner &#125; from "@/components/BetaBadges";
                </code>
                
                <p className="text-sm text-gray-300 mt-4"><strong className="text-purple-400">After line 206:</strong> Add banner before main div:</p>
                <code className="block bg-gray-900 p-2 rounded text-xs text-green-400">
                  &lt;BetaBanner /&gt;
                </code>

                <p className="text-sm text-gray-300 mt-4"><strong className="text-purple-400">Line 217:</strong> Update header title:</p>
                <code className="block bg-gray-900 p-2 rounded text-xs text-green-400">
                  &lt;h1 className="text-xl font-semibold flex items-center gap-2"&gt;<br/>
                  &nbsp;&nbsp;AI-Powered Candidate Search<br/>
                  &nbsp;&nbsp;&lt;BetaBadge size="xs" variant="subtle" /&gt;<br/>
                  &lt;/h1&gt;
                </code>

                <p className="text-sm text-gray-300 mt-4"><strong className="text-purple-400">Line 394:</strong> Add to Meeting title:</p>
                <code className="block bg-gray-900 p-2 rounded text-xs text-green-400">
                  &lt;CardTitle className="..."&gt;<br/>
                  &nbsp;&nbsp;Meeting Prep<br/>
                  &nbsp;&nbsp;&lt;BetaBadge size="xs" variant="glow" /&gt;<br/>
                  &lt;/CardTitle&gt;
                </code>

                <p className="text-sm text-gray-300 mt-4"><strong className="text-purple-400">Line 433:</strong> Add to Interview Prep title:</p>
                <code className="block bg-gray-900 p-2 rounded text-xs text-green-400">
                  &lt;CardTitle className="..."&gt;<br/>
                  &nbsp;&nbsp;Interview Prep<br/>
                  &nbsp;&nbsp;&lt;BetaBadge size="xs" variant="glow" /&gt;<br/>
                  &lt;/CardTitle&gt;
                </code>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-green-300 mb-3">Step 3: For Index.tsx (Landing Page)</h3>
              <div className="bg-gray-800/50 rounded-lg p-4 space-y-3">
                <p className="text-sm text-gray-300"><strong className="text-green-400">Line 1:</strong> Add import:</p>
                <code className="block bg-gray-900 p-2 rounded text-xs text-green-400">
                  import &#123; BetaBanner &#125; from "@/components/BetaBadges";
                </code>

                <p className="text-sm text-gray-300 mt-4"><strong className="text-green-400">After line 51:</strong> Add banner after header:</p>
                <code className="block bg-gray-900 p-2 rounded text-xs text-green-400">
                  &lt;/header&gt;<br/>
                  &lt;BetaBanner /&gt;
                </code>

                <p className="text-sm text-gray-400 mt-4">Note: Your BETA badge in the header logo is perfect - keep it!</p>
              </div>
            </div>
          </div>
        </div>

        {/* Visual Examples */}
        <div className="space-y-8">
          <h2 className="text-2xl font-semibold">Visual Preview</h2>
          
          <div>
            <p className="text-sm text-gray-400 mb-2">Top Banner</p>
           
          </div>

          <div className="bg-gray-800/50 rounded-[3px] p-6">
            <p className="text-sm text-gray-400 mb-4">Header with Badge</p>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              AI-Powered Candidate Search
              <BetaBadge size="xs" variant="subtle" />
            </h1>
          </div>

          <div className="bg-gray-800/50 border border-gray-700 rounded-[3px] p-6">
            <p className="text-sm text-gray-400 mb-4">Card Title with Badge</p>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold">Meeting Prep</h3>
              <BetaBadge size="xs" variant="glow" />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center space-y-2">
              <p className="text-xs text-gray-400">Gradient</p>
              <BetaBadge variant="gradient" size="sm" />
            </div>
            <div className="text-center space-y-2">
              <p className="text-xs text-gray-400">Outline</p>
              <BetaBadge variant="outline" size="sm" />
            </div>
            <div className="text-center space-y-2">
              <p className="text-xs text-gray-400">Subtle</p>
              <BetaBadge variant="subtle" size="sm" />
            </div>
            <div className="text-center space-y-2">
              <p className="text-xs text-gray-400">Glow</p>
              <BetaBadge variant="glow" size="sm" />
            </div>
          </div>
        </div>

        {/* Quick Copy Component Code */}
        <div className="bg-[#3B82F6]/10 border border-[#3B82F6]/30 rounded-[3px] p-6">
          <h3 className="text-xl font-bold text-[#3B82F6] mb-3 flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Quick Tips
          </h3>
          <ul className="space-y-2 text-gray-300 text-sm">
            <li className="flex items-start gap-2">
              <span className="text-[#3B82F6] mt-1">→</span>
              <span>Use <strong>BetaBanner</strong> at the top of every page for consistency</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#3B82F6] mt-1">→</span>
              <span>Add <strong>subtle</strong> variant badges to main headers</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#3B82F6] mt-1">→</span>
              <span>Use <strong>glow</strong> variant for beta features (Meeting, Interview Prep)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#3B82F6] mt-1">→</span>
              <span>Keep badges small (xs/sm) to avoid overwhelming the UI</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}