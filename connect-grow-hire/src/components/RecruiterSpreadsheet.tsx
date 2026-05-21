import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from "@/components/ui/input";
import {
  Mail,
  Search,
  RefreshCw,
  Trash2,
  ExternalLink,
  Download,
} from "lucide-react";
import { LoadingSkeleton } from "./LoadingSkeleton";
import { useNavigate } from "react-router-dom";
import { useFirebaseAuth } from '../contexts/FirebaseAuthContext';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { firebaseApi } from '../services/firebaseApi';
import type { Recruiter } from '../services/firebaseApi';
import { toast } from "@/hooks/use-toast";

const STATUS_OPTIONS = [
  { value: 'Not Contacted', color: '#6B7280', label: 'Not Contacted', bg: '#F3F4F6' },
  { value: 'Contacted', color: '#2563EB', label: 'Contacted', bg: '#EFF6FF' },
  { value: 'Followed Up', color: '#7C3AED', label: 'Followed Up', bg: '#F5F3FF' },
  { value: 'Responded', color: '#059669', label: 'Responded', bg: '#ECFDF5' },
  { value: 'Call Scheduled', color: '#D97706', label: 'Call Scheduled', bg: '#FFFBEB' },
  { value: 'Rejected', color: '#DC2626', label: 'Rejected', bg: '#FEF2F2' },
  { value: 'Hired', color: '#059669', label: 'Hired', bg: '#ECFDF5' }
];

const REC_COLS = [
  { key: 'name', letter: 'A', label: 'Recruiter', width: '14%' },
  { key: 'linkedin', letter: 'B', label: 'LinkedIn', width: '8%' },
  { key: 'email', letter: 'C', label: 'Email', width: '16%' },
  { key: 'company', letter: 'D', label: 'Company', width: '14%' },
  { key: 'jobTitle', letter: 'E', label: 'Title', width: '14%' },
  { key: 'associatedJob', letter: 'F', label: 'Job', width: '14%' },
  { key: 'status', letter: 'G', label: 'Status', width: '10%' },
] as const;

