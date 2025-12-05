import { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, MapPin, Video } from 'lucide-react';

const upcomingEvents = [
  {
    id: 1,
    title: 'Coffee Chat with Sarah Chen',
    firm: 'Goldman Sachs',
    date: 'Dec 5, 2025',
    time: '2:00 PM',
    type: 'video',
    status: 'confirmed'
  },
  {
    id: 2,
    title: 'Follow-up with Michael Torres',
    firm: 'McKinsey & Company',
    date: 'Dec 8, 2025',
    time: '10:00 AM',
    type: 'phone',
    status: 'pending'
  },
  {
    id: 3,
    title: 'Informational Interview',
    firm: 'Bain & Company',
    date: 'Dec 10, 2025',
    time: '3:30 PM',
    type: 'in-person',
    status: 'confirmed'
  },
  {
    id: 4,
    title: 'Coffee Chat with David Kim',
    firm: 'Morgan Stanley',
    date: 'Dec 12, 2025',
    time: '11:00 AM',
    type: 'video',
    status: 'confirmed'
  },
];

const calendarDays = [
  { date: 1, hasEvent: false },
  { date: 2, hasEvent: false },
  { date: 3, hasEvent: true, event: 'Coffee Chat' },
  { date: 4, hasEvent: false },
  { date: 5, hasEvent: true, event: 'Coffee Chat with Sarah' },
  { date: 6, hasEvent: false },
  { date: 7, hasEvent: false },
  { date: 8, hasEvent: true, event: 'Follow-up Call' },
  { date: 9, hasEvent: false },
  { date: 10, hasEvent: true, event: 'Interview' },
  { date: 11, hasEvent: false },
  { date: 12, hasEvent: true, event: 'Coffee Chat' },
  { date: 13, hasEvent: false },
  { date: 14, hasEvent: false },
  { date: 15, hasEvent: false },
  { date: 16, hasEvent: false },
  { date: 17, hasEvent: true, event: 'Follow-up' },
  { date: 18, hasEvent: false },
  { date: 19, hasEvent: false },
  { date: 20, hasEvent: false },
  { date: 21, hasEvent: false },
  { date: 22, hasEvent: false },
  { date: 23, hasEvent: false },
  { date: 24, hasEvent: false },
  { date: 25, hasEvent: false },
  { date: 26, hasEvent: false },
  { date: 27, hasEvent: false },
  { date: 28, hasEvent: false },
  { date: 29, hasEvent: false },
  { date: 30, hasEvent: false },
  { date: 31, hasEvent: false },
];

const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function Calendar() {
  const [view, setView] = useState<'month' | 'week'>('month');

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* Calendar Grid */}
      <div className="col-span-8 bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h3>December 2025</h3>
            <div className="flex items-center gap-1 bg-background rounded-lg p-1">
              <button
                onClick={() => setView('month')}
                className={`px-3 py-1 text-sm rounded-md transition-all ${
                  view === 'month'
                    ? 'gradient-bg text-white'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Month
              </button>
              <button
                onClick={() => setView('week')}
                className={`px-3 py-1 text-sm rounded-md transition-all ${
                  view === 'week'
                    ? 'gradient-bg text-white'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Week
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button className="w-8 h-8 rounded-lg hover:bg-background flex items-center justify-center text-text-secondary hover:text-text-primary">
              <ChevronLeft size={18} />
            </button>
            <button className="w-8 h-8 rounded-lg hover:bg-background flex items-center justify-center text-text-secondary hover:text-text-primary">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
        
        <div className="p-6">
          {/* Week Days */}
          <div className="grid grid-cols-7 gap-2 mb-2">
            {weekDays.map((day) => (
              <div key={day} className="text-center text-xs text-text-muted font-medium py-2">
                {day}
              </div>
            ))}
          </div>
          
          {/* Calendar Days */}
          <div className="grid grid-cols-7 gap-2">
            {calendarDays.map((day, index) => (
              <div
                key={index}
                className={`aspect-square p-2 rounded-lg border transition-all cursor-pointer ${
                  day.date === 3
                    ? 'border-purple bg-purple-soft'
                    : day.hasEvent
                    ? 'border-border hover:border-purple bg-background'
                    : 'border-border-subtle hover:border-border bg-card'
                }`}
              >
                <div className={`text-sm ${day.date === 3 ? 'text-purple font-medium' : 'text-text-primary'}`}>
                  {day.date}
                </div>
                {day.hasEvent && (
                  <div className="mt-1">
                    <div className="w-full h-1 rounded-full bg-purple"></div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Upcoming Events */}
      <div className="col-span-4 space-y-6">
        {/* Upcoming Coffee Chats */}
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <CalendarIcon size={18} className="text-purple" />
            <h3>Upcoming Coffee Chats</h3>
          </div>
          
          <div className="space-y-3">
            {upcomingEvents.map((event) => (
              <div
                key={event.id}
                className="p-3 rounded-lg bg-background border border-border-subtle hover:border-purple transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="font-medium text-sm">{event.title}</div>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${
                    event.status === 'confirmed'
                      ? 'bg-green-500/10 text-green-500'
                      : 'bg-yellow-500/10 text-yellow-500'
                  }`}>
                    {event.status}
                  </span>
                </div>
                
                <div className="text-xs text-text-muted mb-2">{event.firm}</div>
                
                <div className="flex items-center gap-3 text-xs text-text-secondary">
                  <div className="flex items-center gap-1">
                    <Clock size={12} />
                    <span>{event.date} • {event.time}</span>
                  </div>
                  {event.type === 'video' && <Video size={12} className="text-purple" />}
                  {event.type === 'in-person' && <MapPin size={12} className="text-purple" />}
                </div>
              </div>
            ))}
          </div>
          
          <button className="w-full mt-4 gradient-bg text-white px-4 py-2 rounded-lg font-medium text-sm hover:opacity-90 transition-opacity">
            Schedule New Chat
          </button>
        </div>

        {/* Follow-Up Reminders */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="mb-4">Follow-Up Reminders</h3>
          
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-background">
              <div className="flex items-start gap-2">
                <div className="w-2 h-2 rounded-full bg-pink mt-1.5 flex-shrink-0"></div>
                <div>
                  <div className="text-sm mb-1">Follow up with Jane Doe</div>
                  <div className="text-xs text-text-muted">No response after 5 days</div>
                </div>
              </div>
            </div>
            
            <div className="p-3 rounded-lg bg-background">
              <div className="flex items-start gap-2">
                <div className="w-2 h-2 rounded-full bg-purple mt-1.5 flex-shrink-0"></div>
                <div>
                  <div className="text-sm mb-1">Thank you note to Sarah</div>
                  <div className="text-xs text-text-muted">After coffee chat on Dec 5</div>
                </div>
              </div>
            </div>
            
            <div className="p-3 rounded-lg bg-background">
              <div className="flex items-start gap-2">
                <div className="w-2 h-2 rounded-full bg-purple mt-1.5 flex-shrink-0"></div>
                <div>
                  <div className="text-sm mb-1">Prep for David Kim meeting</div>
                  <div className="text-xs text-text-muted">Due Dec 11</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

