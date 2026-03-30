/**
 * app/index.tsx
 * Schermata inserimento Stream ID
 * Si adatta automaticamente a TV e mobile
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const BASE_URL    = 'http://129.153.47.200:8000';
const STORAGE_KEY = 'last_stream_id';

// Rileva TV: schermo largo + nessun touch
const { width } = Dimensions.get('window');
const isTV = Platform.isTV || (width >= 1280 && !('ontouchstart' in global));

export default function HomeScreen() {
  const [streamId, setStreamId] = useState('');
  const [error, setError]       = useState('');
  const inputRef                = useRef<TextInput>(null);
  const dotAnim                 = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dotAnim, { toValue: 0.3, duration: 900, useNativeDriver: true }),
        Animated.timing(dotAnim, { toValue: 1,   duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [dotAnim]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(val => {
      if (val) setStreamId(val);
    });
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  async function handleStart() {
    const id = streamId.trim();
    if (!id) {
      setError('inserisci uno stream id');
      return;
    }
    setError('');
    await AsyncStorage.setItem(STORAGE_KEY, id);
    router.push(`/player?id=${id}`);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.card, isTV && styles.cardTV]}>

          {/* Logo */}
          <View style={styles.logoRow}>
            <Animated.View style={[styles.dot, { opacity: dotAnim }]} />
            <Text style={[styles.logo, isTV && styles.logoTV]}>HLS PLAYER</Text>
          </View>

          {/* Label */}
          <Text style={styles.label}>stream id</Text>

          {/* Input */}
          <TextInput
            ref={inputRef}
            style={[styles.input, isTV && styles.inputTV]}
            value={streamId}
            onChangeText={text => { setStreamId(text); setError(''); }}
            onSubmitEditing={handleStart}
            placeholder="es. 1"
            placeholderTextColor="#2a2a2a"
            keyboardType="default"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            selectTextOnFocus
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {/* Pulsante */}
          <Pressable
            style={({ focused, pressed }) => [
              styles.btn,
              isTV && styles.btnTV,
              (focused || pressed) && styles.btnActive,
            ]}
            onPress={handleStart}
          >
            <Text style={[styles.btnText, isTV && styles.btnTextTV]}>▶  avvia</Text>
          </Pressable>

          {/* URL base */}
          <Text style={styles.baseUrl}>{BASE_URL}</Text>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },

  // Card
  card: {
    width: '100%',
    maxWidth: 420,
    padding: 28,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#1e1e1e',
  },
  cardTV: {
    width: 500,
    padding: 44,
  },

  // Logo
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 32,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff3b3b',
    shadowColor: '#ff3b3b',
    shadowOpacity: 0.6,
    shadowRadius: 6,
  },
  logo: {
    color: '#e8ff47',
    fontFamily: 'monospace',
    fontWeight: '500',
    fontSize: 13,
    letterSpacing: 3,
  },
  logoTV: {
    fontSize: 16,
  },

  // Label
  label: {
    color: '#444',
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },

  // Input
  input: {
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#1e1e1e',
    color: '#c8c8c8',
    fontFamily: 'monospace',
    fontSize: 20,
    padding: 12,
    marginBottom: 8,
    letterSpacing: 3,
  },
  inputTV: {
    fontSize: 26,
    padding: 16,
    letterSpacing: 5,
  },

  // Errore
  error: {
    color: '#ff3b3b',
    fontFamily: 'monospace',
    fontSize: 11,
    marginBottom: 8,
  },

  // Pulsante
  btn: {
    borderWidth: 1,
    borderColor: '#1e1e1e',
    padding: 14,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  btnTV: {
    padding: 16,
    marginTop: 20,
  },
  btnActive: {
    borderColor: '#e8ff47',
  },
  btnText: {
    color: '#c8c8c8',
    fontFamily: 'monospace',
    fontSize: 13,
    letterSpacing: 2,
  },
  btnTextTV: {
    fontSize: 15,
  },

  // URL base
  baseUrl: {
    color: '#2a2a2a',
    fontFamily: 'monospace',
    fontSize: 10,
    textAlign: 'center',
  },
});
