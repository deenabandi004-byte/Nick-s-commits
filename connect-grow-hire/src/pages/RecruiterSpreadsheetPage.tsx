// src/pages/RecruiterSpreadsheetPage.tsx
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { db, storage, auth } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { toast } from "@/hooks/use-toast";
import { ACCEPTED_RESUME_TYPES, isValidResumeFile } from "@/utils/resumeFileTypes";
import { useTour } from "@/contexts/TourContext";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { VideoDemo } from "@/components/VideoDemo";
import { ProGate } from "@/components/ProGate";
import { apiService, type Recruiter, type FeedJob } from "@/services/api";
import { firebaseApi, type Recruiter as FirebaseRecruiter } from "../services/firebaseApi";
import {
  Users, Link, CheckCircle, ArrowUp,
  ArrowRight, Loader2, Upload, ChevronDown, ChevronUp,
  Mail, Inbox, Linkedin
} from "lucide-react";
import { ResultActionButton } from "@/components/find/ResultActionButton";
import { SearchPromptBox } from "@/components/find/SearchPromptBox";
import { SearchModeSelector } from "@/components/find/SearchModeSelector";
import { SendConfirmDialog } from "@/components/SendConfirmDialog";
import { type OutreachMode, getDefaultOutreachMode, canUseOutreachMode } from "@/utils/featureAccess";
import {
  getCompanyLogoUrl, getRecommendedCompanies,
  type RecommendedCompany, type UserContext, isContextEmpty,
} from "@/utils/suggestionChips";
import { DEV_MOCK_USER } from "@/lib/devPreview";

// Some job feeds (Greenhouse/Workday/LinkedIn JSON-LD) return location as a
// schema.org PostalAddress object instead of a plain string. Flatten to text
// so React doesn't try to render the object as a child.
function locationToText(loc: unknown): string {
  if (!loc) return '';
  if (typeof loc === 'string') return loc;
  if (typeof loc === 'object') {
    const o = loc as Record<string, unknown>;
    const parts = [o.addressLocality, o.addressRegion, o.addressCountry]
      .filter((x): x is string => typeof x === 'string' && x.length > 0);
    if (parts.length > 0) return parts.join(', ');
    if (typeof o.streetAddress === 'string') return o.streetAddress;
    return '';
  }
  return String(loc);
}

