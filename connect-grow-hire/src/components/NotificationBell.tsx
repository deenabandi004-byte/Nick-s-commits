import React, { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiService } from '@/services/api';

interface NotificationBellProps {
  contactId: string;
  contactEmail: string;
  gmailThreadId?: string;
  hasUnreadReply?: boolean;
  notificationsMuted?: boolean;
  onStateChange?: () => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  contactId,
  contactEmail,
  gmailThreadId,
  hasUnreadReply = false,
  notificationsMuted = false,
  onStateChange,
}) => {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleBellClick = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!gmailThreadId) {
      toast({
        title: 'No Gmail Thread',
        description: 'No email has been sent to this contact yet.',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);

    try {
      if (hasUnreadReply) {
        // Generate reply draft and open Gmail
        const result = await apiService.generateReplyDraft(contactId);

        if ('error' in result) {
          throw new Error(result.error);
        }

        // Open Gmail with the draft
        window.open(result.gmailUrl, '_blank');

        toast({
          title: 'Reply Draft Created',
          description: 'Opening Gmail with your draft reply...',
        });

        // Trigger state refresh
        onStateChange?.();
      } else {
        // Just open the thread
        window.open(`https://mail.google.com/mail/u/0/#inbox/${gmailThreadId}`, '_blank');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to open Gmail thread',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMuteToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();

    try {
      const result = await apiService.muteContactNotifications(contactId, !notificationsMuted);

      if ('error' in result) {
        throw new Error(result.error);
      }

      toast({
        title: notificationsMuted ? 'Notifications Enabled' : 'Notifications Muted',
        description: notificationsMuted
          ? `You'll receive notifications for ${contactEmail}`
          : `Notifications muted for ${contactEmail}`,
      });

      onStateChange?.();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to toggle notifications',
        variant: 'destructive',
      });
    }
  };

  // Tooltip text
  const getTooltip = () => {
    if (notificationsMuted) return 'Notifications muted';
    if (hasUnreadReply) return 'Reply received - open thread';
    return 'View sent thread';
  };

  // Determine which image to show
  const getBellImage = () => {
    if (notificationsMuted) return '/bell_mute.jpg';
    if (hasUnreadReply) return '/bell_notification.jpg';
    return '/bell.jpg';
  };

  // Get the appropriate styling
  const getBellClass = () => {
    const baseClass = 'h-5 w-5 cursor-pointer transition-all duration-200 object-contain';

    if (notificationsMuted) {
      return `${baseClass} opacity-60 hover:opacity-80`;
    }

    if (hasUnreadReply) {
      return `${baseClass} animate-pulse`;
    }

    return `${baseClass} hover:opacity-80`;
  };

  return (
    <div className="relative group">
      <div
        className="relative flex items-center justify-center"
        onClick={notificationsMuted ? handleMuteToggle : handleBellClick}
        onContextMenu={(e) => {
          e.preventDefault();
          handleMuteToggle(e);
        }}
      >
        <img
          src={getBellImage()}
          alt={getTooltip()}
          className={getBellClass()}
          title={getTooltip()}
          style={
            hasUnreadReply
              ? { filter: 'drop-shadow(0 0 4px rgba(34, 212, 197, 0.6))' }
              : undefined
          }
        />
      </div>

      {/* Tooltip */}
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg">
        {getTooltip()}
        <span className="block text-[10px] text-gray-400 mt-0.5">
          Right-click to {notificationsMuted ? 'unmute' : 'mute'}
        </span>
      </span>
    </div>
  );
};
