import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Mail,
  Search,
  RefreshCw,
  Trash2,
  ExternalLink,
  Download,
  User,
  PenLine,
  Loader2,
} from "lucide-react";
import { LoadingSkeleton } from "./LoadingSkeleton";
import { useNavigate } from "react-router-dom";
import { InlineLoadingBar } from "@/components/ui/LoadingBar";
import { useFirebaseAuth } from '../contexts/FirebaseAuthContext';
import { decodeHtmlEntities } from '@/lib/formatters';
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
import type { Contact as ContactApi } from '../services/firebaseApi';
import { useFirebaseMigration } from '../hooks/useFirebaseMigration';
import { NotificationBell } from '../components/NotificationBell';
import { apiService, BACKEND_URL } from '@/services/api';
import { useToast } from '@/hooks/use-toast';

type Contact = ContactApi;

const STATUS_OPTIONS = [
  { value: 'Not Contacted', color: '#6B7280', label: 'Not Contacted', bg: '#F3F4F6' },
  { value: 'Contacted', color: '#2563EB', label: 'Contacted', bg: '#EFF6FF' },
  { value: 'Followed Up', color: '#7C3AED', label: 'Followed Up', bg: '#F5F3FF' },
  { value: 'Responded', color: '#059669', label: 'Responded', bg: '#ECFDF5' },
  { value: 'Call Scheduled', color: '#D97706', label: 'Call Scheduled', bg: '#FFFBEB' },
  { value: 'Rejected', color: '#DC2626', label: 'Rejected', bg: '#FEF2F2' },
  { value: 'Hired', color: '#059669', label: 'Hired', bg: '#ECFDF5' }
];

const COL_DEFS = [
  { key: 'name', letter: 'A', label: 'Name', width: '14%' },
  { key: 'linkedin', letter: 'B', label: 'LinkedIn', width: '7%' },
  { key: 'email', letter: 'C', label: 'Email', width: '18%' },
  { key: 'company', letter: 'D', label: 'Company', width: '16%' },
  { key: 'jobTitle', letter: 'E', label: 'Role', width: '15%' },
  { key: 'match', letter: 'F', label: 'Match', width: '10%' },
  { key: 'status', letter: 'G', label: 'Status', width: '12%' },
] as const;

type SheetTab = 'contacts' | 'replied' | 'pipeline';

