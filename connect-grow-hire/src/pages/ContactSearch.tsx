/**
 * ContactSearch.tsx - Contact Discovery Page (WITH TABS)
 * 
 * Tab 1: Contact Search - Professional search form (extracted from Home)
 * Tab 2: Contact Sheet - Spreadsheet view of all contacts with CSV export
 * 
 * IMPORTANT: This page preserves ALL existing functionality from Home.tsx
 * Professional Search form. No logic changes, just UI reorganization.
 */

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Upload, Search, Users as UsersIcon, FileText, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { BackToHomeButton } from '@/components/BackToHomeButton';
import { ThemeToggle } from '@/components/ThemeToggle';
import ScoutChatbot from '@/components/ScoutChatbot';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { AutocompleteInput } from '@/components/AutocompleteInput';
import { useFirebaseAuth } from '../contexts/FirebaseAuthContext';
import { useToast } from '@/hooks/use-toast';
import { firebaseApi } from '../services/firebaseApi';
import { logActivity, generateContactSearchSummary } from '../utils/activityLogger';
import SpreadsheetContactDirectory from '@/components/ContactDirectory';
import { auth } from '../lib/firebase';
import { uploadResume } from '@/lib/resumeUtils';

// Import types - these are the same as used in Home.tsx
const TIER_CONFIGS = {
  free: {
    maxContacts: 3,
    minContacts: 1,
    name: "Search Free Plan Tier",
    credits: 150,
    description: "Try out platform risk free - up to 3 contacts + Email drafts",
    usesResume: false,
  },
  pro: {
    maxContacts: 8,
    minContacts: 1,
    name: "Search Pro Plan Tier",
    credits: 1800,
    description: "Everything in free plus advanced features - up to 8 contacts + Resume matching",
    usesResume: true,
  },
};

// Background Blobs Component
function BackgroundBlobs() {
  return (
    <>
      <motion.div
        className="absolute -top-32 left-10 w-80 h-80 rounded-full bg-purple-500/20 blur-3xl pointer-events-none"
        animate={{ 
          y: [0, 20, 0], 
          scale: [1, 1.05, 1],
          x: [0, 10, 0]
        }}
        transition={{ 
          duration: 12, 
          repeat: Infinity, 
          ease: "easeInOut" 
        }}
        style={{ zIndex: 0 }}
      />
      <motion.div
        className="absolute -bottom-40 right-0 w-96 h-96 rounded-full bg-pink-500/20 blur-3xl pointer-events-none"
        animate={{ 
          y: [0, -20, 0], 
          scale: [1, 1.04, 1],
          x: [0, -10, 0]
        }}
        transition={{ 
          duration: 14, 
          repeat: Infinity, 
          ease: "easeInOut" 
        }}
        style={{ zIndex: 0 }}
      />
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-purple-500/10 blur-3xl pointer-events-none"
        animate={{ 
          scale: [1, 1.1, 1],
          opacity: [0.3, 0.5, 0.3]
        }}
        transition={{ 
          duration: 16, 
          repeat: Infinity, 
          ease: "easeInOut" 
        }}
        style={{ zIndex: 0 }}
      />
    </>
  );
}

