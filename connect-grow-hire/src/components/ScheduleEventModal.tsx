import React, { useState, useEffect } from 'react';
import { useFirebaseAuth } from '@/contexts/FirebaseAuthContext';
import { firebaseApi, type CalendarEvent, type Contact } from '@/services/firebaseApi';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Search, X } from 'lucide-react';
import { format, startOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface ScheduleEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEventCreated: () => void;
  prefillContact?: {
    contactId?: string;
    contactName?: string;
    firm?: string;
  };
}

export function ScheduleEventModal({
  isOpen,
  onClose,
  onEventCreated,
  prefillContact,
}: ScheduleEventModalProps) {
  const { user } = useFirebaseAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form state
  const [contactSearch, setContactSearch] = useState('');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [contactOptions, setContactOptions] = useState<Contact[]>([]);
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  
  const [title, setTitle] = useState('');
  const [firm, setFirm] = useState('');
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState('30');
  const [type, setType] = useState<'video' | 'phone' | 'in-person'>('video');
  const [meetingLink, setMeetingLink] = useState('');
  const [notes, setNotes] = useState('');

  // Time options (30-minute intervals from 8:00 AM to 8:00 PM)
  const timeOptions = React.useMemo(() => {
    const options: string[] = [];
    for (let hour = 8; hour <= 20; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        options.push(timeStr);
      }
    }
    return options;
  }, []);

  // Prefill from props
  useEffect(() => {
    if (prefillContact && isOpen) {
      if (prefillContact.contactName) {
        setContactSearch(prefillContact.contactName);
        setTitle(`Meeting with ${prefillContact.contactName}`);
      }
      if (prefillContact.firm) {
        setFirm(prefillContact.firm);
      }
      if (prefillContact.contactId) {
        // Try to load the contact
        firebaseApi.getContact(user?.uid || '', prefillContact.contactId).then(contact => {
          if (contact) {
            setSelectedContact(contact);
            setFirm(contact.company || prefillContact.firm || '');
          }
        });
      }
    }
  }, [prefillContact, isOpen, user?.uid]);

  // Search contacts
  useEffect(() => {
    if (contactSearch.length > 1 && !selectedContact) {
      const searchTimeout = setTimeout(() => {
        if (user?.uid) {
          firebaseApi.searchContacts(user.uid, contactSearch, 5).then(results => {
            setContactOptions(results);
            setShowContactDropdown(true);
          });
        }
      }, 300);
      
      return () => clearTimeout(searchTimeout);
    } else {
      setContactOptions([]);
      setShowContactDropdown(false);
    }
  }, [contactSearch, selectedContact, user?.uid]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setContactSearch('');
      setSelectedContact(null);
      setTitle('');
      setFirm('');
      setDate(undefined);
      setTime('');
      setDuration('30');
      setType('video');
      setMeetingLink('');
      setNotes('');
      setContactOptions([]);
      setShowContactDropdown(false);
    }
  }, [isOpen]);

  const handleContactSelect = (contact: Contact) => {
    setSelectedContact(contact);
    setContactSearch(`${contact.firstName} ${contact.lastName}`.trim() || contact.email);
    setFirm(contact.company || '');
    setTitle(`Meeting with ${contact.firstName} ${contact.lastName}`.trim() || contact.email);
    setShowContactDropdown(false);
  };

  const handleRemoveContact = () => {
    setSelectedContact(null);
    setContactSearch('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user?.uid) {
      toast({
        title: 'Error',
        description: 'You must be logged in to schedule an event',
        variant: 'destructive',
      });
      return;
    }

    // Validation
    if (!title.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Please enter an event title',
        variant: 'destructive',
      });
      return;
    }

    if (!firm.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Please enter a firm name',
        variant: 'destructive',
      });
      return;
    }

    if (!date) {
      toast({
        title: 'Validation Error',
        description: 'Please select a date',
        variant: 'destructive',
      });
      return;
    }

    if (!time) {
      toast({
        title: 'Validation Error',
        description: 'Please select a time',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Use date-fns to format the date, which handles timezones correctly
      // First, normalize to start of day to avoid any time component issues
      const normalizedDate = startOfDay(date);
      
      // Format using date-fns which respects local timezone
      const dateStr = format(normalizedDate, 'yyyy-MM-dd');
      
      // Also extract components manually for verification
      const year = normalizedDate.getFullYear();
      const month = normalizedDate.getMonth() + 1;
      const day = normalizedDate.getDate();
      
      console.log('📅 Creating event with date:', {
        inputDate: date,
        inputDateISO: date.toISOString(),
        inputDateLocal: date.toLocaleDateString(),
        normalizedDate: normalizedDate.toISOString(),
        normalizedLocal: normalizedDate.toLocaleDateString(),
        year,
        month,
        day,
        formattedDate: dateStr,
        formattedViaDateFns: format(normalizedDate, 'yyyy-MM-dd'),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      
      const eventData: Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'> = {
        title: title.trim(),
        contactId: selectedContact?.id,
        contactName: selectedContact 
          ? `${selectedContact.firstName} ${selectedContact.lastName}`.trim() || selectedContact.email
          : contactSearch.trim() || 'Unknown',
        firm: firm.trim(),
        date: dateStr,
        time: time,
        duration: parseInt(duration, 10),
        type,
        status: 'pending',
        // Only include optional fields if they have values (not empty strings)
        ...(meetingLink.trim() && { meetingLink: meetingLink.trim() }),
        ...(notes.trim() && { notes: notes.trim() }),
      };

      await firebaseApi.createCalendarEvent(user.uid, eventData);

      toast({
        title: 'Event Scheduled',
        description: 'Your calendar event has been created successfully',
      });

      onEventCreated();
      onClose();
    } catch (error) {
      console.error('Error creating calendar event:', error);
      toast({
        title: 'Error',
        description: 'Failed to create calendar event. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Schedule New Event</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Contact Selection */}
          <div className="space-y-2">
            <Label htmlFor="contact">Contact (Optional)</Label>
            <div className="relative">
              {selectedContact ? (
                <div className="flex items-center gap-2 p-2 rounded-lg border border-border bg-background">
                  <div className="flex-1">
                    <div className="text-sm font-medium">
                      {`${selectedContact.firstName} ${selectedContact.lastName}`.trim() || selectedContact.email}
                    </div>
                    <div className="text-xs text-text-muted">{selectedContact.company}</div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveContact}
                    className="h-6 w-6 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                    <Input
                      id="contact"
                      className="pl-9"
                      placeholder="Search contacts..."
                      value={contactSearch}
                      onChange={(e) => setContactSearch(e.target.value)}
                      onFocus={() => {
                        if (contactOptions.length > 0) {
                          setShowContactDropdown(true);
                        }
                      }}
                    />
                  </div>
                  {showContactDropdown && contactOptions.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {contactOptions.map((contact) => (
                        <button
                          key={contact.id}
                          type="button"
                          className="w-full text-left px-4 py-2 hover:bg-background transition-colors"
                          onClick={() => handleContactSelect(contact)}
                        >
                          <div className="text-sm font-medium">
                            {`${contact.firstName} ${contact.lastName}`.trim() || contact.email}
                          </div>
                          <div className="text-xs text-text-muted">{contact.company}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Event Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Meeting with..."
              required
            />
          </div>

          {/* Firm */}
          <div className="space-y-2">
            <Label htmlFor="firm">Firm *</Label>
            <Input
              id="firm"
              value={firm}
              onChange={(e) => setFirm(e.target.value)}
              placeholder="Company name"
              required
            />
          </div>

          {/* Date and Time Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !date && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(selectedDate) => {
                      // Handle date selection - use date-fns startOfDay to normalize
                      if (selectedDate) {
                        // Use date-fns startOfDay to ensure we get the date at local midnight
                        // This handles any timezone issues from the calendar picker
                        const normalized = startOfDay(selectedDate);
                        
                        console.log('📅 Date selected from calendar:', {
                          original: selectedDate,
                          originalISO: selectedDate.toISOString(),
                          originalLocal: selectedDate.toLocaleDateString(),
                          originalUTC: {
                            year: selectedDate.getUTCFullYear(),
                            month: selectedDate.getUTCMonth() + 1,
                            day: selectedDate.getUTCDate(),
                          },
                          originalLocalValues: {
                            year: selectedDate.getFullYear(),
                            month: selectedDate.getMonth() + 1,
                            day: selectedDate.getDate(),
                          },
                          normalized,
                          normalizedISO: normalized.toISOString(),
                          normalizedLocal: normalized.toLocaleDateString(),
                          normalizedValues: {
                            year: normalized.getFullYear(),
                            month: normalized.getMonth() + 1,
                            day: normalized.getDate(),
                          },
                          formatted: format(normalized, 'yyyy-MM-dd'),
                        });
                        
                        setDate(normalized);
                      } else {
                        setDate(undefined);
                      }
                    }}
                    disabled={(date) => {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                      return checkDate < today;
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="time">Time *</Label>
              <Select value={time} onValueChange={setTime} required>
                <SelectTrigger id="time">
                  <SelectValue placeholder="Select time" />
                </SelectTrigger>
                <SelectContent>
                  {timeOptions.map((timeOption) => {
                    const [hours, minutes] = timeOption.split(':');
                    const hour = parseInt(hours, 10);
                    const ampm = hour >= 12 ? 'PM' : 'AM';
                    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
                    const displayTime = `${displayHour}:${minutes} ${ampm}`;
                    
                    return (
                      <SelectItem key={timeOption} value={timeOption}>
                        {displayTime}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Duration and Type Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="duration">Duration (minutes) *</Label>
              <Select value={duration} onValueChange={setDuration} required>
                <SelectTrigger id="duration">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="45">45 minutes</SelectItem>
                  <SelectItem value="60">60 minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Type *</Label>
              <Select value={type} onValueChange={(value) => setType(value as typeof type)} required>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="video">Video</SelectItem>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="in-person">In-Person</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Meeting Link */}
          <div className="space-y-2">
            <Label htmlFor="meetingLink">Meeting Link (Optional)</Label>
            <Input
              id="meetingLink"
              type="url"
              value={meetingLink}
              onChange={(e) => setMeetingLink(e.target.value)}
              placeholder="https://meet.google.com/..."
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes about this meeting..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="gradient-bg">
              {isSubmitting ? 'Scheduling...' : 'Schedule Event'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
