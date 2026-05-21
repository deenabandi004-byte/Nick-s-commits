import { useState, useEffect, useMemo } from 'react';
import { 
  Users, Building2, Coffee, Clock, ArrowRight, Briefcase, 
  Search, Mail, ChevronRight, X, FileText, TrendingUp
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useFirebaseAuth } from '@/contexts/FirebaseAuthContext';
import { firebaseApi } from '@/services/firebaseApi';
import { type Firm, apiService, type OutboxThread, type OutboxStats } from '@/services/api';
import { useNavigate, useLocation } from 'react-router-dom';
import { calculateWeeklySummary, type WeeklySummary } from '@/utils/dashboardStats';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const getTimeOfDayGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

const formatTimeAgo = (timestamp: any): string => {
  if (!timestamp) return 'Just now';
  
  const now = Date.now();
  const timeMs = timestamp.toMillis ? timestamp.toMillis() : timestamp;
  const diffMs = now - timeMs;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffSeconds < 60) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  const diffWeeks = Math.floor(diffDays / 7);
  return `${diffWeeks}w ago`;
};

const getActivityIcon = (type: string) => {
  const iconStyle = { color: 'var(--text-tertiary)' };
  switch (type) {
    case 'firmSearch':
      return <Building2 size={14} style={iconStyle} />;
    case 'contactSearch':
      return <Users size={14} style={iconStyle} />;
    case 'coffeePrep':
      return <Coffee size={14} style={iconStyle} />;
    case 'interviewPrep':
      return <Briefcase size={14} style={iconStyle} />;
    default:
      return <Clock size={14} style={iconStyle} />;
  }
};

const getActivityRoute = (type: string): string => {
  switch (type) {
    case 'firmSearch':
      return '/find?tab=companies';
    case 'contactSearch':
      return '/find';
    case 'coffeePrep':
      return '/meeting-prep';
    case 'interviewPrep':
      return '/interview-prep';
    default:
      return '/find';
  }
};

const getPriorityBorderColor = (priority: string) => {
  switch(priority) {
    case 'Hot': return 'border-l-red-500';
    case 'Warm': return 'border-l-yellow-500';
    default: return 'border-l-[#3B82F6]';
  }
};

const getPriorityBadgeStyles = (priority: string) => {
  switch(priority) {
    case 'Hot': return 'bg-red-100 text-red-700';
    case 'Warm': return 'bg-yellow-100 text-yellow-700';
    default: return 'bg-[rgba(59,130,246,0.10)] text-[#3B82F6]';
  }
};

// ============================================================================
// MAIN DASHBOARD COMPONENT
// ============================================================================