// Batch Size Segmented Control Component
function BatchSizeSegmentedControl({
  value,
  onChange,
  options,
  disabled,
}: {
  value: number;
  onChange: (val: number) => void;
  options: number[];
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-muted p-1 border border-border">
      {options.map((option) => {
        const isActive = option === value;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            disabled={disabled}
            className={[
              "px-3 py-1.5 text-xs font-medium rounded-full transition",
              isActive
                ? "bg-primary text-primary-foreground shadow"
                : "text-muted-foreground hover:text-foreground hover:bg-accent",
              disabled && "opacity-50 cursor-not-allowed",
            ].join(" ")}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

export default function ContactSearch() {
  const [searchParams] = useSearchParams();
  const { user: firebaseUser, refreshUser } = useFirebaseAuth();
  const { toast } = useToast();
  const currentUser = firebaseUser;

  const effectiveUser =
    currentUser || ({
      credits: 0,
      maxCredits: 0,
      name: "User",
      email: "user@example.com",
      tier: "free",
    } as const);

  const userTier: "free" | "pro" = useMemo(() => {
    if (effectiveUser?.tier === "pro") return "pro";
    const max = Number(effectiveUser?.maxCredits ?? 0);
    const credits = Number(effectiveUser?.credits ?? 0);
    if (max >= 1800 || credits > 150) return "pro";
    return "free";
  }, [effectiveUser?.tier, effectiveUser?.maxCredits, effectiveUser?.credits]);

  const currentTierConfig = TIER_CONFIGS[userTier];

  // Tab state
  const [activeTab, setActiveTab] = useState('search');

  // Form state - exactly as in Home.tsx
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [collegeAlumni, setCollegeAlumni] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [batchSize, setBatchSize] = useState<number>(1);
  const [isSearching, setIsSearching] = useState(false);
  const [searchProgress, setSearchProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [lastResults, setLastResults] = useState<any[]>([]);
  const [lastSearchStats, setLastSearchStats] = useState<any>(null);
  
  // Resume from account settings
  const [savedResumeUrl, setSavedResumeUrl] = useState<string | null>(null);
  const [savedResumeFileName, setSavedResumeFileName] = useState<string | null>(null);

  const hasResults = lastResults.length > 0;
  const hasResume = uploadedFile || savedResumeUrl;

  // Calculate max batch size based on credits
  const maxBatchSize = useMemo(() => {
    const creditsAvailable = effectiveUser?.credits ?? 0;
    const maxByCredits = Math.floor(creditsAvailable / 15);
    const maxByTier = currentTierConfig.maxContacts;
    return Math.min(Math.max(maxByCredits, 0), maxByTier);
  }, [effectiveUser?.credits, currentTierConfig.maxContacts]);

  // Adjust batch size if it exceeds max
  useEffect(() => {
    if (batchSize > maxBatchSize) {
      setBatchSize(Math.max(1, maxBatchSize));
    }
  }, [maxBatchSize, batchSize]);
  
  // Load saved resume from account settings
  useEffect(() => {
    if (firebaseUser?.resumeUrl) {
      setSavedResumeUrl(firebaseUser.resumeUrl);
      setSavedResumeFileName(firebaseUser.resumeFileName || 'Resume.pdf');
      console.log('✅ Loaded saved resume from account settings:', firebaseUser.resumeFileName);
    }
  }, [firebaseUser]);
  
  // Pre-populate form fields from URL parameters (from Firm Sheet "View Contacts")
  useEffect(() => {
    const companyParam = searchParams.get('company');
    const locationParam = searchParams.get('location');
    
    if (companyParam) {
      setCompany(companyParam);
      console.log('✅ Pre-filled company from URL:', companyParam);
    }
    
    if (locationParam) {
      setLocation(locationParam);
      console.log('✅ Pre-filled location from URL:', locationParam);
    }
    
    // Auto-switch to search tab if params are present
    if (companyParam || locationParam) {
      setActiveTab('search');
      
      // Show toast to indicate pre-fill
      toast({
        title: "Form Pre-filled",
        description: `Company${companyParam ? ` and location` : ''} have been pre-filled from your firm selection.`,
      });
    }
  }, [searchParams, toast]);

  // Auto-save contacts to Firebase
  const autoSaveToDirectory = async (contacts: any[], searchLocation: string) => {
    if (!firebaseUser?.uid || !contacts || contacts.length === 0) return;
    
    console.log('🔍 Auto-saving contacts to Firebase:', contacts.length);
    
    try {
      await Promise.all(contacts.map((c: any) => {
        const derivedLocation = [c.City ?? '', c.State ?? ''].filter(Boolean).join(', ') || c.location || searchLocation || '';
        
        return firebaseApi.createContact(firebaseUser.uid, {
          firstName: c.FirstName ?? c.firstName ?? '',
          lastName: c.LastName ?? c.lastName ?? '',
          email: c.Email ?? c.email ?? '',
          linkedinUrl: c.LinkedIn ?? c.linkedinUrl ?? '',
          company: c.Company ?? c.company ?? '',
          jobTitle: c.Title ?? c.jobTitle ?? '',
          status: 'Not Contacted',
          location: derivedLocation,
          emailBody: c.email_draft || c.emailDraft || '',
          emailSubject: c.email_subject || c.emailSubject || '',
          college: '',
          firstContactDate: new Date().toLocaleDateString('en-US'),
          lastContactDate: new Date().toLocaleDateString('en-US'),
        });
      }));
      
      console.log('✅ Auto-saved contacts to Firebase');
    } catch (error) {
      console.error('❌ Error auto-saving contacts:', error);
    }
  };

  // Handle file upload - saves to Firebase for persistence across sessions
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.type !== 'application/pdf') {
      toast({
        variant: "destructive",
        title: "Invalid file type",
        description: "Please upload a PDF file.",
      });
      return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "File too large",
        description: "Please upload a PDF under 10MB.",
      });
      return;
    }
    
    // Set for immediate use in this session
    setUploadedFile(file);
    
    // Save to Firebase for persistence across sessions
    if (!firebaseUser?.uid) {
      toast({
        title: "Resume uploaded",
        description: "Resume will be used for this search. Sign in to save it permanently.",
      });
      return;
    }
    
    try {
      // Upload to Firebase Storage and save metadata to Firestore
      const resumeData = await uploadResume(file, firebaseUser.uid, true);
      
      // Update local state
      setSavedResumeUrl(resumeData.resumeUrl);
      setSavedResumeFileName(resumeData.resumeFileName);
      
      // Refresh user context to load the new resume data (will persist across sessions)
      await refreshUser();
      
      toast({
        title: "Resume uploaded & saved",
        description: `${file.name} has been saved to your account and will be used for all future searches.`,
      });
      
      console.log('✅ Resume uploaded and saved to Firebase:', resumeData);
    } catch (error) {
      console.error('❌ Failed to save resume to Firebase:', error);
      toast({
        variant: "destructive",
        title: "Resume saved locally only",
        description: "The resume will be used for this search but couldn't be saved permanently. Please try uploading in Account Settings.",
      });
    }
    
    // Clear the file input
    e.target.value = '';
  };

  // Handle search - this is the core logic from Home.tsx
  const handleSearch = async () => {
    if (!jobTitle.trim() || !location.trim()) {
      toast({
        variant: "destructive",
        title: "Missing required fields",
        description: "Please enter both job title and location.",
      });
      return;
    }

    const creditsNeeded = batchSize * 15;
    const creditsAvailable = effectiveUser?.credits ?? 0;

    if (creditsAvailable < creditsNeeded) {
      toast({
        variant: "destructive",
        title: "Insufficient Credits",
        description: `You need ${creditsNeeded} credits but only have ${creditsAvailable}. Please upgrade or reduce batch size.`,
      });
      return;
    }

    if (userTier === "pro" && !uploadedFile && !savedResumeUrl) {
      toast({
        variant: "destructive",
        title: "Resume Required",
        description: "Pro tier requires resume upload for AI similarity matching. Please upload your resume in Account Settings or use the upload button below.",
      });
      return;
    }

    setIsSearching(true);
    setSearchProgress(0);
    setLoadingMessage('Starting your search...');

    // Progress simulation with encouraging messages
    const progressMessages = [
      { progress: 10, message: 'Looking around...' },
      { progress: 25, message: 'Finding the right contacts...' },
      { progress: 40, message: 'Searching professional networks...' },
      { progress: 60, message: 'Almost there...' },
      { progress: 80, message: 'Finalizing results...' },
      { progress: 95, message: 'Just a moment more...' },
    ];

    let currentMessageIndex = 0;
    let progressInterval: NodeJS.Timeout | null = null;
    
    progressInterval = setInterval(() => {
      if (currentMessageIndex < progressMessages.length) {
        const { progress, message } = progressMessages[currentMessageIndex];
        setSearchProgress(progress);
        setLoadingMessage(message);
        currentMessageIndex++;
      } else {
        setSearchProgress(prev => {
          if (prev < 95) return prev + 5;
          return prev;
        });
      }
    }, 800);

    try {
      const API_BASE_URL = window.location.hostname === 'localhost' 
        ? 'http://localhost:5001' 
        : 'https://www.offerloop.ai';

      // Get Firebase auth token
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        throw new Error('Authentication required. Please sign in again.');
      }

      let result: any;

      if (userTier === "free") {
        // Free tier search
        const response = await fetch(`${API_BASE_URL}/api/free-run`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({
            jobTitle: jobTitle.trim(),
            company: company.trim() || "",
            location: location.trim(),
            userEmail: currentUser?.email || "",
            userId: currentUser?.uid || "",
            collegeAlumni: (collegeAlumni || '').trim(),
            batchSize: batchSize,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Search failed');
        }

        result = await response.json();

        if (result && result.contacts && result.contacts.length > 0) {
          setLastResults(result.contacts);
          setLastSearchStats(result);
          
          // Auto-save to Firebase
          await autoSaveToDirectory(result.contacts, location.trim());
          
          // Log activity for contact search
          if (currentUser?.uid) {
            try {
              console.log('📝 ContactSearch: Logging activity for free tier search');
              const summary = generateContactSearchSummary({
                jobTitle: jobTitle.trim(),
                company: company.trim(),
                location: location.trim(),
                college: (collegeAlumni || '').trim(),
                contactCount: result.contacts.length,
              });
              console.log('📝 ContactSearch: Generated summary:', summary);
              await logActivity(currentUser.uid, 'contactSearch', summary, {
                jobTitle: jobTitle.trim(),
                company: company.trim(),
                location: location.trim(),
                college: (collegeAlumni || '').trim(),
                contactCount: result.contacts.length,
              });
              console.log('✅ ContactSearch: Activity logged successfully');
            } catch (error) {
              console.error('❌ ContactSearch: Failed to log contact search activity:', error);
            }
          } else {
            console.warn('⚠️ ContactSearch: No user UID available, skipping activity log');
          }
          
          // Refresh user data to get updated credits
          await refreshUser();
          
          toast({
            title: "Search Complete",
            description: `Found ${result.contacts.length} contacts. Auto-saved to Contact Sheet.`,
          });
          
          // Switch to Contact Sheet tab to view results
          setActiveTab('sheet');
        }
      } else {
        // Pro tier search with resume
        const formData = new FormData();
        formData.append("jobTitle", jobTitle.trim());
        formData.append("company", company.trim() || "");
        formData.append("location", location.trim());
        
        // Use uploaded file if provided, otherwise fetch saved resume
        if (uploadedFile) {
          formData.append("resume", uploadedFile);
        } else if (savedResumeUrl) {
          // Fetch the saved resume from Firebase Storage and convert to File
          try {
            const response = await fetch(savedResumeUrl);
            const blob = await response.blob();
            const file = new File([blob], savedResumeFileName || 'Resume.pdf', { type: 'application/pdf' });
            formData.append("resume", file);
          } catch (err) {
            console.error('Failed to fetch saved resume:', err);
            toast({
              variant: "destructive",
              title: "Resume Error",
              description: "Failed to load your saved resume. Please upload a new one.",
            });
            setIsSearching(false);
            return;
          }
        }
        
        formData.append("userEmail", currentUser?.email || "");
        formData.append("userId", currentUser?.uid || "");
        formData.append("collegeAlumni", (collegeAlumni || '').trim());
        formData.append("batchSize", batchSize.toString());

        const response = await fetch(`${API_BASE_URL}/api/pro-run`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`
            // Don't set Content-Type for FormData - browser will set it with boundary
          },
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Search failed');
        }

        result = await response.json();

        // Complete progress
        if (progressInterval) clearInterval(progressInterval);
        setSearchProgress(100);
        setLoadingMessage('Done!');

        if (result && result.contacts && result.contacts.length > 0) {
          setLastResults(result.contacts);
          setLastSearchStats(result);
          
          // Auto-save to Firebase
          await autoSaveToDirectory(result.contacts, location.trim());
          
          // Log activity for contact search (pro tier)
          if (currentUser?.uid) {
            try {
              console.log('📝 ContactSearch: Logging activity for pro tier search');
              const summary = generateContactSearchSummary({
                jobTitle: jobTitle.trim(),
                company: company.trim(),
                location: location.trim(),
                college: (collegeAlumni || '').trim(),
                contactCount: result.contacts.length,
              });
              console.log('📝 ContactSearch: Generated summary:', summary);
              await logActivity(currentUser.uid, 'contactSearch', summary, {
                jobTitle: jobTitle.trim(),
                company: company.trim(),
                location: location.trim(),
                college: (collegeAlumni || '').trim(),
                contactCount: result.contacts.length,
              });
              console.log('✅ ContactSearch: Activity logged successfully');
            } catch (error) {
              console.error('❌ ContactSearch: Failed to log contact search activity:', error);
            }
          } else {
            console.warn('⚠️ ContactSearch: No user UID available, skipping activity log');
          }
          
          // Refresh user data to get updated credits
          await refreshUser();
          
          toast({
            title: "Search Complete",
            description: `Found ${result.contacts.length} contacts with AI similarity scores. Auto-saved to Contact Sheet.`,
          });
          
          // Switch to Contact Sheet tab
          setActiveTab('sheet');
        }
      }
    } catch (error: any) {
      console.error('Search error:', error);
      toast({
        variant: "destructive",
        title: "Search Failed",
        description: error.message || "An error occurred during the search. Please try again.",
      });
    } finally {
      setIsSearching(false);
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
                    value="search" 
                    className="gap-2 h-12 text-base font-medium data-[state=active]:bg-gradient-to-r data-[state=active]:from-pink-500 data-[state=active]:to-purple-500 data-[state=active]:text-white data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground transition-all"
                  >
                    <Search className="h-5 w-5" />
                    Contact Search
                  </TabsTrigger>
                  <TabsTrigger 
                    value="sheet" 
                    className="gap-2 h-12 text-base font-medium data-[state=active]:bg-gradient-to-r data-[state=active]:from-pink-500 data-[state=active]:to-purple-500 data-[state=active]:text-white data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground transition-all"
                  >
                    <UsersIcon className="h-5 w-5" />
                    Contact Sheet
                  </TabsTrigger>
                  </TabsList>
                </div>
                
                {/* TAB 1: Contact Search (Professional Search Form) */}
                <TabsContent value="search">
                  <div className="mx-auto max-w-5xl px-6 py-12 space-y-10 relative">
                    {/* Animated Background Blobs */}
                    <BackgroundBlobs />
                    
                    {/* Left-aligned Header */}
                    <div className="space-y-2 relative z-10">
                      <h1 className="text-3xl font-semibold text-foreground">Contact Search</h1>
                      <p className="text-sm text-muted-foreground">
                        Find professionals and connect with them.
                      </p>
                    </div>

                    {/* Main Card */}
                    <div className="rounded-2xl bg-card border border-border p-8 space-y-6 shadow-lg">
                      {/* Professional Filters Header */}
                      <div className="space-y-1">
                        <h2 className="text-lg font-semibold text-foreground">Professional Filters</h2>
                        <p className="text-xs text-muted-foreground">I want to network with...</p>
                      </div>

                      {/* Form Fields */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Job Title <span className="text-red-500">*</span>
                          </label>
                          <AutocompleteInput
                            value={jobTitle}
                            onChange={setJobTitle}
                            placeholder="e.g. Analyst, Associate, Manager"
                            dataType="job_title"
                            disabled={isSearching}
                            className="h-12 rounded-xl bg-muted border border-border px-4 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-transparent"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Company
                          </label>
                          <AutocompleteInput
                            value={company}
                            onChange={setCompany}
                            placeholder="e.g. Google, Meta, or any preferred firm"
                            dataType="company"
                            disabled={isSearching}
                            className="h-12 rounded-xl bg-muted border border-border px-4 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-transparent"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Location <span className="text-red-500">*</span>
                          </label>
                          <AutocompleteInput
                            value={location}
                            onChange={setLocation}
                            placeholder="e.g. Los Angeles, CA, New York, NY"
                            dataType="location"
                            disabled={isSearching}
                            className="h-12 rounded-xl bg-muted border border-border px-4 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-transparent"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            College Alumni
                          </label>
                          <AutocompleteInput
                            value={collegeAlumni}
                            onChange={setCollegeAlumni}
                            placeholder="e.g. Stanford, USC, preferred college"
                            dataType="school"
                            disabled={isSearching}
                            className="h-12 rounded-xl bg-muted border border-border px-4 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-transparent"
                          />
                        </div>
                      </div>

                      {/* Batch Size Section */}
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-4 border-t border-border">
                        <div className="space-y-1">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Email Batch Size
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Choose how many contacts to generate per search.
                          </p>
                        </div>

                        <div className="flex items-center gap-4">
                          <BatchSizeSegmentedControl
                            value={batchSize}
                            onChange={(val) => setBatchSize(val)}
                            options={Array.from({ length: maxBatchSize }, (_, i) => i + 1)}
                            disabled={isSearching || maxBatchSize < 1}
                          />
                          <div className="text-right text-xs text-muted-foreground">
                            <div className="font-medium text-foreground">
                              {batchSize * 15} credits
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              15 credits per contact
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Credit Warning */}
                      {maxBatchSize < currentTierConfig.maxContacts && (
                        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                          <p className="text-xs text-yellow-400 flex items-start gap-2">
                            <span>⚠️ Warning:</span>
                            <span>Limited by available credits. Maximum: {maxBatchSize} contacts.</span>
                          </p>
                        </div>
                      )}

                      {/* Resume Upload for Pro Tier */}
                      {userTier === "pro" && (
                        <div className="space-y-6 pt-4 border-t border-slate-200 dark:border-white/5">
                          <div className="space-y-2">
                            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              Resume <span className="text-red-500">*</span> (Required for Pro tier AI similarity matching)
                            </label>
                          </div>
                          
                          {/* Show saved resume if exists */}
                          {savedResumeUrl && !uploadedFile && (
                            <div className="rounded-2xl bg-white border border-slate-200 text-slate-900 shadow-sm px-4 py-3 flex items-center justify-between gap-3 text-sm dark:bg-gray-900/70 dark:border-gray-700 dark:text-gray-200 dark:shadow-none">
                              <div className="flex items-center gap-3">
                                <FileText className="h-4 w-4 text-slate-400 dark:text-gray-400" />
                                <span className="font-medium text-slate-900 dark:text-gray-200">Using saved resume: {savedResumeFileName}</span>
                              </div>
                              <button
                                onClick={() => {
                                  if (savedResumeUrl) window.open(savedResumeUrl, '_blank');
                                }}
                                className="text-sm text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300"
                              >
                                View
                              </button>
                            </div>
                          )}
                          
                          {/* Upload area */}
                          <div className={`rounded-2xl border border-slate-200 bg-slate-50 px-6 py-8 flex flex-col items-center justify-center text-sm text-slate-500 hover:border-slate-300 transition dark:border-gray-700/80 dark:bg-black/40 dark:text-gray-400 dark:hover:border-gray-500 ${
                            uploadedFile 
                              ? 'border-green-500/50 bg-green-500/5 dark:border-green-500/50 dark:bg-green-500/5' 
                              : ''
                          }`}>
                            <input
                              type="file"
                              accept=".pdf"
                              onChange={handleFileUpload}
                              className="hidden"
                              id="resume-upload"
                              disabled={isSearching}
                            />
                            <label
                              htmlFor="resume-upload"
                              className={`cursor-pointer flex flex-col items-center justify-center ${
                                isSearching ? "opacity-50 cursor-not-allowed" : ""
                              }`}
                            >
                              <Upload className="h-5 w-5 mb-2 text-slate-400 dark:text-gray-400" />
                              <p className="text-sm text-slate-500 dark:text-gray-400 mb-1">
                                {uploadedFile
                                  ? `✓ ${uploadedFile.name}`
                                  : "Drag a PDF here or click to upload"}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-gray-500">PDF only, max 10MB</p>
                            </label>
                          </div>
                          
                          {savedResumeUrl && !uploadedFile && (
                            <p className="text-xs text-slate-500 dark:text-gray-500 mt-3">
                              Your saved resume will be used automatically. Upload a new one to override.
                            </p>
                          )}
                        </div>
                      )}

                      {/* Progress Bar */}
                      {isSearching && (
                        <div className="mt-2 space-y-2">
                          <div className="w-full bg-background rounded-full h-2 overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-pink-500 to-purple-500 transition-all duration-300 ease-out"
                              style={{ width: `${searchProgress}%` }}
                            />
                          </div>
                          {loadingMessage && (
                            <p className="text-xs text-center text-muted-foreground animate-pulse">
                              {loadingMessage}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Search Button */}
                      <Button
                        onClick={handleSearch}
                        disabled={
                          !jobTitle.trim() ||
                          !location.trim() ||
                          isSearching ||
                          (userTier === "pro" && !hasResume) ||
                          (effectiveUser.credits ?? 0) < 15
                        }
                        className="mt-6 py-3 w-full rounded-2xl text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground transition-shadow disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSearching ? (loadingMessage || "Searching...") : "Find Contacts"}
                      </Button>

                      {/* Success Message */}
                      {hasResults && lastSearchStats && (
                        <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-5 py-4 space-y-3 dark:border-emerald-500/40 dark:bg-emerald-500/10">
                          <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                            <Check className="h-4 w-4" />
                            <span>Search completed</span>
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex flex-col gap-1 text-slate-900 dark:border-white/5 dark:bg-black/20 dark:text-gray-100">
                              <div className="text-lg font-semibold text-slate-900 dark:text-white">{lastResults.length}</div>
                              <div className="text-xs text-slate-500 dark:text-gray-400">Contacts found</div>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex flex-col gap-1 text-slate-900 dark:border-white/5 dark:bg-black/20 dark:text-gray-100">
                              <div className="text-lg font-semibold text-slate-900 dark:text-white">{lastResults.length}</div>
                              <div className="text-xs text-slate-500 dark:text-gray-400">Email drafts</div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-slate-500 dark:text-gray-400">
                              View Emails in Your{' '}
                              <a 
                                href="https://mail.google.com" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300 underline"
                              >
                                Gmail
                              </a>{' '}
                              Drafts
                            </p>
                            <button 
                              onClick={() => setActiveTab('sheet')}
                              className="flex items-center gap-1 justify-end text-xs font-medium text-indigo-500 hover:text-indigo-600 dark:text-sm dark:font-bold dark:text-indigo-400 dark:hover:text-indigo-300"
                            >
                              View in Contact Sheet
                              <span>→</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>
                
                {/* TAB 2: Contact Sheet (Reuses existing ContactDirectory component) */}
                <TabsContent value="sheet">
                  {/* The ContactDirectory component already has ALL the functionality:
                      - Spreadsheet table
                      - CSV export (excluding Actions column)
                      - Status dropdowns
                      - Email actions
                      - Search/filter
                      We just wrap it here */}
                  <SpreadsheetContactDirectory />
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


