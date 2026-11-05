/** Shared LAKAD branding tokens, never inspection data. */
export const layout = {
  sidebar: 264, compact: 980, phone: 650, columns: 1180,
  spacing: { xs: 6, sm: 12, md: 18, lg: 24, xl: 32 },
  radius: { control: 10, card: 14, badge: 7 },
  type: { caption: 12, body: 15, panel: 18, title: 30, metric: 36 },
  navy: { sidebar: '#112B40', active: '#29495F', ink: '#183249' },
  shadow: { boxShadow: '0px 3px 12px rgba(17, 43, 64, 0.04)' },
} as const;
export function createPalette(isDark: boolean) {
  return {
    background: isDark ? '#0E1C29' : '#F3F5F6', panel: isDark ? '#162A3B' : '#FFFFFF',
    panelAlt: isDark ? '#1B3245' : '#F1F4F6', input: isDark ? '#102333' : '#F8FAFB',
    text: isDark ? '#F3F6F8' : '#183249', muted: isDark ? '#B6C6D2' : '#526576',
    border: isDark ? '#395064' : '#D9E1E7', blue: isDark ? '#C3D7E5' : '#29495F', action: '#29495F',
    blueSoft: isDark ? '#223E53' : '#E9EFF3', icon: isDark ? '#223E53' : '#E1EBF1',
    green: isDark ? '#76DEAD' : '#126B45', greenSoft: isDark ? '#10392F' : '#EAF8F2',
    amber: isDark ? '#FFD06F' : '#805000', amberSoft: isDark ? '#352811' : '#FFF8E8',
    red: isDark ? '#FFA4AF' : '#B62135', redSoft: isDark ? '#40202A' : '#FFF0F2',
    purple: isDark ? '#CCB6FF' : '#6540BC', purpleSoft: isDark ? '#2C244C' : '#F1EBFF',
  };
}
/** Breakpoints account for the space occupied by the desktop sidebar. */
export function dashboardLayout(windowWidth: number) {
  const content = windowWidth - (windowWidth >= layout.compact ? layout.sidebar : 0) - (windowWidth < layout.phone ? 28 : 48);
  return { metricColumns: content >= 1000 ? 4 : content >= 280 ? 2 : 1, twoColumns: windowWidth >= layout.columns, phone: windowWidth < layout.phone };
}
