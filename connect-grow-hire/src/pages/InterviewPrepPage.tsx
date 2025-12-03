/**
 * InterviewPrepPage.tsx - Interview Preparation Page (WITH TABS)
 * 
 * Tab 1: Interview Prep - Coming soon
 * Tab 2: Interview Library - Coming soon
 */

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Library, Lock, Zap } from 'lucide-react';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { BackToHomeButton } from '@/components/BackToHomeButton';
import { ThemeToggle } from '@/components/ThemeToggle';
import ScoutChatbot from '@/components/ScoutChatbot';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ComingSoonOverlay } from '@/components/ComingSoonOverlay';
import { Card } from '@/components/ui/card';
import { useFirebaseAuth } from '../contexts/FirebaseAuthContext';

export default function InterviewPrepPage() {
  const [activeTab, setActiveTab] = useState('prep');
  const navigate = useNavigate();
  const { user } = useFirebaseAuth();
  
  // Check if user is on free tier
  const isFreeTier = useMemo(() => {
    if (!user) return true; // Default to free if no user
    if (user.tier === 'pro') return false;
    // Also check maxCredits to determine tier
    const maxCredits = Number(user.maxCredits ?? 0);
    if (maxCredits >= 1800) return false; // Pro tier
    return true; // Free tier
  }, [user]);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background relative">
        <AppSidebar />
        
        <div className="flex-1 flex flex-col relative">
          {/* Pro Members Only Overlay for Free Tier */}
          {isFreeTier && (
            <div 
              className="absolute inset-0 backdrop-blur-sm z-[100] flex items-start justify-center pointer-events-auto pt-32"
              style={{
                background: 'linear-gradient(135deg, rgba(75, 85, 99, 0.75), rgba(100, 100, 100, 0.75), rgba(55, 65, 81, 0.75), rgba(80, 80, 80, 0.75))'
              }}
            >
              <div className="text-center space-y-6">
                <div className="w-16 h-16 mx-auto bg-gray-800/80 rounded-full flex items-center justify-center border-2 border-gray-700/80 backdrop-blur-sm">
                  <Lock className="w-8 h-8 text-white" />
                </div>
                <p className="text-white text-7xl font-semibold drop-shadow-lg">Unlock with <span className="bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent">Pro</span></p>
                <button
                  onClick={() => navigate("/pricing")}
                  className="bg-gradient-to-r from-[hsl(var(--accent-from))] to-[hsl(var(--accent-to))] rounded-xl py-3 px-4 text-white hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 active:scale-[0.98]"
                >
                  <div className="flex items-center justify-center gap-2">
                    <Zap className="w-5 h-5 text-white" />
                    <span className="font-semibold">Upgrade Plan</span>
                  </div>
                </button>
                <p className="text-white text-base max-w-2xl mx-auto mt-8 leading-relaxed drop-shadow-md">
                  Interview Prep is the most advanced preparation tool of its kind, predicting the questions you're most likely to face with remarkable accuracy. You'll walk in knowing what to expect, from behavioral prompts to role-specific scenarios. The technical preparation is still on you, but with Interview Prep handling the research and question forecasting, <span className="font-bold">you'll have a serious edge going into any interview.</span>
                </p>
              </div>
            </div>
          )}
          
          {/* Blur and disable content behind overlay */}
          {isFreeTier && (
            <div className="absolute inset-0 pointer-events-none z-40">
              <div className="w-full h-full opacity-50 pointer-events-none" style={{ filter: 'blur(2px)' }} />
            </div>
          )}
          {/* Header with Back Button and Sidebar Toggle */}
          <div className={`bg-background border-b border-border ${isFreeTier ? 'pointer-events-none opacity-50' : ''}`}>
            <div className="flex items-center justify-between px-4 py-4">
              <div className="flex items-center gap-4">
                <SidebarTrigger />
                <BackToHomeButton />
              </div>
              <div className="flex items-center">
                <ThemeToggle />
              </div>
            </div>
          </div>
          
          {/* Main Content Area */}
          <div className={`flex-1 ${isFreeTier ? 'pointer-events-none opacity-50' : ''}`}>
            <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
              {/* Tabs */}
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="flex justify-center mb-8">
                  <TabsList className="grid w-full grid-cols-2 max-w-lg bg-muted border border-border p-1 rounded-xl h-14">
                  <TabsTrigger 
                    value="prep" 
                    className="gap-2 h-12 text-base font-medium data-[state=active]:bg-gradient-to-r data-[state=active]:from-pink-500 data-[state=active]:to-purple-500 data-[state=active]:text-white data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground transition-all"
                  >
                    <Briefcase className="h-5 w-5" />
                    Interview Prep
                  </TabsTrigger>
                  <TabsTrigger 
                    value="library" 
                    className="gap-2 h-12 text-base font-medium data-[state=active]:bg-gradient-to-r data-[state=active]:from-pink-500 data-[state=active]:to-purple-500 data-[state=active]:text-white data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground transition-all"
                  >
                    <Library className="h-5 w-5" />
                    Interview Library
                  </TabsTrigger>
                  </TabsList>
                </div>
                
                {/* TAB 1: Interview Prep */}
                <TabsContent value="prep">
                  <div className="mx-auto max-w-5xl px-6 py-12 space-y-10">
                    {/* Left-aligned Header */}
                    <div className="space-y-2">
                      <h1 className="text-3xl font-semibold text-foreground">Interview Prep</h1>
                      <p className="text-sm text-muted-foreground">
                        Master your next interview with AI preparation.
                      </p>
                    </div>

                    {/* Main Card */}
                    <div className="rounded-2xl bg-card border border-border p-8 space-y-6 shadow-lg relative min-h-[400px]">
                      <ComingSoonOverlay
                        title="AI Interview Preparation"
                        description="Master your next interview with tailored prep materials, common questions for your role, and company-specific insights to help you stand out."
                        icon={Briefcase}
                      />
                    </div>
                  </div>
                </TabsContent>
                
                {/* TAB 2: Interview Library */}
                <TabsContent value="library">
                  <div className="mx-auto max-w-5xl px-6 py-12 space-y-10">
                    {/* Left-aligned Header */}
                    <div className="space-y-2">
                      <h1 className="text-3xl font-semibold text-foreground">Interview Library</h1>
                      <p className="text-sm text-muted-foreground">
                        Access your past interview prep materials and insights.
                      </p>
                    </div>

                    {/* Main Card */}
                    <div className="rounded-2xl bg-card border border-border p-8 space-y-6 shadow-lg relative min-h-[400px]">
                      <ComingSoonOverlay
                        title="Interview Library"
                        description="Access your past interview prep materials and insights. Review what worked and refine your approach for future interviews."
                        icon={Library}
                      />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
        <ScoutChatbot onJobTitleSuggestion={() => {}} />
      </div>
    </SidebarProvider>
  );
}

