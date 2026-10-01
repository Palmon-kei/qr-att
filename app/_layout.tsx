import { Stack } from 'expo-router';
import { useEffect } from 'react';

import { COLORS } from '@/constants/colors';
import { initializeAuth } from '@/lib/auth';

export default function RootLayout() {
  useEffect(() => {
    initializeAuth();
  }, []);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: COLORS.background,
        },
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}