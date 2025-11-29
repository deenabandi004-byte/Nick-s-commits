/**
 * InterviewPrepPage.tsx - Interview Preparation Page (WITH TABS)
 * 
 * Tab 1: Interview Prep - Coming soon
 * Tab 2: Interview Library - Coming soon
 */

import React, { useState } from 'react';
import { Briefcase, Library } from 'lucide-react';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { BackToHomeButton } from '@/components/BackToHomeButton';
import { ThemeToggle } from '@/components/ThemeToggle';
import ScoutChatbot from '@/components/ScoutChatbot';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ComingSoonOverlay } from '@/components/ComingSoonOverlay';
import { Card } from '@/components/ui/card';

export default function InterviewPrepPage() {
  const [activeTab, setActiveTab] = useState('prep');

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        
        <div className="flex-1 flex flex-col">
          {/* Header with Back Button and Sidebar Toggle */}
          <div className="bg-background border-b border-border">
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
          <div className="flex-1">
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

