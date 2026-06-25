import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useNotifications, type NotificationItem } from '@/hooks/useNotifications';
import { toast } from '@/hooks/use-toast';

/**
 * ReplyNotifier — the single global owner of the "new reply" toast.
 *
 * Mounted once in App.tsx so it never remounts on navigation. The old trigger
 * lived inside the per-page AppHeader, which React unmounted and remounted on
 * every route change; each fresh instance reset its dedupe refs and read an
 * initial unread count of 0 before the Firestore snapshot loaded, so the
 * 0 -> N load looked like a new reply and re-fired the same toast on every
 * navigation. This owner instead dedupes by notification identity persisted in
 * sessionStorage and seeds silently on the first loaded snapshot, so a given
 * reply toasts exactly once and pre-existing unread replies never re-announce.
 */

const SEEN_KEY = 'offerloop:reply-toasts-seen';

// Pages where the reply list already lives, so a toast would be redundant.
const SUPPRESS_ON = new Set(['/outbox', '/tracker']);

function itemId(i: NotificationItem): string {
  return `${i.contactId}|${i.timestamp}`;
}

// Loop-run summaries (written by loop_notifications.write_loop_run_notification
// with kind: "loop_run") share this same outbox doc + items[] array, but they
// are NOT replies and must never fire the reply toast. Legacy reply items have
// no `kind` field, so treat a missing kind as "reply". Read defensively so this
// stays correct even though HEAD's NotificationItem type predates the field.
function isReply(i: NotificationItem): boolean {
  return ((i as { kind?: string }).kind ?? 'reply') === 'reply';
}

function loadSeen(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveSeen(seen: Set<string>) {
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    // sessionStorage unavailable (private mode / quota). Dedupe quietly
    // degrades; worst case a reply re-announces after a full reload.
  }
}

function initial(name: string): string {
  const c = name?.trim()?.charAt(0);
  return c ? c.toUpperCase() : '?';
}

export function ReplyNotifier() {
  const location = useLocation();
  const { notifications, loaded } = useNotifications();
  const seededRef = useRef(false);

  useEffect(() => {
    if (!loaded) return;

    const seen = loadSeen();

    // First loaded snapshot: record what is already unread without toasting,
    // so existing replies do not announce themselves on open.
    if (!seededRef.current) {
      seededRef.current = true;
      notifications.items.forEach((i) => seen.add(itemId(i)));
      saveSeen(seen);
      return;
    }

    const unseen = notifications.items.filter(
      (i) => !i.read && !seen.has(itemId(i)) && isReply(i)
    );
    if (unseen.length === 0) return;

    // Mark every newly seen reply now, so none of them can re-toast later
    // (including any that arrived while we were on a suppressed page).
    unseen.forEach((i) => seen.add(itemId(i)));
    saveSeen(seen);

    if (SUPPRESS_ON.has(location.pathname)) return;

    const item = unseen[0];
    // Rich content goes in `description` (typed ReactNode). The toast's `title`
    // collides with the DOM title attribute (string), so it cannot take a node.
    toast({
      className: 'reply-toast',
      description: (
        <div className="reply-toast-row">
          <span className="reply-toast-avatar">{initial(item.contactName)}</span>
          <span className="reply-toast-text">
            <span className="reply-toast-name">{item.contactName} responded</span>
            {item.snippet && (
              <span className="reply-toast-snippet">
                {item.snippet.slice(0, 80)}
                {item.snippet.length > 80 ? '…' : ''}
              </span>
            )}
          </span>
        </div>
      ),
    });
  }, [loaded, notifications.items, location.pathname]);

  return null;
}

export default ReplyNotifier;
