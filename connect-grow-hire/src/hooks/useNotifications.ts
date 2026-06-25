import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useFirebaseAuth } from '@/contexts/FirebaseAuthContext';

// `kind` discriminates a reply notification (default for legacy items)
// from a loop-run summary. Backend writes "loop_run" when a Loop cycle
// finishes with user-visible output. Older docs that pre-date this field
// implicitly fall back to "reply" so the existing reply-toast logic in
// AppHeader keeps working.
export type NotificationKind = 'reply' | 'loop_run';

export interface NotificationItem {
  kind?: NotificationKind;
  // Reply-notification fields (filled by gmail_webhook)
  contactId: string;
  contactName: string;
  company: string;
  // Loop-run summary fields (filled by loop_notifications.assess_cycle_results)
  loopId?: string;
  loopName?: string;
  cycleId?: string;
  // Common
  snippet: string;
  timestamp: string;
  read: boolean;
}

export interface OutboxNotifications {
  // Replies (gmail_webhook bumps this on detection).
  unreadReplyCount: number;
  // Loop-run summaries (loop_jobs bumps this after every cycle that
  // produced user-visible output). Kept separate so the reply-toast in
  // AppHeader can stay focused on actual replies.
  unreadLoopRunCount: number;
  items: NotificationItem[];
}

export function useNotifications() {
  const { user } = useFirebaseAuth();
  const [notifications, setNotifications] = useState<OutboxNotifications>({
    unreadReplyCount: 0,
    unreadLoopRunCount: 0,
    items: [],
  });
  // True once the first Firestore snapshot has resolved. Lets consumers tell
  // "loaded, zero notifications" apart from "not loaded yet", which the toast
  // trigger needs so it can seed silently instead of treating the initial
  // 0 -> N load as a brand-new reply.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    setLoaded(false);

    const unsub = onSnapshot(
      doc(db, 'users', user.uid, 'notifications', 'outbox'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setNotifications({
            unreadReplyCount: data?.unreadReplyCount ?? 0,
            unreadLoopRunCount: data?.unreadLoopRunCount ?? 0,
            items: Array.isArray(data?.items) ? data.items : [],
          });
        }
        setLoaded(true);
      },
      (err) => console.warn('Notification listener error:', err)
    );

    return () => unsub();
  }, [user?.uid]);

  const markAllRead = async () => {
    if (!user?.uid) return;
    const ref = doc(db, 'users', user.uid, 'notifications', 'outbox');
    await setDoc(
      ref,
      {
        unreadReplyCount: 0,
        unreadLoopRunCount: 0,
        items: notifications.items.map((i) => ({ ...i, read: true })),
      },
      { merge: true },
    );
  };

  const markOneRead = async (contactId: string) => {
    if (!user?.uid) return;
    const ref = doc(db, 'users', user.uid, 'notifications', 'outbox');
    const updatedItems = notifications.items.map((i) =>
      i.contactId === contactId ? { ...i, read: true } : i
    );
    // Recompute both counters from the post-mark items so each kind tracks
    // its own unread count without leaking across types.
    const newUnreadReply = updatedItems.filter(
      (i) => !i.read && (i.kind ?? 'reply') === 'reply',
    ).length;
    const newUnreadLoopRun = updatedItems.filter(
      (i) => !i.read && i.kind === 'loop_run',
    ).length;
    await setDoc(
      ref,
      {
        unreadReplyCount: newUnreadReply,
        unreadLoopRunCount: newUnreadLoopRun,
        items: updatedItems,
      },
      { merge: true },
    );
  };

  return { notifications, loaded, markAllRead, markOneRead };
}
