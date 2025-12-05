/**
 * Home.tsx - Main Landing Page (Simplified)
 * 
 * After navigation refactoring, the main features (Professional Search,
 * Coffee Chat Prep, etc.) have been moved to dedicated pages accessible
 * from the sidebar.
 * 
 * This page now shows a "Coming Soon" message for the new dashboard.
 */

import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { ComingSoonOverlay } from '@/components/ComingSoonOverlay';
import { ThemeToggle } from '@/components/ThemeToggle';
import ScoutChatbot from '@/components/ScoutChatbot';
import { Home as HomeIcon } from 'lucide-react';

export default function Home() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        
        <div className="flex-1 flex flex-col">
          {/* Header with Sidebar Toggle */}
          <div className="bg-background border-b border-border">
            <div className="flex items-center justify-between px-4 py-4">
              <div className="flex items-center gap-4">
                <SidebarTrigger />
                <h1 className="text-xl font-semibold text-foreground">Home</h1>
              </div>
              <div className="flex items-center">
                <ThemeToggle />
              </div>
            </div>
          </div>
          
          {/* Main Content Area */}
          <main className="flex-1 p-6 relative">
            <div className="max-w-7xl mx-auto h-full">
              <div className="relative min-h-[600px] rounded-xl border border-border bg-card">
                <ComingSoonOverlay 
                  title="Dashboard Coming Soon"
                  description="We're building an amazing dashboard with quick access to all your favorite features, recent activity, and personalized insights."
                  icon={HomeIcon}
                />
                
                {/* Placeholder content (blurred in background) */}
                <div className="p-8 opacity-20 blur-sm space-y-6">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="h-32 bg-gray-700 rounded-lg"></div>
                    <div className="h-32 bg-gray-700 rounded-lg"></div>
                    <div className="h-32 bg-gray-700 rounded-lg"></div>
                  </div>
                  <div className="h-64 bg-gray-700 rounded-lg"></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="h-48 bg-gray-700 rounded-lg"></div>
                    <div className="h-48 bg-gray-700 rounded-lg"></div>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
        <ScoutChatbot onJobTitleSuggestion={() => {}} />
      </div>
    </SidebarProvider>
  );
}
