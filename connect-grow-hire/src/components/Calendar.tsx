import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, MapPin, Video, Phone, Download, ExternalLink, Loader2, Trash2, Coffee } from 'lucide-react';
import { useFirebaseAuth } from '@/contexts/FirebaseAuthContext';
import { firebaseApi, type CalendarEvent, type FollowUpReminder } from '@/services/firebaseApi';
import { ScheduleEventModal } from './ScheduleEventModal';
import { generateGoogleCalendarLink, downloadICS } from '@/utils/calendarHelpers';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameMonth, isSameDay, isToday, addMonths, subMonths } from 'date-fns';

const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function Calendar() {
  const { user } = useFirebaseAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [reminders, setReminders] = useState<FollowUpReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Fetch events and reminders
  useEffect(() => {
    const fetchData = async () => {
      if (!user?.uid) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const month = currentMonth.getMonth();
        const year = currentMonth.getFullYear();
        
        console.log(`📅 Fetching calendar events for month ${month + 1}/${year}`);
        
        const [fetchedEvents, fetchedReminders] = await Promise.all([
          firebaseApi.getCalendarEvents(user.uid, month, year),
          firebaseApi.getFollowUpReminders(user.uid),
        ]);

        console.log(`✅ Fetched ${fetchedEvents.length} events:`, fetchedEvents);
        setEvents(fetchedEvents);
        setReminders(fetchedReminders);
      } catch (error) {
        console.error('Error fetching calendar data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user?.uid, currentMonth]);

  // Auto-complete past events
  useEffect(() => {
    const completePastEvents = async () => {
      if (!user?.uid || events.length === 0) return;

      const now = new Date();
      const updates: Array<{ id: string; updates: Partial<CalendarEvent> }> = [];

      events.forEach(event => {
        // Parse date string without timezone conversion
        const [year, month, day] = event.date.split('-').map(Number);
        const [hours, minutes] = event.time.split(':').map(Number);
        const eventDate = new Date(year, month - 1, day, hours, minutes);
        if (
          eventDate < now &&
          event.status !== 'completed' &&
          event.status !== 'cancelled'
        ) {
          updates.push({
            id: event.id!,
            updates: { status: 'completed' },
          });
        }
      });

      // Update events in parallel
      if (updates.length > 0) {
        Promise.all(
          updates.map(({ id, updates }) =>
            firebaseApi.updateCalendarEvent(user.uid!, id, updates)
          )
        ).then(() => {
          // Refresh events
          const month = currentMonth.getMonth();
          const year = currentMonth.getFullYear();
          firebaseApi.getCalendarEvents(user.uid!, month, year).then(setEvents);
        });
      }
    };

    completePastEvents();
  }, [events, user?.uid, currentMonth]);

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    
    // Get first day of month (0 = Sunday, 6 = Saturday)
    const firstDayOfWeek = getDay(monthStart);
    
    // Get year and month for building date strings
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth() + 1; // getMonth() returns 0-11, we need 1-12
    
    // Get number of days in the month
    const daysInMonth = monthEnd.getDate();
    
    // Create array with empty slots for days before month starts
    const days: Array<{ date: number; hasEvent: boolean; isCurrentMonth: boolean; isToday: boolean }> = [];
    
    // Add empty slots
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push({ date: 0, hasEvent: false, isCurrentMonth: false, isToday: false });
    }
    
    console.log(`📅 Generating calendar days for ${format(currentMonth, 'MMMM yyyy')} with ${events.length} events`);
    console.log(`📅 Events:`, events.map(e => ({ title: e.title, date: e.date })));
    
    // Add days of the month - iterate directly without using Date objects
    for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber++) {
      // Build date string manually: "yyyy-MM-dd"
      const dayDateStr = `${year}-${String(month).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
      
      // Check if this day has events
      const hasEvent = events.some(event => {
        if (!event.date) return false;
        
        // Direct string comparison
        const isMatch = event.date === dayDateStr;
        
        if (isMatch) {
          console.log(`✅ Event found on day ${dayNumber} (${dayDateStr}):`, event.title, `event.date=${event.date}`);
        }
        
        return isMatch;
      });
      
      // Check if this is today
      const today = new Date();
      const isToday = today.getFullYear() === year && 
                     today.getMonth() + 1 === month && 
                     today.getDate() === dayNumber;
      
      days.push({
        date: dayNumber,
        hasEvent,
        isCurrentMonth: true,
        isToday,
      });
    }
    
    const daysWithEvents = days.filter(d => d.hasEvent).length;
    console.log(`📅 Calendar generated: ${daysWithEvents} days with events`);
    
    return days;
  }, [currentMonth, events]);

  // Get events for a specific day
  const getEventsForDay = (dayNumber: number) => {
    if (dayNumber === 0) return [];
    
    // Build date string manually to avoid timezone issues
    const dayYear = currentMonth.getFullYear();
    const dayMonth = currentMonth.getMonth() + 1; // getMonth() returns 0-11, we need 1-12
    const dayDateStr = `${dayYear}-${String(dayMonth).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
    
    return events.filter(event => {
      if (!event.date) return false;
      // Direct string comparison
      return event.date === dayDateStr;
    });
  };

  // Helper to parse date and time without timezone conversion
  const parseEventDateTime = (dateStr: string, timeStr: string): Date => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hours, minutes] = timeStr.split(':').map(Number);
    return new Date(year, month - 1, day, hours, minutes);
  };

  // Get upcoming events (sorted by date/time)
  const upcomingEvents = events
    .filter(event => {
      const eventDate = parseEventDateTime(event.date, event.time);
      return eventDate >= new Date() && event.status !== 'cancelled';
    })
    .sort((a, b) => {
      const dateA = parseEventDateTime(a.date, a.time);
      const dateB = parseEventDateTime(b.date, b.time);
      return dateA.getTime() - dateB.getTime();
    })
    .slice(0, 10); // Limit to 10 upcoming events

  // Format time for display
  const formatTime = (timeStr: string): string => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const hour = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    const ampm = hours >= 12 ? 'PM' : 'AM';
    return `${hour}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  // Format date for display - parse date string without timezone conversion
  const formatEventDate = (dateStr: string): string => {
    // Parse date string (format: "yyyy-MM-dd") without timezone conversion
    const [year, month, day] = dateStr.split('-').map(Number);
    // Create date in local timezone to avoid timezone shift
    const date = new Date(year, month - 1, day);
    return format(date, 'MMM d, yyyy');
  };

  const handlePreviousMonth = () => {
    setCurrentMonth(subMonths(currentMonth, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(addMonths(currentMonth, 1));
  };

  const handleDayClick = (dayNumber: number) => {
    if (dayNumber === 0) return;
    setSelectedDay(selectedDay === dayNumber ? null : dayNumber);
  };

  const handleEventCreated = async () => {
    if (!user?.uid) return;
    const month = currentMonth.getMonth();
    const year = currentMonth.getFullYear();
    console.log('🔄 Refreshing calendar after event creation...');
    const [refreshedEvents, refreshedReminders] = await Promise.all([
      firebaseApi.getCalendarEvents(user.uid, month, year),
      firebaseApi.getFollowUpReminders(user.uid),
    ]);
    console.log(`✅ Refreshed: ${refreshedEvents.length} events`);
    setEvents(refreshedEvents);
    setReminders(refreshedReminders);
  };

  const handleDeleteEvent = async (eventId: string, eventTitle: string) => {
    if (!user?.uid) return;
    
    // Confirm deletion
    if (!confirm(`Are you sure you want to delete "${eventTitle}"?`)) {
      return;
    }

    try {
      await firebaseApi.deleteCalendarEvent(user.uid, eventId);
      
      // Refresh events
      const month = currentMonth.getMonth();
      const year = currentMonth.getFullYear();
      const [refreshedEvents, refreshedReminders] = await Promise.all([
        firebaseApi.getCalendarEvents(user.uid, month, year),
        firebaseApi.getFollowUpReminders(user.uid),
      ]);
      
      setEvents(refreshedEvents);
      setReminders(refreshedReminders);
      
      console.log(`✅ Event deleted: ${eventTitle}`);
    } catch (error) {
      console.error('Error deleting event:', error);
      alert('Failed to delete event. Please try again.');
    }
  };

  return (
    <div className="grid grid-cols-12 gap-6 calendar-container">
      {/* Calendar Grid */}
      <div className="col-span-8 bg-card border border-border rounded-[3px] overflow-hidden calendar-main">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-semibold">{format(currentMonth, 'MMMM yyyy')}</h3>
            <div className="flex items-center gap-1 bg-background rounded-[3px] p-1">
              <button
                onClick={() => setCurrentMonth(new Date())}
                className="px-3 py-1 text-sm rounded-md transition-all text-text-secondary hover:text-text-primary"
              >
                Today
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handlePreviousMonth}
              className="w-8 h-8 rounded-[3px] hover:bg-background flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={handleNextMonth}
              className="w-8 h-8 rounded-[3px] hover:bg-background flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
        
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-6 w-6 animate-spin text-[#3B82F6]" />
            </div>
          ) : (
            <>
              {/* Week Days */}
              <div className="grid grid-cols-7 gap-2 mb-2">
                {weekDays.map((day) => (
                  <div key={day} className="text-center text-xs text-text-muted font-medium py-2">
                    {day}
                  </div>
                ))}
              </div>
              
              {/* Calendar Days */}
              <div className="grid grid-cols-7 gap-2 calendar-days-grid">
                {calendarDays.map((day, index) => {
                  if (day.date === 0) {
                    return <div key={index} className="aspect-square" />;
                  }
                  
                  const dayEvents = getEventsForDay(day.date);
                  const isSelected = selectedDay === day.date;
                  
                  return (
                    <div
                      key={index}
                      onClick={() => handleDayClick(day.date)}
                      className={`aspect-square p-2 rounded-[3px] border transition-all cursor-pointer ${
                        day.isToday
                          ? 'border-purple bg-purple-soft'
                          : isSelected
                          ? 'border-purple bg-purple-soft'
                          : day.hasEvent
                          ? 'border-border hover:border-purple bg-background'
                          : 'border-border-subtle hover:border-border bg-card'
                      }`}
                    >
                      <div className={`text-sm ${day.isToday || isSelected ? 'text-[#3B82F6] font-medium' : 'text-text-primary'}`}>
                        {day.date}
                      </div>
                      {day.hasEvent && (
                        <div className="mt-1.5 flex items-center justify-center">
                          <Coffee className="w-5 h-5 text-red-500" />
                        </div>
                      )}
                      {isSelected && dayEvents.length > 0 && (
                        <div className="mt-1 text-[10px] text-[#3B82F6] font-medium">
                          {dayEvents.length} event{dayEvents.length > 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Upcoming Events & Reminders */}
      <div className="col-span-4 space-y-6 calendar-sidebar">
        {/* Upcoming Events */}
        <div className="bg-card border border-border rounded-[3px] p-6 calendar-upcoming-events">
          <div className="flex items-center gap-2 mb-4">
            <CalendarIcon size={18} className="text-[#3B82F6]" />
            <h3 className="text-lg font-semibold calendar-upcoming-title">Upcoming Events</h3>
          </div>
          
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-[#3B82F6]" />
            </div>
          ) : upcomingEvents.length === 0 ? (
            <div className="text-center py-8 text-text-muted text-sm">
              No upcoming events. Schedule your first chat!
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingEvents.map((event) => (
                <div
                  key={event.id}
                  className="p-3 rounded-[3px] bg-background border border-border-subtle hover:border-purple transition-all"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="font-medium text-sm flex-1">{event.title}</div>
                    <span className={`px-2 py-0.5 rounded-full text-xs ml-2 ${
                      event.status === 'confirmed'
                        ? 'bg-[#3B82F6]/10 text-[#3B82F6]'
                        : event.status === 'pending'
                        ? 'bg-yellow-500/10 text-yellow-500'
                        : 'bg-gray-500/10 text-gray-500'
                    }`}>
                      {event.status}
                    </span>
                  </div>
                  
                  <div className="text-xs text-text-muted mb-2">{event.firm}</div>
                  
                  <div className="flex items-center gap-3 text-xs text-text-secondary mb-2">
                    <div className="flex items-center gap-1">
                      <Clock size={12} />
                      <span>{formatEventDate(event.date)} • {formatTime(event.time)}</span>
                    </div>
                    {event.type === 'video' && <Video size={12} className="text-[#3B82F6]" />}
                    {event.type === 'phone' && <Phone size={12} className="text-[#3B82F6]" />}
                    {event.type === 'in-person' && <MapPin size={12} className="text-[#3B82F6]" />}
                  </div>
                  
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => window.open(generateGoogleCalendarLink(event), '_blank')}
                      className="flex items-center gap-1 text-xs bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-2 py-1 rounded transition-colors"
                    >
                      <ExternalLink size={12} />
                      Add to Google
                    </button>
                    <button
                      onClick={() => downloadICS(event)}
                      className="flex items-center gap-1 text-xs bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-2 py-1 rounded transition-colors"
                    >
                      <Download size={12} />
                      Download .ics
                    </button>
                    <button
                      onClick={() => event.id && handleDeleteEvent(event.id, event.title)}
                      className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 transition-colors ml-auto"
                      title="Delete event"
                    >
                      <Trash2 size={12} />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          <button
            onClick={() => setIsModalOpen(true)}
            className="w-full mt-4 text-white px-4 py-2 rounded-[3px] font-medium text-sm shadow-sm transition-all hover:opacity-90 calendar-schedule-btn"
            style={{ background: '#0F172A' }}
          >
            Schedule New Chat
          </button>
        </div>

        {/* Follow-Up Reminders */}
        <div className="bg-card border border-border rounded-[3px] p-6 calendar-followup-reminders">
          <h3 className="text-lg font-semibold mb-4 calendar-followup-title">Follow-Up Reminders</h3>
          
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-[#3B82F6]" />
            </div>
          ) : reminders.length === 0 ? (
            <div className="text-center py-8 text-text-muted text-sm">
              No follow-ups needed. Great job staying on top of your network!
            </div>
          ) : (
            <div className="space-y-3 calendar-followup-list">
              {reminders.map((reminder) => (
                <div key={reminder.id} className="p-3 rounded-[3px] bg-background calendar-followup-item">
                  <div className="flex items-start gap-2">
                    <div className="w-2 h-2 rounded-full bg-purple-500 mt-1.5 flex-shrink-0"></div>
                    <div className="calendar-followup-content">
                      <div className="text-sm mb-1 calendar-followup-name">Follow up with {reminder.contactName}</div>
                      <div className="text-xs text-text-muted calendar-followup-details">
                        {reminder.firm} • No response after {reminder.daysSinceContact} day{reminder.daysSinceContact > 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Schedule Event Modal */}
      <ScheduleEventModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onEventCreated={handleEventCreated}
      />

      {/* Mobile-only CSS overrides */}
      <style>{`
        @media (max-width: 768px) {
          /* 1. MAIN LAYOUT - Stack vertically */
          .calendar-container {
            display: flex !important;
            flex-direction: column !important;
            gap: 16px !important;
            padding: 16px;
            box-sizing: border-box;
          }

          /* 2. CALENDAR COMPONENT - Full width */
          .calendar-main {
            width: 100% !important;
            max-width: 100% !important;
            grid-column: span 12 !important;
            box-sizing: border-box;
          }

          .calendar-main > div {
            width: 100%;
            max-width: 100%;
          }

          /* Day cells - ensure adequate size for touch */
          .calendar-days-grid {
            width: 100%;
            max-width: 100%;
          }

          .calendar-days-grid > div {
            min-width: 40px;
            min-height: 40px;
            aspect-ratio: 1;
          }

          /* Day labels - ensure breathing room */
          .calendar-days-grid + div {
            font-size: 12px;
          }

          /* 3. UPCOMING EVENTS CARD - Full width */
          .calendar-sidebar {
            width: 100% !important;
            max-width: 100% !important;
            grid-column: span 12 !important;
            box-sizing: border-box;
          }

          .calendar-upcoming-events {
            width: 100% !important;
            max-width: 100% !important;
            padding: 16px !important;
            box-sizing: border-box;
          }

          .calendar-upcoming-title {
            word-wrap: break-word;
            overflow-wrap: break-word;
            white-space: normal;
          }

          .calendar-schedule-btn {
            width: 100% !important;
            min-height: 44px !important;
            box-sizing: border-box;
            white-space: normal;
            word-wrap: break-word;
          }

          /* 4. FOLLOW-UP REMINDERS SECTION - Full width */
          .calendar-followup-reminders {
            width: 100% !important;
            max-width: 100% !important;
            padding: 16px !important;
            box-sizing: border-box;
          }

          .calendar-followup-title {
            word-wrap: break-word;
            overflow-wrap: break-word;
            white-space: normal;
          }

          .calendar-followup-list {
            width: 100%;
            max-width: 100%;
          }

          .calendar-followup-item {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
          }

          .calendar-followup-content {
            width: 100%;
            max-width: 100%;
            flex: 1;
            min-width: 0;
          }

          .calendar-followup-name {
            word-wrap: break-word;
            overflow-wrap: break-word;
            white-space: normal;
          }

          .calendar-followup-details {
            word-wrap: break-word;
            overflow-wrap: break-word;
            white-space: normal;
          }

          /* 5. GENERAL - Page padding and spacing */
          .calendar-container > * {
            margin-bottom: 0;
          }

          .calendar-container > * + * {
            margin-top: 16px;
          }

          /* Ensure no horizontal overflow */
          .calendar-container,
          .calendar-main,
          .calendar-sidebar,
          .calendar-upcoming-events,
          .calendar-followup-reminders {
            overflow-x: hidden;
          }

          /* All text must be fully readable */
          .calendar-container * {
            max-width: 100%;
            box-sizing: border-box;
          }

          .calendar-container p,
          .calendar-container h3,
          .calendar-container div {
            word-wrap: break-word;
            overflow-wrap: break-word;
          }
        }
      `}</style>
    </div>
  );
}
