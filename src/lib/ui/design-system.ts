/** Shared LAKAD branding tokens, never inspection data. */

/** Colours sampled from the LAKAD logo, and the wordmark's typeface family. */
export const brand = {
  /** Main stroke of the logo. */
  royal: '#1850E0',
  /** Road surface and shadowed stroke. */
  deep: '#1038B0',
  /** Light right-hand stroke. */
  sky: '#4E8BFE',
  /** Deep navy grounds derived from the logo hue. */
  navy: '#0A1B4D',
  night: '#060F2E',
  ink: '#0B1D4D',
  /** The logo's three blues as one diagonal sweep (web only). */
  gradient: 'linear-gradient(135deg, #1038B0 0%, #1850E0 55%, #4E8BFE 100%)',
  /** Noto Sans is the open twin of the wordmark's Segoe UI Black, loaded in +html.tsx. */
  font: '"Noto Sans", "Segoe UI", system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif',
} as const;

export const layout = {
  sidebar: 264, compact: 980, phone: 650, columns: 1180,
  spacing: { xs: 6, sm: 12, md: 18, lg: 24, xl: 32 },
  radius: { control: 10, card: 16, badge: 8 },
  type: { caption: 12, body: 15, panel: 18, title: 30, metric: 36 },
  navy: { sidebar: brand.navy, active: brand.royal, ink: brand.ink },
  shadow: { boxShadow: '0px 1px 2px rgba(10, 27, 77, 0.04), 0px 10px 28px rgba(10, 27, 77, 0.06)' },
  /** One dimming layer behind every dialog, sheet and mobile menu. */
  scrim: 'rgba(6, 15, 46, 0.58)',
} as const;
export function createPalette(isDark: boolean) {
  return {
    background: isDark ? '#060F2E' : '#F3F6FC', panel: isDark ? '#0C1A42' : '#FFFFFF',
    panelAlt: isDark ? '#11214F' : '#EEF3FC', input: isDark ? '#091536' : '#F8FAFE',
    text: isDark ? '#F1F5FE' : brand.ink, muted: isDark ? '#A8B5D6' : '#4B5B7C',
    border: isDark ? '#1F3366' : '#DBE3F2', blue: isDark ? '#7DA8FF' : brand.royal, action: isDark ? '#2A5FF0' : brand.royal,
    blueSoft: isDark ? '#13265A' : '#E9F0FE', icon: isDark ? '#16295F' : '#E2EBFE',
    green: isDark ? '#76DEAD' : '#126B45', greenSoft: isDark ? '#0D3328' : '#EAF8F2',
    amber: isDark ? '#FFD06F' : '#B45309', amberSoft: isDark ? '#352811' : '#FFF7E6',
    red: isDark ? '#FFA4AF' : '#B62135', redSoft: isDark ? '#40202A' : '#FFF0F2',
    teal: isDark ? '#5ED3E6' : '#0E7490', tealSoft: isDark ? '#0A2E3A' : '#E3F5F9',
  };
}
/** Breakpoints account for the space occupied by the desktop sidebar. */
export function dashboardLayout(windowWidth: number) {
  const content = windowWidth - (windowWidth >= layout.compact ? layout.sidebar : 0) - (windowWidth < layout.phone ? 28 : 48);
  return { metricColumns: content >= 1000 ? 4 : content >= 280 ? 2 : 1, twoColumns: windowWidth >= layout.columns, phone: windowWidth < layout.phone };
}
