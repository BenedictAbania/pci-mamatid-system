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
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { canAccess, homeForRole } from '@/lib/access';
import { supabase } from '@/lib/supabase';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { AppThemeProvider } from '@/providers/ThemeProvider';

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { session, role, isLoading, error, refreshProfile } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isLoginRoute = pathname === '/' || pathname === '/login';
  const isPublicRoute = isLoginRoute || pathname === '/prototype';

  useEffect(() => {
    if (isLoading) return;

    if (!session && !isPublicRoute) {
      router.replace('/');
    } else if (session && role && isLoginRoute) {
      router.replace(homeForRole(role));
    }
  }, [isLoading, isLoginRoute, isPublicRoute, role, router, session]);

  if (pathname !== '/prototype' && ((!isPublicRoute && isLoading) || (!session && !isPublicRoute) || (session && isLoginRoute && !error))) {
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

  if (pathname !== '/prototype' && session && !isLoading && (error || !canAccess(role, pathname))) {
    return <View style={[styles.loadingScreen, { backgroundColor: colorScheme === 'dark' ? '#071127' : '#F7FAFF', padding: 24, gap: 18 }]}>
      <Text style={{ color: colorScheme === 'dark' ? '#FFFFFF' : '#071A43', fontSize: 18, textAlign: 'center' }}>{error || 'You are not authorized to open this page.'}</Text>
      {error ? <Pressable onPress={() => void refreshProfile()}><Text style={styles.actionText}>Retry profile</Text></Pressable> : <Pressable onPress={() => role && router.replace(homeForRole(role))}><Text style={styles.actionText}>Back to my dashboard</Text></Pressable>}
      <Pressable onPress={() => void supabase.auth.signOut()}><Text style={styles.actionText}>Sign out</Text></Pressable>
    </View>;
  }

  return (
    <>
      <AnimatedSplashOverlay />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" options={{ title: 'Sign in · LAKAD' }} />
        <Stack.Screen name="login" options={{ title: 'Sign in · LAKAD' }} />
        <Stack.Screen name="workspace" options={{ title: 'Workspace · LAKAD' }} />
        <Stack.Screen name="field-inspections" options={{ title: 'Field Inspections · LAKAD' }} />
        <Stack.Screen name="sampling" options={{ title: 'Sample Planning · LAKAD' }} />
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
  actionText: { color: '#1769E8', fontSize: 15, fontWeight: '700' },
});
