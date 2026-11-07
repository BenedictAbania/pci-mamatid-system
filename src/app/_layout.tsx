import {
    DarkTheme,
    DefaultTheme,
    ThemeProvider as NavigationThemeProvider,
    Stack,
    usePathname,
    useRouter,
} from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { canAccess, homeForRole } from '@/lib/auth/access';
import { brand } from '@/lib/ui/design-system';
import { supabase } from '@/lib/data/supabase';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { AppThemeProvider, useAppTheme } from '@/providers/ThemeProvider';

function RootLayoutNav() {
  const { colorScheme } = useAppTheme();
  const { session, role, isLoading, error, refreshProfile } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isLandingRoute = pathname === '/';
  const isLoginRoute = pathname === '/login';
  // Invitees land on /welcome from the email link to accept and set a password.
  const isWelcomeRoute = pathname === '/welcome';
  const isPublicRoute = isLandingRoute || isLoginRoute || isWelcomeRoute || pathname === '/prototype';

  useEffect(() => {
    if (isLoading) return;

    if (!session && !isPublicRoute) {
      router.replace('/login');
    } else if (session && role && isLoginRoute) {
      router.replace(homeForRole(role));
    }
  }, [isLoading, isLoginRoute, isPublicRoute, role, router, session]);

  if ((pathname === '/prototype' && isLoading) || (pathname !== '/prototype' && ((!isPublicRoute && isLoading && !role) || (!session && !isPublicRoute) || (session && isLoginRoute && !error)))) {
    return (
      <View
        style={[
          styles.loadingScreen,
          { backgroundColor: colorScheme === 'dark' ? '#060F2E' : '#F3F6FC' },
        ]}>
        <ActivityIndicator color={brand.royal} size="large" />
      </View>
    );
  }

  if (session && !isLoading && !isWelcomeRoute && !isLandingRoute && (error || ((pathname !== '/prototype' || role === 'viewer') && !canAccess(role, pathname)))) {
    return <View style={[styles.loadingScreen, { backgroundColor: colorScheme === 'dark' ? '#060F2E' : '#F3F6FC', padding: 24, gap: 18 }]}>
      <Text style={{ color: colorScheme === 'dark' ? '#FFFFFF' : brand.ink, fontSize: 18, textAlign: 'center' }}>{error || 'You are not authorized to open this page.'}</Text>
      {error ? <Pressable onPress={() => void refreshProfile()}><Text style={[styles.actionText, { color: colorScheme === 'dark' ? brand.sky : brand.royal }]}>Retry profile</Text></Pressable> : <Pressable onPress={() => role && router.replace(homeForRole(role))}><Text style={[styles.actionText, { color: colorScheme === 'dark' ? brand.sky : brand.royal }]}>Back to my home</Text></Pressable>}
      <Pressable onPress={() => void supabase.auth.signOut()}><Text style={[styles.actionText, { color: colorScheme === 'dark' ? brand.sky : brand.royal }]}>Sign out</Text></Pressable>
    </View>;
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" options={{ title: 'LAKAD · Smarter Roads Through Better Data' }} />
        <Stack.Screen name="login" options={{ title: 'Sign in · LAKAD' }} />
        <Stack.Screen name="workspace" options={{ title: role === 'viewer' ? 'Overview · LAKAD' : 'Home · LAKAD' }} />
        <Stack.Screen name="field-inspections" options={{ title: role === 'reviewer' ? 'Inspections to Review · LAKAD' : 'My Inspections · LAKAD' }} />
        <Stack.Screen name="sampling" options={{ title: 'Sampling Plans · LAKAD' }} />
        <Stack.Screen name="dashboard" options={{ title: role === 'viewer' ? 'Overview · LAKAD' : 'Home · LAKAD' }} />
        <Stack.Screen name="road-network" options={{ title: 'Road Network · LAKAD' }} />
        <Stack.Screen name="pci-results" options={{ title: role === 'viewer' ? 'Published Results · LAKAD' : role === 'admin' ? 'Results & Reports · LAKAD' : 'Results · LAKAD' }} />
        <Stack.Screen name="demo-priorities" options={{ title: 'Synthetic priority preview · LAKAD' }} />
        <Stack.Screen name="maintenance-plan" options={{ title: 'Maintenance Priorities · LAKAD' }} />
        <Stack.Screen name="users" options={{ title: 'Users · LAKAD' }} />
        <Stack.Screen name="reports" options={{ title: 'Reports · LAKAD' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings · LAKAD' }} />
        <Stack.Screen name="rls-test" options={{ title: 'RLS Test' }} />
        <Stack.Screen name="prototype" options={{ title: 'PCI Prototype · LAKAD' }} />
        <Stack.Screen name="welcome" options={{ title: 'Welcome to LAKAD' }} />
      </Stack>
    </>
  );
}

function AppNavigation() {
  const { colorScheme } = useAppTheme();

  return (
    <SafeAreaProvider>
      <SafeAreaView edges={['top', 'bottom']} style={[styles.safeArea, { backgroundColor: colorScheme === 'dark' ? '#060F2E' : '#F3F6FC' }]}>
        <NavigationThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <AuthProvider>
            <RootLayoutNav />
          </AuthProvider>
        </NavigationThemeProvider>
      </SafeAreaView>
    </SafeAreaProvider>
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
  safeArea: { flex: 1 },
  loadingScreen: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  actionText: { color: brand.sky, fontSize: 15, fontWeight: '700' },
});