const RecruiterSpreadsheetPage: React.FC<{ embedded?: boolean; isDevPreview?: boolean }> = ({ embedded = false, isDevPreview = false }) => {
  const { user: authUser } = useFirebaseAuth();
  const user = isDevPreview ? DEV_MOCK_USER as any : authUser;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('find-hiring-managers');

  // Resume state
  const [savedResumeUrl, setSavedResumeUrl] = useState<string | null>(null);
  const [savedResumeFileName, setSavedResumeFileName] = useState<string | null>(null);
  const [isUploadingResume, setIsUploadingResume] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state — pre-fill from URL param if present
  const [jobPostingUrl, setJobPostingUrl] = useState(searchParams.get('jobUrl') || '');
  const [company, setCompany] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [location, setLocation] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchComplete, setSearchComplete] = useState(false);
  const [progress, setProgress] = useState(0);
  const [estimatedManagers] = useState(2);
  const [managersFound, setManagersFound] = useState(0);
  const [showManualEntry, setShowManualEntry] = useState(false);
  // Found hiring managers rendered as Find-People-style result cards. Display
  // shape only; the durable write still goes to users/{uid}/recruiters below.
  const [foundManagers, setFoundManagers] = useState<any[]>([]);
  // Scroll target for the result cards, so a successful search lands the user
  // on the cards inline (mirrors the People tab's searchSuccessRef behavior).
  const resultsRef = useRef<HTMLDivElement>(null);

  // Job feed chips + profile-based fallback
  const [recentJobs, setRecentJobs] = useState<FeedJob[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendedCompany[]>([]);
  const [chipsCollapsed, setChipsCollapsed] = useState(false);
  const [hmSuggestions, setHmSuggestions] = useState<any[]>([]);
  // Set true when a chip click prefills the form so the next render auto-runs the search
  const pendingAutoSearch = useRef(false);

  // ── Tour demo state ──────────────────────────────────────────────────────
  // When the product tour reaches the Find Hiring Manager step it sets
  // `demoSurface` to 'hiring-managers'. The effect below types an example URL
  // into the real `jobPostingUrl` state, holds a brief "Searching…" beat, then
  // seeds a single inert manager card. Cleanup wipes every demo write so
  // there is zero residue on tour-end or unmount.
  const { demoSurface } = useTour();
  const hmDemoActive = demoSurface === 'hiring-managers';
  const HM_DEMO_URL = 'https://jobs.lever.co/offerloop/cmo-2026';
  const HM_DEMO_CARD = {
    demo: true as const,
    name: 'Rylan Bohnett',
    title: 'CMO',
    company: 'Offerloop',
    email: 'rylan@offerloop.ai',
  };

  useEffect(() => {
    if (!hmDemoActive) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const TYPE_DELAY_MS = 32;
    const SEARCHING_HOLD_MS = 1500;
    const POST_TYPE_PAUSE_MS = 250;

    setJobPostingUrl('');
    setFoundManagers([]);
    setManagersFound(0);
    setSearchComplete(false);
    setIsSearching(false);
    setProgress(0);

    for (let i = 1; i <= HM_DEMO_URL.length; i++) {
      timers.push(
        setTimeout(() => {
          if (cancelled) return;
          setJobPostingUrl(HM_DEMO_URL.slice(0, i));
        }, i * TYPE_DELAY_MS),
      );
    }

    const typingDoneAt = HM_DEMO_URL.length * TYPE_DELAY_MS + POST_TYPE_PAUSE_MS;
    timers.push(
      setTimeout(() => {
        if (cancelled) return;
        setIsSearching(true);
        setProgress(50);
      }, typingDoneAt),
    );
    timers.push(
      setTimeout(() => {
        if (cancelled) return;
        setIsSearching(false);
        setProgress(100);
        setFoundManagers([HM_DEMO_CARD]);
        setManagersFound(1);
        setSearchComplete(true);
      }, typingDoneAt + SEARCHING_HOLD_MS),
    );

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      setJobPostingUrl('');
      setFoundManagers([]);
      setManagersFound(0);
      setIsSearching(false);
      setSearchComplete(false);
      setProgress(0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hmDemoActive]);

  // Outreach mode (preview / draft / send), same contract as the People tab.
  // Backend re-validates against tier; this drives the UI. Free lands on
  // preview, Pro and Elite on draft.
  const userTier: "free" | "pro" | "elite" =
    user?.tier === "pro" || user?.tier === "elite" ? user.tier : "free";
  const [outreachMode, setOutreachMode] = useState<OutreachMode>(() => getDefaultOutreachMode(userTier));
  useEffect(() => {
    if (!canUseOutreachMode(userTier, outreachMode)) {
      setOutreachMode(getDefaultOutreachMode(userTier));
    }
  }, [userTier, outreachMode]);
  // Hard confirm gate shown before any send (send is irreversible).
  const [showSendConfirm, setShowSendConfirm] = useState(false);


  // Ref for original button to track visibility

  // Validate parsed job title - reject common error messages from JS-required pages
  const isValidJobTitle = (title: string | undefined | null): boolean => {
    if (!title || title.trim().length === 0) return false;

    const invalidPatterns = [
      'javascript is disabled',
      'javascript is required',
      'enable javascript',
      'please enable javascript',
      'browser not supported',
      'loading...',
      'please wait',
    ];

    const lowerTitle = title.toLowerCase().trim();
    return !invalidPatterns.some(pattern => lowerTitle.includes(pattern));
  };

  // URL validation
  const isValidUrl = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  // Load saved resume from Firestore
  const loadSavedResume = useCallback(async () => {
    if (!user?.uid || isDevPreview) return;
    try {
      const userRef = doc(db, 'users', user.uid);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const data = snap.data();
        setSavedResumeUrl(data.resumeUrl || null);
        setSavedResumeFileName(data.resumeFileName || null);
      }
    } catch (error) {
      console.error('Failed to load saved resume:', error);
    }
  }, [user?.uid]);

  useEffect(() => {
    loadSavedResume();
  }, [loadSavedResume]);

  // Fetch job feed for chips, fallback to profile-based recommendations
  useEffect(() => {
    if (!user?.uid || isDevPreview) return;
    let cancelled = false;

    // Try job feed first
    apiService.getJobFeed().then(data => {
      if (cancelled) return;
      const all = [...(data.top_jobs || []), ...(data.new_matches || [])];
      const seen = new Set<string>();
      const unique: FeedJob[] = [];
      for (const job of all) {
        if (!seen.has(job.job_id) && job.apply_url) {
          seen.add(job.job_id);
          unique.push(job);
        }
        if (unique.length >= 8) break;
      }
      setRecentJobs(unique);
    }).catch(() => {});

    // Also fetch profile-based recommendations as fallback
    firebaseApi.getUserOnboardingData(user.uid).then(data => {
      if (cancelled) return;
      const ctx: UserContext = {
        firstName: data.firstName,
        university: data.university,
        graduationYear: data.graduationYear,
        targetIndustries: data.targetIndustries,
        preferredLocations: data.preferredLocations,
        dreamCompanies: data.dreamCompanies,
        careerTrack: data.careerTrack,
        preferredJobRole: data.preferredJobRole,
      };
      if (!isContextEmpty(ctx)) {
        setRecommendations(getRecommendedCompanies(ctx));
      }
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [user?.uid]);

  // Save resume to account settings
  const saveResumeToAccountSettings = async (file: File) => {
    if (!user?.uid) {
      throw new Error('User not authenticated');
    }
    setIsUploadingResume(true);
    try {
      const storageRef = ref(storage, `resumes/${user.uid}/${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        resumeUrl: downloadUrl,
        resumeFileName: file.name,
        resumeUpdatedAt: new Date().toISOString(),
      });
      setSavedResumeUrl(downloadUrl);
      setSavedResumeFileName(file.name);
      toast({
        title: "Resume saved",
        description: "Your resume has been uploaded and saved to your account.",
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save resume';
      toast({
        title: "Upload failed",
        description: errorMessage,
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsUploadingResume(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!isValidResumeFile(file)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a PDF, DOCX, or DOC file.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Please upload a file smaller than 10MB.",
        variant: "destructive",
      });
      return;
    }
    try {
      await saveResumeToAccountSettings(file);
    } catch (error) {
      // Error handled in saveResumeToAccountSettings
    }
    event.target.value = '';
  };

  // Check if form is valid - only job description is required
  const hasValidInput = jobPostingUrl.trim() || jobDescription.trim();
  const canSearch = savedResumeUrl && hasValidInput && !isSearching;

  // Handle search
  const handleFindHiringManagers = async (confirmedSend = false) => {
    // Hard short-circuit while the tour's demo is active on this surface.
    // Catches button click, form submit, and the chip-driven pendingAutoSearch
    // path with a single guard. No API call fires.
    if (hmDemoActive) return;
    if (!canSearch || !user) return;
    // Send is irreversible: gate it behind the hard confirm dialog. The dialog's
    // confirm handler re-invokes this with confirmedSend=true. This also covers
    // the job-board card auto-search path, which calls this same function.
    // Strict === true so a stray click-event argument cannot bypass the gate.
    if (outreachMode === "send" && confirmedSend !== true) {
      setShowSendConfirm(true);
      return;
    }
    setIsSearching(true);
    setProgress(0);
    setHmSuggestions([]);
    // Clear prior result state so a follow-up search starts clean. setFoundManagers
    // only fires when managers are found, so a second search returning zero would
    // otherwise leave stale cards on screen and a stuck searchComplete flag.
    setFoundManagers([]);
    setManagersFound(0);
    setSearchComplete(false);

    // Simulate progress
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 200);

    try {
      let companyName = company;
      let jobTitleValue = jobTitle;
      let locationValue = location;
      let description = jobDescription;

      // Priority 1: Parse job URL if provided
      if (jobPostingUrl && jobPostingUrl.trim()) {
        try {
          const parseResponse = await apiService.parseJobUrl({ url: jobPostingUrl });
          if (parseResponse.job) {
            if (parseResponse.job.company && !companyName) {
              companyName = parseResponse.job.company;
            }
            const parsedTitle = parseResponse.job.title;
            if (parsedTitle && !jobTitleValue && isValidJobTitle(parsedTitle)) {
              jobTitleValue = parsedTitle;
            }
            if (parseResponse.job.location && !locationValue) {
              locationValue = locationToText(parseResponse.job.location);
            }
            if (parseResponse.job.description && !description) {
              description = parseResponse.job.description;
            }
          } else if (parseResponse.error) {
            console.warn('Failed to parse job URL:', parseResponse.error);
            toast({
              title: "Could not parse job URL",
              description: "Please paste the job description instead.",
              variant: "default"
            });
          }
        } catch (error) {
          console.error('Error parsing job URL:', error);
        }
      }

      // Validate we have required fields - only job description is required
      if (!description || !description.trim()) {
        toast({
          title: "Job description required",
          description: "Please provide a job description or paste a job URL.",
          variant: "destructive",
        });
        clearInterval(progressInterval);
        setIsSearching(false);
        return;
      }

      // Call the API. Mode governs generate/draft/send; the backend re-validates
      // it against tier and is the source of truth.
      const response = await apiService.findHiringManagers({
        company: companyName,
        jobTitle: jobTitleValue,
        jobDescription: description,
        location: locationValue,
        jobUrl: jobPostingUrl || undefined,
        maxResults: estimatedManagers,
        mode: outreachMode,
      });

      console.log('🔍 API Response:', JSON.stringify(response, null, 2));
      console.log('🔍 Hiring managers found:', response.hiringManagers?.length);
      console.log('🔍 First manager raw:', response.hiringManagers?.[0]);

      clearInterval(progressInterval);
      setProgress(100);

      if (response.error) {
        toast({
          title: "Error finding hiring managers",
          description: response.error,
          variant: "destructive",
        });
        setIsSearching(false);
        return;
      }

      // Save hiring managers to tracker
      if (response.hiringManagers && response.hiringManagers.length > 0) {
        try {
          // Create a map of email -> draft info for quick lookup
          const draftMap = new Map<string, any>();
          if (response.draftsCreated && Array.isArray(response.draftsCreated)) {
            response.draftsCreated.forEach((draft: any) => {
              const email = draft.recruiter_email || draft.recruiterEmail;
              if (email) {
                draftMap.set(email.toLowerCase(), draft);
              }
            });
          }

          // Map of email -> sent info (send mode only). Drives the deterministic
          // sent record below: the same fields People writes on a send.
          const sentMap = new Map<string, any>();
          if (response.sentEmails && Array.isArray(response.sentEmails)) {
            response.sentEmails.forEach((s: any) => {
              const email = s.recruiter_email || s.recruiterEmail;
              if (email) {
                sentMap.set(email.toLowerCase(), s);
              }
            });
          }

          // Map of email -> generated email content (subject/body) so the
          // result cards can show the drafted subject line, mirroring People.
          const emailMap = new Map<string, any>();
          if (response.emails && Array.isArray(response.emails)) {
            response.emails.forEach((em: any) => {
              const email = em.to_email || em.toEmail;
              if (email) {
                emailMap.set(email.toLowerCase(), em);
              }
            });
          }

          // Convert API format to Firebase format
          const firebaseRecruiters: Omit<FirebaseRecruiter, 'id'>[] = response.hiringManagers.map((manager: any) => {
            // Build base object with required fields
            const managerEmail = manager.Email || manager.email || manager.WorkEmail || manager.work_email || '';
            const recruiter: Omit<FirebaseRecruiter, 'id'> = {
              firstName: manager.FirstName || manager.firstName || manager.first_name || '',
              lastName: manager.LastName || manager.lastName || manager.last_name || '',
              linkedinUrl: manager.LinkedIn || manager.linkedin || manager.linkedinUrl || manager.linkedin_url || '',
              email: managerEmail,
              company: manager.Company || manager.company || companyName,
              jobTitle: manager.Title || manager.title || manager.jobTitle || manager.job_title || '',
              location: `${manager.City || manager.city || ''}${(manager.City || manager.city) && (manager.State || manager.state) ? ', ' : ''}${manager.State || manager.state || ''}`.trim() || '',
              dateAdded: new Date().toISOString(),
              status: 'Not Contacted',
            };

            // Only add optional fields if they have values (Firestore rejects undefined)
            const phone = manager.Phone || manager.phone;
            const workEmail = manager.WorkEmail || manager.work_email || manager.workEmail;
            const personalEmail = manager.PersonalEmail || manager.personal_email || manager.personalEmail;
            const associatedJobTitle = jobTitleValue;
            const associatedJobUrl = jobPostingUrl;

            if (phone) recruiter.phone = phone;
            if (workEmail) recruiter.workEmail = workEmail;
            if (personalEmail) recruiter.personalEmail = personalEmail;
            if (associatedJobTitle && isValidJobTitle(associatedJobTitle)) {
              recruiter.associatedJobTitle = associatedJobTitle;
            }
            if (associatedJobUrl) recruiter.associatedJobUrl = associatedJobUrl;

            // Match draft info by email and add to recruiter
            if (managerEmail) {
              const draftInfo = draftMap.get(managerEmail.toLowerCase());
              if (draftInfo) {
                if (draftInfo.draft_id) recruiter.gmailDraftId = draftInfo.draft_id;
                if (draftInfo.message_id) recruiter.gmailMessageId = draftInfo.message_id;
                if (draftInfo.draft_url) recruiter.gmailDraftUrl = draftInfo.draft_url;
              }
              // Sent record (send mode): same fields People writes on a send,
              // plus status Contacted so the tracker reflects that it went out.
              const sentInfo = sentMap.get(managerEmail.toLowerCase());
              if (sentInfo) {
                recruiter.pipelineStage = "waiting_on_reply";
                recruiter.emailSentAt = new Date().toISOString();
                recruiter.status = "Contacted";
                if (sentInfo.thread_id) recruiter.gmailThreadId = sentInfo.thread_id;
                if (sentInfo.message_id) recruiter.gmailMessageId = sentInfo.message_id;
              }
            }

            return recruiter;
          });

          // Build the result-card display list from every found manager (not
          // just the deduped ones) so the cards mirror the People result view.
          const managerCards = response.hiringManagers.map((manager: any) => {
            const managerEmail = manager.Email || manager.email || manager.WorkEmail || manager.work_email || '';
            const key = managerEmail.toLowerCase();
            const draftInfo = key ? draftMap.get(key) : undefined;
            const emailInfo = key ? emailMap.get(key) : undefined;
            const sentInfo = key ? sentMap.get(key) : undefined;
            const fullName = `${manager.FirstName || manager.firstName || manager.first_name || ''} ${manager.LastName || manager.lastName || manager.last_name || ''}`.trim();
            return {
              name: fullName || managerEmail || 'Hiring manager',
              title: manager.Title || manager.title || manager.jobTitle || manager.job_title || '',
              company: manager.Company || manager.company || companyName,
              email: managerEmail,
              linkedin: manager.LinkedIn || manager.linkedin || manager.linkedinUrl || manager.linkedin_url || '',
              gmailDraftUrl: draftInfo?.draft_url || '',
              gmailDraftId: draftInfo?.draft_id || '',
              emailSubject: emailInfo?.subject || '',
              emailSent: !!sentInfo,
            };
          });
          setFoundManagers(managerCards);

          console.log('📋 Converted to Firebase format:', JSON.stringify(firebaseRecruiters, null, 2));

          // Check for duplicates before saving
          const existingRecruiters = await firebaseApi.getRecruiters(user.uid);
          const existingEmails = new Set(existingRecruiters.map(r => r.email).filter(Boolean));
          const existingLinkedIns = new Set(existingRecruiters.map(r => r.linkedinUrl).filter(Boolean));

          const newRecruiters = firebaseRecruiters.filter(r => {
            const hasEmail = r.email && existingEmails.has(r.email);
            const hasLinkedIn = r.linkedinUrl && existingLinkedIns.has(r.linkedinUrl);
            return !hasEmail && !hasLinkedIn;
          });

          console.log('💾 About to save these recruiters:', newRecruiters.length, JSON.stringify(newRecruiters, null, 2));

          if (newRecruiters.length > 0) {
            await firebaseApi.bulkCreateRecruiters(user.uid, newRecruiters);
            console.log(`✅ Saved ${newRecruiters.length} hiring manager(s) to tracker`);
          } else {
            console.log('⚠️ All hiring managers were duplicates, nothing saved');
          }
        } catch (error) {
          console.error('Error saving hiring managers to tracker:', error);
          toast({
            title: "Error saving to tracker",
            description: "Hiring managers were found but couldn't be saved. Please try again.",
            variant: "destructive",
          });
        }
      } else {
        console.log('⚠️ No hiring managers in response to save');
      }

      // Show success message
      const foundCount = response.hiringManagers?.length || 0;
      const savedCount = response.hiringManagers?.length || 0;
      setManagersFound(foundCount);

      if (foundCount > 0) {
        const sentCount = response.sentEmails?.length || 0;
        const draftCount = response.draftsCreated?.length || 0;
        let description = `${savedCount} saved to tracker.`;
        if (sentCount > 0) {
          description = `${savedCount} saved to tracker. ${sentCount} ${sentCount === 1 ? 'email' : 'emails'} sent from your Gmail.`;
        } else if (draftCount > 0) {
          description = `${savedCount} saved to tracker. Draft emails saved to your Gmail.`;
        }
        toast({
          title: `Found ${foundCount} hiring manager${foundCount !== 1 ? 's' : ''}!`,
          description,
        });
      } else {
        const fallbackMsg = (response as any).fallback_message || (response as any).fallbackMessage || "";
        toast({
          title: "No hiring managers found",
          description: fallbackMsg || "Try adjusting your search criteria or company name.",
          variant: "default",
          duration: 7000,
        });
        // Store suggestions for UI rendering
        if ((response as any).suggestions?.length) {
          setHmSuggestions((response as any).suggestions);
        }
      }

      setIsSearching(false);
      setSearchComplete(true);
    } catch (error) {
      clearInterval(progressInterval);
      setIsSearching(false);
      const errorMessage = error instanceof Error ? error.message : 'Failed to find hiring managers';
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  // Auto-trigger the search after a chip prefills the form. The chip click
  // sets `pendingAutoSearch` and updates form state; on the next render this
  // effect runs once `canSearch` flips true.
  useEffect(() => {
    if (pendingAutoSearch.current && canSearch && user) {
      pendingAutoSearch.current = false;
      handleFindHiringManagers();
    }
  }, [jobPostingUrl, jobDescription, savedResumeUrl, user, canSearch]);

  // On a successful search, scroll the result cards into view so the user lands
  // on them inline (mirrors the People tab; there is no interstitial modal).
  useEffect(() => {
    if (foundManagers.length > 0 && !isSearching && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [foundManagers.length, isSearching]);

  const embeddedContent = (
    <>
          <ProGate title="Find Hiring Manager" description="Find the recruiters and hiring managers behind any job posting. Paste a URL and get direct contact info in seconds." videoId="TIERqtjc1tk">
          <main className="px-3 py-6 sm:px-6 sm:py-12" style={{ background: '#FFFFFF', flex: 1, overflowY: 'auto', paddingBottom: '96px' }}>
            <div>

              {/* Header Section — only when standalone */}
              {!embedded && (
              <div className="w-full px-3 py-6 sm:px-6 sm:py-12 !pb-0" style={{ maxWidth: '900px', margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <VideoDemo videoId="TIERqtjc1tk" />
                </div>
              </div>
              )}

              {/* Main Content Area */}
              <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">

                  {/* TAB 1: Find Hiring Managers */}
                  <TabsContent value="find-hiring-managers" className="mt-0">
                    <div style={{ padding: '0 32px 0', maxWidth: '860px' }}>
                      <input
                        type="file"
                        accept={ACCEPTED_RESUME_TYPES.accept}
                        onChange={handleFileUpload}
                        className="hidden"
                        ref={fileInputRef}
                        disabled={isSearching || isUploadingResume}
                      />

                      {/* Job URL input — shared search-box shell (matches Find People) */}
                      <div style={{ marginTop: 20, marginBottom: 16 }}>
                        {/* Outreach mode picker, same component and contract as
                            the People tab. Governs both entry points (paste-URL
                            here and job-board card auto-search). */}
                        <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'flex-start' }}>
                          <SearchModeSelector
                            tier={userTier}
                            value={outreachMode}
                            onChange={setOutreachMode}
                            disabled={isSearching}
                          />
                        </div>
                        <SendConfirmDialog
                          open={showSendConfirm}
                          count={estimatedManagers}
                          loading={isSearching}
                          onCancel={() => setShowSendConfirm(false)}
                          onConfirm={() => {
                            setShowSendConfirm(false);
                            handleFindHiringManagers(true);
                          }}
                        />
                        <SearchPromptBox
                          helper={null}
                          onSubmit={() => handleFindHiringManagers()}
                          submitDisabled={!canSearch}
                          inputValue={jobPostingUrl}
                          submitAriaLabel="Find hiring managers"
                          submitIcon={isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
                        >
                          {/* link icon + URL input */}
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, paddingRight: 40 }}>
                            <Link style={{ width: 16, height: 16, flexShrink: 0, color: '#3B82F6', marginTop: 2 }} />
                            <input
                              type="url"
                              value={jobPostingUrl}
                              onChange={(e) => {
                                setJobPostingUrl(e.target.value);
                                if (e.target.value.trim()) {
                                  setShowManualEntry(false);
                                }
                              }}
                              placeholder="Paste a job posting URL (LinkedIn, Greenhouse, Lever, etc.)"
                              disabled={isSearching || hmDemoActive}
                              style={{
                                flex: 1,
                                border: 'none',
                                background: 'none',
                                fontSize: 14,
                                color: '#0F172A',
                                outline: 'none',
                                fontFamily: 'inherit',
                                lineHeight: 1.5,
                              }}
                            />
                            {jobPostingUrl && isValidUrl(jobPostingUrl) && (
                              <CheckCircle style={{ width: 15, height: 15, flexShrink: 0, color: '#22C55E', marginTop: 2 }} />
                            )}
                          </div>
                        </SearchPromptBox>
                      </div>

                      {/* Found hiring managers, rendered as Find-People-style
                          result cards. Mirrors the People result view: an
                          identity row with a per-card Gmail action, plus a
                          shared footer trio (Open Gmail drafts / See in inbox /
                          See in spreadsheet). */}
                      {foundManagers.length > 0 && (
                        <div ref={resultsRef} style={{ marginTop: 8, marginBottom: 16 }}>
                          {foundManagers.map((m: any, i: number) => {
                            const initials = (m.name || '').split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();
                            const linkedinHref = m.linkedin
                              ? (m.linkedin.startsWith('http') ? m.linkedin : `https://${m.linkedin}`)
                              : '';
                            const gmailHref = m.gmailDraftUrl || 'https://mail.google.com/mail/u/0/#drafts';
                            return (
                              <div
                                key={i}
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  padding: '11px 13px',
                                  background: '#fff',
                                  border: '0.5px solid #E2E8F0',
                                  borderRadius: 3,
                                  marginBottom: 6,
                                  transition: 'all .12s',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                                  <div style={{
                                    width: 34,
                                    height: 34,
                                    borderRadius: '50%',
                                    background: 'rgba(74,96,168,0.10)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color: '#0F172A',
                                    flexShrink: 0,
                                  }}>
                                    {initials}
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 500, color: '#0F172A' }}>{m.name}</div>
                                    <div style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }}>
                                      {[m.title, m.company].filter(Boolean).join(' at ')}
                                    </div>
                                    {m.email && (
                                      <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{m.email}</div>
                                    )}
                                    {m.emailSubject && (
                                      <div style={{ fontSize: 11, color: '#6B7280', marginTop: 3, lineHeight: 1.3 }}>{m.emailSubject}</div>
                                    )}
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                                    <ResultActionButton
                                      variant="secondary"
                                      size="sm"
                                      className="text-st-accent hover:text-st-accent font-semibold"
                                      href={m.demo ? undefined : gmailHref}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e: React.MouseEvent) => {
                                        if (m.demo) e.preventDefault();
                                      }}
                                    >
                                      <Mail style={{ width: 13, height: 13 }} /> View in Gmail
                                    </ResultActionButton>
                                    {linkedinHref && (
                                      <ResultActionButton
                                        variant="secondary"
                                        size="sm"
                                        href={linkedinHref}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        <Linkedin style={{ width: 14, height: 14 }} /> LinkedIn
                                      </ResultActionButton>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}

                          {/* Shared footer trio, mirroring the People result view. */}
                          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                            {foundManagers.some((m: any) => m.gmailDraftUrl && !m.emailSent) && (
                              <ResultActionButton
                                variant="primary"
                                href="https://mail.google.com/mail/u/0/#drafts"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1"
                              >
                                <Mail className="w-3.5 h-3.5" />
                                Open Gmail drafts
                              </ResultActionButton>
                            )}
                            <ResultActionButton
                              variant="secondary"
                              onClick={() => {
                                // Inert during the tour's hiring-manager demo —
                                // the seeded card isn't a real contact, so
                                // navigating to /outbox would land on nothing.
                                if (foundManagers.some((m: any) => m.demo)) return;
                                // Same deep-link mechanism as the People card.
                                // Manually drafted HMs are now logged to the
                                // outbox at draft time by find_hiring_manager_endpoint
                                // (shared upsert_hm_outbox_contact), so the target
                                // contact exists and the segment switch + refetch
                                // land on it.
                                const focusEmail = foundManagers.find((m: any) => m.email)?.email || undefined;
                                navigate('/outbox', { state: { focusEmail, segment: 'hiringManagers' } });
                              }}
                              className="flex-1"
                            >
                              <Inbox className="w-3.5 h-3.5" />
                              See in inbox
                            </ResultActionButton>
                            <ResultActionButton
                              variant="secondary"
                              onClick={() => {
                                if (foundManagers.some((m: any) => m.demo)) return;
                                navigate('/my-network/managers');
                              }}
                              className="flex-1"
                            >
                              <Users className="w-3.5 h-3.5" />
                              See in spreadsheet
                            </ResultActionButton>
                          </div>
                        </div>
                      )}

                      {/* Job/recommendation cards — below search box, like People tab */}
                      {!jobPostingUrl.trim() && !isSearching && (() => {
                        const hasJobs = recentJobs.length > 0;
                        const hasRecs = recommendations.length > 0;
                        if (!hasJobs && !hasRecs) return null;

                        if (chipsCollapsed) {
                          return (
                            <button
                              onClick={() => setChipsCollapsed(false)}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                padding: '4px 10px', fontSize: 11, color: 'var(--warm-ink-tertiary, #9C9590)',
                                background: 'none', border: '1px solid var(--warm-border, #E8E4DE)', borderRadius: 100,
                                cursor: 'pointer', transition: 'all .12s', fontFamily: 'inherit',
                                marginBottom: 16,
                              }}
                              onMouseEnter={e => { e.currentTarget.style.color = '#3B82F6'; e.currentTarget.style.borderColor = '#3B82F6'; }}
                              onMouseLeave={e => { e.currentTarget.style.color = 'var(--warm-ink-tertiary, #9C9590)'; e.currentTarget.style.borderColor = 'var(--warm-border, #E8E4DE)'; }}
                            >
                              Suggestions
                              <ChevronDown style={{ width: 12, height: 12 }} />
                            </button>
                          );
                        }

                        return (
                          <div style={{ marginTop: 24 }}>
                            {/* Header row */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{
                                fontSize: 10, fontWeight: 500, color: 'var(--ink-3, #8A8F9A)',
                                letterSpacing: '0.14em', textTransform: 'uppercase' as const,
                                fontFamily: "'Libre Baskerville', Georgia, serif",
                                display: 'flex', alignItems: 'center',
                              }}>
                                {hasJobs ? 'From your job board' : 'Recommended for you'}
                              </span>
                              <button
                                onClick={() => setChipsCollapsed(true)}
                                style={{
                                  fontSize: 11, color: 'var(--warm-ink-tertiary, #9C9590)', background: 'none', border: 'none',
                                  cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex',
                                  alignItems: 'center', gap: 3, padding: 0,
                                }}
                                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#3B82F6'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--warm-ink-tertiary, #9C9590)'; }}
                              >
                                Collapse
                                <ChevronUp style={{ width: 12, height: 12 }} />
                              </button>
                            </div>

                            {/* Subtitle */}
                            <div style={{ fontSize: 11.5, color: 'var(--warm-ink-secondary, #6B6560)', marginBottom: 14 }}>
                              {hasJobs ? 'Click a role to find the hiring manager behind it' : 'Click a company to find hiring managers there'}
                            </div>

                            {/* Horizontal scroll card row */}
                            <div
                              style={{
                                display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 6,
                                scrollbarWidth: 'none',
                              }}
                            >
                              {hasJobs ? (
                                recentJobs.map((job, idx) => {
                                  const domainGuess = job.company.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
                                  const logoUrl = job.employer_logo || getCompanyLogoUrl(job.company) || `https://www.google.com/s2/favicons?domain=${domainGuess}&sz=128`;
                                  const initial = job.company.charAt(0).toUpperCase();

                                  return (
                                    <button
                                      key={job.job_id}
                                      type="button"
                                      onClick={() => {
                                        setJobPostingUrl(job.apply_url);
                                        setCompany(job.company);
                                        setJobTitle(job.title);
                                        setLocation(locationToText(job.location));
                                        setChipsCollapsed(true);
                                        pendingAutoSearch.current = true;
                                      }}
                                      className="suggestion-row-enter"
                                      style={{
                                        flex: '0 0 160px', width: 160,
                                        borderRadius: 16, overflow: 'hidden',
                                        background: 'var(--elev, #FFFFFF)',
                                        border: '1px solid var(--line, #E8E8E8)',
                                        cursor: 'pointer', textAlign: 'left',
                                        transition: 'all .2s ease',
                                        fontFamily: 'inherit', padding: 0,
                                        boxShadow: 'inset 0 -1px 0 var(--line, #E8E8E8), 0 1px 2px rgba(26,29,35,0.03)',
                                        animationDelay: `${idx * 60}ms`,
                                      }}
                                      onMouseEnter={e => {
                                        const el = e.currentTarget as HTMLButtonElement;
                                        el.style.borderColor = 'var(--accent, #4A60A8)';
                                        el.style.boxShadow = 'inset 0 -1px 0 var(--line, #E8E8E8), 0 2px 6px rgba(26,29,35,0.06)';
                                        el.style.transform = 'translateY(-1px)';
                                      }}
                                      onMouseLeave={e => {
                                        const el = e.currentTarget as HTMLButtonElement;
                                        el.style.borderColor = 'var(--line, #E8E8E8)';
                                        el.style.boxShadow = 'inset 0 -1px 0 var(--line, #E8E8E8), 0 1px 2px rgba(26,29,35,0.03)';
                                        el.style.transform = 'translateY(0)';
                                      }}
                                    >
                                      <div style={{ padding: '12px 14px 14px' }}>
                                        <div style={{ marginBottom: 10 }}>
                                          {logoUrl ? (
                                            <img
                                              src={logoUrl}
                                              alt=""
                                              style={{
                                                width: 32, height: 32, borderRadius: 3,
                                                objectFit: 'contain', background: 'var(--paper-2, #FAFAF8)',
                                              }}
                                              onError={e => {
                                                (e.currentTarget as HTMLImageElement).style.display = 'none';
                                                const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                                                if (fallback) fallback.style.display = 'flex';
                                              }}
                                            />
                                          ) : null}
                                          <div style={{
                                            width: 32, height: 32, borderRadius: 3,
                                            background: 'var(--paper-2, #FAFAF8)',
                                            color: 'var(--ink-2, #4A5058)',
                                            fontSize: 13, fontWeight: 600,
                                            display: logoUrl ? 'none' : 'flex',
                                            alignItems: 'center', justifyContent: 'center',
                                          }}>
                                            {initial}
                                          </div>
                                        </div>

                                        <div style={{
                                          fontSize: 13.5, fontWeight: 500, color: '#1A1714',
                                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                          marginBottom: 4,
                                        }}>
                                          {job.company}
                                        </div>

                                        <div style={{
                                          fontSize: 11, color: 'var(--ink-2, #4A4F5B)', lineHeight: 1.4,
                                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                                          overflow: 'hidden', minHeight: 30,
                                          marginBottom: (job.match_score && job.match_score > 0) || job.location ? 6 : 10,
                                        }}>
                                          {job.title}
                                        </div>

                                        {((job.match_score && job.match_score > 0) || job.location) && (
                                          <div style={{
                                            fontSize: 11, padding: '6px 8px',
                                            background: 'var(--paper, #FFFFFF)',
                                            borderLeft: '2px solid var(--accent, #1B2A44)',
                                            borderRadius: '0 4px 4px 0',
                                            marginBottom: 10,
                                            lineHeight: 1.4,
                                          }}>
                                            {job.match_score && job.match_score > 0 && (
                                              <>
                                                <span style={{
                                                  fontFamily: "'JetBrains Mono', monospace",
                                                  fontWeight: 600,
                                                  color: 'var(--accent, #1B2A44)',
                                                }}>
                                                  {job.match_score}%
                                                </span>
                                                {' '}
                                                <span style={{ color: 'var(--ink-2, #4A4F5B)' }}>match</span>
                                              </>
                                            )}
                                            {job.match_score && job.match_score > 0 && job.location && (
                                              <span style={{ color: 'var(--ink-3, #8A8F9A)', margin: '0 4px' }}>&middot;</span>
                                            )}
                                            {job.location && locationToText(job.location) && (
                                              <em style={{
                                                fontFamily: "'Instrument Serif', Georgia, serif",
                                                fontStyle: 'italic',
                                                color: 'var(--ink-2, #4A4F5B)',
                                              }}>
                                                {locationToText(job.location)}
                                              </em>
                                            )}
                                          </div>
                                        )}

                                        <div style={{
                                          fontSize: 11, color: 'var(--accent, #4A60A8)', fontWeight: 500,
                                          display: 'flex', alignItems: 'center', gap: 4,
                                        }}>
                                          Find hiring manager
                                          <ArrowRight style={{ width: 11, height: 11, opacity: 0.7 }} />
                                        </div>
                                      </div>
                                    </button>
                                  );
                                })
                              ) : (
                                recommendations.slice(0, 8).map((rec, idx) => {
                                  const logoUrl = getCompanyLogoUrl(rec.company);
                                  const initial = rec.company.charAt(0).toUpperCase();

                                  return (
                                    <button
                                      key={rec.company}
                                      type="button"
                                      onClick={() => {
                                        setCompany(rec.company);
                                        setShowManualEntry(true);
                                        setChipsCollapsed(true);
                                      }}
                                      className="suggestion-row-enter"
                                      style={{
                                        flex: '0 0 160px', width: 160,
                                        borderRadius: 16, overflow: 'hidden',
                                        background: 'var(--elev, #FFFFFF)',
                                        border: '1px solid var(--line, #E8E8E8)',
                                        cursor: 'pointer', textAlign: 'left',
                                        transition: 'all .2s ease',
                                        fontFamily: 'inherit', padding: 0,
                                        boxShadow: 'inset 0 -1px 0 var(--line, #E8E8E8), 0 1px 2px rgba(26,29,35,0.03)',
                                        animationDelay: `${idx * 60}ms`,
                                      }}
                                      onMouseEnter={e => {
                                        const el = e.currentTarget as HTMLButtonElement;
                                        el.style.borderColor = 'var(--accent, #4A60A8)';
                                        el.style.boxShadow = 'inset 0 -1px 0 var(--line, #E8E8E8), 0 2px 6px rgba(26,29,35,0.06)';
                                        el.style.transform = 'translateY(-1px)';
                                      }}
                                      onMouseLeave={e => {
                                        const el = e.currentTarget as HTMLButtonElement;
                                        el.style.borderColor = 'var(--line, #E8E8E8)';
                                        el.style.boxShadow = 'inset 0 -1px 0 var(--line, #E8E8E8), 0 1px 2px rgba(26,29,35,0.03)';
                                        el.style.transform = 'translateY(0)';
                                      }}
                                    >
                                      <div style={{ padding: '12px 14px 14px' }}>
                                        <div style={{ marginBottom: 10 }}>
                                          {logoUrl ? (
                                            <img
                                              src={logoUrl}
                                              alt=""
                                              style={{
                                                width: 32, height: 32, borderRadius: 3,
                                                objectFit: 'contain', background: 'var(--paper-2, #FAFAF8)',
                                              }}
                                              onError={e => {
                                                (e.currentTarget as HTMLImageElement).style.display = 'none';
                                                const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                                                if (fallback) fallback.style.display = 'flex';
                                              }}
                                            />
                                          ) : null}
                                          <div style={{
                                            width: 32, height: 32, borderRadius: 3,
                                            background: 'var(--paper-2, #FAFAF8)',
                                            color: 'var(--ink-2, #4A5058)',
                                            fontSize: 13, fontWeight: 600,
                                            display: logoUrl ? 'none' : 'flex',
                                            alignItems: 'center', justifyContent: 'center',
                                          }}>
                                            {initial}
                                          </div>
                                        </div>

                                        <div style={{
                                          fontSize: 13.5, fontWeight: 500, color: '#1A1714',
                                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                          marginBottom: 4,
                                        }}>
                                          {rec.company}
                                        </div>

                                        <div style={{
                                          fontSize: 11, color: 'var(--ink-2, #4A4F5B)', lineHeight: 1.4,
                                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                                          overflow: 'hidden', minHeight: 30,
                                          marginBottom: rec.reasoning ? 6 : 10,
                                        }}>
                                          {rec.reason}
                                        </div>

                                        {rec.reasoning && (
                                          <div style={{
                                            fontSize: 11, padding: '6px 8px',
                                            background: 'var(--paper, #FFFFFF)',
                                            borderLeft: '2px solid var(--accent, #1B2A44)',
                                            borderRadius: '0 4px 4px 0',
                                            marginBottom: 10,
                                            lineHeight: 1.4,
                                          }}>
                                            <span style={{
                                              fontFamily: "'JetBrains Mono', monospace",
                                              fontWeight: 600,
                                              color: 'var(--accent, #1B2A44)',
                                            }}>
                                              {rec.reasoning.primary.number}
                                            </span>
                                            {' '}
                                            <span style={{ color: 'var(--ink-2, #4A4F5B)' }}>
                                              {rec.reasoning.primary.label}
                                            </span>
                                            {rec.reasoning.qualifier && (
                                              <>
                                                <span style={{ color: 'var(--ink-3, #8A8F9A)', margin: '0 4px' }}>&middot;</span>
                                                <em style={{
                                                  fontFamily: "'Instrument Serif', Georgia, serif",
                                                  fontStyle: 'italic',
                                                  color: 'var(--ink-2, #4A4F5B)',
                                                }}>
                                                  {rec.reasoning.qualifier}
                                                </em>
                                              </>
                                            )}
                                          </div>
                                        )}

                                        <div style={{
                                          fontSize: 11, color: 'var(--accent, #4A60A8)', fontWeight: 500,
                                          display: 'flex', alignItems: 'center', gap: 4,
                                        }}>
                                          Find hiring manager
                                          <ArrowRight style={{ width: 11, height: 11, opacity: 0.7 }} />
                                        </div>
                                      </div>
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Credit cost pill */}
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--warm-ink-secondary, #6B6560)' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '2px 8px', borderRadius: 3,
                            background: 'var(--warm-surface, #FAF9F6)', border: '1px solid var(--warm-border, #E8E4DE)',
                            fontWeight: 500, color: '#0F172A', fontSize: 12,
                          }}>
                            {15 * estimatedManagers} credits
                          </span>
                          <span>· finds ~{estimatedManagers} hiring managers</span>
                        </div>
                      </div>

                      {/* Manual entry toggle */}
                      <div style={{ marginBottom: 14 }}>
                        <button
                          type="button"
                          onClick={() => setShowManualEntry(!showManualEntry)}
                          style={{
                            fontSize: 12,
                            fontWeight: 500,
                            color: 'var(--warm-ink-secondary, #6B6560)',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                          }}
                        >
                          {showManualEntry ? <ChevronUp style={{ width: 13, height: 13 }} /> : <ChevronDown style={{ width: 13, height: 13 }} />}
                          {showManualEntry ? 'Hide manual entry' : 'Or enter details manually'}
                        </button>
                      </div>

                      {/* Manual Entry Section - Collapsible */}
                      {showManualEntry && !jobPostingUrl && (
                        <div style={{ marginBottom: 16, paddingTop: 16, borderTop: '1px solid var(--warm-border, #E8E4DE)' }}>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                            <div>
                              <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--warm-ink-secondary, #6B6560)', marginBottom: 4 }}>Company</label>
                              <input
                                type="text"
                                value={company}
                                onChange={(e) => setCompany(e.target.value)}
                                placeholder="e.g. Google"
                                disabled={isSearching}
                                style={{
                                  width: '100%',
                                  padding: '8px 12px',
                                  border: '1.5px solid var(--warm-border, #E8E4DE)',
                                  borderRadius: 8,
                                  fontSize: 13,
                                  color: '#0F172A',
                                  background: 'var(--warm-surface, #FAF9F6)',
                                  outline: 'none',
                                  fontFamily: 'inherit',
                                }}
                              />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--warm-ink-secondary, #6B6560)', marginBottom: 4 }}>Job Title</label>
                              <input
                                type="text"
                                value={jobTitle}
                                onChange={(e) => setJobTitle(e.target.value)}
                                placeholder="e.g. Product Manager"
                                disabled={isSearching}
                                style={{
                                  width: '100%',
                                  padding: '8px 12px',
                                  border: '1.5px solid var(--warm-border, #E8E4DE)',
                                  borderRadius: 8,
                                  fontSize: 13,
                                  color: '#0F172A',
                                  background: 'var(--warm-surface, #FAF9F6)',
                                  outline: 'none',
                                  fontFamily: 'inherit',
                                }}
                              />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--warm-ink-secondary, #6B6560)', marginBottom: 4 }}>Location</label>
                              <input
                                type="text"
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                                placeholder="e.g. New York, NY"
                                disabled={isSearching}
                                style={{
                                  width: '100%',
                                  padding: '8px 12px',
                                  border: '1.5px solid var(--warm-border, #E8E4DE)',
                                  borderRadius: 8,
                                  fontSize: 13,
                                  color: '#0F172A',
                                  background: 'var(--warm-surface, #FAF9F6)',
                                  outline: 'none',
                                  fontFamily: 'inherit',
                                }}
                              />
                            </div>
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--warm-ink-secondary, #6B6560)', marginBottom: 4 }}>
                              Job Description <span style={{ color: '#EF4444' }}>*</span>
                            </label>
                            <textarea
                              value={jobDescription}
                              onChange={(e) => setJobDescription(e.target.value)}
                              placeholder="Paste the job description or role summary here."
                              rows={4}
                              disabled={isSearching}
                              style={{
                                width: '100%',
                                padding: '10px 12px',
                                border: '1.5px solid var(--warm-border, #E8E4DE)',
                                borderRadius: 8,
                                fontSize: 13,
                                color: '#0F172A',
                                background: 'var(--warm-surface, #FAF9F6)',
                                outline: 'none',
                                resize: 'none',
                                fontFamily: 'inherit',
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Resume status — subtle text line below CTA */}
                      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10, marginBottom: 8 }}>
                        {savedResumeUrl && savedResumeFileName ? (
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isSearching || isUploadingResume}
                            style={{
                              fontSize: 11,
                              color: 'var(--warm-ink-tertiary, #9C9590)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              cursor: 'pointer',
                              background: 'none',
                              border: 'none',
                              fontFamily: 'inherit',
                            }}
                          >
                            <CheckCircle style={{ width: 11, height: 11, color: '#22C55E' }} />
                            Resume: <span style={{ fontWeight: 500 }}>{savedResumeFileName}</span>
                            <span style={{ color: 'var(--accent, #1B2A44)', marginLeft: 2 }}>
                              {isUploadingResume ? 'Uploading...' : '· Change'}
                            </span>
                          </button>
                        ) : (
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                              fontSize: 11,
                              color: 'var(--warm-ink-tertiary, #9C9590)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              cursor: 'pointer',
                              background: 'none',
                              border: 'none',
                              fontFamily: 'inherit',
                            }}
                          >
                            <Upload style={{ width: 11, height: 11 }} />
                            {isUploadingResume ? 'Uploading...' : 'Upload resume (required for personalized emails)'}
                          </button>
                        )}
                      </div>

                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </main>
          </ProGate>

        {/* Loading Modal */}
        {isSearching && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-[3px] p-8 max-w-md text-center">
              <div className="w-16 h-16 bg-[#FAFBFF] rounded-[3px] flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-[#0F172A] animate-pulse" />
              </div>
              <h3 className="text-xl font-semibold text-[#0F172A] mb-2" style={{ fontFamily: "'Lora', Georgia, serif" }}>Finding hiring managers...</h3>
              <p className="text-[#6B7280] mb-4">
                {jobPostingUrl
                  ? "Analyzing the job posting and identifying decision makers"
                  : `Searching for hiring managers at ${company}`
                }
              </p>
              <div className="w-full bg-[#E2E8F0] rounded-[3px] h-2">
                <div
                  className="bg-[#3B82F6] h-2 rounded-[3px] transition-all duration-300"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <p className="text-sm text-[#6B7280] mt-3">This usually takes 15-30 seconds</p>
            </div>
          </div>
        )}

        {/* Fallback suggestions when no HMs found */}
        {searchComplete && managersFound === 0 && hmSuggestions.length > 0 && (
          <div style={{ margin: '16px 32px', padding: '14px 18px', background: 'rgba(59,130,246,0.04)', border: '1px solid #E2E8F0', borderRadius: 8 }}>
            <p style={{ fontSize: 13, color: '#374151', marginBottom: 10 }}>No direct hiring managers found. Try one of these alternatives:</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {hmSuggestions.map((s: any, i: number) => (
                <button
                  key={i}
                  onClick={() => {
                    if (s.type === 'switch_tab' && s.prefill?.company) {
                      navigate(`/find?tab=hiring-managers&company=${encodeURIComponent(s.prefill.company)}`);
                    }
                  }}
                  style={{
                    padding: '7px 14px',
                    background: '#fff',
                    border: '1px solid #BFDBFE',
                    borderRadius: 6,
                    fontSize: 13,
                    color: '#2563EB',
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

      {/* Mobile-only CSS overrides */}
      <style>{`
        @media (max-width: 768px) {
          /* 1. PAGE/BODY LEVEL - Prevent horizontal overflow */
          html, body {
            overflow-x: hidden;
            max-width: 100vw;
          }

          .recruiter-search-page {
            overflow-x: hidden;
            max-width: 100vw;
          }

          /* 2. ALL MAIN CONTENT CONTAINERS */
          .recruiter-search-container {
            max-width: 100vw;
            width: 100%;
            box-sizing: border-box;
            padding-left: 16px;
            padding-right: 16px;
          }

          /* 3. HEADER SECTION - Ensure padding so text doesn't touch edges */
          .recruiter-search-header {
            padding-left: 16px;
            padding-right: 16px;
            box-sizing: border-box;
          }

          .recruiter-search-title {
            word-wrap: break-word;
            overflow-wrap: break-word;
            font-size: 1.75rem !important;
          }

          .recruiter-search-subtitle {
            word-wrap: break-word;
            overflow-wrap: break-word;
            font-size: 0.875rem !important;
          }

          /* 4. TAB BARS - Ensure doesn't overflow */
          .recruiter-search-tabs {
            max-width: 100%;
            width: 100%;
            overflow-x: auto;
            overflow-y: hidden;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            -ms-overflow-style: none;
            padding: 8px !important;
            justify-content: flex-start;
          }

          .recruiter-search-tabs::-webkit-scrollbar {
            display: none;
          }

          .recruiter-search-tabs button {
            min-width: fit-content;
            min-height: 44px;
            flex-shrink: 0;
            white-space: nowrap;
          }

          /* 5. FORM CARDS - Full width with proper padding */
          .recruiter-search-form-card {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
          }

          .recruiter-search-form-content {
            padding: 16px !important;
            box-sizing: border-box;
          }

          /* 6. ALL CHILD ELEMENTS - Ensure no fixed widths exceed viewport */
          .recruiter-search-page * {
            max-width: 100%;
            box-sizing: border-box;
          }

          .recruiter-search-page img,
          .recruiter-search-page .recruiter-search-form-card,
          .recruiter-search-page button,
          .recruiter-search-page input,
          .recruiter-search-page textarea,
          .recruiter-search-page select {
            max-width: 100%;
            box-sizing: border-box;
          }

          /* Prevent text overflow */
          .recruiter-search-page p,
          .recruiter-search-page h1,
          .recruiter-search-page h2,
          .recruiter-search-page h3,
          .recruiter-search-page span,
          .recruiter-search-page label {
            word-wrap: break-word;
            overflow-wrap: break-word;
            hyphens: auto;
          }
        }
      `}</style>

    </>
  );

  if (embedded) {
    return embeddedContent;
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full text-foreground">
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title="" />
          {embeddedContent}
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
};

export default RecruiterSpreadsheetPage;