export function Dashboard() {
  const { user } = useFirebaseAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // State
  const [contactCount, setContactCount] = useState<number>(0);
  const [firmCount, setFirmCount] = useState<number>(0);
  const [meetingCount, setMeetingCount] = useState<number>(0);
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null);
  const [timeSeriesData, setTimeSeriesData] = useState<Array<{ month: string; outreach: number; replies: number }>>([]);
  const [replyStats, setReplyStats] = useState<{ totalReplies: number; responseRate: number; totalSent: number } | null>(null);
  const [activities, setActivities] = useState<Array<{ id: string; type: string; summary: string; timestamp: any }>>([]);
  const [contacts, setContacts] = useState<Array<any>>([]);
  const [followUpReminders, setFollowUpReminders] = useState<Array<{
    id: string;
    contactId: string;
    contactName: string;
    firm: string;
    daysSinceContact: number;
    lastContactDate: string;
  }>>([]);
  const [outboxThreads, setOutboxThreads] = useState<OutboxThread[]>([]);
  const [outboxLoading, setOutboxLoading] = useState(true);
  const [trackerStats, setTrackerStats] = useState<OutboxStats | null>(null);

  // Derived values
  const timeSavedHours = useMemo(() => {
    const contactMinutes = contactCount * 20;
    const firmMinutes = firmCount * 2;
    const meetingMinutes = meetingCount * 30;
    const totalMinutes = contactMinutes + firmMinutes + meetingMinutes;
    return Math.round((totalMinutes / 60) * 10) / 10;
  }, [contactCount, firmCount, meetingCount]);

  const outreachSent = weeklySummary?.contactsGenerated || replyStats?.totalSent || 0;
  const repliesReceived = replyStats?.totalReplies || 0;

  // Get user's first name
  const firstName = user?.name?.split(' ')[0] || 'there';

  // Fetch follow-up reminders (depends on contacts, so keep separate)
  useEffect(() => {
    const fetchFollowUpReminders = async () => {
      if (!user?.uid) return;
      try {
        const reminders = await firebaseApi.getFollowUpReminders(user.uid);
        console.log('📋 Follow-up reminders fetched:', reminders.length, reminders);
        setFollowUpReminders(reminders);
      } catch (error) {
        console.error('❌ Failed to fetch follow-up reminders:', error);
        setFollowUpReminders([]);
      }
    };
    fetchFollowUpReminders();
  }, [user?.uid, contacts]); // Re-fetch when contacts change

  // Map follow-up reminders to UI format with real data
  // Also include outbox threads that are waiting for replies (more actionable)
  const followUps = useMemo(() => {
    console.log('🔄 Mapping follow-ups:', {
      remindersCount: followUpReminders.length,
      contactsCount: contacts.length,
      outboxThreadsCount: outboxThreads.length,
      reminders: followUpReminders
    });
    
    // Start with reminders from getFollowUpReminders (contacts 3+ days old)
    const reminderFollowUps = followUpReminders.map((reminder) => {
      // Find the corresponding contact to get additional info
      const contact = contacts.find(c => 
        c.id === reminder.contactId || 
        c.id === reminder.id ||
        (reminder.contactId && c.id === reminder.contactId)
      );
      
      // Calculate priority based on days since contact
      // Hot = 7+ days (urgent), Warm = 4-6 days, Normal = 3 days
      let priority: 'Hot' | 'Warm' | 'Normal' = 'Normal';
      if (reminder.daysSinceContact >= 7) {
        priority = 'Hot';
      } else if (reminder.daysSinceContact >= 4) {
        priority = 'Warm';
      }
      
      // Get email opened status from contact (if available)
      // Check multiple possible fields for email tracking
      const emailOpened = contact?.emailOpened || 
                         contact?.hasUnreadReply || 
                         contact?.emailOpenedAt || 
                         false;
      
      // Extract name from contactName (which might be "First Last" or just email)
      const personName = reminder.contactName || 
                        (contact ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim() : '') ||
                        contact?.name ||
                        'Unknown Contact';
      
      return {
        id: reminder.id || reminder.contactId || `reminder-${Math.random()}`,
        personName: personName || 'Unknown Contact',
        title: contact?.jobTitle || contact?.title || contact?.job_title || 'Professional',
        company: reminder.firm || contact?.company || 'Company',
        daysSinceContact: reminder.daysSinceContact,
        priority,
        emailOpened,
      };
    }).sort((a, b) => {
      // Sort by priority (Hot first, then Warm, then Normal)
      const priorityOrder = { 'Hot': 0, 'Warm': 1, 'Normal': 2 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      // Then by days since contact (most urgent first)
      return b.daysSinceContact - a.daysSinceContact;
    });
    
    // Also add outbox threads that need attention:
    // 1. Waiting for replies (sent, no reply yet) - these definitely need follow-ups
    // 2. New replies (contact replied, needs response) - these need responses
    // 3. Drafts (no_reply_yet) - these are ready to send, show them as actionable items
    const outboxFollowUps = outboxThreads
      .filter(t => {
        // Include all threads that need action:
        // - Waiting for replies (sent emails)
        // - New replies (need to respond)
        // - Drafts (ready to send)
        return t.status === "waiting_on_reply" ||
               t.status === "replied" ||
               t.status === "email_sent" ||
               t.status === "draft_created"; // Include drafts as actionable items
      })
      .map(thread => {
        // Calculate days since last activity
        const lastActivity = thread.lastActivityAt ? new Date(thread.lastActivityAt) : new Date();
        const daysSince = Math.floor((Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24));
        
        // Determine priority based on status and days
        let priority: 'Hot' | 'Warm' | 'Normal' = 'Normal';
        
        // New replies are always high priority
        if (thread.status === "replied" || thread.hasUnreadReply) {
          priority = 'Hot';
        } else if (daysSince >= 7) {
          priority = 'Hot';
        } else if (daysSince >= 4) {
          priority = 'Warm';
        } else if (thread.status === "draft_created") {
          // Drafts are "Normal" priority unless they're old
          priority = daysSince >= 2 ? 'Warm' : 'Normal';
        }
        
        return {
          id: thread.id,
          personName: thread.name || thread.contactName,
          title: thread.title || thread.jobTitle,
          company: thread.company,
          daysSinceContact: daysSince,
          priority,
          emailOpened: thread.status === "replied" || thread.hasUnreadReply,
        };
      });
    
    // Combine both sources and deduplicate by contact ID
    const allFollowUps = [...reminderFollowUps, ...outboxFollowUps];
    const uniqueFollowUps = Array.from(
      new Map(allFollowUps.map(f => [f.id, f])).values()
    );
    
    // Sort by priority and days
    return uniqueFollowUps.sort((a, b) => {
      const priorityOrder = { 'Hot': 0, 'Warm': 1, 'Normal': 2 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return b.daysSinceContact - a.daysSinceContact;
    });
  }, [followUpReminders, contacts, outboxThreads]);

  // Get the top follow-up for the hero card
  const topFollowUp = followUps[0];

  // Fetch outbox threads and tracker stats
  useEffect(() => {
    const fetchOutboxData = async () => {
      if (!user?.uid) {
        setOutboxLoading(false);
        return;
      }
      try {
        setOutboxLoading(true);
        const [threadsResult, statsResult] = await Promise.all([
          apiService.getOutboxThreads(),
          apiService.getOutboxStats(),
        ]);
        if ('error' in threadsResult) {
          setOutboxThreads([]);
        } else {
          setOutboxThreads(threadsResult.threads || []);
        }
        if (!('error' in statsResult)) {
          setTrackerStats(statsResult as OutboxStats);
        }
      } catch (error) {
        console.error('Failed to fetch outbox data:', error);
        setOutboxThreads([]);
      } finally {
        setOutboxLoading(false);
      }
    };
    fetchOutboxData();
  }, [user?.uid]);

  // Quick wins data - using real data
  const quickWins = useMemo(() => {
    // Use needsAttentionCount from tracker stats (contacts needing action)
    const emailsReady = trackerStats?.needsAttentionCount ?? outboxThreads.filter(t => Boolean(t.hasDraft)).length;

    // Meetings that need prep
    const meetingsNeedPrep = meetingCount;

    // New company matches
    const newMatches = firmCount > 0 ? firmCount : 0;

    return {
      emailsReady,
      meetingsNeedPrep,
      newMatches,
    };
  }, [outboxThreads, trackerStats, meetingCount, firmCount]);

  // Fetch contacts (needed for follow-up reminders, so fetch first)
  useEffect(() => {
    const fetchContacts = async () => {
      if (user?.uid) {
        try {
          const fetchedContacts = await firebaseApi.getContacts(user.uid);
          setContacts(fetchedContacts);
          setContactCount(fetchedContacts.length);
        } catch (error) {
          console.error('Failed to fetch contacts:', error);
          setContactCount(0);
        }
      }
    };
    fetchContacts();
  }, [user?.uid]);

  // Combined fetch for data that depends on user?.uid (reduces waterfall effect)
  useEffect(() => {
    if (!user?.uid) return;
    
    const fetchAllData = async () => {
      try {
        const [
          summary,
          stats,
          activities
        ] = await Promise.all([
          calculateWeeklySummary(user.uid),
          apiService.getDashboardStats(),
          firebaseApi.getActivities(user.uid, 10)
        ]);
        
        setWeeklySummary(summary);
        if (!('error' in stats)) {
          setTimeSeriesData(stats.outreachByMonth);
          setReplyStats(stats.replyStats);
        }
        setActivities(activities);
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      }
    };
    
    fetchAllData();
  }, [user?.uid, location.pathname]); // Re-fetch when user or location changes

  // Fetch firm count (keep separate due to different error handling and user dependency)
  useEffect(() => {
    const fetchFirmCount = async () => {
      if (!user) {
        setFirmCount(0);
        return;
      }
      try {
        const history = await apiService.getFirmSearchHistory(50);
        const firmIds = new Set<string>();
        
        // Fetch all searches in parallel instead of sequentially
        const searchPromises = history.map(historyItem =>
          apiService.getFirmSearchById(historyItem.id).catch(err => {
            console.error(`Failed to load search ${historyItem.id}:`, err);
            return null;
          })
        );
        
        const searchResults = await Promise.all(searchPromises);
        
        searchResults.forEach(searchData => {
          if (searchData && searchData.firms) {
            searchData.firms.forEach((firm: Firm) => {
              const firmKey = firm.id || `${firm.name}-${firm.location?.display}`;
              firmIds.add(firmKey);
            });
          }
        });
        
        setFirmCount(firmIds.size);
      } catch (error) {
        console.error('Failed to fetch firms:', error);
        setFirmCount(0);
      }
    };
    fetchFirmCount();
  }, [user]);

  // Fetch meeting count (keep separate due to different error handling)
  useEffect(() => {
    const fetchMeetingCount = async () => {
      if (!user) {
        setMeetingCount(0);
        return;
      }
      try {
        const result = await apiService.getAllCoffeeChatPreps();
        if ('error' in result) {
          setMeetingCount(0);
        } else {
          setMeetingCount(result.preps?.length || 0);
        }
      } catch (error) {
        console.error('Failed to fetch meeting preps:', error);
        setMeetingCount(0);
      }
    };
    fetchMeetingCount();
  }, [user]);

  return (
    <div className="space-y-8 dashboard-container">
      {/* ================================================================== */}
      {/* PERSONALIZED GREETING */}
      {/* ================================================================== */}
      <div className="animate-fadeInUp">
        <h1
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: '36px',
            fontWeight: 400,
            letterSpacing: '-0.025em',
            color: 'var(--text-primary)',
            marginBottom: '6px',
          }}
        >
          {getTimeOfDayGreeting()}, {firstName}
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '15px',
            color: 'var(--text-secondary)',
          }}
        >
          You have <span style={{ color: '#3B82F6', fontWeight: 600 }}>{followUps.length} follow-ups</span> pending.
        </p>
      </div>

      {/* ================================================================== */}
      {/* RECOMMENDED ACTION - COMPACT */}
      {/* ================================================================== */}
      <div
        style={{
          background: '#EFF6FF',
          border: '1px solid rgba(59, 130, 246, 0.12)',
          borderRadius: '14px',
          padding: '24px 28px',
          marginTop: '28px',
          marginBottom: '32px',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: '#3B82F6',
            marginBottom: '8px',
          }}
        >
          RECOMMENDED ACTION
        </p>
        {topFollowUp ? (
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '17px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  marginBottom: '2px',
                }}
              >
                Follow up with {topFollowUp.personName}
              </p>
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '14px',
                  color: 'var(--text-secondary)',
                }}
              >
                at {topFollowUp.company} · Last contacted {topFollowUp.daysSinceContact} days ago
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/tracker')}
                className="flex items-center gap-2 px-5 py-2.5 rounded-[10px] text-sm font-medium transition-all"
                style={{
                  background: '#0F172A',
                  color: 'white',
                  fontFamily: 'var(--font-body)',
                  fontSize: '14px',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Send Follow-up →
              </button>
              <button
                onClick={() => navigate('/find')}
                className="text-sm font-medium transition-colors"
                style={{
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '14px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Or find new contacts
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '17px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  marginBottom: '2px',
                }}
              >
                Start building your network
              </p>
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '14px',
                  color: 'var(--text-secondary)',
                }}
              >
                Find people at companies you're interested in and start reaching out
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/find')}
                className="flex items-center gap-2 px-5 py-2.5 rounded-[10px] text-sm font-medium transition-all"
                style={{
                  background: '#0F172A',
                  color: 'white',
                  fontFamily: 'var(--font-body)',
                  fontSize: '14px',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Find People →
              </button>
              <button
                onClick={() => navigate('/find?tab=companies')}
                className="text-sm font-medium transition-colors"
                style={{
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '14px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Or explore companies
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ================================================================== */}
      {/* WORKFLOW SHORTCUTS */}
      {/* ================================================================== */}
      <div className="animate-fadeInUp dashboard-workflow-section" style={{ animationDelay: '200ms' }}>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '14px',
            color: 'var(--text-tertiary)',
            marginBottom: '12px',
          }}
        >
          Or start a new workflow
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: <Search className="w-4 h-4" />, label: 'Find People', route: '/find' },
            { icon: <Building2 className="w-4 h-4" />, label: 'Find Companies', route: '/find?tab=companies' },
            { icon: <Mail className="w-4 h-4" />, label: 'Review Outreach', route: '/tracker' },
            { icon: <Coffee className="w-4 h-4" />, label: 'Prep for Chat', route: '/meeting-prep' },
          ].map((shortcut, i) => (
            <button
              key={i}
              onClick={() => navigate(shortcut.route)}
              className="flex items-center gap-3 px-4 py-3 rounded-[10px] transition-all text-left"
              style={{
                background: 'var(--bg-white)',
                border: '1px solid var(--border-light)',
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
                fontSize: '14px',
                fontWeight: 500,
                color: 'var(--text-secondary)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.2)';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(59, 130, 246, 0.08)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-light)';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              <span>{shortcut.icon}</span>
              {shortcut.label}
            </button>
          ))}
        </div>
      </div>

      {/* ================================================================== */}
      {/* MAIN CONTENT */}
      {/* ================================================================== */}
      <div className="space-y-8">
          
          {/* QUICK WINS SECTION */}
          <div className="animate-fadeInUp" style={{ animationDelay: '300ms' }}>
            <h2
              style={{
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontSize: '24px',
                fontWeight: 400,
                letterSpacing: '-0.02em',
                color: 'var(--text-primary)',
                marginTop: '40px',
                marginBottom: '16px',
              }}
            >
              Quick Wins
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                {
                  icon: <Mail className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />,
                  title: outboxLoading ? '...' : `${quickWins.emailsReady} need attention`,
                  description: 'Review replies and send drafts',
                  badge: '2 min',
                  route: '/tracker',
                  disabled: quickWins.emailsReady === 0,
                },
                {
                  icon: <Coffee className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />,
                  title: `${quickWins.meetingsNeedPrep} meetings`,
                  description: 'Need quick prep before calls',
                  badge: '5 min',
                  route: '/meeting-prep',
                  disabled: quickWins.meetingsNeedPrep === 0,
                },
                {
                  icon: <Building2 className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />,
                  title: `${quickWins.newMatches} companies`,
                  description: 'Match your search criteria',
                  badge: 'New',
                  route: '/find?tab=companies',
                  disabled: quickWins.newMatches === 0,
                },
              ].map((win, i) => (
                <div
                  key={i}
                  onClick={() => !win.disabled && navigate(win.route)}
                  className="px-5 py-4 rounded-[12px] transition-all cursor-pointer"
                  style={{
                    background: 'var(--bg-white)',
                    border: '1px solid var(--border-light)',
                    opacity: win.disabled ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!win.disabled) {
                      e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.15)';
                      e.currentTarget.style.boxShadow = '0 4px 16px rgba(59, 130, 246, 0.06)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-light)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span style={{ fontSize: '20px' }}>{win.icon}</span>
                    <span
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: '#3B82F6',
                        background: 'rgba(59, 130, 246, 0.08)',
                        padding: '2px 8px',
                        borderRadius: '6px',
                      }}
                    >
                      {win.badge}
                    </span>
                  </div>
                  <p
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '15px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      marginBottom: '2px',
                    }}
                  >
                    {win.title}
                  </p>
                  <p
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '13px',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {win.description}
                  </p>
                </div>
              ))}
              {quickWins.emailsReady === 0 && quickWins.meetingsNeedPrep === 0 && quickWins.newMatches === 0 && (
                <div 
                  onClick={() => navigate('/find')}
                  className="px-5 py-4 rounded-[12px] transition-all cursor-pointer col-span-full"
                  style={{
                    background: 'var(--bg-white)',
                    border: '1px solid var(--border-light)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.15)';
                    e.currentTarget.style.boxShadow = '0 4px 16px rgba(59, 130, 246, 0.06)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-light)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span style={{ fontSize: '20px' }}>
                      <Search className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: '#3B82F6',
                        background: 'rgba(59, 130, 246, 0.08)',
                        padding: '2px 8px',
                        borderRadius: '6px',
                      }}
                    >
                      Get started
                    </span>
                  </div>
                  <p
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '15px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      marginBottom: '2px',
                    }}
                  >
                    Find your first contacts
                  </p>
                  <p
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '13px',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    Search for people at companies you're targeting
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* FOLLOW-UP QUEUE */}
          <div className="animate-fadeInUp" style={{ animationDelay: '400ms' }}>
            <div className="flex items-center justify-between mb-4">
              <h2
                style={{
                  fontFamily: "'Instrument Serif', Georgia, serif",
                  fontSize: '24px',
                  fontWeight: 400,
                  letterSpacing: '-0.02em',
                  color: 'var(--text-primary)',
                }}
              >
                Your Follow-up Queue
              </h2>
              {followUps.length > 0 && (
                <span
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '14px',
                    color: 'var(--text-tertiary)',
                  }}
                >
                  {followUps.length} pending
                </span>
              )}
            </div>
            
            {followUps.length === 0 ? (
              <div
                className="rounded-[12px] p-6 text-center"
                style={{
                  background: 'var(--bg-off)',
                  border: '1px solid var(--border-light)',
                }}
              >
                <p
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '14px',
                    color: 'var(--text-secondary)',
                    marginBottom: '8px',
                  }}
                >
                  No follow-ups needed right now
                </p>
                <p
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '12px',
                    color: 'var(--text-tertiary)',
                  }}
                >
                  Follow-ups appear here when contacts haven't replied after 3+ days
                </p>
              </div>
            ) : (
              <>
              <div className="space-y-3 dashboard-followup-list">
                {followUps.slice(0, 4).map((followUp) => (
                  <div 
                    key={followUp.id}
                    onClick={() => navigate('/tracker')}
                    className="dashboard-followup-card group relative flex items-center justify-between p-4 rounded-[12px] transition-all cursor-pointer"
                    style={{
                      background: 'var(--bg-white)',
                      border: '1px solid var(--border-light)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.15)';
                      e.currentTarget.style.boxShadow = '0 4px 16px rgba(59, 130, 246, 0.06)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-light)';
                      e.currentTarget.style.boxShadow = 'none';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className="w-10 h-10 rounded-[10px] flex items-center justify-center"
                        style={{
                          background: 'var(--bg-off)',
                        }}
                      >
                        <Building2 className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
                      </div>
                      
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            style={{
                              fontFamily: 'var(--font-body)',
                              fontSize: '15px',
                              fontWeight: 600,
                              color: 'var(--text-primary)',
                            }}
                          >
                            {followUp.personName}
                          </span>
                          <span
                            style={{
                              fontFamily: 'var(--font-body)',
                              fontSize: '11px',
                              fontWeight: 600,
                              color: '#3B82F6',
                              background: 'rgba(59, 130, 246, 0.08)',
                              padding: '2px 8px',
                              borderRadius: '6px',
                            }}
                          >
                            {followUp.priority}
                          </span>
                        </div>
                        <p
                          style={{
                            fontFamily: 'var(--font-body)',
                            fontSize: '13px',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {followUp.title} at {followUp.company}
                        </p>
                        <p
                          style={{
                            fontFamily: 'var(--font-body)',
                            fontSize: '12px',
                            color: 'var(--text-tertiary)',
                            marginTop: '4px',
                          }}
                        >
                          Last contacted {followUp.daysSinceContact} days ago
                          {followUp.emailOpened && (
                            <span style={{ marginLeft: '8px', color: '#16A34A' }}>Email opened</span>
                          )}
                        </p>
                      </div>
                    </div>
                    
                    <ChevronRight className="w-5 h-5" style={{ color: 'var(--border)' }} />
                  </div>
                ))}
              </div>
              
                {followUps.length > 4 && (
                  <button 
                    onClick={() => navigate('/tracker')}
                    className="dashboard-view-all-followups mt-4 flex items-center gap-1"
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '14px',
                      color: '#3B82F6',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    View all {followUps.length} follow-ups <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </>
            )}
          </div>
      </div>

      {/* Mobile-only CSS overrides */}
      <style>{`
        @media (max-width: 768px) {
          /* General: Page horizontal padding */
          .dashboard-container {
            padding-left: 16px;
            padding-right: 16px;
          }

          /* 1. WORKFLOW BUTTONS - Full width, min-height 48px */
          .dashboard-workflow-buttons {
            flex-direction: column;
            gap: 12px;
          }
          
          .dashboard-workflow-btn {
            width: 100%;
            min-height: 48px;
            justify-content: center;
          }

          /* 2. SEND FOLLOW-UP BUTTON - Full width, min-height 48px */
          .dashboard-send-followup-btn {
            width: 100%;
            min-height: 48px;
          }

          /* 3. OR FIND NEW CONTACTS LINK - Block display, padding */
          .dashboard-find-contacts-link {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 12px 0;
            min-height: 44px;
            width: 100%;
          }

          /* 4. QUICK WINS CARDS - Reduced padding, min-height 60px */
          .dashboard-quick-win-card {
            padding: 12px;
            min-height: 60px;
          }

          /* 5. CONTACT CARDS (Follow-up list) - Reduced padding, min-height 70px, ensure tappable */
          .dashboard-followup-card {
            padding: 12px;
            min-height: 70px;
            cursor: pointer;
          }

          /* 6. VIEW ALL FOLLOW-UPS LINK - Full-width button style, min-height 44px */
          .dashboard-view-all-followups {
            width: 100%;
            min-height: 44px;
            display: flex;
            align-items: center;
            justify-content: center;
            background-color: #f3f4f6;
            border-radius: 8px;
            padding: 12px;
            margin-top: 16px;
          }
          
          .dashboard-view-all-followups:hover {
            background-color: #e5e7eb;
            text-decoration: none;
          }

          /* 7. GENERAL - Ensure all interactive elements have min 44px touch targets */
          .dashboard-workflow-btn,
          .dashboard-send-followup-btn,
          .dashboard-find-contacts-link,
          .dashboard-quick-win-card,
          .dashboard-followup-card,
          .dashboard-view-all-followups {
            touch-action: manipulation;
          }
        }
      `}</style>
    </div>
  );
}