const RecruiterSpreadsheet: React.FC = () => {
  const navigate = useNavigate();
  const { user: currentUser } = useFirebaseAuth();

  const [recruiters, setRecruiters] = useState<Recruiter[]>([]);
  const [filteredRecruiters, setFilteredRecruiters] = useState<Recruiter[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ row: number; col: string } | null>(null);
  const [mailAppDialogOpen, setMailAppDialogOpen] = useState(false);
  const [selectedRecruiterForEmail, setSelectedRecruiterForEmail] = useState<Recruiter | null>(null);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [activeCell, setActiveCell] = useState<{ rowId: string; col: string } | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Track pending saves to prevent data loss
  const [pendingSaves, setPendingSaves] = useState<Set<string>>(new Set());
  const [saveQueue, setSaveQueue] = useState<Map<string, { recruiterId: string; field: keyof Recruiter; value: string }>>(new Map());
  const saveTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const isUnmountingRef = useRef(false);

  // Swipe hint state
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);

  const normalizeFromServer = (serverRecruiter: any): Recruiter => ({
    id: serverRecruiter.id,
    firstName: serverRecruiter.firstName || serverRecruiter.first_name || '',
    lastName: serverRecruiter.lastName || serverRecruiter.last_name || '',
    linkedinUrl: serverRecruiter.linkedinUrl || serverRecruiter.linkedin_url || '',
    email: serverRecruiter.email || '',
    company: serverRecruiter.company || '',
    jobTitle: serverRecruiter.jobTitle || serverRecruiter.job_title || '',
    location: serverRecruiter.location || '',
    phone: serverRecruiter.phone || '',
    workEmail: serverRecruiter.workEmail || serverRecruiter.work_email || '',
    personalEmail: serverRecruiter.personalEmail || serverRecruiter.personal_email || '',
    associatedJobId: serverRecruiter.associatedJobId || serverRecruiter.associated_job_id,
    associatedJobTitle: serverRecruiter.associatedJobTitle || serverRecruiter.associated_job_title,
    associatedJobUrl: serverRecruiter.associatedJobUrl || serverRecruiter.associated_job_url,
    dateAdded: serverRecruiter.dateAdded || serverRecruiter.date_added || new Date().toISOString(),
    status: serverRecruiter.status || 'Not Contacted',
    createdAt: serverRecruiter.createdAt || serverRecruiter.created_at,
    updatedAt: serverRecruiter.updatedAt || serverRecruiter.updated_at,
    // Gmail draft tracking fields
    gmailMessageId: serverRecruiter.gmailMessageId || serverRecruiter.gmail_message_id,
    gmailDraftId: serverRecruiter.gmailDraftId || serverRecruiter.gmail_draft_id,
    gmailDraftUrl: serverRecruiter.gmailDraftUrl || serverRecruiter.gmail_draft_url,
  });

  const loadRecruiters = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      if (currentUser) {
        console.log('[RecruiterFetch] Fetching recruiters from Firestore');
        const firestoreRecruiters = await firebaseApi.getRecruiters(currentUser.uid);
        console.log('[RecruiterFetch] Loaded recruiters from Firestore:', firestoreRecruiters.length);
        const normalizedRecruiters = firestoreRecruiters.map(normalizeFromServer);
        setRecruiters(normalizedRecruiters);
        console.log('[RecruiterFetch] Normalized and set recruiters:', normalizedRecruiters.length);
      } else {
        console.log('[RecruiterFetch] No user, setting empty array');
        setRecruiters([]);
      }
    } catch (err: any) {
      console.error('[RecruiterFetch] Error loading recruiters:', err);
      setError(err.message || 'Failed to load recruiters');
      setRecruiters([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  // Load recruiters on mount and when user changes - exactly like ContactDirectory
  // This ensures data is always loaded from backend, not from props/state
  useEffect(() => {
    if (currentUser) {
      loadRecruiters();
    } else {
      // Clear recruiters if no user
      setRecruiters([]);
      setFilteredRecruiters([]);
      setIsLoading(false);
    }
  }, [currentUser]);

  // Reload recruiters when page becomes visible (user navigates back)
  // But only if there are no pending saves
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && currentUser && pendingSaves.size === 0) {
        console.log('[RecruiterFetch] Page visible, reloading recruiters');
        loadRecruiters();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [currentUser, pendingSaves.size]);

  // Warn user before leaving with pending saves
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingSaves.size > 0 || saveQueue.size > 0) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Cleanup: mark as unmounting to prevent new saves
      isUnmountingRef.current = true;
    };
  }, [pendingSaves.size, saveQueue.size]);

  // Save pending changes before unmount
  useEffect(() => {
    return () => {
      isUnmountingRef.current = true;
      // Cancel all pending timeouts
      saveTimeoutRef.current.forEach(timeout => clearTimeout(timeout));
      saveTimeoutRef.current.clear();
    };
  }, []);

  // Filter recruiters based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredRecruiters(recruiters);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = recruiters.filter((recruiter) => {
      const searchableText = [
        recruiter.firstName,
        recruiter.lastName,
        recruiter.email,
        recruiter.company,
        recruiter.jobTitle,
        recruiter.location,
        recruiter.associatedJobTitle,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchableText.includes(query);
    });

    setFilteredRecruiters(filtered);
  }, [searchQuery, recruiters]);

  // Check for horizontal overflow
  useEffect(() => {
    const checkOverflow = () => {
      if (tableContainerRef.current) {
        const hasOverflow = tableContainerRef.current.scrollWidth > tableContainerRef.current.clientWidth;
        setHasHorizontalOverflow(hasOverflow);
      }
    };

    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [filteredRecruiters]);

  // Track scroll
  useEffect(() => {
    const handleScroll = () => {
      if (tableContainerRef.current) {
        setHasScrolled(tableContainerRef.current.scrollLeft > 0);
      }
    };

    const container = tableContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, []);

  const handleCellClick = (row: number, col: string) => {
    setEditingCell({ row, col });
  };

  // Debounced save function
  const saveRecruiterUpdate = useCallback(async (
    recruiterId: string, 
    field: keyof Recruiter, 
    value: string
  ) => {
    if (!currentUser || !recruiterId || isUnmountingRef.current) {
      console.warn('[RecruiterSave] Cannot save: missing user, recruiterId, or unmounting');
      return;
    }

    const saveKey = `${recruiterId}_${field}`;
    setPendingSaves(prev => new Set(prev).add(saveKey));

    try {
      await firebaseApi.updateRecruiter(currentUser.uid, recruiterId, { [field]: value });
      
      // Remove from pending and queue
      setPendingSaves(prev => {
        const next = new Set(prev);
        next.delete(saveKey);
        return next;
      });
      setSaveQueue(prev => {
        const next = new Map(prev);
        next.delete(saveKey);
        return next;
      });

      // Clear timeout if it exists
      const timeout = saveTimeoutRef.current.get(saveKey);
      if (timeout) {
        clearTimeout(timeout);
        saveTimeoutRef.current.delete(saveKey);
      }

      console.log(`[RecruiterSave] ✅ Successfully saved ${field} for recruiter ${recruiterId}`);
    } catch (err) {
      console.error('[RecruiterSave] Error updating recruiter:', err);
      
      // Remove from pending
      setPendingSaves(prev => {
        const next = new Set(prev);
        next.delete(saveKey);
        return next;
      });

      // Show error to user
      toast({
        title: "Failed to save changes",
        description: `Could not save ${field}. Your changes may be lost. Please try again.`,
        variant: "destructive",
      });

      // Reload to get correct state
      await loadRecruiters();
    }
  }, [currentUser, loadRecruiters]);

  const handleCellEdit = (recruiterId: string, field: keyof Recruiter, value: string) => {
    if (!currentUser) {
      toast({
        title: "Not signed in",
        description: "Please sign in to save changes.",
        variant: "destructive",
      });
      return;
    }

    if (!recruiterId) {
      console.error('[RecruiterSave] Cannot save: missing recruiter ID');
      toast({
        title: "Cannot save",
        description: "Recruiter ID is missing. Please refresh the page.",
        variant: "destructive",
      });
      return;
    }

    // Update UI immediately (optimistic update)
    const updatedRecruiters = recruiters.map((r) =>
      r.id === recruiterId ? { ...r, [field]: value } : r
    );
    setRecruiters(updatedRecruiters);

    // Add to save queue
    const saveKey = `${recruiterId}_${field}`;
    setSaveQueue(prev => new Map(prev).set(saveKey, { recruiterId, field, value }));

    // Clear existing timeout for this field
    const existingTimeout = saveTimeoutRef.current.get(saveKey);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Debounce: wait 500ms before saving to avoid excessive API calls
    const timeout = setTimeout(() => {
      saveRecruiterUpdate(recruiterId, field, value);
    }, 500);

    saveTimeoutRef.current.set(saveKey, timeout);
  };

  const handleCellBlur = async () => {
    setEditingCell(null);
    
    // Immediately flush any pending saves when cell loses focus
    if (saveQueue.size > 0 && currentUser && !isUnmountingRef.current) {
      const entriesToSave = Array.from(saveQueue.entries());
      
      // Clear all timeouts first
      entriesToSave.forEach(([saveKey]) => {
        const timeout = saveTimeoutRef.current.get(saveKey);
        if (timeout) {
          clearTimeout(timeout);
          saveTimeoutRef.current.delete(saveKey);
        }
      });
      
      // Save all pending changes immediately
      const savePromises = entriesToSave.map(([, saveOp]) =>
        saveRecruiterUpdate(saveOp.recruiterId, saveOp.field, saveOp.value)
      );
      
      // Wait for all saves to complete
      await Promise.allSettled(savePromises);
    }
  };

  const handleDeleteRecruiter = async (recruiterId: string, recruiterName: string) => {
    // Show confirmation dialog
    if (!window.confirm(`Are you sure you want to delete ${recruiterName}? This action cannot be undone.`)) {
      return;
    }

    try {
      if (!currentUser) {
        toast({ title: 'Error', description: 'Please sign in to delete recruiters.', variant: 'destructive' });
        return;
      }
      if (recruiterId) {
        // Delete from Firestore
        await firebaseApi.deleteRecruiter(currentUser.uid, recruiterId);
      }

      // Update local state only after successful Firestore delete
      setRecruiters((prev) => prev.filter((recruiter) => recruiter.id !== recruiterId));
      
      toast({
        title: 'Recruiter Deleted',
        description: `${recruiterName} has been removed from your recruiters.`,
      });
    } catch (error) {
      console.error('Error deleting recruiter:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete recruiter. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const buildGmailLink = (recruiter: Recruiter) => {
    // Build a new Gmail compose URL with pre-filled fields
    const to = recruiter.email || recruiter.workEmail;
    if (!to) return '#';
    const subject = encodeURIComponent(`Inquiry about ${recruiter.associatedJobTitle || 'position'}`);
    const body = encodeURIComponent(
      `Hi ${recruiter.firstName || ''},\n\nI hope this email finds you well...`
    );
    // Use the reliable Gmail compose URL format with proper encoding
    return `https://mail.google.com/mail/u/0/?view=cm&fs=1&tf=1&to=${encodeURIComponent(
      to
    )}&su=${subject}&body=${body}`;
  };

  const buildMailto = (recruiter: Recruiter) => {
    const to = recruiter.email || recruiter.workEmail;
    if (!to) return '#';
    const subject = encodeURIComponent(`Inquiry about ${recruiter.associatedJobTitle || 'position'}`);
    const body = encodeURIComponent(
      `Hi ${recruiter.firstName || ''},\n\nI hope this email finds you well...`
    );
    return `mailto:${to}?subject=${subject}&body=${body}`;
  };

  const handleEmailClick = (recruiter: Recruiter) => {
    setSelectedRecruiterForEmail(recruiter);
    setMailAppDialogOpen(true);
  };

  const handleMailAppSelect = (app: 'apple' | 'gmail') => {
    if (!selectedRecruiterForEmail) return;

    const email = selectedRecruiterForEmail.email || selectedRecruiterForEmail.workEmail;
    if (!email) {
      toast({
        title: 'No email address',
        description: 'No email address available for this recruiter.',
        variant: 'destructive',
      });
      setMailAppDialogOpen(false);
      setSelectedRecruiterForEmail(null);
      return;
    }

    if (app === 'apple') {
      window.open(buildMailto(selectedRecruiterForEmail), '_blank');
      // Note: Apple Mail can't attach files via mailto: URL
      toast({
        title: 'Reminder',
        description: 'Please attach your resume before sending.',
      });
    } else {
      // Check if we have a Gmail draft URL (has resume attached)
      // Prefer message ID format (more reliable) over draft ID
      const messageId = selectedRecruiterForEmail.gmailMessageId;
      const draftId = selectedRecruiterForEmail.gmailDraftId;
      let draftUrl = selectedRecruiterForEmail.gmailDraftUrl;
      
      if (messageId || draftId || draftUrl) {
        // Open the actual draft (has resume attached)
        // Option A: Use message ID format (most reliable)
        if (messageId) {
          draftUrl = `https://mail.google.com/mail/u/0/#drafts?compose=${messageId}`;
          window.open(draftUrl, '_blank');
        } else if (draftUrl) {
          // Use stored URL (should already be in correct format)
          window.open(draftUrl, '_blank');
        } else if (draftId) {
          // Fallback: Construct draft URL from draft ID
          draftUrl = `https://mail.google.com/mail/u/0/#draft/${draftId}`;
          window.open(draftUrl, '_blank');
        }
        
        toast({
          title: 'Opening Draft',
          description: 'Opening your saved draft with resume attached.',
        });
      } else {
        // No draft exists - fall back to compose URL (no attachment)
        window.open(buildGmailLink(selectedRecruiterForEmail), '_blank');
        
        toast({
          title: 'Reminder',
          description: 'Please attach your resume before sending.',
        });
      }
    }

    setMailAppDialogOpen(false);
    setSelectedRecruiterForEmail(null);
  };

  const getDisplayName = (recruiter: Recruiter): string => {
    if (recruiter.firstName && recruiter.lastName) {
      return `${recruiter.firstName} ${recruiter.lastName}`;
    }
    if (recruiter.firstName) return recruiter.firstName;
    if (recruiter.lastName) return recruiter.lastName;
    if (recruiter.email) return recruiter.email.split('@')[0];
    if (recruiter.linkedinUrl) {
      const match = recruiter.linkedinUrl.match(/linkedin\.com\/in\/([^\/\?]+)/);
      return match ? match[1] : 'Unknown Recruiter';
    }
    return 'Unknown Recruiter';
  };

  const handleExportCsv = () => {
    if (!recruiters || recruiters.length === 0) {
      return;
    }

    // Check if user is on free tier
    if (currentUser?.tier === 'free') {
      setShowUpgradeDialog(true);
      return;
    }

    // Define CSV headers
    const headers = [
      'First Name',
      'Last Name',
      'Email',
      'LinkedIn',
      'Title',
      'Company',
      'Location',
      'Phone',
      'Work Email',
      'Personal Email',
      'Associated Job Title',
      'Associated Job URL',
      'Status',
      'Date Added'
    ] as const;

    const headerRow = headers.join(',');

    // Map recruiters to CSV rows
    const rows = recruiters.map((recruiter) => {
      const escapeCsv = (val: string | undefined | null) => {
        if (!val) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      return [
        escapeCsv(recruiter.firstName),
        escapeCsv(recruiter.lastName),
        escapeCsv(recruiter.email),
        escapeCsv(recruiter.linkedinUrl),
        escapeCsv(recruiter.jobTitle),
        escapeCsv(recruiter.company),
        escapeCsv(recruiter.location),
        escapeCsv(recruiter.phone),
        escapeCsv(recruiter.workEmail),
        escapeCsv(recruiter.personalEmail),
        escapeCsv(recruiter.associatedJobTitle),
        escapeCsv(recruiter.associatedJobUrl),
        escapeCsv(recruiter.status),
        escapeCsv(recruiter.dateAdded)
      ].join(',');
    });

    const csvContent = [headerRow, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `recruiter_spreadsheet_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const clearAllRecruiters = async () => {
    if (!currentUser) {
      toast({ title: 'Error', description: 'Please sign in to manage recruiters.', variant: 'destructive' });
      return;
    }
    if (window.confirm('Are you sure you want to delete all recruiters? This action cannot be undone.')) {
      try {
        await firebaseApi.clearAllRecruiters(currentUser.uid);
        setRecruiters([]);
      } catch (err) {
        console.error('Error clearing recruiters:', err);
        setError('Failed to clear recruiters');
      }
    }
  };

  const mono = "'IBM Plex Mono', monospace";
  const GUTTER_W = 40;

  const getActiveCellRef = (): string => {
    if (!activeCell) return 'A1';
    const col = REC_COLS.find(c => c.key === activeCell.col);
    const letter = col?.letter || 'A';
    const idx = filteredRecruiters.findIndex(r => r.id === activeCell.rowId);
    return `${letter}${idx >= 0 ? idx + 1 : 1}`;
  };

  const getActiveCellValue = (): string => {
    if (!activeCell) return '';
    const r = filteredRecruiters.find(r => r.id === activeCell.rowId);
    if (!r) return '';
    switch (activeCell.col) {
      case 'name': return getDisplayName(r);
      case 'linkedin': return r.linkedinUrl || '';
      case 'email': return r.email || '';
      case 'company': return r.company || '';
      case 'jobTitle': return r.jobTitle || '';
      case 'associatedJob': return r.associatedJobTitle || '';
      case 'status': return r.status || '';
      default: return '';
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <LoadingSkeleton variant="contacts" count={5} />
      </div>
    );
  }

  return (
    <div
      className="recruiter-spreadsheet-page"
      style={{ fontFamily: mono, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#fff' }}
      onClick={(e) => { if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) setActiveCell(null); }}
    >
      {/* Toolbar */}
      <div className="recruiter-toolbar" style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 10px', background: '#ffffff', borderBottom: '1px solid #e5e5e3',
      }}>
        <div className="relative recruiter-search-wrap" style={{ flex: '0 0 220px' }}>
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3" style={{ color: '#bbb' }} />
          <input
            type="text" placeholder="Search..." value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ fontFamily: mono, fontSize: 12, color: '#2a2a2a', background: '#fff', border: '1px solid #e5e5e3', outline: 'none', padding: '4px 6px 4px 24px', width: '100%' }}
          />
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={handleExportCsv}
          disabled={recruiters.length === 0 || currentUser?.tier === 'free'}
          className="disabled:opacity-40"
          style={{ fontFamily: mono, fontSize: 11, border: '1px solid #e5e5e3', background: '#fff', color: '#555', padding: '4px 10px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <Download className="h-3 w-3" /> Export CSV
        </button>
        <button onClick={loadRecruiters} disabled={isLoading} className="disabled:opacity-40"
          style={{ border: '1px solid #e5e5e3', background: '#fff', color: '#555', padding: '4px 8px', cursor: 'pointer' }}>
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
        <button onClick={clearAllRecruiters} disabled={recruiters.length === 0} className="disabled:opacity-40"
          style={{ border: '1px solid #e5c5c5', background: '#fff', color: '#c00', padding: '4px 8px', cursor: 'pointer' }}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <span style={{ fontSize: 11, color: '#999', marginLeft: 6 }}>
          {recruiters.length} recruiter{recruiters.length !== 1 ? 's' : ''}
          {pendingSaves.size > 0 && <span style={{ color: '#555', marginLeft: 6 }}>saving...</span>}
        </span>
      </div>

      {/* Formula Bar */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', height: 26, borderBottom: '1px solid #e5e5e3', background: '#fff' }}>
        <div style={{ width: 60, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff', borderRight: '1px solid #e5e5e3', fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', color: '#2a2a2a', fontFamily: mono }}>
          {getActiveCellRef()}
        </div>
        <div style={{ padding: '0 10px', borderRight: '1px solid #e5e5e3', fontSize: 11, color: '#bbb', fontStyle: 'italic', fontFamily: mono, display: 'flex', alignItems: 'center', height: '100%' }}>fx</div>
        <div style={{ flex: 1, padding: '0 10px', fontSize: 12, color: '#2a2a2a', fontFamily: mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', height: '100%' }}>
          {getActiveCellValue()}
        </div>
      </div>

      {error && (
        <div style={{ flexShrink: 0, background: '#fce8e6', border: '1px solid #e5c5c5', color: '#c00', padding: '6px 12px', fontSize: 11, fontFamily: mono }}>{error}</div>
      )}

      {/* Sheet */}
      <div ref={sheetRef} style={{ flex: 1, overflow: 'auto' }}>
        {recruiters.length === 0 ? (
          <div style={{ padding: '60px 24px', textAlign: 'center', fontFamily: mono }}>
            <p style={{ color: '#2a2a2a', fontWeight: 500, fontSize: 13, marginBottom: 6 }}>No hiring managers saved yet</p>
            <p style={{ color: '#999', fontSize: 12 }}>Hiring managers found from job URL search will automatically appear here</p>
          </div>
        ) : (
          <div ref={tableContainerRef} className="recruiter-table-container" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table className="recruiter-table" style={{ width: '100%', minWidth: 1100, borderCollapse: 'collapse', fontFamily: mono }}>
              <thead>
                {/* Column Letter Row */}
                <tr style={{ borderBottom: '1px solid #e5e5e3' }}>
                  <th style={{ width: GUTTER_W, background: '#ffffff', borderRight: '1px solid #e5e5e3', padding: 0 }} />
                  {REC_COLS.map((col) => {
                    const isActive = activeCell?.col === col.key;
                    return (
                      <th key={col.letter} style={{ fontSize: 10, color: isActive ? '#2a2a2a' : '#999', fontWeight: isActive ? 500 : 400, background: isActive ? '#f0f0ee' : '#ffffff', borderRight: '1px solid #e5e5e3', textAlign: 'center', padding: '3px 0', width: col.width }}>
                        {col.letter}
                      </th>
                    );
                  })}
                  <th style={{ background: '#ffffff', padding: 0, width: 70 }} />
                </tr>

                {/* Column Label Row */}
                <tr style={{ borderBottom: '2px solid #e5e5e3' }}>
                  <th style={{ width: GUTTER_W, background: '#F8FAFC', borderRight: '1px solid #e5e5e3', fontSize: 10, color: '#64748B', textAlign: 'center', padding: '11px 0', position: 'sticky', top: 0, zIndex: 10 }}>#</th>
                  {REC_COLS.map((col) => {
                    const isActive = activeCell?.col === col.key;
                    return (
                      <th key={col.key} style={{ padding: '11px 12px', textAlign: 'left', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: isActive ? '#1E40AF' : '#64748B', background: isActive ? '#EFF6FF' : '#F8FAFC', whiteSpace: 'nowrap', width: col.width, position: 'sticky', top: 0, zIndex: 10 }}>
                        {col.label}
                      </th>
                    );
                  })}
                  <th style={{ background: '#F8FAFC', padding: '11px 8px', width: 70, position: 'sticky', top: 0, zIndex: 10 }} />
                </tr>
              </thead>
              <tbody>
                {filteredRecruiters.length === 0 && searchQuery ? (
                  <tr><td colSpan={REC_COLS.length + 2} style={{ padding: '40px 24px', textAlign: 'center', color: '#999', fontSize: 12 }}>
                    No recruiters match your search. <button onClick={() => setSearchQuery('')} style={{ fontSize: 11, color: '#555', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', fontFamily: mono }}>Clear</button>
                  </td></tr>
                ) : filteredRecruiters.map((recruiter, index) => {
                  const statusOption = STATUS_OPTIONS.find(opt => opt.value === recruiter.status);
                  const cellStyle = (col: string) => ({
                    padding: '0 12px' as const, whiteSpace: 'nowrap' as const, position: 'relative' as const,
                    ...(activeCell?.rowId === recruiter.id && activeCell?.col === col ? { outline: '2px solid #2a2a2a', outlineOffset: -2, background: '#fff', zIndex: 1 } : {}),
                  });

                  return (
                    <tr
                      key={recruiter.id}
                      style={{ height: 32, borderBottom: '1px solid #F1F5F9', background: index % 2 === 1 ? '#F8FAFC' : 'white', transition: 'background 0.1s' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#EFF6FF'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = index % 2 === 1 ? '#F8FAFC' : 'white'; }}
                    >
                      {/* Row Number */}
                      <td style={{ width: GUTTER_W, textAlign: 'center', fontSize: 10, color: '#999', background: '#ffffff', borderRight: '1px solid #e5e5e3', padding: '0 4px' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#EFF6FF'; e.currentTarget.style.color = '#2563EB'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.color = '#999'; }}
                      >{index + 1}</td>

                      {/* Name */}
                      <td onClick={() => { setActiveCell({ rowId: recruiter.id || '', col: 'name' }); handleCellClick(index, 'name'); }} style={cellStyle('name')}>
                        {editingCell?.row === index && editingCell?.col === 'name' ? (
                          <div className="space-y-1" style={{ padding: '2px 0' }}>
                            <Input value={recruiter.firstName} onChange={(e) => handleCellEdit(recruiter.id!, 'firstName', e.target.value)} onBlur={handleCellBlur} placeholder="First" className="text-sm h-6 border-gray-300" style={{ fontFamily: mono }} autoFocus />
                            <Input value={recruiter.lastName} onChange={(e) => handleCellEdit(recruiter.id!, 'lastName', e.target.value)} onBlur={handleCellBlur} placeholder="Last" className="text-sm h-6 border-gray-300" style={{ fontFamily: mono }} />
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, fontWeight: 500, color: '#2a2a2a', cursor: 'default' }}>{getDisplayName(recruiter)}</span>
                        )}
                      </td>

                      {/* LinkedIn */}
                      <td onClick={() => setActiveCell({ rowId: recruiter.id || '', col: 'linkedin' })} style={cellStyle('linkedin')}>
                        {recruiter.linkedinUrl ? (
                          <a href={recruiter.linkedinUrl.startsWith('http') ? recruiter.linkedinUrl : `https://${recruiter.linkedinUrl}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                            style={{ fontSize: 11, color: '#2563EB', textDecoration: 'none', borderBottom: '1px solid #BFDBFE', paddingBottom: 1 }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = '#1D4ED8'; e.currentTarget.style.borderColor = '#1D4ED8'; }} onMouseLeave={(e) => { e.currentTarget.style.color = '#2563EB'; e.currentTarget.style.borderColor = '#BFDBFE'; }}
                          >↗ view</a>
                        ) : <span style={{ color: '#bbb' }}> - </span>}
                      </td>

                      {/* Email */}
                      <td onClick={() => setActiveCell({ rowId: recruiter.id || '', col: 'email' })} style={cellStyle('email')}>
                        <span style={{ fontSize: 12, color: '#555' }}>{recruiter.email || ' - '}</span>
                      </td>

                      {/* Company */}
                      <td onClick={() => { setActiveCell({ rowId: recruiter.id || '', col: 'company' }); handleCellClick(index, 'company'); }} style={cellStyle('company')}>
                        {editingCell?.row === index && editingCell?.col === 'company' ? (
                          <Input value={recruiter.company} onChange={(e) => handleCellEdit(recruiter.id!, 'company', e.target.value)} onBlur={handleCellBlur} className="text-sm h-6 border-gray-300" style={{ fontFamily: mono }} autoFocus />
                        ) : (
                          <span style={{ fontSize: 12, color: '#555', cursor: 'default' }}>{recruiter.company || ' - '}</span>
                        )}
                      </td>

                      {/* Title */}
                      <td onClick={() => { setActiveCell({ rowId: recruiter.id || '', col: 'jobTitle' }); handleCellClick(index, 'jobTitle'); }} style={cellStyle('jobTitle')}>
                        {editingCell?.row === index && editingCell?.col === 'jobTitle' ? (
                          <Input value={recruiter.jobTitle} onChange={(e) => handleCellEdit(recruiter.id!, 'jobTitle', e.target.value)} onBlur={handleCellBlur} className="text-sm h-6 border-gray-300" style={{ fontFamily: mono }} autoFocus />
                        ) : (
                          <span style={{ fontSize: 12, color: '#555', cursor: 'default' }}>{recruiter.jobTitle || ' - '}</span>
                        )}
                      </td>

                      {/* Associated Job */}
                      <td onClick={() => setActiveCell({ rowId: recruiter.id || '', col: 'associatedJob' })} style={cellStyle('associatedJob')}>
                        {recruiter.associatedJobTitle ? (
                          <div>
                            <span style={{ fontSize: 12, color: '#2a2a2a', fontWeight: 500 }}>{recruiter.associatedJobTitle}</span>
                            {recruiter.associatedJobUrl && (
                              <a href={recruiter.associatedJobUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                                style={{ fontSize: 11, color: '#2563EB', textDecoration: 'none', borderBottom: '1px solid #BFDBFE', marginLeft: 6 }}
                                onMouseEnter={(e) => { e.currentTarget.style.color = '#1D4ED8'; e.currentTarget.style.borderColor = '#1D4ED8'; }} onMouseLeave={(e) => { e.currentTarget.style.color = '#2563EB'; e.currentTarget.style.borderColor = '#BFDBFE'; }}
                              >↗</a>
                            )}
                          </div>
                        ) : <span style={{ color: '#bbb' }}> - </span>}
                      </td>

                      {/* Status */}
                      <td onClick={() => setActiveCell({ rowId: recruiter.id || '', col: 'status' })} style={cellStyle('status')}>
                        <span
                          style={{ display: 'inline-block', fontSize: 10, fontFamily: mono, fontWeight: 500, padding: '3px 10px', borderRadius: 12, background: statusOption?.bg || '#F3F4F6', color: statusOption?.color || '#6B7280', cursor: 'pointer', whiteSpace: 'nowrap' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            const idx = STATUS_OPTIONS.findIndex(o => o.value === recruiter.status);
                            const next = STATUS_OPTIONS[(idx + 1) % STATUS_OPTIONS.length];
                            handleCellEdit(recruiter.id!, 'status', next.value);
                          }}
                        >
                          {recruiter.status || 'Not Contacted'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '0 8px', whiteSpace: 'nowrap', textAlign: 'right', width: 70 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
                          {(recruiter.email || recruiter.workEmail) && (
                            <button onClick={() => handleEmailClick(recruiter)} title={`Email ${getDisplayName(recruiter)}`}
                              style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', padding: 3 }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = '#2a2a2a'; }} onMouseLeave={(e) => { e.currentTarget.style.color = '#999'; }}
                            ><Mail className="h-3 w-3" /></button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteRecruiter(recruiter.id!, getDisplayName(recruiter)); }}
                            title="Delete" style={{ background: 'none', border: 'none', color: '#bbb', cursor: 'pointer', padding: 3 }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = '#c00'; }} onMouseLeave={(e) => { e.currentTarget.style.color = '#bbb'; }}
                          ><Trash2 className="h-3 w-3" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bottom Bar */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'stretch', height: 30, background: '#ffffff', borderTop: '1px solid #e5e5e3', fontFamily: mono }}>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 10, color: '#bbb', whiteSpace: 'nowrap' }}>
          {filteredRecruiters.length} rows · offerloop.ai
        </div>
      </div>

      {/* Mail App Selection Dialog */}
      {mailAppDialogOpen && selectedRecruiterForEmail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div style={{ background: '#fff', border: '1px solid #e5e5e3', padding: 24, maxWidth: 400, width: '100%', margin: '0 16px' }}>
            <h3 style={{ fontSize: 14, fontWeight: 500, color: '#2a2a2a', marginBottom: 12, fontFamily: mono }}>Choose Email App</h3>
            <p style={{ fontSize: 12, color: '#555', marginBottom: 20, fontFamily: mono }}>Send email to {getDisplayName(selectedRecruiterForEmail)}</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => handleMailAppSelect('apple')}
                style={{ flex: 1, padding: '16px 0', border: '1px solid #e5e5e3', background: '#fff', cursor: 'pointer', fontFamily: mono, fontSize: 12, color: '#555', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#ffffff'; }} onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; }}
              ><Mail className="h-4 w-4" />Apple Mail</button>
              <button onClick={() => handleMailAppSelect('gmail')}
                style={{ flex: 1, padding: '16px 0', border: '1px solid #e5e5e3', background: '#fff', cursor: 'pointer', fontFamily: mono, fontSize: 12, color: '#555', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#ffffff'; }} onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; }}
              ><Mail className="h-4 w-4" />Gmail</button>
            </div>
            <button onClick={() => { setMailAppDialogOpen(false); setSelectedRecruiterForEmail(null); }}
              style={{ fontFamily: mono, fontSize: 11, color: '#999', background: 'none', border: 'none', cursor: 'pointer', width: '100%', marginTop: 16, textAlign: 'center' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Upgrade Dialog */}
      <AlertDialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Upgrade to Export CSV</AlertDialogTitle>
            <AlertDialogDescription>CSV export is available for Pro and Elite tier users.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => navigate('/pricing')}>Upgrade</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mobile CSS */}
      <style>{`
        @media (max-width: 768px) {
          .recruiter-spreadsheet-page { width: 100%; max-width: 100vw; box-sizing: border-box; }
          .recruiter-toolbar { flex-wrap: wrap; gap: 6px; padding: 6px 8px; }
          .recruiter-search-wrap { flex: 1 1 100% !important; }
          .recruiter-table-container { overflow-x: auto; -webkit-overflow-scrolling: touch; }
          .recruiter-table { min-width: 900px; }
        }
      `}</style>
    </div>
  );
};

export default RecruiterSpreadsheet;

