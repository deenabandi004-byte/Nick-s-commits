import { useEffect, useRef, useState } from 'react';
import { Bell, BookOpen, Settings } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { MobileMenuButton } from '@/components/ui/sidebar';
import ScoutHeaderButton from './ScoutHeaderButton';
import { useTour } from '@/contexts/TourContext';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '@/hooks/useNotifications';
import type { NotificationItem } from '@/hooks/useNotifications';

interface AppHeaderProps {
  title?: string;
  /** Optional icon to display next to the title */
  titleIcon?: React.ReactNode;
  /** Optional content to display in the center of the header */
  centerContent?: React.ReactNode;
  /** Optional content to display in the right section (before Scout button) */
  rightContent?: React.ReactNode;
  /** Callback when job title suggestion is received from Scout */
  onJobTitleSuggestion?: (title: string, company?: string, location?: string) => void;
}

function formatNotificationTime(timestamp: string): string {
  try {
    const d = new Date(timestamp);
    if (Number.isNaN(d.getTime())) return '';
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return '';
  }
}

/**
 * AppHeader - Standardized header component for all app pages
 *
 * Layout:
 * - Left: Mobile menu button, notification icons, page title
 * - Center: Optional custom content (e.g., stats for Dashboard)
 * - Right: Scout button
 */
export function AppHeader({
  title,
  titleIcon,
  centerContent,
  rightContent,
  onJobTitleSuggestion,
}: AppHeaderProps) {
  const navigate = useNavigate();
  const { startTour } = useTour();
  const { notifications, markAllRead, markOneRead } = useNotifications();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Reply notifications surface only via the bell dropdown - no toast popups
  // anywhere in the app. Previously every new reply fired a toast on every
  // page, which the user found intrusive.

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dropdownOpen]);

  const handleBellClick = () => {
    setDropdownOpen((o) => !o);
  };

  const handleNotificationClick = (item: NotificationItem) => {
    markOneRead(item.contactId);
    setDropdownOpen(false);
    navigate('/tracker', { state: { selectContactId: item.contactId } });
  };

  const handleSettingsClick = () => {
    navigate('/account-settings');
  };

  return (
    <header className="h-16 flex items-center justify-between px-4 lg:px-6 flex-shrink-0 relative z-20" style={{ borderBottom: "1px solid var(--warm-border-light, #E2E8F0)", background: 'var(--warm-bg, #FFFFFF)' }}>
      {/* Left Section: Mobile menu, icons, title */}
      <div className="flex items-center gap-2 lg:gap-3">
        <MobileMenuButton />

        {/* Header Icons: Tour, Outbox, Calendar, Settings */}
        <div className="hidden sm:flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={startTour}
            className="h-8 w-8 text-[#6B7280] hover:bg-[#F8FAFF] hover:text-[#0F172A]"
            aria-label="View tour"
          >
            <BookOpen className="h-5 w-5" />
          </Button>
          <div className="relative" ref={dropdownRef}>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBellClick}
              className={`h-8 w-8 hover:bg-[#F8FAFF] ${notifications.unreadReplyCount > 0 ? 'text-[#3B82F6]' : 'text-[#6B7280] hover:text-[#0F172A]'}`}
              aria-label="Notifications"
            >
              <div className="relative">
                <Bell className={`h-5 w-5 ${notifications.unreadReplyCount > 0 ? 'fill-[#3B82F6]' : ''}`} />
                {notifications.unreadReplyCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-medium rounded-full flex items-center justify-center">
                    {notifications.unreadReplyCount > 9 ? '9+' : notifications.unreadReplyCount}
                  </span>
                )}
              </div>
            </Button>
            {dropdownOpen && (
              <div className="absolute left-0 top-full mt-1 w-[320px] max-w-[calc(100vw-2rem)] bg-white rounded-[3px] shadow-lg border border-[#E2E8F0] max-h-80 overflow-hidden flex flex-col z-50">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#E2E8F0]">
                  <span className="text-sm font-semibold text-foreground">Notifications</span>
                  {notifications.unreadReplyCount > 0 && (
                    <button
                      type="button"
                      onClick={() => markAllRead()}
                      className="text-xs text-[#3B82F6] hover:underline"
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="overflow-y-auto flex-1">
                  {notifications.items.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-muted-foreground">No notifications yet</p>
                  ) : (
                    <ul className="divide-y divide-[#EEF2F8]">
                      {notifications.items.map((item) => (
                        <li key={`${item.contactId}-${item.timestamp}`}>
                          <button
                            type="button"
                            onClick={() => handleNotificationClick(item)}
                            className={`w-full text-left px-4 py-3 transition-colors hover:bg-[#F8FAFF] ${
                              !item.read ? 'bg-[#F8FAFF]' : ''
                            }`}
                          >
                            <p className="text-sm font-medium text-foreground">
                              {item.contactName} responded to you!
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {formatNotificationTime(item.timestamp)}
                            </p>
                            {item.snippet && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {item.snippet}
                              </p>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
<Button
            variant="ghost"
            size="icon"
            onClick={handleSettingsClick}
            className="h-8 w-8 text-[#6B7280] hover:bg-[#F8FAFF] hover:text-[#0F172A]"
            aria-label="Account settings"
          >
            <Settings className="h-5 w-5" />
          </Button>
        </div>

        {/* Page Title */}
        <div className="flex items-center gap-2">
          {titleIcon && <span className="text-[#6B7280]">{titleIcon}</span>}
          <h1 className="text-lg lg:text-xl font-semibold text-[#0F172A] truncate max-w-[150px] sm:max-w-none font-serif">
            {title}
          </h1>
        </div>
      </div>

      {/* Center Section: Optional custom content */}
      {centerContent && (
        <div className="absolute left-1/2 -translate-x-1/2 hidden md:flex items-center">
          {centerContent}
        </div>
      )}

      {/* Right Section: optional rightContent + Scout */}
      <div className="flex items-center gap-2 lg:gap-3">
        {rightContent}
        <ScoutHeaderButton />
      </div>
    </header>
  );
}
