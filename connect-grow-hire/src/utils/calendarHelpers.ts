import { type CalendarEvent } from '@/services/firebaseApi';

/**
 * Generate a Google Calendar URL for an event
 */
export function generateGoogleCalendarLink(event: CalendarEvent): string {
  // Parse date and time
  const [year, month, day] = event.date.split('-').map(Number);
  const [hours, minutes] = event.time.split(':').map(Number);
  
  // Create start date
  const startDate = new Date(year, month - 1, day, hours, minutes);
  
  // Create end date (add duration in minutes)
  const endDate = new Date(startDate.getTime() + event.duration * 60 * 1000);
  
  // Format dates as ISO strings without dashes, colons, or milliseconds
  const formatGoogleDate = (date: Date): string => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };
  
  const startDateStr = formatGoogleDate(startDate);
  const endDateStr = formatGoogleDate(endDate);
  
  // Build description
  const description = `Meeting with ${event.contactName} at ${event.firm}${event.notes ? `\n\nNotes: ${event.notes}` : ''}`;
  
  // Create URL with params
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${startDateStr}/${endDateStr}`,
    details: description,
    location: event.meetingLink || (event.type === 'in-person' ? 'TBD' : ''),
  });
  
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Download an ICS file for an event
 */
export function downloadICS(event: CalendarEvent): void {
  // Parse date and time
  const [year, month, day] = event.date.split('-').map(Number);
  const [hours, minutes] = event.time.split(':').map(Number);
  
  // Create start date
  const startDate = new Date(year, month - 1, day, hours, minutes);
  
  // Create end date (add duration in minutes)
  const endDate = new Date(startDate.getTime() + event.duration * 60 * 1000);
  
  // Format date for ICS (YYYYMMDDTHHMMSSZ)
  const formatICSDate = (date: Date): string => {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
  };
  
  const startDateStr = formatICSDate(startDate);
  const endDateStr = formatICSDate(endDate);
  const nowStr = formatICSDate(new Date());
  
  // Build description
  const description = `Meeting with ${event.contactName} at ${event.firm}${event.notes ? `\\n\\nNotes: ${event.notes}` : ''}`;
  
  // Create ICS content
  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Offerloop//Calendar//EN',
    'BEGIN:VEVENT',
    `UID:${event.id || Date.now()}@offerloop.ai`,
    `DTSTAMP:${nowStr}`,
    `DTSTART:${startDateStr}`,
    `DTEND:${endDateStr}`,
    `SUMMARY:${event.title}`,
    `DESCRIPTION:${description.replace(/\n/g, '\\n')}`,
    `LOCATION:${event.meetingLink || (event.type === 'in-person' ? 'TBD' : '')}`,
    `STATUS:${event.status.toUpperCase()}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  
  // Create blob and download
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${event.title.replace(/[^a-z0-9]/gi, '_')}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
