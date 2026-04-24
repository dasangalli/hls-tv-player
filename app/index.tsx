/**
 * app/index.tsx
 * Schermata di avvio ottimizzata per Android TV e Mobile
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
  Keyboard,
} from 'react-native';

const BASE_URL    = 'http://129.153.47.200:8000';
const STORAGE_KEY = 'last_stream_id';

// Rilevamento TV migliorato
const { width } = Dimensions.get('window');
const isTV = Platform.isTV || width >= 1280;

export default function HomeScreen() {
  const [streamId, setStreamId] = useState('');
  const [error, setError]       = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  
  const inputRef  = useRef<TextInput>(null);
  const dotAnim   = useRef(new Animated.Value(1)).current;

  // Animazione pulsante "Live"
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

  // Caricamento ultimo ID e Focus iniziale
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(val => {
      if (val) setStreamId(val);
    });

    // Su TV forziamo il focus sull'input all'avvio
    if (isTV) {
      setTimeout(() => inputRef.current?.focus(), 500);
    }
  }, []);

  async function handleStart() {
    const id = streamId.trim();
    if (!id) {
      setError('inserisci id');
      inputRef.current?.focus();
      return;
    }
    setError('');
    Keyboard.dismiss();
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

          {/* Header con animazione */}
          <View style={styles.logoRow}>
            <Animated.View style={[styles.dot, { opacity: dotAnim }]} />
            <Text style={[styles.logo, isTV && styles.logoTV]}>SYSTEM CONSOLE v3.1</Text>
          </View>

          <Text style={styles.label}>selezione canale</Text>

          {/* INPUT: Ottimizzato per TV */}
          <TextInput
            ref={inputRef}
            style={[
              styles.input, 
              isTV && styles.inputTV,
              isInputFocused && styles.inputFocused
            ]}
            value={streamId}
            onChangeText={text => { setStreamId(text); setError(''); }}
            onSubmitEditing={handleStart}
            placeholder="0"
            placeholderTextColor="#222"
            
            // Fondamentale per TV: mostra tastiera numerica
            keyboardType="numeric" 
            
            // Gestione Focus visivo
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setIsInputFocused(false)}
            
            // UX
            returnKeyType="next"
            selectTextOnFocus
            autoFocus={isTV}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {/* PULSANTE: Gestione nativa del telecomando */}
          <Pressable
            focusable={true}
            onPress={handleStart}
            style={({ focused, pressed }) => [
              styles.btn,
              isTV && styles.btnTV,
              focused && styles.btnFocused,  // Focus del telecomando
              pressed && styles.btnPressed,  // Click del telecomando
            ]}
          >
            {({ focused }) => (
              <Text style={[
                styles.btnText, 
                isTV && styles.btnTextTV,
                focused && styles.btnTextFocused
              ]}>
                {focused ? "READY > AVVIA" : "AVVIA STREAM"}
              </Text>
            )}
          </Pressable>

          <View style={styles.footer}>
            <Text style={styles.baseUrl}>NODE: {BASE_URL.replace('http://', '')}</Text>
            <Text style={styles.footerInfo}>TV_MODE: {isTV ? 'ENABLED' : 'DISABLED'}</Text>
          </View>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
  },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },

  // Card principale
  card: {
    width: '100%',
    maxWidth: 400,
    padding: 24,
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#1a1a1a',
    borderRadius: 2,
  },
  cardTV: {
    maxWidth: 600,
    padding: 50,
    borderWidth: 2,
  },

  // Logo & Info
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 40,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#e8ff47',
    shadowColor: '#e8ff47',
    shadowOpacity: 0.8,
    shadowRadius: 10,
  },
  logo: {
    color: '#e8ff47',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 2,
  },
  logoTV: {
    fontSize: 16,
  },

  // Label
  label: {
    color: '#333',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 10,
    textTransform: 'uppercase',
    marginBottom: 10,
  },

  // Input con stato Focus
  input: {
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: '#222',
    color: '#fff',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 32,
    padding: 15,
    textAlign: 'center',
    marginBottom: 10,
  },
  inputTV: {
    fontSize: 48,
    padding: 20,
    borderWidth: 2,
  },
  inputFocused: {
    borderColor: '#e8ff47',
    backgroundColor: '#0d0d00',
  },

  error: {
    color: '#ff3b3b',
    fontFamily: 'monospace',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 15,
  },

  // Pulsante ottimizzato per Telecomando
  btn: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#222',
    padding: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  btnTV: {
    padding: 22,
    marginTop: 20,
  },
  btnFocused: {
    backgroundColor: '#e8ff47',
    borderColor: '#fff',
    transform: [{ scale: 1.05 }], // Leggero ingrandimento su TV
  },
  btnPressed: {
    opacity: 0.7,
  },
  btnText: {
    color: '#666',
    fontFamily: 'monospace',
    fontWeight: 'bold',
    fontSize: 14,
    letterSpacing: 1,
  },
  btnTextTV: {
    fontSize: 18,
  },
  btnTextFocused: {
    color: '#000',
  },

  // Footer
  footer: {
    marginTop: 40,
    gap: 4,
  },
  baseUrl: {
    color: '#222',
    fontFamily: 'monospace',
    fontSize: 9,
    textAlign: 'center',
  },
  footerInfo: {
    color: '#1a1a1a',
    fontFamily: 'monospace',
    fontSize: 8,
    textAlign: 'center',
  }
});
