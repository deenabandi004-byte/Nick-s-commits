import { Bell, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ScoutHeaderButton from './ScoutHeaderButton';
import { useNavigate } from 'react-router-dom';

interface PageHeaderActionsProps {
  onJobTitleSuggestion?: (title: string, company?: string, location?: string) => void;
}

export function PageHeaderActions({ onJobTitleSuggestion }: PageHeaderActionsProps) {
  const navigate = useNavigate();

  const handleBellClick = () => {
    // Always navigate to the outbox tab on the home page
    navigate('/home?tab=outbox');
  };

  return (
    <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
      {/* Bell icon - links to outbox */}
      <Button
        variant="ghost"
        size="icon"
        onClick={handleBellClick}
        className="h-9 w-9 hover:bg-[rgba(59,130,246,0.10)] hover:text-[#3B82F6] flex-shrink-0"
        aria-label="View inbox"
      >
        <Bell className="h-5 w-5" />
      </Button>

      {/* Calendar button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => navigate('/home?tab=calendar')}
        className="h-9 w-9 hover:bg-[rgba(59,130,246,0.10)] hover:text-[#3B82F6] flex-shrink-0"
        aria-label="View calendar"
      >
        <Calendar className="h-5 w-5" />
      </Button>

      {/* Ask Scout button - rightmost */}
      <ScoutHeaderButton onJobTitleSuggestion={onJobTitleSuggestion} />
    </div>
  );
}

