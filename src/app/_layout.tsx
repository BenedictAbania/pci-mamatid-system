import {
    DarkTheme,
    DefaultTheme,
    ThemeProvider as NavigationThemeProvider,
    Stack,
    usePathname,
    useRouter,
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { AppThemeProvider } from '@/providers/ThemeProvider';

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { session, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isLoginRoute = pathname === '/' || pathname === '/login';
  const isPublicRoute = isLoginRoute || pathname === '/prototype';

  useEffect(() => {
    if (isLoading) return;

    if (!session && !isPublicRoute) {
      router.replace('/');
    } else if (session && isLoginRoute) {
      router.replace('/dashboard');
    }
  }, [isLoading, isLoginRoute, isPublicRoute, router, session]);

  if ((!isPublicRoute && isLoading) || (!session && !isPublicRoute) || (session && isLoginRoute)) {
    return (
      <View
        style={[
          styles.loadingScreen,
          { backgroundColor: colorScheme === 'dark' ? '#071127' : '#F7FAFF' },
        ]}>
        <ActivityIndicator color="#3B82F6" size="large" />
      </View>
    );
  }

  return (
    <>
      <AnimatedSplashOverlay />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" options={{ title: 'PCI Prototype · LAKAD' }} />
        <Stack.Screen name="login" options={{ title: 'Sign in · LAKAD' }} />
        <Stack.Screen name="dashboard" options={{ title: 'Dashboard · LAKAD' }} />
        <Stack.Screen name="road-network" options={{ title: 'Road Network · LAKAD' }} />
        <Stack.Screen name="inspections" options={{ title: 'Inspections · LAKAD' }} />
        <Stack.Screen name="pci-results" options={{ title: 'PCI Results · LAKAD' }} />
        <Stack.Screen name="maintenance-plan" options={{ title: 'Maintenance Plan · LAKAD' }} />
        <Stack.Screen name="users" options={{ title: 'Users & Roles · LAKAD' }} />
        <Stack.Screen name="reports" options={{ title: 'Reports · LAKAD' }} />
        <Stack.Screen name="settings" options={{ title: 'System Settings · LAKAD' }} />
        <Stack.Screen name="rls-test" options={{ title: 'RLS Test' }} />
        <Stack.Screen name="prototype" options={{ title: 'PCI Prototype · LAKAD' }} />
      </Stack>
    </>
  );
}

function AppNavigation() {
  const colorScheme = useColorScheme();

  return (
    <NavigationThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <AppNavigation />
    </AppThemeProvider>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
});
