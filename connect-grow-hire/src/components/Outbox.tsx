import { useState } from 'react';
import { Clock, CheckCircle, AlertCircle, Send, MoreVertical, Building2, MapPin, Briefcase } from 'lucide-react';

interface EmailThread {
  id: number;
  subject: string;
  firmName: string;
  contactName: string;
  status: 'replied' | 'no-response' | 'needs-follow-up';
  lastUpdated: string;
  preview: string;
}

const emailThreads: EmailThread[] = [
  {
    id: 1,
    subject: 'Coffee Chat Request - Investment Banking',
    firmName: 'Goldman Sachs',
    contactName: 'Sarah Chen',
    status: 'replied',
    lastUpdated: '2 hours ago',
    preview: 'Thanks for reaching out! I\'d be happy to chat...'
  },
  {
    id: 2,
    subject: 'Following Up - Consulting Opportunities',
    firmName: 'McKinsey & Company',
    contactName: 'Michael Torres',
    status: 'needs-follow-up',
    lastUpdated: '3 days ago',
    preview: 'Hi Michael, I wanted to follow up on my previous...'
  },
  {
    id: 3,
    subject: 'Introduction from LinkedIn',
    firmName: 'Bain & Company',
    contactName: 'Jane Doe',
    status: 'no-response',
    lastUpdated: '5 days ago',
    preview: 'Hi Jane, I came across your profile and would...'
  },
  {
    id: 4,
    subject: 'Informational Interview Request',
    firmName: 'Morgan Stanley',
    contactName: 'David Kim',
    status: 'replied',
    lastUpdated: '1 week ago',
    preview: 'Absolutely! Let\'s schedule something for next week...'
  },
];

const conversationMessages = [
  {
    from: 'me',
    time: '5 days ago',
    content: 'Hi Jane,\n\nI came across your profile and was really impressed by your career trajectory at Bain. I\'m currently exploring consulting opportunities and would love to learn more about your experience.\n\nWould you be open to a brief 15-minute coffee chat?\n\nBest regards,\nNicholas'
  },
];

export function Outbox() {
  const [selectedThread, setSelectedThread] = useState<EmailThread>(emailThreads[0]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'replied':
        return 'text-green-500 bg-green-500/10';
      case 'needs-follow-up':
        return 'text-yellow-500 bg-yellow-500/10';
      case 'no-response':
        return 'text-text-muted bg-border';
      default:
        return 'text-text-muted bg-border';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'replied':
        return <CheckCircle size={12} />;
      case 'needs-follow-up':
        return <AlertCircle size={12} />;
      case 'no-response':
        return <Clock size={12} />;
      default:
        return <Clock size={12} />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'replied':
        return 'Replied';
      case 'needs-follow-up':
        return 'Needs Follow-Up';
      case 'no-response':
        return 'No Response';
      default:
        return status;
    }
  };

  return (
    <div className="grid grid-cols-12 gap-6 h-[calc(100vh-12rem)]">
      {/* Email Thread List */}
      <div className="col-span-4 bg-card border border-border rounded-xl overflow-hidden flex flex-col">
        <div className="p-4 border-b border-border">
          <h3>Conversations</h3>
          <p className="text-xs text-text-muted mt-1">{emailThreads.length} threads</p>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {emailThreads.map((thread) => (
            <div
              key={thread.id}
              onClick={() => setSelectedThread(thread)}
              className={`p-4 border-b border-border cursor-pointer transition-colors ${
                selectedThread.id === thread.id
                  ? 'bg-purple-soft border-l-2 border-l-purple'
                  : 'hover:bg-background'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="font-medium text-sm truncate flex-1">{thread.subject}</div>
                <div className="text-xs text-text-muted ml-2">{thread.lastUpdated}</div>
              </div>
              
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-text-secondary">{thread.contactName}</span>
                <span className="text-xs text-text-muted">•</span>
                <span className="text-xs text-text-muted">{thread.firmName}</span>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="text-xs text-text-muted truncate flex-1">{thread.preview}</div>
                <span className={`ml-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${getStatusColor(thread.status)}`}>
                  {getStatusIcon(thread.status)}
                  {getStatusLabel(thread.status)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Conversation Detail */}
      <div className="col-span-5 bg-card border border-border rounded-xl overflow-hidden flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-base">{selectedThread.subject}</h3>
            <p className="text-xs text-text-muted mt-0.5">
              {selectedThread.contactName} • {selectedThread.firmName}
            </p>
          </div>
          <button className="text-text-muted hover:text-text-primary">
            <MoreVertical size={18} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-background">
          {conversationMessages.map((message, index) => (
            <div key={index}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-full bg-purple flex items-center justify-center text-white text-xs">
                  N
                </div>
                <span className="text-sm font-medium">You</span>
                <span className="text-xs text-text-muted">{message.time}</span>
              </div>
              <div className="ml-8 text-sm text-text-secondary whitespace-pre-line">
                {message.content}
              </div>
            </div>
          ))}
        </div>
        
        <div className="p-4 border-t border-border">
          <button className="w-full gradient-bg text-white px-4 py-2.5 rounded-lg font-medium text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
            <Send size={16} />
            Send Follow-Up
          </button>
        </div>
      </div>

      {/* Contact Details */}
      <div className="col-span-3 bg-card border border-border rounded-xl overflow-hidden flex flex-col">
        <div className="p-4 border-b border-border">
          <h3 className="text-base">Contact Details</h3>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Contact Info */}
          <div>
            <div className="w-16 h-16 rounded-full gradient-bg flex items-center justify-center text-white text-xl font-bold mb-3">
              SC
            </div>
            <h3 className="text-base mb-1">{selectedThread.contactName}</h3>
            <p className="text-sm text-text-muted">Associate, Investment Banking</p>
          </div>

          {/* Firm Info */}
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Building2 size={16} className="text-purple mt-0.5" />
              <div>
                <div className="text-xs text-text-muted">Firm</div>
                <div className="text-sm">{selectedThread.firmName}</div>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <MapPin size={16} className="text-purple mt-0.5" />
              <div>
                <div className="text-xs text-text-muted">Location</div>
                <div className="text-sm">New York, NY</div>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <Briefcase size={16} className="text-purple mt-0.5" />
              <div>
                <div className="text-xs text-text-muted">Industry</div>
                <div className="text-sm">Investment Banking</div>
              </div>
            </div>
          </div>

          {/* Suggested Actions */}
          <div className="pt-4 border-t border-border">
            <h3 className="text-sm mb-3">Suggested Next Steps</h3>
            <div className="space-y-2">
              <button className="w-full text-left p-3 rounded-lg bg-background hover:bg-purple-soft transition-colors text-sm">
                Schedule coffee chat
              </button>
              <button className="w-full text-left p-3 rounded-lg bg-background hover:bg-purple-soft transition-colors text-sm">
                View firm research
              </button>
              <button className="w-full text-left p-3 rounded-lg bg-background hover:bg-purple-soft transition-colors text-sm">
                Find similar contacts
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