const SpreadsheetContactDirectory: React.FC = () => {
  const navigate = useNavigate();
  const { user: currentUser } = useFirebaseAuth();
  const { isLoading: migrationLoading } = useFirebaseMigration();
  const { toast } = useToast();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ row: number; col: string } | null>(null);
  const [mailAppDialogOpen, setMailAppDialogOpen] = useState(false);
  const [selectedContactForEmail, setSelectedContactForEmail] = useState<Contact | null>(null);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);

  const [replyStatuses, setReplyStatuses] = useState<Record<string, any>>({});
  const [isCheckingReplies, setIsCheckingReplies] = useState(false);
  const [draftingContactIds, setDraftingContactIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeCell, setActiveCell] = useState<{ rowId: string; col: string } | null>(null);
  const [sheetTab, setSheetTab] = useState<SheetTab>('contacts');

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredContacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredContacts.map(c => c.id!).filter(Boolean)));
    }
  };
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const isCheckingRepliesRef = useRef(false);
  const lastCheckTimeRef = useRef<number>(0);

  const getStorageKey = () => {
    return currentUser ? `contacts_${currentUser.uid}` : 'contacts_anonymous';
  };

  const normalizeFromServer = (serverContact: any): Contact => {
    // Helper to get value from multiple possible field names, preserving undefined/null
    const getField = (...fieldNames: string[]): string | undefined => {
      for (const fieldName of fieldNames) {
        const value = serverContact[fieldName];
        if (value !== undefined && value !== null && value !== '') {
          return String(value).trim();
        }
      }
      return undefined;
    };

    // DEBUG: Log raw server contact data
    console.log('[DEBUG] Raw server contact:', JSON.stringify(serverContact, null, 2));
    
    // DEBUG: Log normalized email fields
    const normalizedEmailSubject = getField('emailSubject', 'email_subject');
    const normalizedEmailBody = getField('emailBody', 'email_body', 'emailContent', 'email_content');
    console.log('[DEBUG] Normalized emailSubject:', normalizedEmailSubject);
    console.log('[DEBUG] Normalized emailBody:', normalizedEmailBody ? `${normalizedEmailBody.substring(0, 100)}...` : 'MISSING');

    // DIAGNOSTIC: Log raw server contact data for email fields
    const isDev = import.meta.env.DEV;
    if (isDev && (serverContact.emailSubject || serverContact.email_subject || serverContact.emailBody || serverContact.email_body || serverContact.emailContent || serverContact.email_content)) {
      console.log('[ContactDirectory] normalizeFromServer - Raw email fields:', {
        id: serverContact.id,
        name: `${serverContact.firstName || ''} ${serverContact.lastName || ''}`,
        emailSubject: serverContact.emailSubject || 'MISSING',
        email_subject: serverContact.email_subject || 'MISSING',
        emailBody: serverContact.emailBody ? `${serverContact.emailBody.substring(0, 100)}...` : 'MISSING',
        email_body: serverContact.email_body ? `${serverContact.email_body.substring(0, 100)}...` : 'MISSING',
        emailContent: serverContact.emailContent ? `${serverContact.emailContent.substring(0, 100)}...` : 'MISSING',
        email_content: serverContact.email_content ? `${serverContact.email_content.substring(0, 100)}...` : 'MISSING',
        allEmailKeys: Object.keys(serverContact).filter(k => k.toLowerCase().includes('email')),
      });
    }

    const normalized = {
      id: serverContact.id,
      firstName: serverContact.firstName || serverContact.first_name || '',
      lastName: serverContact.lastName || serverContact.last_name || '',
      linkedinUrl: serverContact.linkedinUrl || serverContact.linkedin_url || '',
      email: serverContact.email || '',
      company: serverContact.company || '',
      jobTitle: serverContact.jobTitle || serverContact.job_title || '',
      college: serverContact.college || '',
      location: serverContact.location || '',
      firstContactDate: serverContact.firstContactDate || serverContact.first_contact_date || '',
      status: serverContact.status || 'Not Contacted',
      lastContactDate: serverContact.lastContactDate || serverContact.last_contact_date || '',
      // SOURCE OF TRUTH: emailSubject/emailBody are the generated outreach emails from backend
      // Check both camelCase (emailSubject) and snake_case (email_subject) variants
      // Also check emailContent (legacy field name from linkedin_import bug - now fixed)
      // Preserve undefined if not present (don't default to empty string)
      emailSubject: normalizedEmailSubject,
      emailBody: normalizedEmailBody,
      gmailDraftId: serverContact.gmailDraftId || serverContact.gmail_draft_id || '',
      gmailDraftUrl: serverContact.gmailDraftUrl || serverContact.gmail_draft_url || '',
      createdAt: serverContact.createdAt || serverContact.created_at,
      updatedAt: serverContact.updatedAt || serverContact.updated_at,
      gmailThreadId: serverContact.gmailThreadId || serverContact.gmail_thread_id,
      gmailMessageId: serverContact.gmailMessageId || serverContact.gmail_message_id,
      hasUnreadReply: serverContact.hasUnreadReply || serverContact.has_unread_reply || false,
      notificationsMuted: serverContact.notificationsMuted || serverContact.notifications_muted || false,
      draftCreatedAt: serverContact.draftCreatedAt,
      lastChecked: serverContact.lastChecked,
      mutedAt: serverContact.mutedAt,
      // Warmth & personalization
      warmthScore: serverContact.warmthScore,
      warmthTier: serverContact.warmthTier,
      warmthSignals: serverContact.warmthSignals,
      personalizationLabel: serverContact.personalizationLabel,
      personalizationType: serverContact.personalizationType,
    };

    if (isDev) {
      console.log('[ContactDirectory] normalizeFromServer - Normalized email fields:', {
        id: normalized.id,
        name: `${normalized.firstName || ''} ${normalized.lastName || ''}`,
        emailSubject: normalized.emailSubject ? `${normalized.emailSubject.substring(0, 100)}...` : 'MISSING',
        emailBody: normalized.emailBody ? `${normalized.emailBody.substring(0, 100)}...` : 'MISSING',
        emailSubjectLength: normalized.emailSubject?.length || 0,
        emailBodyLength: normalized.emailBody?.length || 0,
      });
    }

    return normalized;
  };

  const loadContacts = async () => {
    try {
      setIsLoading(true);
      setError(null);

      if (currentUser) {
        const firebaseContacts = await firebaseApi.getContacts(currentUser.uid);
        const normalizedContacts = firebaseContacts.map(normalizeFromServer);
        setContacts(normalizedContacts);
      } else {
        const stored = localStorage.getItem(getStorageKey());
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            setContacts(Array.isArray(parsed) ? parsed : []);
          } catch (e) {
            console.error('Error parsing stored contacts:', e);
            setContacts([]);
          }
        } else {
          setContacts([]);
        }
      }
    } catch (err) {
      console.error('Error loading contacts:', err);
      setError('Failed to load contacts');
      setContacts([]);
    } finally {
      setIsLoading(false);
    }
  };

  const saveContacts = async (newContacts: Contact[]) => {
    try {
      if (!currentUser) {
        localStorage.setItem(getStorageKey(), JSON.stringify(newContacts));
      }
    } catch (err) {
      console.error('Error saving contacts:', err);
    }
  };

  const stripUndefined = <T extends Record<string, any>>(obj: T) =>
    Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;

  const addContactsToDirectory = async (contactsToAdd: any[]) => {
    try {
      const today = new Date().toLocaleDateString('en-US');

      const mapped: Omit<Contact, 'id'>[] = contactsToAdd.map((c: any) =>
        stripUndefined({
          firstName: c.FirstName ?? c.firstName ?? '',
          lastName: c.LastName ?? c.lastName ?? '',
          linkedinUrl: c.LinkedIn ?? c.linkedinUrl ?? '',
          email: c.Email ?? c.email ?? '',
          company: c.Company ?? c.company ?? '',
          jobTitle: c.Title ?? c.jobTitle ?? '',
          college: c.College ?? c.college ?? '',
          location:
            `${c.City ?? ''}${c.City && c.State ? ', ' : ''}${c.State ?? ''}`.trim() ||
            c.location ||
            '',
          firstContactDate: today,
          status: 'Not Contacted',
          lastContactDate: today,
          emailSubject: c.email_subject ?? c.emailSubject ?? undefined,
          emailBody: c.email_body ?? c.emailBody ?? undefined,
          gmailThreadId: c.gmailThreadId ?? c.gmail_thread_id ?? undefined,
          gmailMessageId: c.gmailMessageId ?? c.gmail_message_id ?? undefined,
          hasUnreadReply: false,
          notificationsMuted: false,
        })
      );

      if (currentUser) {
        await firebaseApi.bulkCreateContacts(currentUser.uid, mapped);
        await loadContacts();
      } else {
        const updatedContacts: Contact[] = [...contacts];
        mapped.forEach((newContact) => {
          const isDuplicate = updatedContacts.some(
            (existing) =>
              existing.email &&
              newContact.email &&
              existing.email.toLowerCase() === newContact.email.toLowerCase()
          );
          if (!isDuplicate) {
            updatedContacts.push({
              ...newContact,
              id: `local_${Date.now()}_${Math.random()}`,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            } as Contact);
          }
        });
        setContacts(updatedContacts);
        await saveContacts(updatedContacts);
      }
    } catch (err) {
      console.error('Error adding contacts:', err);
      setError('Failed to add contacts');
    }
  };

  const checkRepliesForAllContacts = useCallback(async () => {
    // Debounce: Don't check more than once every 30 seconds
    const now = Date.now();
    if (now - lastCheckTimeRef.current < 30000) {
      return;
    }
    
    if (isCheckingRepliesRef.current || !currentUser) return;
    
    isCheckingRepliesRef.current = true;
    setIsCheckingReplies(true);
    lastCheckTimeRef.current = now;

    try {
      // Access contacts directly - don't need it in deps since we read current value
      const contactsWithThreads = contacts
        .filter((c) => c.gmailThreadId && !c.notificationsMuted && c.id)
        .map((c) => c.id!)
        .filter(Boolean);

      if (contactsWithThreads.length === 0) {
        return;
      }

      const result = await apiService.batchCheckReplies(contactsWithThreads);
      if ('results' in result) setReplyStatuses(result.results);
    } catch (error) {
      console.error('Error checking replies:', error);
    } finally {
      isCheckingRepliesRef.current = false;
      setIsCheckingReplies(false);
    }
  }, [currentUser, contacts]); // Keep contacts but we'll fix the useEffect

  useEffect(() => {
    if (!currentUser || contacts.length === 0) return;
    
    // Initial check with delay to avoid rapid fire on mount
    const initialTimeout = setTimeout(() => {
      checkRepliesForAllContacts();
    }, 2000);
    
    // Set up polling interval (2 minutes)
    const interval = setInterval(() => {
      checkRepliesForAllContacts();
    }, 120000);
    
    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, contacts.length]); // Intentionally exclude checkRepliesForAllContacts to prevent infinite loop

  useEffect(() => {
    (window as any).addContactsToDirectory = addContactsToDirectory;
    return () => {
      delete (window as any).addContactsToDirectory;
    };
  }, [addContactsToDirectory]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredContacts(contacts);
      return;
    }
    const filtered = contacts.filter((contact) =>
      Object.values(contact).some((value) =>
        value?.toString().toLowerCase().includes(searchQuery.toLowerCase())
      )
    );
    setFilteredContacts(filtered);
  }, [searchQuery, contacts]);

  const handleCellEdit = async (contactId: string, field: keyof Contact, value: string) => {
    try {
      setContacts((prev) =>
        prev.map((contact) => {
          if (contact.id === contactId) {
            const updated: Contact = { ...contact, [field]: value } as Contact;
            if (field === 'status' && value !== contact.status) {
              updated.lastContactDate = new Date().toLocaleDateString('en-US');
            }
            return updated;
          }
          return contact;
        })
      );

      if (currentUser && contactId && !contactId.startsWith('local_')) {
        const updates: Partial<Contact> = { [field]: value } as Partial<Contact>;
        if (field === 'status') {
          updates.lastContactDate = new Date().toLocaleDateString('en-US');
        }
        await firebaseApi.updateContact(currentUser.uid, contactId, updates);
      }
    } catch (error) {
      console.error('Error updating contact:', error);
      setError('Failed to update contact');
    }
  };

  const handleCellClick = (row: number, col: string, contactId?: string) => {
    if (col === 'actions') return;
    if (contactId) setActiveCell({ rowId: contactId, col });
    if (col === 'status') return; // status uses dropdown, not inline edit
    setEditingCell({ row, col });
  };

  const handleCellBlur = () => {
    setEditingCell(null);
  };

  const handleDeleteContact = async (contactId: string, contactName: string) => {
    // Show confirmation dialog
    if (!window.confirm(`Are you sure you want to delete ${contactName}? This action cannot be undone.`)) {
      return;
    }

    try {
      if (currentUser && contactId && !contactId.startsWith('local_')) {
        // Delete from Firestore via backend API
        await firebaseApi.deleteContact(currentUser.uid, contactId);
      }
      
      // Update local state
      setContacts((prev) => prev.filter((contact) => contact.id !== contactId));
      
      // Save to localStorage for anonymous users
      if (!currentUser) {
        const updatedContacts = contacts.filter((contact) => contact.id !== contactId);
        localStorage.setItem(getStorageKey(), JSON.stringify(updatedContacts));
      }
      
      toast({
        title: 'Contact Deleted',
        description: `${contactName} has been removed from your contacts.`,
      });
    } catch (error) {
      console.error('Error deleting contact:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete contact. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleDraftEmail = async (contact: Contact) => {
    if (!contact.id || !contact.email) return;

    setDraftingContactIds((prev) => new Set(prev).add(contact.id!));

    try {
      const { auth: fbAuth } = await import("../lib/firebase");
      const idToken = await fbAuth.currentUser?.getIdToken(true);
      if (!idToken) throw new Error("Not authenticated");

      const contactsPayload = [{
        FirstName: contact.firstName || "",
        LastName: contact.lastName || "",
        Email: contact.email,
        Company: contact.company || "",
        Title: contact.jobTitle || "",
      }];

      const requestBody: Record<string, unknown> = {
        contacts: contactsPayload,
        resumeText: "",
        userProfile: {},
        careerInterests: [],
      };

      // Fetch resume text from Firestore for better email quality
      try {
        const { doc, getDoc } = await import("firebase/firestore");
        const { db } = await import("../lib/firebase");
        if (fbAuth.currentUser) {
          const userRef = doc(db, "users", fbAuth.currentUser.uid);
          const snap = await getDoc(userRef);
          if (snap.exists()) {
            const data = snap.data();
            requestBody.resumeText = data.resumeText || (data.resumeParsed ? JSON.stringify(data.resumeParsed) : "");
          }
        }
      } catch {
        // Non-critical
      }

      const API_BASE_URL = BACKEND_URL;
      const res = await fetch(`${API_BASE_URL}/api/emails/generate-and-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error((errData as any)?.error || `HTTP ${res.status}`);
      }

      toast({
        title: "Gmail draft created!",
        description: `Draft created for ${contact.firstName || contact.email}. Check your Gmail Drafts.`,
      });

      // Refresh contacts so gmailDraftId/gmailDraftUrl are reflected
      await loadContacts();
    } catch (err: any) {
      toast({
        title: "Draft creation failed",
        description: err?.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setDraftingContactIds((prev) => {
        const next = new Set(prev);
        next.delete(contact.id!);
        return next;
      });
    }
  };

  /**
   * Get email subject/body with strict precedence order:
   * 1. Most recent generated email (emailSubject/emailBody) - SOURCE OF TRUTH
   * 2. Fallback template (only if no generated email exists)
   *
   * This ensures we always use the high-quality generated outreach emails
   * that match what users see elsewhere in the app.
   */
  const getEmailContent = (contact: Contact): { subject: string; body: string } => {
    // DIAGNOSTIC: Log contact email fields to debug why fallback is used
    const isDev = import.meta.env.DEV;
    if (isDev) {
      const generatedSubject = contact.emailSubject?.trim();
      const generatedBody = contact.emailBody?.trim();
      console.log('[ContactDirectory] getEmailContent - Contact data:', {
        id: contact.id,
        name: `${contact.firstName || ''} ${contact.lastName || ''}`,
        email: contact.email || 'MISSING',
        emailSubject: contact.emailSubject || 'MISSING',
        emailBody: contact.emailBody ? `${contact.emailBody.substring(0, 100)}...` : 'MISSING',
        emailSubjectType: typeof contact.emailSubject,
        emailBodyType: typeof contact.emailBody,
        emailSubjectLength: contact.emailSubject?.length || 0,
        emailBodyLength: contact.emailBody?.length || 0,
        emailSubjectTrimmed: generatedSubject || 'EMPTY_AFTER_TRIM',
        emailBodyTrimmed: generatedBody ? `${generatedBody.substring(0, 100)}...` : 'EMPTY_AFTER_TRIM',
        willUseGeneratedSubject: !!(generatedSubject && generatedSubject.length > 0),
        willUseGeneratedBody: !!(generatedBody && generatedBody.length > 0),
      });
    }

    // PRECEDENCE 1: Use generated email content if present (non-empty after trimming)
    // emailSubject/emailBody are the source of truth - they contain the actual
    // generated outreach emails saved by the backend (see emails.py, runs.py, etc.)
    const generatedSubject = contact.emailSubject?.trim();
    const generatedBody = contact.emailBody?.trim();
    
    const subject = generatedSubject && generatedSubject.length > 0
      ? decodeHtmlEntities(generatedSubject)
      : `Question about your work at ${contact.company || 'your company'}`;

    const body = generatedBody && generatedBody.length > 0
      ? decodeHtmlEntities(generatedBody)
      : `Hi ${contact.firstName || 'there'},\n\nI'd love to connect and learn more about your work.\n\nBest regards`;
    
    if (isDev) {
      console.log('[ContactDirectory] getEmailContent - Result:', {
        usingGeneratedSubject: generatedSubject && generatedSubject.length > 0,
        usingGeneratedBody: generatedBody && generatedBody.length > 0,
        finalSubject: subject.substring(0, 150),
        finalBody: body.substring(0, 200),
        finalSubjectLength: subject.length,
        finalBodyLength: body.length,
        isFallbackSubject: !(generatedSubject && generatedSubject.length > 0),
        isFallbackBody: !(generatedBody && generatedBody.length > 0),
      });
    }
    
    return { subject, body };
  };

  const buildMailto = (contact: Contact) => {
    const to = contact.email;
    if (!to) return '#';
    const { subject, body } = getEmailContent(contact);
    return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body.replace(/\n/g, '\r\n'))}`;
  };

  const buildGmailLink = (contact: Contact) => {
    // Always build a new Gmail compose URL with pre-filled fields
    // Do NOT attempt to open existing drafts via URL (unreliable)
    const to = contact.email;
    if (!to) return '#';
    const { subject, body } = getEmailContent(contact);
    // Use the reliable Gmail compose URL format with proper encoding
    return `https://mail.google.com/mail/u/0/?view=cm&fs=1&tf=1&to=${encodeURIComponent(
      to
    )}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const handleEmailClick = (contact: Contact) => {
    // DIAGNOSTIC: Log full contact data when email icon is clicked
    const isDev = import.meta.env.DEV;
    if (isDev) {
      console.log('[ContactDirectory] handleEmailClick - Full contact object:', {
        id: contact.id,
        name: `${contact.firstName} ${contact.lastName}`,
        email: contact.email,
        emailSubject: contact.emailSubject,
        emailBody: contact.emailBody ? `${contact.emailBody.substring(0, 100)}...` : 'MISSING',
        emailSubjectType: typeof contact.emailSubject,
        emailBodyType: typeof contact.emailBody,
        emailSubjectLength: contact.emailSubject?.length || 0,
        emailBodyLength: contact.emailBody?.length || 0,
        allEmailFields: Object.keys(contact).filter(k => k.toLowerCase().includes('email')),
        rawContact: contact,
      });
      
      // Also log what getEmailContent will return
      const { subject, body } = getEmailContent(contact);
      console.log('[ContactDirectory] handleEmailClick - getEmailContent result:', {
        subject: subject.substring(0, 150),
        body: body.substring(0, 200),
        subjectLength: subject.length,
        bodyLength: body.length,
        subjectStartsWith: subject.substring(0, 30),
        bodyStartsWith: body.substring(0, 50),
      });
    }
    
    // Always show the mail app selection dialog
    // Do NOT attempt to open existing Gmail drafts via URL (unreliable)
    // The gmailDraftId/gmailDraftUrl are kept for backend tracking but not used for opening
    setSelectedContactForEmail(contact);
    setMailAppDialogOpen(true);
  };

  const handleMailAppSelect = (app: 'apple' | 'gmail') => {
    if (!selectedContactForEmail) return;
    
    if (app === 'apple') {
      window.open(buildMailto(selectedContactForEmail), '_blank');
      // Note: Apple Mail can't attach files via mailto: URL
      toast({
        title: 'Reminder',
        description: 'Please attach your resume before sending.',
      });
    } else {
      // Check if we have a Gmail draft URL (has resume attached)
      // Prefer message ID format (more reliable) over draft ID
      const messageId = selectedContactForEmail.gmailMessageId;
      const draftId = selectedContactForEmail.gmailDraftId;
      let draftUrl = selectedContactForEmail.gmailDraftUrl;
      
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
        window.open(buildGmailLink(selectedContactForEmail), '_blank');
        
        toast({
          title: 'Reminder',
          description: 'Please attach your resume before sending.',
        });
      }
    }
    
    setMailAppDialogOpen(false);
    setSelectedContactForEmail(null);
  };

  const getDisplayName = (contact: Contact) => {
    if (contact.firstName && contact.lastName) return `${contact.firstName} ${contact.lastName}`;
    if (contact.firstName) return contact.firstName;
    if (contact.lastName) return contact.lastName;
    if (contact.email) return contact.email.split('@')[0];
    if (contact.linkedinUrl) {
      const match = contact.linkedinUrl.match(/linkedin\.com\/in\/([^\/\?]+)/);
      return match ? match[1] : 'Unknown Contact';
    }
    return 'Unknown Contact';
  };

  const handleExportCsv = () => {
    if (!contacts || contacts.length === 0) {
      return;
    }

    if (currentUser?.tier === 'free') {
      setShowUpgradeDialog(true);
      return;
    }

    const headers = [
      'First Name',
      'Last Name',
      'Email',
      'LinkedIn',
      'Job Title',
      'Company',
      'Location',
      'College',
      'Status',
      'First Contact Date',
      'Last Contact Date',
      'Email Subject',
      'Email Body',
      'Gmail Draft URL'
    ] as const;

    const headerRow = headers.join(',');

    const rows = contacts.map((contact) => {
      const escapeCsv = (val: string | undefined | null) => {
        if (!val) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      return [
        escapeCsv(contact.firstName),
        escapeCsv(contact.lastName),
        escapeCsv(contact.email),
        escapeCsv(contact.linkedinUrl),
        escapeCsv(contact.jobTitle),
        escapeCsv(contact.company),
        escapeCsv(contact.location),
        escapeCsv(contact.college),
        escapeCsv(contact.status),
        escapeCsv(contact.firstContactDate),
        escapeCsv(contact.lastContactDate),
        escapeCsv(contact.emailSubject),
        escapeCsv(contact.emailBody),
        escapeCsv(contact.gmailDraftUrl)
      ].join(',');
    });

    const csvContent = [headerRow, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `contact_library_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const clearAllContacts = async () => {
    if (window.confirm('Are you sure you want to delete all contacts? This action cannot be undone.')) {
      try {
        if (currentUser) {
          await firebaseApi.clearAllContacts(currentUser.uid);
          setContacts([]);
        } else {
          localStorage.removeItem(getStorageKey());
          setContacts([]);
        }
      } catch (err) {
        console.error('Error clearing contacts:', err);
        setError('Failed to clear contacts');
      }
    }
  };

  const warmthRefreshedRef = useRef(false);

  useEffect(() => {
    if (!migrationLoading) {
      loadContacts();
    }
  }, [currentUser, migrationLoading]);

  // Auto-refresh warmth scores for existing contacts that don't have them
  useEffect(() => {
    if (!currentUser || contacts.length === 0 || warmthRefreshedRef.current) return;
    const hasAnyWarmth = contacts.some(c => c.warmthTier);
    if (hasAnyWarmth) return;
    warmthRefreshedRef.current = true;
    (async () => {
      try {
        const { auth } = await import('@/lib/firebase');
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        const resp = await fetch(`${BACKEND_URL}/api/contacts/refresh-warmth`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
        if (resp.ok) {
          await loadContacts();
        } else {
          console.error('[WarmthRefresh] Response not ok:', resp.status);
        }
      } catch (err) {
        console.error('[WarmthRefresh] Failed:', err);
      }
    })();
  }, [contacts, currentUser]);

  // Load user profile for client-side matching
  const [userUniversity, setUserUniversity] = useState('');
  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      try {
        const { db } = await import('@/lib/firebase');
        const { doc, getDoc } = await import('firebase/firestore');
        const snap = await getDoc(doc(db, 'users', currentUser.uid));
        if (snap.exists()) {
          const d = snap.data();
          const uni = d.academics?.university || d.professionalInfo?.university || d.resumeParsed?.university || '';
          setUserUniversity(uni.toLowerCase());
        }
      } catch {}
    })();
  }, [currentUser]);

  // Client-side match detection as fallback when warmth data is missing
  const getClientSideMatch = useCallback((contact: Contact): { label: string; type: string } | null => {
    if (contact.warmthTier || contact.personalizationLabel) return null;
    if (!userUniversity) return null;

    const contactCollege = (contact.college || '').toLowerCase();
    if (contactCollege && (contactCollege.includes(userUniversity) || userUniversity.includes(contactCollege))) {
      return { label: 'Alumni', type: 'university' };
    }

    return null;
  }, [userUniversity]);

  const getActiveCellValue = (): string => {
    if (!activeCell) return '';
    const contact = filteredContacts.find(c => c.id === activeCell.rowId);
    if (!contact) return '';
    switch (activeCell.col) {
      case 'name': return getDisplayName(contact);
      case 'linkedin': return contact.linkedinUrl || '';
      case 'email': return contact.email || '';
      case 'company': return contact.company || '';
      case 'jobTitle': return contact.jobTitle || '';
      case 'status': return contact.status || '';
      default: return '';
    }
  };

  const getActiveCellRef = (): string => {
    if (!activeCell) return 'A1';
    const colDef = COL_DEFS.find(c => c.key === activeCell.col);
    const letter = colDef?.letter || 'A';
    const rowIdx = filteredContacts.findIndex(c => c.id === activeCell.rowId);
    return `${letter}${rowIdx >= 0 ? rowIdx + 1 : 1}`;
  };

  // Filter contacts by sheet tab
  const tabFilteredContacts = filteredContacts.filter(c => {
    if (sheetTab === 'replied') return c.status === 'Responded';
    if (sheetTab === 'pipeline') return ['Contacted', 'Followed Up', 'Call Scheduled'].includes(c.status);
    return true;
  });

  if (migrationLoading || isLoading) {
    return (
      <div className="space-y-4">
        <LoadingSkeleton variant="contacts" count={5} />
      </div>
    );
  }

  const mono = "'IBM Plex Mono', monospace";
  const GUTTER_W = 40;
  const CHECKBOX_W = 32;

  return (
    <div
      className="contact-directory-page"
      style={{
        fontFamily: mono,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        background: '#ffffff',
      }}
      onClick={(e) => {
        // Clear active cell when clicking outside table
        if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) {
          setActiveCell(null);
        }
      }}
    >
      {/* Toolbar */}
      <div
        className="contact-directory-toolbar"
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 10px',
          background: '#ffffff',
          borderBottom: '1px solid #E2E8F0',
        }}
      >
        {/* Search */}
        <div className="relative contact-directory-search" style={{ flex: '0 0 220px' }}>
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3" style={{ color: '#bbb' }} />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              fontFamily: mono, fontSize: 12, color: '#2a2a2a',
              background: '#ffffff', border: '1px solid #E2E8F0',
              outline: 'none', padding: '4px 6px 4px 24px', width: '100%',
            }}
          />
        </div>

        <div style={{ flex: 1 }} />

        {/* Toolbar buttons */}
        <button
          onClick={handleExportCsv}
          disabled={contacts.length === 0}
          className="contact-directory-export-btn disabled:opacity-40"
          style={{
            fontFamily: mono, fontSize: 11,
            border: '1px solid #E2E8F0', background: '#fff', color: '#555',
            padding: '4px 10px', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}
        >
          <Download className="h-3 w-3" /> Export CSV
        </button>
        <button
          onClick={loadContacts}
          disabled={isLoading}
          className="disabled:opacity-40"
          style={{
            border: '1px solid #E2E8F0', background: '#fff', color: '#555',
            padding: '4px 8px', cursor: 'pointer',
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={clearAllContacts}
          disabled={contacts.length === 0}
          className="disabled:opacity-40"
          style={{
            border: '1px solid #e5c5c5', background: '#fff', color: '#c00',
            padding: '4px 8px', cursor: 'pointer',
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>

        <span style={{ fontSize: 11, color: '#999', marginLeft: 6 }}>
          {contacts.length} contact{contacts.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Formula Bar */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          height: 26,
          borderBottom: '1px solid #E2E8F0',
          background: '#ffffff',
        }}
      >
        <div style={{
          width: 60, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#ffffff', borderRight: '1px solid #E2E8F0',
          fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', color: '#2a2a2a',
          fontFamily: mono,
        }}>
          {getActiveCellRef()}
        </div>
        <div style={{
          padding: '0 10px', borderRight: '1px solid #E2E8F0',
          fontSize: 11, color: '#bbb', fontStyle: 'italic', fontFamily: mono,
          display: 'flex', alignItems: 'center', height: '100%',
        }}>
          fx
        </div>
        <div style={{
          flex: 1, padding: '0 10px', fontSize: 12, color: '#2a2a2a',
          fontFamily: mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          display: 'flex', alignItems: 'center', height: '100%',
        }}>
          {getActiveCellValue()}
        </div>
      </div>

      {error && (
        <div style={{ flexShrink: 0, background: '#fce8e6', border: '1px solid #e5c5c5', color: '#c00', padding: '6px 12px', fontSize: 11, fontFamily: mono }}>
          {error}
        </div>
      )}

      {/* Sheet area */}
      <div ref={sheetRef} style={{ flex: 1, overflow: 'auto' }}>
        {contacts.length === 0 ? (
          <div style={{ padding: '60px 24px', textAlign: 'center', fontFamily: mono }}>
            <p style={{ color: '#2a2a2a', fontWeight: 500, fontSize: 13, marginBottom: 6 }}>No contacts saved yet</p>
            <p style={{ color: '#999', fontSize: 12, marginBottom: 20 }}>
              Use the Find People search to discover and save contacts
            </p>
            <button
              onClick={() => navigate('/find')}
              style={{
                fontFamily: mono, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em',
                border: '1px solid #E2E8F0', background: '#fff', color: '#555',
                padding: '6px 14px', cursor: 'pointer',
              }}
            >
              Find People
            </button>
          </div>
        ) : (
          <div ref={tableContainerRef} className="contact-directory-table-container" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table className="contact-directory-table" style={{ width: '100%', minWidth: 1000, borderCollapse: 'collapse', fontFamily: mono }}>
              {/* Column Letter Row */}
              <thead>
                <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                  {/* Gutter */}
                  <th style={{ width: GUTTER_W, background: '#ffffff', borderRight: '1px solid #E2E8F0', padding: 0 }} />
                  {/* Checkbox */}
                  <th style={{ width: CHECKBOX_W, background: '#ffffff', borderRight: '1px solid #E2E8F0', padding: 0 }} />
                  {COL_DEFS.map((col) => {
                    const isActiveCol = activeCell?.col === col.key;
                    return (
                      <th
                        key={col.letter}
                        style={{
                          fontSize: 10, color: isActiveCol ? '#2a2a2a' : '#999',
                          fontWeight: isActiveCol ? 500 : 400,
                          background: isActiveCol ? '#f0f0ee' : '#ffffff',
                          borderRight: '1px solid #E2E8F0',
                          textAlign: 'center', padding: '3px 0',
                          width: col.width,
                        }}
                      >
                        {col.letter}
                      </th>
                    );
                  })}
                  {/* Actions gutter */}
                  <th style={{ background: '#ffffff', padding: 0, width: 80 }} />
                </tr>

                {/* Column Label Row */}
                <tr style={{ borderBottom: '2px solid #E2E8F0' }}>
                  {/* Gutter header */}
                  <th style={{
                    width: GUTTER_W, background: '#F8FAFC', borderRight: '1px solid #E2E8F0',
                    fontSize: 10, color: '#64748B', textAlign: 'center', padding: '11px 0',
                    position: 'sticky', top: 0, zIndex: 10,
                  }}>
                    #
                  </th>
                  {/* Checkbox header */}
                  <th style={{
                    width: CHECKBOX_W, background: '#F8FAFC', borderRight: '1px solid #E2E8F0',
                    textAlign: 'center', padding: '11px 4px',
                    position: 'sticky', top: 0, zIndex: 10,
                  }}>
                    <input
                      type="checkbox"
                      checked={tabFilteredContacts.length > 0 && selectedIds.size === tabFilteredContacts.length}
                      onChange={toggleSelectAll}
                      style={{ width: 13, height: 13, accentColor: '#444', cursor: 'pointer' }}
                    />
                  </th>
                  {COL_DEFS.map((col) => {
                    const isActiveCol = activeCell?.col === col.key;
                    return (
                      <th
                        key={col.key}
                        style={{
                          padding: '11px 12px',
                          textAlign: 'left',
                          fontSize: 10, fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.1em',
                          color: isActiveCol ? '#1E40AF' : '#64748B',
                          background: isActiveCol ? '#EFF6FF' : '#F8FAFC',
                          whiteSpace: 'nowrap',
                          width: col.width,
                          position: 'sticky', top: 0, zIndex: 10,
                        }}
                      >
                        {col.label}
                      </th>
                    );
                  })}
                  {/* Actions header */}
                  <th style={{
                    background: '#F8FAFC', padding: '11px 12px', textAlign: 'right',
                    fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                    letterSpacing: '0.1em', color: '#64748B', width: 80,
                    position: 'sticky', top: 0, zIndex: 10,
                  }} />
                </tr>
              </thead>
              <tbody>
                {tabFilteredContacts.map((contact, index) => {
                  const statusOption = STATUS_OPTIONS.find(opt => opt.value === contact.status);
                  const isSelected = !!(contact.id && selectedIds.has(contact.id));
                  const isActiveRow = activeCell?.rowId === contact.id;

                  return (
                    <tr
                      key={contact.id}
                      style={{
                        height: 32,
                        borderBottom: '1px solid #F1F5F9',
                        background: isSelected ? '#EFF6FF' : index % 2 === 1 ? '#F8FAFC' : 'white',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#EFF6FF'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = isSelected ? '#EFF6FF' : index % 2 === 1 ? '#F8FAFC' : 'white'; }}
                    >
                      {/* Row Number Gutter */}
                      <td
                        style={{
                          width: GUTTER_W, textAlign: 'center', fontSize: 10,
                          color: isSelected ? '#fff' : '#999',
                          background: isSelected ? '#2563EB' : '#ffffff',
                          borderRight: '1px solid #E2E8F0',
                          padding: '0 4px',
                          transition: 'background 0.08s, color 0.08s',
                        }}
                        onMouseEnter={(e) => { if (!isSelected) { e.currentTarget.style.background = '#EFF6FF'; e.currentTarget.style.color = '#2563EB'; } }}
                        onMouseLeave={(e) => { if (!isSelected) { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.color = '#999'; } }}
                      >
                        {index + 1}
                      </td>

                      {/* Checkbox */}
                      <td style={{ width: CHECKBOX_W, textAlign: 'center', borderRight: '1px solid #E2E8F0', padding: '0 4px' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => contact.id && toggleSelect(contact.id)}
                          style={{ width: 13, height: 13, accentColor: '#444', cursor: 'pointer' }}
                        />
                      </td>

                      {/* Name */}
                      <td
                        onClick={() => handleCellClick(index, 'name', contact.id)}
                        style={{
                          padding: '0 12px', whiteSpace: 'nowrap',
                          position: 'relative',
                          ...(activeCell?.rowId === contact.id && activeCell?.col === 'name' ? {
                            outline: '2px solid #2a2a2a', outlineOffset: -2, background: '#fff', zIndex: 1,
                          } : {}),
                        }}
                      >
                        {editingCell?.row === index && editingCell?.col === 'name' ? (
                          <div className="space-y-1" style={{ padding: '2px 0' }}>
                            <Input
                              value={contact.firstName}
                              onChange={(e) => handleCellEdit(contact.id!, 'firstName', e.target.value)}
                              onBlur={handleCellBlur}
                              placeholder="First name"
                              className="text-sm h-6 border-gray-300"
                              style={{ fontFamily: mono }}
                              autoFocus
                            />
                            <Input
                              value={contact.lastName}
                              onChange={(e) => handleCellEdit(contact.id!, 'lastName', e.target.value)}
                              onBlur={handleCellBlur}
                              placeholder="Last name"
                              className="text-sm h-6 border-gray-300"
                              style={{ fontFamily: mono }}
                            />
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, fontWeight: 500, color: '#2a2a2a', cursor: 'default' }}>
                            {getDisplayName(contact)}
                          </span>
                        )}
                      </td>

                      {/* LinkedIn */}
                      <td
                        onClick={() => handleCellClick(index, 'linkedin', contact.id)}
                        style={{
                          padding: '0 12px', whiteSpace: 'nowrap',
                          position: 'relative',
                          ...(activeCell?.rowId === contact.id && activeCell?.col === 'linkedin' ? {
                            outline: '2px solid #2a2a2a', outlineOffset: -2, background: '#fff', zIndex: 1,
                          } : {}),
                        }}
                      >
                        {contact.linkedinUrl ? (
                          <a
                            href={contact.linkedinUrl.startsWith('http') ? contact.linkedinUrl : `https://${contact.linkedinUrl}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              fontSize: 11, color: '#2563EB', textDecoration: 'none',
                              borderBottom: '1px solid #BFDBFE', paddingBottom: 1,
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = '#1D4ED8'; e.currentTarget.style.borderColor = '#1D4ED8'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = '#2563EB'; e.currentTarget.style.borderColor = '#BFDBFE'; }}
                          >
                            ↗ view
                          </a>
                        ) : (
                          <span style={{ color: '#bbb' }}> - </span>
                        )}
                      </td>

                      {/* Email */}
                      <td
                        onClick={() => handleCellClick(index, 'email', contact.id)}
                        style={{
                          padding: '0 12px', whiteSpace: 'nowrap',
                          position: 'relative',
                          ...(activeCell?.rowId === contact.id && activeCell?.col === 'email' ? {
                            outline: '2px solid #2a2a2a', outlineOffset: -2, background: '#fff', zIndex: 1,
                          } : {}),
                        }}
                      >
                        <span style={{ fontSize: 12, color: '#555' }}>{contact.email || ' - '}</span>
                      </td>

                      {/* Company */}
                      <td
                        onClick={() => handleCellClick(index, 'company', contact.id)}
                        style={{
                          padding: '0 12px', whiteSpace: 'nowrap',
                          position: 'relative',
                          ...(activeCell?.rowId === contact.id && activeCell?.col === 'company' ? {
                            outline: '2px solid #2a2a2a', outlineOffset: -2, background: '#fff', zIndex: 1,
                          } : {}),
                        }}
                      >
                        {editingCell?.row === index && editingCell?.col === 'company' ? (
                          <Input
                            value={contact.company}
                            onChange={(e) => handleCellEdit(contact.id!, 'company', e.target.value)}
                            onBlur={handleCellBlur}
                            className="text-sm h-6 border-gray-300"
                            style={{ fontFamily: mono }}
                            autoFocus
                          />
                        ) : (
                          <span style={{ fontSize: 12, color: '#555', cursor: 'default' }}>
                            {contact.company || <span style={{ color: '#bbb' }}> - </span>}
                          </span>
                        )}
                      </td>

                      {/* Role */}
                      <td
                        onClick={() => handleCellClick(index, 'jobTitle', contact.id)}
                        style={{
                          padding: '0 12px', whiteSpace: 'nowrap',
                          position: 'relative',
                          ...(activeCell?.rowId === contact.id && activeCell?.col === 'jobTitle' ? {
                            outline: '2px solid #2a2a2a', outlineOffset: -2, background: '#fff', zIndex: 1,
                          } : {}),
                        }}
                      >
                        {editingCell?.row === index && editingCell?.col === 'jobTitle' ? (
                          <Input
                            value={contact.jobTitle}
                            onChange={(e) => handleCellEdit(contact.id!, 'jobTitle', e.target.value)}
                            onBlur={handleCellBlur}
                            className="text-sm h-6 border-gray-300"
                            style={{ fontFamily: mono }}
                            autoFocus
                          />
                        ) : (
                          <span style={{ fontSize: 12, color: '#555', cursor: 'default' }}>
                            {contact.jobTitle || <span style={{ color: '#bbb' }}> - </span>}
                          </span>
                        )}
                      </td>

                      {/* Match */}
                      <td
                        style={{
                          padding: '0 12px', whiteSpace: 'nowrap',
                          position: 'relative',
                        }}
                      >
                        {(() => {
                          const clientMatch = getClientSideMatch(contact);
                          const label = contact.personalizationLabel || clientMatch?.label;
                          const type = contact.personalizationType || clientMatch?.type;

                          if (contact.warmthTier === 'warm') {
                            return (
                              <span style={{
                                display: 'inline-block', fontSize: 10, fontWeight: 500,
                                padding: '3px 10px', borderRadius: 12,
                                background: '#DCFCE7', color: '#15803D',
                              }}>
                                Strong match
                              </span>
                            );
                          }
                          if (contact.warmthTier === 'neutral') {
                            return (
                              <span style={{
                                display: 'inline-block', fontSize: 10, fontWeight: 500,
                                padding: '3px 10px', borderRadius: 12,
                                background: '#FEF3C7', color: '#92400E',
                              }}>
                                Good fit
                              </span>
                            );
                          }
                          if (label) {
                            return (
                              <span style={{
                                display: 'inline-block', fontSize: 10, fontWeight: 500,
                                padding: '3px 10px', borderRadius: 12,
                                background: type === 'university' ? 'rgba(59,130,246,0.1)' :
                                           type === 'hometown' ? 'rgba(34,197,94,0.1)' :
                                           type === 'company' ? 'rgba(124,58,237,0.1)' :
                                           '#F3F4F6',
                                color: type === 'university' ? '#2563EB' :
                                       type === 'hometown' ? '#16A34A' :
                                       type === 'company' ? '#7C3AED' :
                                       '#6B7280',
                              }}>
                                {label}
                              </span>
                            );
                          }
                          return <span style={{ color: '#bbb' }}> - </span>;
                        })()}
                      </td>

                      {/* Status */}
                      <td
                        onClick={() => handleCellClick(index, 'status', contact.id)}
                        style={{
                          padding: '0 12px', whiteSpace: 'nowrap',
                          position: 'relative',
                          ...(activeCell?.rowId === contact.id && activeCell?.col === 'status' ? {
                            outline: '2px solid #2a2a2a', outlineOffset: -2, background: '#fff', zIndex: 1,
                          } : {}),
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span
                            style={{
                              display: 'inline-block',
                              fontSize: 10, fontFamily: mono, fontWeight: 500,
                              padding: '3px 10px',
                              borderRadius: 12,
                              background: statusOption?.bg || '#F3F4F6',
                              color: statusOption?.color || '#6B7280',
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              // Cycle through statuses
                              const idx = STATUS_OPTIONS.findIndex(o => o.value === contact.status);
                              const next = STATUS_OPTIONS[(idx + 1) % STATUS_OPTIONS.length];
                              handleCellEdit(contact.id!, 'status', next.value);
                            }}
                          >
                            {contact.status || 'Not Contacted'}
                          </span>
                          {contact.gmailThreadId && contact.id && (
                            <NotificationBell
                              contactId={contact.id}
                              contactEmail={contact.email}
                              gmailThreadId={contact.gmailThreadId}
                              hasUnreadReply={replyStatuses[contact.id]?.isUnread || false}
                              notificationsMuted={contact.notificationsMuted || false}
                              onStateChange={() => { loadContacts(); checkRepliesForAllContacts(); }}
                            />
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '0 8px', whiteSpace: 'nowrap', textAlign: 'right', width: 80 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
                          {contact.email && (
                            <button
                              onClick={() => handleEmailClick(contact)}
                              style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', padding: 3 }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = '#2a2a2a'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = '#999'; }}
                            >
                              <Mail className="h-3 w-3" />
                            </button>
                          )}
                          {contact.email && contact.id && (
                            contact.gmailDraftId ? (
                              <button
                                onClick={() => window.open(contact.gmailDraftUrl || `https://mail.google.com/mail/#drafts`, '_blank')}
                                style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', padding: 3 }}
                                title="Open Gmail draft"
                                onMouseEnter={(e) => { e.currentTarget.style.color = '#2a2a2a'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.color = '#999'; }}
                              >
                                <ExternalLink className="h-3 w-3" />
                              </button>
                            ) : (
                              <button
                                onClick={() => handleDraftEmail(contact)}
                                disabled={draftingContactIds.has(contact.id)}
                                style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', padding: 3 }}
                                title="Create Gmail draft"
                                onMouseEnter={(e) => { e.currentTarget.style.color = '#2a2a2a'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.color = '#999'; }}
                              >
                                {draftingContactIds.has(contact.id) ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <PenLine className="h-3 w-3" />
                                )}
                              </button>
                            )
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteContact(contact.id!, getDisplayName(contact)); }}
                            style={{ background: 'none', border: 'none', color: '#bbb', cursor: 'pointer', padding: 3 }}
                            title="Delete contact"
                            onMouseEnter={(e) => { e.currentTarget.style.color = '#c00'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = '#bbb'; }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Empty search results */}
            {tabFilteredContacts.length === 0 && contacts.length > 0 && (
              <div style={{ padding: '40px 24px', textAlign: 'center', fontFamily: mono }}>
                <p style={{ color: '#999', fontSize: 12, marginBottom: 8 }}>
                  {searchQuery ? 'No contacts match your search.' : `No contacts in this view.`}
                </p>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    style={{ fontSize: 11, color: '#555', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', fontFamily: mono }}
                  >
                    Clear search
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Sheet Tab Bar */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'stretch',
          height: 30,
          background: '#ffffff',
          borderTop: '1px solid #E2E8F0',
          fontFamily: mono,
        }}
      >
        {/* + button */}
        <div
          style={{
            width: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRight: '1px solid #E2E8F0', fontSize: 16, color: '#bbb', cursor: 'pointer',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#555'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#bbb'; }}
        >
          +
        </div>

        {/* Tabs */}
        {([
          { id: 'contacts' as SheetTab, label: 'Contacts' },
          { id: 'replied' as SheetTab, label: 'Replied' },
          { id: 'pipeline' as SheetTab, label: 'Pipeline' },
        ]).map((tab) => {
          const isActive = sheetTab === tab.id;
          return (
            <div
              key={tab.id}
              onClick={() => setSheetTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 16px', cursor: 'pointer',
                fontSize: 11, fontFamily: mono,
                color: isActive ? '#1E40AF' : '#64748B',
                fontWeight: isActive ? 600 : 400,
                background: isActive ? '#EFF6FF' : 'transparent',
                borderTop: isActive ? '2px solid #2563EB' : '2px solid transparent',
                borderRight: '1px solid #E2E8F0',
                marginTop: -1,
              }}
            >
              {tab.label}
            </div>
          );
        })}

        <div style={{ flex: 1 }} />

        {/* Row count */}
        <div style={{
          display: 'flex', alignItems: 'center', padding: '0 12px',
          fontSize: 10, color: '#bbb', fontFamily: mono, whiteSpace: 'nowrap',
        }}>
          {tabFilteredContacts.length} rows · offerloop.ai
        </div>
      </div>

      {/* Mail App Selection Dialog */}
      {mailAppDialogOpen && selectedContactForEmail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', padding: 24, maxWidth: 400, width: '100%', margin: '0 16px' }}>
            <h3 style={{ fontSize: 14, fontWeight: 500, color: '#2a2a2a', marginBottom: 12, fontFamily: mono }}>Choose Email App</h3>
            <p style={{ fontSize: 12, color: '#555', marginBottom: 20, fontFamily: mono }}>
              Send email to {getDisplayName(selectedContactForEmail)}
            </p>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => handleMailAppSelect('apple')}
                style={{
                  flex: 1, padding: '16px 0', border: '1px solid #E2E8F0', background: '#fff',
                  cursor: 'pointer', fontFamily: mono, fontSize: 12, color: '#555',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#ffffff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; }}
              >
                <Mail className="h-4 w-4" />
                Apple Mail
              </button>
              <button
                onClick={() => handleMailAppSelect('gmail')}
                style={{
                  flex: 1, padding: '16px 0', border: '1px solid #E2E8F0', background: '#fff',
                  cursor: 'pointer', fontFamily: mono, fontSize: 12, color: '#555',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#ffffff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; }}
              >
                <Mail className="h-4 w-4" />
                Gmail
              </button>
            </div>

            <button
              onClick={() => { setMailAppDialogOpen(false); setSelectedContactForEmail(null); }}
              style={{ fontFamily: mono, fontSize: 11, color: '#999', background: 'none', border: 'none', cursor: 'pointer', width: '100%', marginTop: 16, textAlign: 'center' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Upgrade Dialog for CSV Export */}
      <AlertDialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Upgrade to Export CSV</AlertDialogTitle>
            <AlertDialogDescription>
              CSV export is available for Pro and Elite tier users. Upgrade your plan to export your contacts to CSV.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => navigate('/pricing')}>
              Upgrade
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mobile CSS */}
      <style>{`
        @media (max-width: 768px) {
          .contact-directory-page {
            width: 100%;
            max-width: 100vw;
            box-sizing: border-box;
          }
          .contact-directory-toolbar {
            flex-wrap: wrap;
            gap: 6px;
            padding: 6px 8px;
          }
          .contact-directory-search {
            flex: 1 1 100% !important;
          }
          .contact-directory-table-container {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }
          .contact-directory-table {
            min-width: 900px;
          }
        }
      `}</style>
    </div>
  );
};

export default SpreadsheetContactDirectory;
