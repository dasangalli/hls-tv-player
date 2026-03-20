/**
 * app/index.tsx
 * Schermata di inserimento Stream ID
 *
 * Navigabile da telecomando Android TV:
 * - D-pad su/giù/sinistra/destra per muoversi tra i caratteri
 * - Tasto OK/Select per confermare
 * - Il campo di testo usa la tastiera di sistema della TV
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const BASE_URL = 'http://129.153.47.200:8000';
const STORAGE_KEY = 'last_stream_id';

export default function HomeScreen() {
  const [streamId, setStreamId]   = useState('');
  const [error, setError]         = useState('');
  const inputRef                  = useRef<TextInput>(null);
  const dotAnim                   = useRef(new Animated.Value(1)).current;

  // Pulsante lampeggiante
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

  // Recupera l'ultimo stream ID usato
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(val => {
      if (val) setStreamId(val);
    });

    // Autofocus dopo un breve delay (serve su TV)
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
    <View style={styles.container}>

      <View style={styles.card}>

        {/* Logo */}
        <View style={styles.logoRow}>
          <Animated.View style={[styles.dot, { opacity: dotAnim }]} />
          <Text style={styles.logo}>STREAM PLAYER</Text>
        </View>

        {/* Label */}
        <Text style={styles.label}>stream id</Text>

        {/* Input */}
        <TextInput
          ref={inputRef}
          style={styles.input}
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

        {/* Errore */}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Pulsante */}
        <Pressable
          style={({ focused, pressed }) => [
            styles.btn,
            (focused || pressed) && styles.btnFocused,
          ]}
          onPress={handleStart}
          hasTVPreferredFocus={false}
        >
          <Text style={styles.btnText}>▶  avvia</Text>
        </Pressable>

        {/* URL base */}
        <Text style={styles.baseUrl}>{BASE_URL}</Text>

      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: 480,
    padding: 40,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#1e1e1e',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 36,
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
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontWeight: '500',
    fontSize: 15,
    letterSpacing: 3,
  },
  label: {
    color: '#444',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#1e1e1e',
    color: '#c8c8c8',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 24,
    padding: 14,
    marginBottom: 8,
    letterSpacing: 4,
  },
  error: {
    color: '#ff3b3b',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 11,
    marginBottom: 8,
  },
  btn: {
    borderWidth: 1,
    borderColor: '#1e1e1e',
    padding: 14,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  btnFocused: {
    borderColor: '#e8ff47',
  },
  btnText: {
    color: '#c8c8c8',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 13,
    letterSpacing: 2,
  },
  baseUrl: {
    color: '#2a2a2a',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 10,
    textAlign: 'center',
  },
});
