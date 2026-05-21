import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Mail, ExternalLink } from "lucide-react";
import { useFirebaseAuth } from '../contexts/FirebaseAuthContext';
import { LoadingContainer } from '@/components/ui/LoadingBar';
import { firebaseApi } from '../services/firebaseApi';
import { useFirebaseMigration } from '../hooks/useFirebaseMigration';

interface Contact {
  id?: string;
  firstName: string;
  lastName: string;
  linkedinUrl: string;
  email: string;
  company: string;
  jobTitle: string;
  college: string;
  location: string;
  firstContactDate: string;
  status: string;
  lastContactDate: string;
  emailSubject?: string;
  emailBody?: string;
}

interface ContactDirectoryProps {
  userEmail?: string;
}

const ContactDirectory: React.FC<ContactDirectoryProps> = ({ userEmail = 'user@example.com' }) => {
  const { user } = useFirebaseAuth();
  const { migrationComplete } = useFirebaseMigration();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const effectiveUserEmail = user?.email || userEmail;

  const getStorageKey = () => `contacts_${effectiveUserEmail.replace('@', '_').replace('.', '_')}`;

  useEffect(() => {
    if (user || userEmail) {
      loadContacts();
    }
  }, [user, userEmail, migrationComplete]);

  const loadContacts = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      if (user) {
        console.log('Loading contacts from Firestore for:', user.uid);
        const firestoreContacts = await firebaseApi.getContacts(user.uid);
        setContacts(firestoreContacts);
        console.log(`Loaded ${firestoreContacts.length} contacts from Firestore`);
      } else {
        console.log('Loading contacts from localStorage for:', effectiveUserEmail);
        const storageKey = getStorageKey();
        const storedContacts = localStorage.getItem(storageKey);
        
        if (storedContacts) {
          const parsed = JSON.parse(storedContacts);
          setContacts(Array.isArray(parsed) ? parsed : []);
          console.log(`Loaded ${parsed.length} contacts from localStorage`);
        } else {
          setContacts([]);
          console.log('No contacts found in localStorage');
        }
      }
      
    } catch (err) {
      console.error('Failed to load contacts:', err);
      setError('Failed to load contacts. Please try again.');
      setContacts([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Function to save contacts to localStorage (called from parent component)
  const saveContacts = (newContacts: Partial<Contact>[]) => {
    try {
      const storageKey = getStorageKey();
      const existingContacts = contacts;
      const today = new Date().toLocaleDateString();
      
      const contactsToAdd: Contact[] = newContacts.map((contact, index) => ({
        id: `contact_${Date.now()}_${index}`,
        firstName: contact.firstName || '',
        lastName: contact.lastName || '',
        linkedinUrl: contact.linkedinUrl || '',
        email: contact.email || '',
        company: contact.company || '',
        jobTitle: contact.jobTitle || '',
        college: contact.college || '',
        location: contact.location || '',
        firstContactDate: today,
        status: 'Not Contacted',
        lastContactDate: today,
      }));
      
      // Check for duplicates (by email or LinkedIn)
      const updatedContacts = [...existingContacts];
      let addedCount = 0;
      let skippedCount = 0;
      
      contactsToAdd.forEach(newContact => {
        const isDuplicate = existingContacts.some(existing => 
          (existing.email && newContact.email && existing.email === newContact.email) ||
          (existing.linkedinUrl && newContact.linkedinUrl && existing.linkedinUrl === newContact.linkedinUrl)
        );
        
        if (!isDuplicate) {
          updatedContacts.push(newContact);
          addedCount++;
        } else {
          skippedCount++;
        }
      });
      
      localStorage.setItem(storageKey, JSON.stringify(updatedContacts));
      setContacts(updatedContacts);
      
      console.log(`Saved to localStorage: ${addedCount} added, ${skippedCount} skipped`);
      return { created: addedCount, skipped: skippedCount };
      
    } catch (err) {
      console.error('Failed to save contacts to localStorage:', err);
      throw err;
    }
  };

  // Expose save function globally so Home.tsx can call it
  useEffect(() => {
    (window as any).saveContactsToDirectory = saveContacts;
    return () => {
      delete (window as any).saveContactsToDirectory;
    };
  }, [contacts]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  const buildMailto = (contact: Contact) => {
    const to = (contact.email || '').trim();
    if (!to) return '#';

    let profInfo: any = {};
    let resumeData: any = {};
    try { profInfo = JSON.parse(localStorage.getItem('professionalInfo') || '{}'); } catch {}
    try { resumeData = JSON.parse(localStorage.getItem('resumeData') || '{}'); } catch {}
    const userName = (profInfo.firstName && profInfo.lastName) ? `${profInfo.firstName} ${profInfo.lastName}` : (resumeData.name || '');
    const userMajor = profInfo.fieldOfStudy || resumeData.major || '';
    const userUniversity = profInfo.university || resumeData.university || '';

    const subject = `Quick chat about your work at ${contact.company || 'your company'}`;

    const firstName = contact.firstName || contact.lastName || 'there';
    const intro = userName
      ? `I'm ${userName}${userMajor ? `, studying ${userMajor}` : ''}${userUniversity ? ` at ${userUniversity}` : ''}.`
      : `I came across your profile and was impressed by your work.`;
    const roleLine = (contact.jobTitle || contact.company)
      ? ` I noticed your work as ${contact.jobTitle || 'a professional'} at ${contact.company || 'your company'} and would love to learn more.`
      : '';

    const body = `Hi ${firstName},

${intro}${roleLine}

Would you be open to a brief 15–20 minute chat sometime this or next week?

Best regards,
${userName || ''}`;

    return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  // Fixed LinkedIn URL handling
  const normalizeLinkedInUrl = (url: string) => {
    if (!url || url.trim() === '') return '';
    
    const trimmedUrl = url.trim();
    
    // If it already starts with http, return as is
    if (trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://')) {
      return trimmedUrl;
    }
    
    // If it starts with linkedin.com or www.linkedin.com, add https://
    if (trimmedUrl.startsWith('linkedin.com') || trimmedUrl.startsWith('www.linkedin.com')) {
      return `https://${trimmedUrl}`;
    }
    
    // If it's just a path like /in/username, add the full domain
    if (trimmedUrl.startsWith('/in/')) {
      return `https://linkedin.com${trimmedUrl}`;
    }
    
    // If it contains linkedin but is malformed, try to fix it
    if (trimmedUrl.includes('linkedin') && trimmedUrl.includes('/in/')) {
      // Extract the /in/username part and rebuild
      const match = trimmedUrl.match(/\/in\/[^\/\s]+/);
      if (match) {
        return `https://linkedin.com${match[0]}`;
      }
    }
    
    // Otherwise, assume it's just a username and add the full path
    return `https://linkedin.com/in/${trimmedUrl}`;
  };

  const openLinkedIn = (url: string) => {
    if (!url) return;
    
    const normalizedUrl = normalizeLinkedInUrl(url);
    console.log('Opening LinkedIn URL:', normalizedUrl);
    
    try {
      window.open(normalizedUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('Failed to open LinkedIn URL:', error);
      // Fallback: try to navigate directly
      window.location.href = normalizedUrl;
    }
  };

  const clearAllContacts = () => {
    if (confirm('Are you sure you want to clear all contacts? This cannot be undone.')) {
      const storageKey = getStorageKey();
      localStorage.removeItem(storageKey);
      setContacts([]);
      console.log('Cleared all contacts from localStorage');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F8FAFC]">
        <LoadingContainer 
          label="Loading contacts..." 
          sublabel="Please wait" 
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <p className="text-red-600 mb-4">{error}</p>
        <Button onClick={loadContacts}>Try Again</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Contact Library</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">User: {effectiveUserEmail}</span>
          <span className="text-sm text-muted-foreground">Storage: {user ? 'Firestore' : 'localStorage'}</span>
          <Button onClick={loadContacts} variant="outline">
            Refresh
          </Button>
          {contacts.length > 0 && (
            <Button onClick={clearAllContacts} variant="destructive" size="sm">
              Clear All
            </Button>
          )}
        </div>
      </div>

      {contacts.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground text-lg">
            No contacts in your library yet.
          </p>
          <p className="text-muted-foreground mt-2">
            Use the search functionality with "Save to Library" enabled to add contacts.
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-border overflow-x-auto bg-background/60 backdrop-blur-sm">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">First Name</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Last Name</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">LinkedIn</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Email Link</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Email Address</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Company</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Job Title</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">College</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Location</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">First Contact Date</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Last Contact Date</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Mail</th>
              </tr>
            </thead>
            <tbody className="bg-background divide-y divide-border">
              {contacts.map((contact, index) => (
                <tr key={contact.id || index} className="hover:bg-secondary/50">
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-foreground">{contact.firstName}</td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-foreground">{contact.lastName}</td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm">
                    {contact.linkedinUrl ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openLinkedIn(contact.linkedinUrl)}
                        className="p-1 h-auto text-primary hover:text-primary/80 cursor-pointer"
                        title={`View ${contact.firstName || contact.lastName || ''}'s LinkedIn`}
                        type="button"
                      >
                        <ExternalLink className="h-4 w-4 mr-1" />
                        LinkedIn
                      </Button>
                    ) : (
                      <span className="text-muted-foreground text-xs">No LinkedIn</span>
                    )}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm">
                    {contact.email ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                        className="p-1 h-auto text-primary hover:text-primary/80"
                        title={`Email ${contact.firstName || contact.lastName || ''}`}
                      >
                        <a href={buildMailto(contact)}>
                          <Mail className="h-4 w-4 mr-1" />
                          Email
                        </a>
                      </Button>
                    ) : (
                      <span className="text-muted-foreground text-xs">No Email</span>
                    )}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-foreground">{contact.email}</td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-foreground">{contact.company}</td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-foreground">{contact.jobTitle}</td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-foreground">{contact.college}</td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-foreground">{contact.location}</td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-foreground">{formatDate(contact.firstContactDate)}</td>
                  <td className="px-3 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 rounded-full text-xs bg-muted text-foreground">
                      {contact.status}
                    </span>
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-foreground">{formatDate(contact.lastContactDate)}</td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm">
                    {contact.email ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        asChild
                        className="text-primary hover:text-primary/80"
                        aria-label={`Quick email ${contact.firstName || contact.lastName || ''}`}
                        title={`Email ${contact.firstName || contact.lastName || ''}`}
                      >
                        <a href={buildMailto(contact)}>
                          <Mail className="h-4 w-4" />
                        </a>
                      </Button>
                    ) : (
                      <span className="text-muted-foreground text-xs">No Email</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ContactDirectory;