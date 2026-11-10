import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import type { AdminPalette } from '@/components/admin/admin-shell';
import { canAccess } from '@/lib/auth/access';
import { loadNotifications, markNotificationsRead, NotificationsUnavailable, timeAgo, watchNotifications, type AppNotification, type NotificationKind } from '@/lib/data/notifications';
import { useAuth } from '@/providers/AuthProvider';

type PressState = { pressed: boolean; hovered?: boolean };
const ICONS: Record<NotificationKind, 'clipboard' | 'user-check' | 'send' | 'corner-up-left' | 'check-circle' | 'globe' | 'edit-3' | 'layers'> = {
  assigned: 'clipboard', review_assigned: 'user-check', submitted: 'send', returned: 'corner-up-left',
  approved: 'check-circle', published: 'globe', correction: 'edit-3', section_published: 'layers',
};

/**
 * Bell in the page header with the unread count. Opens the latest notifications; tapping one
 * marks it read and opens the related inspection. New notifications arrive live through Realtime.
 */
export function NotificationBell({ palette: p }: { palette: AdminPalette }) {
  const router = useRouter();
  const { role, user } = useAuth();
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const sequence = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const result = await loadNotifications();
      if (request !== sequence.current) return;
      setItems(result.items); setUnread(result.unread); setStatus('ready');
    } catch (reason) {
      if (request !== sequence.current) return;
      setStatus(reason instanceof NotificationsUnavailable ? 'unavailable' : 'error');
      setMessage(reason instanceof Error ? reason.message : 'Notifications could not be loaded.');
    }
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    // Load once, then stay live through Realtime.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const stop = watchNotifications(user.id, () => void refresh());
    const requests = sequence;
    return () => { ++requests.current; stop(); };
  }, [refresh, user?.id]);

  async function openItem(item: AppNotification) {
    setOpen(false);
    if (!item.read_at) {
      setItems(list => list.map(n => n.id === item.id ? { ...n, read_at: new Date().toISOString() } : n));
      setUnread(count => Math.max(0, count - 1));
      void markNotificationsRead([item.id]).catch(() => void refresh());
    }
    const target = item.sample_unit_id ? `/field-inspections?status=all&sample=${item.sample_unit_id}`
      : item.kind === 'assigned' ? '/field-inspections?status=planned'
        : item.kind === 'review_assigned' ? '/field-inspections?status=all' : null;
    if (target && canAccess(role, '/field-inspections')) router.push(target as never);
  }

  async function markAll() {
    setItems(list => list.map(n => n.read_at ? n : { ...n, read_at: new Date().toISOString() }));
    setUnread(0);
    try { await markNotificationsRead(); } catch { void refresh(); }
  }

  const phone = width < 520;
  const label = unread ? `Notifications, ${unread} unread` : 'Notifications';
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => { setOpen(true); void refresh(); }}
      style={({ hovered, pressed }: PressState) => [{ alignItems: 'center', borderRadius: 24, borderWidth: 1, height: 42, justifyContent: 'center', width: 42, backgroundColor: hovered ? p.blueSoft : p.panel, borderColor: hovered ? p.blue : p.border }, pressed && { transform: [{ scale: 0.96 }] }]}>
      <Feather color={p.text} name="bell" size={17} />
      {unread > 0 && <View pointerEvents="none" style={{ position: 'absolute', top: -4, right: -4, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D92D20', borderWidth: 2, borderColor: p.panel }}>
        <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '800' }}>{unread > 99 ? '99+' : unread}</Text>
      </View>}
    </Pressable>

    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <Pressable accessibilityLabel="Close notifications" onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(6,15,46,0.25)' }}>
        <Pressable accessibilityViewIsModal onPress={() => undefined}
          style={{ position: 'absolute', top: phone ? 64 : 72, right: phone ? 12 : 24, left: phone ? 12 : undefined, width: phone ? undefined : 400, maxHeight: '80%', backgroundColor: p.panel, borderColor: p.border, borderWidth: 1, borderRadius: 14, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderColor: p.border }}>
            <Text accessibilityRole="header" style={{ color: p.text, fontSize: 17, fontWeight: '800', flex: 1 }}>Notifications</Text>
            {unread > 0 && <Pressable accessibilityRole="button" onPress={() => void markAll()} hitSlop={6}>
              <Text style={{ color: p.blue, fontWeight: '700', fontSize: 13 }}>Mark all as read</Text>
            </Pressable>}
            <Pressable accessibilityRole="button" accessibilityLabel="Close notifications" onPress={() => setOpen(false)} hitSlop={6}>
              <Feather name="x" size={20} color={p.text} />
            </Pressable>
          </View>
          <ScrollView>
            {status === 'loading' && <Text style={{ color: p.muted, padding: 20, textAlign: 'center' }}>Loading notifications…</Text>}
            {status === 'unavailable' && <Text style={{ color: p.muted, padding: 20, textAlign: 'center' }}>Notifications are not available yet.</Text>}
            {status === 'error' && <Text style={{ color: p.red, padding: 20, textAlign: 'center' }}>{message}</Text>}
            {status === 'ready' && !items.length && <View style={{ alignItems: 'center', gap: 8, padding: 28 }}>
              <Feather name="bell" size={26} color={p.muted} />
              <Text style={{ color: p.muted, textAlign: 'center' }}>No notifications yet. Assignments, reviews and approvals will appear here.</Text>
            </View>}
            {status === 'ready' && items.map(item => {
              const fresh = !item.read_at;
              return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${fresh ? 'Unread. ' : ''}${item.title}. ${item.body} ${timeAgo(item.created_at)}`} onPress={() => void openItem(item)}
                style={({ hovered }: PressState) => ({ flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: p.border, backgroundColor: hovered ? p.panelAlt : fresh ? p.blueSoft : p.panel })}>
                <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: item.kind === 'returned' ? p.amberSoft : p.icon }}>
                  <Feather name={ICONS[item.kind] ?? 'bell'} size={16} color={item.kind === 'returned' ? p.amber : p.blue} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={{ color: p.text, fontWeight: fresh ? '800' : '600', fontSize: 14 }}>{item.title}</Text>
                  <Text style={{ color: p.text, fontSize: 13.5, lineHeight: 19 }}>{item.body}</Text>
                  <Text style={{ color: p.muted, fontSize: 12 }}>{timeAgo(item.created_at)}</Text>
                </View>
                {fresh && <View accessibilityElementsHidden style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: p.blue, marginTop: 6 }} />}
              </Pressable>;
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  </>;
}
