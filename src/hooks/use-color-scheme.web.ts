import { useAppTheme } from '@/providers/ThemeProvider';

export function useColorScheme() {
  return useAppTheme().colorScheme;
}
