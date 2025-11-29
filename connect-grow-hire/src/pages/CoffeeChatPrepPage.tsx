/**
 * CoffeeChatPrepPage.tsx - Coffee Chat Preparation Page (WITH TABS)
 * 
 * Tab 1: Coffee Chat Prep - Generate one-pagers from LinkedIn profiles
 * Tab 2: Coffee Chat Library - View and manage saved preps
 * 
 * IMPORTANT: Preserves ALL existing Coffee Chat functionality from Home.tsx
 */

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Coffee, Library, Loader2, Download, Clock, CheckCircle, XCircle } from 'lucide-react';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { BackToHomeButton } from '@/components/BackToHomeButton';
import { ThemeToggle } from '@/components/ThemeToggle';
import ScoutChatbot from '@/components/ScoutChatbot';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { BetaBadge } from '@/components/BetaBadges';
import { CoffeeChatLibraryContent } from '@/components/CoffeeChatLibraryContent';
import { useFirebaseAuth } from '../contexts/FirebaseAuthContext';
import { useToast } from '@/hooks/use-toast';
import { apiService } from '@/services/api';
import type { CoffeeChatPrepStatus } from '@/services/api';
import { flushSync } from 'react-dom';

const COFFEE_CHAT_CREDITS = 30;

export default function CoffeeChatPrepPage() {
  const [searchParams] = useSearchParams();
  const { user: firebaseUser, checkCredits } = useFirebaseAuth();
  const { toast } = useToast();
  
  // Tab state - check URL params for initial tab
  const [activeTab, setActiveTab] = useState(() => {
    const tabParam = searchParams.get('tab');
    return tabParam === 'library' ? 'library' : 'prep';
  });
  
  // Coffee Chat Prep state (from Home.tsx)
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [coffeeChatLoading, setCoffeeChatLoading] = useState(false);
  const [coffeeChatProgress, setCoffeeChatProgress] = useState<string>('');
  const [coffeeChatPrepId, setCoffeeChatPrepId] = useState<string | null>(null);
  const [coffeeChatResult, setCoffeeChatResult] = useState<CoffeeChatPrepStatus | null>(null);
  const [coffeeChatStatus, setCoffeeChatStatus] = useState<'idle' | 'processing' | 'completed' | 'failed'>('idle');
  const [showCompletionUI, setShowCompletionUI] = useState(false);
  const [renderKey, setRenderKey] = useState(0);
  
  const coffeeChatPollTimeoutRef = useRef<number | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (coffeeChatPollTimeoutRef.current) {
        clearTimeout(coffeeChatPollTimeoutRef.current);
        coffeeChatPollTimeoutRef.current = null;
      }
    };
  }, []);

  // Debug monitor
  useEffect(() => {
    console.log('🔍 Coffee Chat State:', {
      loading: coffeeChatLoading,
      status: coffeeChatStatus,
      hasResult: !!coffeeChatResult,
      prepId: coffeeChatPrepId,
      showCompletionUI,
    });
  }, [coffeeChatLoading, coffeeChatStatus, coffeeChatResult, coffeeChatPrepId, showCompletionUI]);

  // Handle Coffee Chat submission (extracted from Home.tsx)
  const handleCoffeeChatSubmit = async () => {
    console.log('🎬 handleCoffeeChatSubmit called');
    
    if (!linkedinUrl.trim()) {
      toast({
        title: "Missing LinkedIn URL",
        description: "Please enter a LinkedIn profile URL.",
        variant: "destructive",
      });
      return;
    }

    if (!firebaseUser) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to continue.",
        variant: "destructive",
      });
      return;
    }

    setCoffeeChatLoading(true);
    setCoffeeChatStatus('processing');
    setCoffeeChatProgress('Starting Coffee Chat Prep...');
    setCoffeeChatResult(null);
    setShowCompletionUI(false);

    try {
      // Start the generation
      const result = await apiService.createCoffeeChatPrep({ linkedinUrl });
      
      if ('error' in result) {
        throw new Error(result.error);
      }

      const prepId = result.prepId;
      setCoffeeChatPrepId(prepId);
      
      // Use setInterval for polling
      let pollCount = 0;
      const maxPolls = 200;
      
      const pollPromise = new Promise((resolve, reject) => {
        const intervalId = setInterval(async () => {
          pollCount++;
          console.log(`🔄 Poll ${pollCount} starting...`);
          
          try {
            const statusResult = await apiService.getCoffeeChatPrepStatus(prepId);
            console.log(`Poll ${pollCount}:`, statusResult);
            
            // Check if it's an error response
            if ('error' in statusResult && !('status' in statusResult)) {
              clearInterval(intervalId);
              reject(new Error(statusResult.error));
              return;
            }
            
            // Check if completed (pdfUrl is definitive)
            if (statusResult.pdfUrl) {
              clearInterval(intervalId);
              console.log('✅ Completed! pdfUrl:', statusResult.pdfUrl);
              
              // Update ALL states synchronously
              flushSync(() => {
                setCoffeeChatLoading(false);
                setCoffeeChatStatus('completed');
                setCoffeeChatProgress('Coffee Chat Prep ready!');
                setCoffeeChatResult(statusResult as CoffeeChatPrepStatus);
                setCoffeeChatPrepId((statusResult as any).id || prepId);
                setShowCompletionUI(true);
                setRenderKey(prev => prev + 1);
              });
              
              console.log('✅ States updated, interval cleared');
              
              // Show toast
              toast({
                title: "Coffee Chat Prep Ready!",
                description: "Your one-pager has been generated successfully.",
                duration: 5000,
              });
              
              console.log('✅ Toast shown, now updating credits');
              
              // Update credits
              checkCredits().then(() => {
                console.log('✅ Everything complete!');
                resolve(statusResult);
              });
              
              return;
            }
            
            // Only update progress if NOT completed
            if ('status' in statusResult) {
              setCoffeeChatProgress('Processing your request...');
            }
            
            if (pollCount >= maxPolls) {
              clearInterval(intervalId);
              reject(new Error('Generation timed out'));
            }
          } catch (error) {
            clearInterval(intervalId);
            reject(error);
          }
        }, 3000); // Poll every 3 seconds
      });
      
      await pollPromise;
      
    } catch (error: any) {
      console.error('Coffee chat prep failed:', error);
      setCoffeeChatStatus('failed');
      setCoffeeChatProgress('Generation failed');
      toast({
        title: "Generation Failed",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      // ALWAYS set loading to false in finally block
      setCoffeeChatLoading(false);
      console.log('✅ Loading set to false in finally block');
    }
  };

  // Download PDF handler (extracted from Home.tsx)
  const downloadCoffeeChatPDF = async (prepId?: string) => {
    const id = prepId || coffeeChatPrepId;
    if (!id || !firebaseUser) return;

    try {
      const MAX_TRIES = 20;
      const DELAY_MS = 1000;
      let pdfUrl: string | undefined;

      // Show loading toast
      toast({
        title: "Preparing PDF",
        description: "Please wait while we prepare your Coffee Chat PDF...",
        duration: 3000,
      });

      // Poll until PDF is ready
      for (let i = 0; i < MAX_TRIES; i++) {
        try {
          const res = await apiService.downloadCoffeeChatPDF(id);
          pdfUrl = res?.pdfUrl || undefined;
          if (pdfUrl) {
            // Verify the URL is accessible
            try {
              const response = await fetch(pdfUrl, { method: 'HEAD' });
              if (response.ok) {
                break; // PDF is ready and accessible
              }
            } catch {
              // URL not ready yet, continue polling
            }
          }
        } catch { /* ignore transient errors while polling */ }
        await new Promise(r => setTimeout(r, DELAY_MS));
      }

      if (!pdfUrl) {
        throw new Error("PDF isn't ready yet. Please try again in a moment.");
      }

      // Add a small delay to ensure everything is ready
      await new Promise(r => setTimeout(r, 500));

      // Open the PDF in a new tab
      const tab = window.open(pdfUrl, "_blank", "noopener,noreferrer");
      
      if (!tab) {
        // Popup was blocked → try using an anchor click
        const a = document.createElement("a");
        a.href = pdfUrl;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }

      toast({
        title: "PDF Ready",
        description: "Opened your Coffee Chat one-pager in a new tab.",
      });
    } catch (err) {
      toast({
        title: "Download Failed",
        description: err instanceof Error ? err.message : "Could not download the PDF.",
        variant: "destructive",
      });
    }
  };

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
                    <Coffee className="h-5 w-5" />
                    Coffee Chat Prep
                  </TabsTrigger>
                  <TabsTrigger 
                    value="library" 
                    className="gap-2 h-12 text-base font-medium data-[state=active]:bg-gradient-to-r data-[state=active]:from-pink-500 data-[state=active]:to-purple-500 data-[state=active]:text-white data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground transition-all"
                  >
                    <Library className="h-5 w-5" />
                    Coffee Chat Library
                  </TabsTrigger>
                  </TabsList>
                </div>
                
                {/* TAB 1: Coffee Chat Prep (Generation Form) */}
                <TabsContent value="prep">
                  <div className="mx-auto max-w-5xl px-6 py-12 space-y-10">
                    {/* Left-aligned Header */}
                    <div className="space-y-2">
                      <h1 className="text-3xl font-semibold text-foreground">Coffee Chat Prep</h1>
                      <p className="text-sm text-muted-foreground">
                        Prepare for your networking meetings.
                      </p>
                    </div>

                    {/* Main Card */}
                    <div className="rounded-2xl bg-card border border-border p-8 space-y-6 shadow-lg">
                      <div className="flex items-center justify-between pb-4 border-b border-border">
                        <div className="flex items-center gap-2">
                          <h2 className="text-lg font-semibold text-foreground">Generate Coffee Chat Prep</h2>
                          <BetaBadge size="xs" variant="glow" />
                        </div>
                        <Badge variant="secondary" className="bg-muted text-muted-foreground">
                          {COFFEE_CHAT_CREDITS} credits
                        </Badge>
                      </div>

                      <div className="grid gap-8 lg:grid-cols-2">
                        {/* Left Column: Form */}
                        <div className="space-y-5">
                          <div className="space-y-2">
                            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              LinkedIn Profile URL
                            </label>
                            <Input
                              value={linkedinUrl}
                              onChange={(e) => setLinkedinUrl(e.target.value)}
                              placeholder="https://linkedin.com/in/username"
                              className="h-12 rounded-xl bg-muted border border-border px-4 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-transparent"
                              disabled={coffeeChatLoading}
                            />
                            <p className="text-xs text-muted-foreground mt-2">
                              Uses {COFFEE_CHAT_CREDITS} credits. Generates a PDF with recent division news, talking points, and similarities.
                            </p>
                          </div>

                          <div className="flex flex-col gap-3" key={`buttons-${renderKey}`}>
                            <Button
                              onClick={handleCoffeeChatSubmit}
                              disabled={coffeeChatLoading || !linkedinUrl.trim()}
                              key={`generate-btn-${coffeeChatLoading}-${renderKey}`}
                              className="h-12 w-full rounded-xl text-sm font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-xl transition-shadow disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {coffeeChatLoading ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Generating...
                                </>
                              ) : (
                                <>
                                  <Coffee className="h-4 w-4 mr-2" />
                                  Generate Prep
                                </>
                              )}
                            </Button>

                            {coffeeChatStatus === 'completed' && (coffeeChatPrepId || coffeeChatResult) && (
                              <Button
                                variant="outline"
                                onClick={() => downloadCoffeeChatPDF()}
                                className="h-12 w-full rounded-xl border-green-500/60 text-green-300 hover:bg-green-500/10"
                              >
                                <Download className="h-4 w-4 mr-2" />
                                Download PDF
                              </Button>
                            )}
                          </div>

                          {/* Status Display */}
                          {coffeeChatStatus !== 'idle' && (
                            <div 
                              key={`status-${coffeeChatStatus}-${renderKey}`} 
                              className="rounded-lg border border-border bg-muted p-4 shadow-inner text-sm text-foreground"
                            >
                              <div className="flex items-center gap-2">
                                {coffeeChatLoading ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                                ) : coffeeChatStatus === 'completed' ? (
                                  <CheckCircle className="h-4 w-4 text-green-400" />
                                ) : coffeeChatStatus === 'failed' ? (
                                  <XCircle className="h-4 w-4 text-red-400" />
                                ) : (
                                  <Clock className="h-4 w-4 text-blue-400" />
                                )}
                                <span>{coffeeChatProgress}</span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Right Column: Results/Info */}
                        <div className="space-y-4" key={`coffee-${coffeeChatStatus}-${renderKey}`}>
                          {coffeeChatStatus === 'completed' && coffeeChatResult ? (
                            <>
                              {/* Contact Snapshot */}
                              <div className="rounded-xl border border-green-500/40 bg-green-500/10 p-5 space-y-3">
                                <div className="flex items-center justify-between">
                                  <h3 className="text-sm font-semibold text-green-200 uppercase tracking-wide">
                                    Contact Snapshot
                                  </h3>
                                  <span className="text-xs text-green-300/80">
                                    Ready for coffee chat
                                  </span>
                                </div>
                                <div className="space-y-1 text-sm text-foreground">
                                  <p><span className="text-muted-foreground">Name:</span> {coffeeChatResult.contactData?.firstName} {coffeeChatResult.contactData?.lastName}</p>
                                  <p><span className="text-muted-foreground">Role:</span> {coffeeChatResult.contactData?.jobTitle}</p>
                                  <p><span className="text-muted-foreground">Company:</span> {coffeeChatResult.contactData?.company}</p>
                                  <p><span className="text-muted-foreground">Office:</span> {coffeeChatResult.contactData?.location || coffeeChatResult.context?.office}</p>
                                  {coffeeChatResult.hometown && (
                                    <p><span className="text-muted-foreground">Hometown:</span> {coffeeChatResult.hometown}</p>
                                  )}
                                </div>
                              </div>

                              {/* Common Ground */}
                              {coffeeChatResult.similaritySummary && (
                                <div className="rounded-xl border border-blue-500/40 bg-blue-500/10 p-4">
                                  <h3 className="text-sm font-semibold text-blue-200 uppercase tracking-wide mb-2">
                                    Common Ground
                                  </h3>
                                  <p className="text-sm text-foreground leading-relaxed">
                                    {coffeeChatResult.similaritySummary}
                                  </p>
                                </div>
                              )}

                              {/* Industry Pulse */}
                              {coffeeChatResult.industrySummary && (
                                <div className="rounded-xl border border-purple-500/40 bg-purple-500/10 p-4">
                                  <h3 className="text-sm font-semibold text-purple-200 uppercase tracking-wide mb-2">
                                    Industry Pulse
                                  </h3>
                                  <p className="text-sm text-foreground leading-relaxed">
                                    {coffeeChatResult.industrySummary}
                                  </p>
                                </div>
                              )}
                            </>
                          ) : (
                            /* What You'll Receive */
                            <div className="rounded-xl border border-border bg-muted p-5 text-sm text-foreground space-y-3">
                              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                                What you'll receive
                              </h3>
                              <ul className="space-y-2 text-foreground">
                                <li className="flex items-start gap-2">
                                  <CheckCircle className="h-4 w-4 text-green-400 mt-0.5" />
                                  Curated headlines tied to the division and office
                                </li>
                                <li className="flex items-start gap-2">
                                  <CheckCircle className="h-4 w-4 text-green-400 mt-0.5" />
                                  40-second similarity summary & coffee chat questions
                                </li>
                                <li className="flex items-start gap-2">
                                  <CheckCircle className="h-4 w-4 text-green-400 mt-0.5" />
                                  PDF saved to your Coffee Chat Library
                                </li>
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>
                
                {/* TAB 2: Coffee Chat Library */}
                <TabsContent value="library">
                  <CoffeeChatLibraryContent 
                    showCreateButton={false}
                    createButtonPath="/coffee-chat-prep?tab=prep"
                  />
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
