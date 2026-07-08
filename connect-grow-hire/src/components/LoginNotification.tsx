import { useEffect, useRef, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { useFirebaseAuth } from '@/contexts/FirebaseAuthContext';
import { useNotifications } from '@/hooks/useNotifications';

/**
 * LoginNotification — the one-time "welcome back" summary card.
 *
 * Shows ONCE per login (per uid, per browser session) in the top-left of the
 * page: a dark-blue card matching the dashboard hero, with white bold copy,
 * extra-bold counts, and a floating bell badge. It summarizes how many unread
 * replies and loop actions are waiting, then auto-dismisses.
 *
 * This is the only reply / loop-run notification surface. The old live
 * per-event toasts were removed; this card is login-only.
 */

const SHOWN_KEY = 'offerloop:login-summary-shown-uid';
const AUTO_DISMISS_MS = 7000;

const firstNameOf = (name?: string) => (name?.trim().split(/\s+/)[0]) || 'there';

export function LoginNotification() {
  const { user } = useFirebaseAuth();
  const { notifications, loaded } = useNotifications();
  const [visible, setVisible] = useState(false);
  const [counts, setCounts] = useState({ replies: 0, loops: 0 });
  const decidedRef = useRef(false);

  // Reset when the user signs out so a fresh login re-shows the summary.
  useEffect(() => {
    if (!user) {
      decidedRef.current = false;
      try { sessionStorage.removeItem(SHOWN_KEY); } catch {}
    }
  }, [user]);

  // Decide once per login, on the first loaded notifications snapshot.
  useEffect(() => {
    if (!user || !loaded || decidedRef.current) return;

    let shownFor: string | null = null;
    try { shownFor = sessionStorage.getItem(SHOWN_KEY); } catch {}
    if (shownFor === user.uid) { decidedRef.current = true; return; }

    decidedRef.current = true;
    try { sessionStorage.setItem(SHOWN_KEY, user.uid); } catch {}

    const replies = notifications.unreadReplyCount;
    const loops = notifications.unreadLoopRunCount;
    if (replies + loops === 0) return; // nothing waiting — stay quiet

    setCounts({ replies, loops });
    setVisible(true);
  }, [user, loaded, notifications.unreadReplyCount, notifications.unreadLoopRunCount]);

  // Auto-dismiss.
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setVisible(false), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [visible]);

  if (!visible) return null;

  const { replies, loops } = counts;
  const Num = ({ n }: { n: number }) => (
    <span className="font-extrabold tabular-nums">{n}</span>
  );

  return (
    // Outer wrapper is fixed + NOT clipped, with a little top/left breathing
    // room so the bell badge can poke out of the card without being cut off by
    // the viewport. On desktop it sits just past the 232px sidebar.
    <div className="fixed left-4 top-6 z-[60] animate-fadeInUp md:left-[248px]">
      <div className="relative max-w-[280px]">
        {/* floating bell badge — sibling of the card (not inside its
            overflow-hidden), so it never gets clipped */}
        <span className="absolute -left-2.5 -top-2.5 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white text-[var(--accent)] shadow-[0_4px_12px_rgba(15,23,42,0.22)] ring-4 ring-white/40">
          <Bell className="h-[15px] w-[15px]" strokeWidth={2.6} />
        </span>

        {/* the card body — overflow-hidden only clips its own gradient */}
        <div
          className="relative overflow-hidden rounded-st-2xl pl-5 pr-7 py-3 text-white shadow-[0_14px_30px_rgba(15,23,42,0.28)]"
          style={{ background: 'linear-gradient(135deg,var(--accent) 0%,var(--heading) 100%)' }}
          role="status"
        >
          {/* close */}
          <button
            aria-label="Dismiss"
            onClick={() => setVisible(false)}
            className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/15 hover:text-white"
          >
            <X className="h-3 w-3" strokeWidth={2.5} />
          </button>

          <p className="text-[13px] font-bold leading-tight">
            Welcome back, {firstNameOf(user?.name)}
          </p>
          <p className="mt-0.5 text-[12px] font-semibold leading-snug text-white/90">
            {replies > 0 && loops > 0 && (
              <>You have <Num n={replies} /> unread {replies === 1 ? 'reply' : 'replies'} and{' '}
              <Num n={loops} /> loop {loops === 1 ? 'action' : 'actions'} to review.</>
            )}
            {replies > 0 && loops === 0 && (
              <>You have <Num n={replies} /> unread {replies === 1 ? 'reply' : 'replies'} to review.</>
            )}
            {replies === 0 && loops > 0 && (
              <>You have <Num n={loops} /> loop {loops === 1 ? 'action' : 'actions'} to review.</>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

export default LoginNotification;
