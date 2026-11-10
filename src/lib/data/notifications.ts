import { supabase } from './supabase';

export type NotificationKind = 'assigned' | 'review_assigned' | 'submitted' | 'returned' | 'approved' | 'published' | 'correction' | 'section_published';
export type AppNotification = {
  id: string; kind: NotificationKind; title: string; body: string;
  sample_unit_id: string | null; section_id: string | null; read_at: string | null; created_at: string;
};

export const NOTIFICATION_PAGE_SIZE = 30;
/** Thrown when the notifications migration has not been applied yet. */
export class NotificationsUnavailable extends Error {}

function check(error: { code?: string; message: string } | null) {
  if (!error) return;
  // 42P01 / PGRST205: the table does not exist (migration not applied yet).
  if (error.code === '42P01' || error.code === 'PGRST205' || (/notifications/i.test(error.message) && /does not exist|could not find/i.test(error.message))) {
    throw new NotificationsUnavailable('Notifications are not available yet.');
  }
  throw new Error('Notifications could not be loaded: ' + error.message);
}

/** The signed-in person's latest notifications and unread total. The database only returns their own. */
export async function loadNotifications() {
  const [list, unread] = await Promise.all([
    supabase.from('notifications').select('id,kind,title,body,sample_unit_id,section_id,read_at,created_at')
      .order('created_at', { ascending: false }).limit(NOTIFICATION_PAGE_SIZE),
    supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null),
  ]);
  check(list.error);
  check(unread.error);
  return { items: (list.data ?? []) as AppNotification[], unread: unread.count ?? 0 };
}

/** Marks the given notifications read, or all of them when no ids are given. */
export async function markNotificationsRead(ids?: string[]) {
  const { error } = await supabase.rpc('lakad_mark_notifications_read', { ids: ids ?? null });
  check(error);
}

/** Calls onNew whenever a notification arrives for this person. Returns the unsubscribe function. */
export function watchNotifications(userId: string, onNew: () => void) {
  const channel = supabase.channel(`notifications:${userId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` }, () => onNew())
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

/** "Just now", "5 min ago", "3 h ago", "2 d ago", then the date. */
export function timeAgo(value: string, now = Date.now()) {
  const minutes = Math.floor((now - Date.parse(value)) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}
