import React, { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  Mail,
  Search,
  RefreshCw,
  Trash2,
  Download,
  Linkedin
} from "lucide-react";
import { useFirebaseAuth } from '../contexts/FirebaseAuthContext';
import { firebaseApi } from '../services/firebaseApi';
import type { Contact as ContactApi } from '../services/firebaseApi';
import { useFirebaseMigration } from '../hooks/useFirebaseMigration';
import { NotificationBell } from '../components/NotificationBell'; // adjust if your bell lives elsewhere
import { apiService } from '@/services/api';

// Reuse the Contact shape from firebaseApi so types stay in sync
type Contact = ContactApi;

const STATUS_OPTIONS = [
  { value: 'Not Contacted', color: '#A0A0A0', label: 'Not Contacted' },
  { value: 'Contacted', color: '#4285F4', label: 'Contacted' },
  { value: 'Followed Up', color: '#FB8C00', label: 'Followed Up' },
  { value: 'Responded', color: '#34A853', label: 'Responded' },
  { value: 'Call Scheduled', color: '#9C27B0', label: 'Call Scheduled' },
  { value: 'Rejected', color: '#EA4335', label: 'Rejected' },
  { value: 'Hired', color: '#FFD700', label: 'Hired' }
];

const SpreadsheetContactDirectory: React.FC = () => {
  const { user: currentUser } = useFirebaseAuth();
  const { isLoading: migrationLoading } = useFirebaseMigration();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ row: number; col: string } | null>(null);
  const [mailAppDialogOpen, setMailAppDialogOpen] = useState(false);
  const [selectedContactForEmail, setSelectedContactForEmail] = useState<Contact | null>(null);

  // 🔔 Reply check state
  const [replyStatuses, setReplyStatuses] = useState<Record<string, any>>({});
  const [isCheckingReplies, setIsCheckingReplies] = useState(false);

  const getStorageKey = () => {
    return currentUser ? `contacts_${currentUser.uid}` : 'contacts_anonymous';
  };

  // CSV Export function - excludes the Actions column
  const handleExportCsv = () => {
    if (!contacts || contacts.length === 0) {
      return;
    }

    // Define CSV headers - only data columns, excluding the "Actions" column
    // Matches table columns: Contact, LinkedIn, Email, Company, Role, Location, Status (Actions column excluded)
    const headers = [
      'Contact Name',
      'LinkedIn',
      'Email',
      'Company',
      'Role',
      'Location',
      'Status'
    ] as const;

    const headerRow = headers.join(',');

    // Map contacts to CSV rows
    const rows = contacts.map((contact) => {
      const contactName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
      const linkedIn = contact.linkedinUrl || '';
      const email = contact.email || '';
      const company = contact.company || '';
      const role = contact.jobTitle || '';
      const location = contact.location || '';
      const status = contact.status || '';

      // Escape and quote CSV values
      const escapeCSV = (value: string) => {
        const raw = value.toString();
        const escaped = raw.replace(/"/g, '""');
        return `"${escaped}"`;
      };

      return [
        escapeCSV(contactName),
        escapeCSV(linkedIn),
        escapeCSV(email),
        escapeCSV(company),
        escapeCSV(role),
        escapeCSV(location),
        escapeCSV(status)
      ].join(',');
    });

    // Combine header and rows
    const csv = [headerRow, ...rows].join('\n');

    // Create download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `contacts_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const normalizeFromServer = (serverContact: any): Contact => ({
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
    emailSubject: serverContact.emailSubject || serverContact.email_subject || '',
    emailBody: serverContact.emailBody || serverContact.email_body || '',
    gmailDraftId: serverContact.gmailDraftId || serverContact.gmail_draft_id || '',
    gmailDraftUrl: serverContact.gmailDraftUrl || serverContact.gmail_draft_url || '',
    createdAt: serverContact.createdAt || serverContact.created_at,
    updatedAt: serverContact.updatedAt || serverContact.updated_at,
    // Gmail tracking fields
    gmailThreadId: serverContact.gmailThreadId || serverContact.gmail_thread_id,
    gmailMessageId: serverContact.gmailMessageId || serverContact.gmail_message_id,
    hasUnreadReply: serverContact.hasUnreadReply || serverContact.has_unread_reply || false,
    notificationsMuted: serverContact.notificationsMuted || serverContact.notifications_muted || false,
    draftCreatedAt: serverContact.draftCreatedAt,
    lastChecked: serverContact.lastChecked,
    mutedAt: serverContact.mutedAt,
  });

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

  // ✅ Build a strictly typed array for bulkCreateContacts
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

          // required
          firstContactDate: today,
          status: 'Not Contacted',
          lastContactDate: today,

          // optional (only include if present)
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


  // 🔔 Check replies for all contacts
  const checkRepliesForAllContacts = useCallback(async () => {
    if (!contacts || contacts.length === 0 || isCheckingReplies || !currentUser) return;
    setIsCheckingReplies(true);

    try {
      const contactsWithThreads = contacts
        .filter((c) => c.gmailThreadId && !c.notificationsMuted && c.id)
        .map((c) => c.id!)
        .filter(Boolean);

      if (contactsWithThreads.length === 0) {
        setIsCheckingReplies(false);
        return;
      }

      const result = await apiService.batchCheckReplies(contactsWithThreads);
      if ('results' in result) setReplyStatuses(result.results);
    } catch (error) {
      console.error('Error checking replies:', error);
    } finally {
      setIsCheckingReplies(false);
    }
  }, [contacts, isCheckingReplies, currentUser]);

  useEffect(() => {
    if (currentUser && contacts.length > 0) {
      checkRepliesForAllContacts();
      const interval = setInterval(() => checkRepliesForAllContacts(), 120000);
      return () => clearInterval(interval);
    }
  }, [currentUser, contacts.length, checkRepliesForAllContacts]);

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

  const handleCellClick = (row: number, col: string) => {
    if (col === 'status' || col === 'actions') return;
    setEditingCell({ row, col });
  };

  const handleCellBlur = () => {
    setEditingCell(null);
  };

  const buildMailto = (contact: Contact) => {
    const to = contact.email;
    if (!to) return '#';
    const subject =
      contact.emailSubject || `Question about your work at ${contact.company || 'your company'}`;
    const body =
      contact.emailBody ||
      `Hi ${contact.firstName || 'there'},\n\nI'd love to connect and learn more about your work.\n\nBest regards`;
    return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body.replace(/\n/g, '\r\n'))}`;
  };

  const buildGmailLink = (contact: Contact) => {
    // If a Gmail draft exists, open that instead (has resume attached)
    if (contact.gmailDraftUrl) {
      return contact.gmailDraftUrl;
    }
    
    const to = contact.email;
    if (!to) return '#';
    const subject =
      contact.emailSubject || `Question about your work at ${contact.company || 'your company'}`;
    const body =
      contact.emailBody ||
      `Hi ${contact.firstName || 'there'},\n\nI'd love to connect and learn more about your work.\n\nBest regards`;
    return `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(
      to
    )}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const handleEmailClick = (contact: Contact) => {
    // If Gmail draft exists, open it directly (has resume attached)
    if (contact.gmailDraftUrl) {
      window.open(contact.gmailDraftUrl, '_blank');
      return;
    }
    
    // Otherwise, show dialog to choose mail app
    setSelectedContactForEmail(contact);
    setMailAppDialogOpen(true);
  };

  const handleMailAppSelect = (app: 'apple' | 'gmail') => {
    if (!selectedContactForEmail) return;
    if (app === 'apple') {
      window.open(buildMailto(selectedContactForEmail), '_blank');
    } else {
      window.open(buildGmailLink(selectedContactForEmail), '_blank');
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

  const deleteContact = async (contactId: string) => {
    if (window.confirm('Are you sure you want to delete this contact? This action cannot be undone.')) {
      try {
        if (currentUser && contactId && !contactId.startsWith('local_')) {
          // Delete from Firebase
          await firebaseApi.deleteContact(currentUser.uid, contactId);
        }
        
        // Remove from local state
        const updatedContacts = contacts.filter(contact => contact.id !== contactId);
        setContacts(updatedContacts);
        
        // Update localStorage if not logged in or if it's a local contact
        if (!currentUser || contactId.startsWith('local_')) {
          await saveContacts(updatedContacts);
        }
      } catch (err) {
        console.error('Error deleting contact:', err);
        setError('Failed to delete contact');
      }
    }
  };

  useEffect(() => {
    if (!migrationLoading) {
      loadContacts();
    }
  }, [currentUser, migrationLoading]);

  if (migrationLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-foreground">Loading contacts...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4 flex flex-col w-full py-4 px-6">
        {/* Export CSV Button */}
        {contacts.length > 0 && (
          <div className="flex justify-between items-center bg-card backdrop-blur-sm rounded-lg shadow-sm border border-border p-4 w-full">
            <div>
              <p className="text-sm font-medium text-foreground">
                {contacts.length} contact{contacts.length !== 1 ? 's' : ''} saved
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Export your results to CSV for further analysis
              </p>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={handleExportCsv} 
                className="gap-2 bg-blue-600 hover:bg-blue-700"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={loadContacts}
                disabled={isLoading}
                className="flex items-center gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={clearAllContacts}
                className="flex items-center gap-2 text-red-400 border-red-600 hover:bg-red-900/20"
              >
                <Trash2 className="h-4 w-4" />
                Clear All
              </Button>
            </div>
          </div>
        )}

        {/* Search */}
        {contacts.length > 0 && (
          <div className="w-full">
            <div className="relative w-80">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                type="text"
                placeholder="Search contacts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-muted border-border text-foreground placeholder-muted-foreground focus:border-primary focus:ring-primary"
              />
            </div>
          </div>
        )}

      {error && (
        <div className="bg-red-900/20 border border-red-600 text-red-400 px-6 py-3 mx-6 mt-4 rounded">
          {error}
        </div>
      )}

      {contacts.length === 0 ? (
        <div className="bg-card backdrop-blur-sm rounded-xl shadow-sm border border-border p-12 text-center w-full">
          <p className="text-foreground mb-2">No contacts to display yet</p>
          <p className="text-sm text-muted-foreground">
            Switch to the "Contact Search" tab to find professionals
          </p>
        </div>
      ) : (
        <div className="w-full">
          <div className="bg-card backdrop-blur-sm rounded-xl shadow-sm border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Contact
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      LinkedIn
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Company
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Location
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Actions
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Delete
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-background divide-y divide-border">
                  {filteredContacts.map((contact, index) => {
                    const statusOption = STATUS_OPTIONS.find(opt => opt.value === contact.status);

                    return (
                      <tr
                        key={contact.id}
                        className="hover:bg-accent transition-colors"
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            {editingCell?.row === index && editingCell?.col === 'name' ? (
                              <div className="space-y-1">
                                <Input
                                  value={contact.firstName}
                                  onChange={(e) => handleCellEdit(contact.id!, 'firstName', e.target.value)}
                                  onBlur={handleCellBlur}
                                  placeholder="First name"
                                  className="text-sm h-6 bg-muted border-border text-foreground"
                                  autoFocus
                                />
                                <Input
                                  value={contact.lastName}
                                  onChange={(e) => handleCellEdit(contact.id!, 'lastName', e.target.value)}
                                  onBlur={handleCellBlur}
                                  placeholder="Last name"
                                  className="text-sm h-6 bg-muted border-border text-foreground"
                                />
                              </div>
                            ) : (
                              <div
                                onClick={() => handleCellClick(index, 'name')}
                                className="cursor-text hover:bg-accent rounded px-2 py-1 transition-colors"
                              >
                                <div className="text-sm font-medium text-foreground">{getDisplayName(contact)}</div>
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-4 whitespace-nowrap text-center">
                          {contact.linkedinUrl ? (
                            <a
                              href={
                                contact.linkedinUrl.startsWith('http')
                                  ? contact.linkedinUrl
                                  : `https://${contact.linkedinUrl}`
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center p-2 text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                              title="View on LinkedIn"
                            >
                              <Linkedin className="h-5 w-5" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          {contact.email ? (
                            <span className="text-sm text-foreground">{contact.email}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          {editingCell?.row === index && editingCell?.col === 'company' ? (
                            <Input
                              value={contact.company}
                              onChange={(e) => handleCellEdit(contact.id!, 'company', e.target.value)}
                              onBlur={handleCellBlur}
                              className="text-sm h-8 bg-muted border-border text-foreground"
                              autoFocus
                            />
                          ) : (
                            <div
                              onClick={() => handleCellClick(index, 'company')}
                              className="cursor-text hover:bg-accent rounded px-2 py-1 text-sm text-foreground transition-colors"
                            >
                              {contact.company || <span className="text-gray-600">—</span>}
                            </div>
                          )}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          {editingCell?.row === index && editingCell?.col === 'jobTitle' ? (
                            <Input
                              value={contact.jobTitle}
                              onChange={(e) => handleCellEdit(contact.id!, 'jobTitle', e.target.value)}
                              onBlur={handleCellBlur}
                              className="text-sm h-8 bg-muted border-border text-foreground"
                              autoFocus
                            />
                          ) : (
                            <div
                              onClick={() => handleCellClick(index, 'jobTitle')}
                              className="cursor-text hover:bg-accent rounded px-2 py-1 text-sm text-foreground transition-colors"
                            >
                              {contact.jobTitle || <span className="text-gray-600">—</span>}
                            </div>
                          )}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          {editingCell?.row === index && editingCell?.col === 'location' ? (
                            <Input
                              value={contact.location}
                              onChange={(e) => handleCellEdit(contact.id!, 'location', e.target.value)}
                              onBlur={handleCellBlur}
                              className="text-sm h-8 bg-muted border-border text-foreground"
                              autoFocus
                            />
                          ) : (
                            <div
                              onClick={() => handleCellClick(index, 'location')}
                              className="cursor-text hover:bg-accent rounded px-2 py-1 text-sm text-foreground transition-colors"
                            >
                              {contact.location || <span className="text-gray-600">—</span>}
                            </div>
                          )}
                        </td>

                        {/* Status + Bell */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <select
                              value={contact.status}
                              onChange={(e) => handleCellEdit(contact.id!, 'status', e.target.value)}
                              className="flex-1 text-xs bg-muted border-border text-foreground focus:ring-1 focus:ring-primary cursor-pointer rounded px-2 py-1.5"
                              style={{ color: statusOption?.color }}
                            >
                              {STATUS_OPTIONS.map(option => (
                                <option
                                  key={option.value}
                                  value={option.value}
                                  style={{ color: option.color }}
                                >
                                  {option.label}
                                </option>
                              ))}
                            </select>

                            {contact.gmailThreadId && contact.id && (
                              <NotificationBell
                                contactId={contact.id}
                                contactEmail={contact.email}
                                gmailThreadId={contact.gmailThreadId}
                                hasUnreadReply={replyStatuses[contact.id]?.isUnread || false}
                                notificationsMuted={contact.notificationsMuted || false}
                                onStateChange={() => {
                                  loadContacts();
                                  checkRepliesForAllContacts();
                                }}
                              />
                            )}
                          </div>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          {contact.email ? (
                            <button
                              onClick={() => handleEmailClick(contact)}
                              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-blue-300 bg-blue-500/20 border border-blue-500/30 rounded-lg hover:bg-blue-500/30 hover:text-blue-200 transition-colors"
                              title={`Email ${getDisplayName(contact)}${
                                contact.emailSubject ? ' (Generated email available)' : ''
                              }`}
                            >
                              <Mail
                                className={`h-4 w-4 mr-1.5 ${
                                  contact.emailSubject ? 'text-green-300' : ''
                                }`}
                              />
                              Email
                            </button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <button
                            onClick={() => deleteContact(contact.id!)}
                            className="inline-flex items-center justify-center p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                            title={`Delete ${getDisplayName(contact)}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {filteredContacts.length === 0 && contacts.length > 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No contacts match your search.</p>
              <Button
                variant="ghost"
                onClick={() => setSearchQuery('')}
                className="mt-2"
              >
                Clear search
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Summary Footer */}
      {contacts.length > 0 && (
        <div className="w-full border-t border-border bg-muted px-6 py-3">
          <div className="flex justify-between items-center text-sm text-foreground">
            <div>
              Total contacts: {filteredContacts?.length || 0}
              {searchQuery && ` (filtered from ${contacts.length})`}
            </div>
            <div className="text-xs text-muted-foreground">
              {(filteredContacts || contacts).filter(c => c.emailSubject).length} contacts have generated emails
            </div>
          </div>
        </div>
      )}

      {/* Mail App Selection Dialog */}
      {mailAppDialogOpen && selectedContactForEmail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 max-w-md w-full mx-4 border border-border">
            <h3 className="text-xl font-semibold text-foreground mb-4">Choose Email App</h3>
            <p className="text-foreground mb-6">
              Send email to {getDisplayName(selectedContactForEmail)}
            </p>

            <div className="flex gap-3">
              <Button
                onClick={() => handleMailAppSelect('apple')}
                className="flex-1 bg-muted hover:bg-accent text-foreground py-6"
              >
                <div className="flex flex-col items-center gap-2">
                  <Mail className="h-6 w-6" />
                  <span>Apple Mail</span>
                </div>
              </Button>

              <Button
                onClick={() => handleMailAppSelect('gmail')}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-6"
              >
                <div className="flex flex-col items-center gap-2">
                  <Mail className="h-6 w-6" />
                  <span>Gmail</span>
                </div>
              </Button>
            </div>

            <Button
              onClick={() => {
                setMailAppDialogOpen(false);
                setSelectedContactForEmail(null);
              }}
              variant="ghost"
              className="w-full mt-4"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SpreadsheetContactDirectory;