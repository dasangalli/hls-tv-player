import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';

interface State {
  hasError: boolean;
  error: string;
  stack: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: '', stack: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error: error?.message ?? String(error),
      stack: error?.stack ?? '',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('=== APP CRASH ===');
    console.error('Error:', error?.message);
    console.error('Stack:', error?.stack);
    console.error('Component Stack:', info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>💥 CRASH RILEVATO</Text>
          <Text style={styles.label}>ERRORE:</Text>
          <Text style={styles.error}>{this.state.error}</Text>
          <Text style={styles.label}>STACK:</Text>
          <ScrollView style={styles.scroll}>
            <Text style={styles.stack}>{this.state.stack}</Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    padding: 40,
    justifyContent: 'center',
  },
  title: {
    color: '#ff4444',
    fontSize: 32,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    marginBottom: 30,
  },
  label: {
    color: '#888',
    fontSize: 14,
    fontFamily: 'monospace',
    marginBottom: 8,
    marginTop: 16,
  },
  error: {
    color: '#e8ff47',
    fontSize: 18,
    fontFamily: 'monospace',
    backgroundColor: '#1a1a1a',
    padding: 12,
    borderRadius: 8,
  },
  scroll: {
    maxHeight: 300,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
  },
  stack: {
    color: '#aaa',
    fontSize: 12,
    fontFamily: 'monospace',
    lineHeight: 18,
  },
});
