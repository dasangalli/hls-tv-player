import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ErrorBoundary } from '../components/ErrorBoundary';

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <StatusBar hidden />
      <Stack screenOptions={{ headerShown: false }} />
    </ErrorBoundary>
  );
}
