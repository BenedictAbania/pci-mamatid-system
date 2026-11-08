import { Platform, Pressable, Text, View, type KeyDownEvent } from 'react-native';
import { useAdminPalette } from '@/components/admin/admin-shell';

/** Native-compatible labeled tabs: keyboard focus and selected state remain explicit. */
export function TaskTabs({ label, items, value, onChange, disabled = false, variant = 'default' }: {
  label: string; items: readonly { value: string; label: string }[]; value: string;
  onChange: (value: string) => void; disabled?: boolean;
  /** `pill`: larger rounded chips with a filled sky selection (assignment filters). */
  variant?: 'default' | 'pill';
}) {
  const p = useAdminPalette();
  const pill = variant === 'pill';
  return <View testID="lakad-tabs" accessibilityRole="tablist" accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: pill ? 12 : 8 }}>
    {items.map((item, index) => <Pressable key={item.value} accessibilityRole="tab" accessibilityLabel={item.label}
      aria-selected={item.value === value} tabIndex={item.value === value ? 0 : -1}
      {...(Platform.OS === 'web' ? { onKeyDown: (event: KeyDownEvent) => {
        const key = event.nativeEvent.key;
        if (disabled || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return;
        event.preventDefault();
        const next = key === 'Home' ? 0 : key === 'End' ? items.length - 1 : (index + (key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
        onChange(items[next].value);
        (event.currentTarget as unknown as HTMLElement).parentElement?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
      } } : {})}
      accessibilityState={{ selected: item.value === value, disabled: disabled && item.value !== value }}
      disabled={disabled && item.value !== value} onPress={() => onChange(item.value)}
      style={pill ? { minHeight: 56, minWidth: 96, paddingHorizontal: 18, paddingVertical: 14, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
        borderColor: item.value === value ? p.text : p.border, backgroundColor: item.value === value ? p.tabActive : p.panel }
        : { minHeight: 44, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, borderWidth: 1,
        borderColor: item.value === value ? p.blue : p.border, backgroundColor: item.value === value ? p.blueSoft : p.panel }}>
      <Text style={pill ? { fontSize: 16, fontWeight: '500', color: p.text } : { fontSize: 13, fontWeight: item.value === value ? '700' : '500', color: p.text }}>{item.label}</Text>
    </Pressable>)}
  </View>;
}
