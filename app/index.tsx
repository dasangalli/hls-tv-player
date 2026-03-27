import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Platform,
  findNodeHandle,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeTVEventHandler } from '../hooks/useSafeTVEventHandler';

const KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['⌫', '0', '✓'],
];

export default function HomeScreen() {
  const [id, setId] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isButtonFocused, setIsButtonFocused] = useState(false);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const router = useRouter();

  const rootRef = useRef<View>(null);
  const inputRef = useRef<TextInput>(null);
  const buttonRef = useRef<TouchableOpacity>(null);

  useSafeTVEventHandler(rootRef, (evt) => {
    if (!evt) return;
    if (['0','1','2','3','4','5','6','7','8','9'].includes(evt.eventType)) {
      setId((prev) => prev + evt.eventType);
    }
    if (evt.eventType === 'longSelect') {
      setId('');
    }
  });

  const handleKey = (key: string) => {
    if (key === '⌫') {
      setId((prev) => prev.slice(0, -1));
    } else if (key === '✓') {
      handleStart();
    } else {
      setId((prev) => prev + key);
    }
  };

  const handleStart = () => {
    if (id.trim()) {
      router.push({ pathname: '/player', params: { id: id.trim() } });
    }
  };

  return (
    <View ref={rootRef} style={styles.container}>
      <Text style={styles.title}>HLS TV PLAYER</Text>
      <Text style={styles.label}>INSERISCI ID STREAM:</Text>

      <TextInput
        ref={inputRef}
        style={[styles.input, isInputFocused && styles.inputFocused]}
        value={id}
        onChangeText={setId}
        placeholder="Es: 2"
        placeholderTextColor="#444"
        keyboardType="numeric"
        focusable={true}
        hasTVPreferredFocus={true}
        onFocus={() => { setIsInputFocused(true); setShowKeyboard(true); }}
        onBlur={() => setIsInputFocused(false)}
        nextFocusDown={findNodeHandle(buttonRef.current) ?? undefined}
        showSoftInputOnFocus={false} // disabilita tastiera sistema, usiamo la nostra
      />

      {/* Tastiera numerica custom */}
      {showKeyboard && (
        <View style={styles.keyboard}>
          {KEYS.map((row, ri) => (
            <View key={ri} style={styles.keyRow}>
              {row.map((key) => (
                <TouchableOpacity
                  key={key}
                  style={styles.key}
                  focusable={true}
                  onFocus={() => setIsInputFocused(false)}
                  onPress={() => handleKey(key)}
                >
                  <Text style={styles.keyText}>{key}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity
        ref={buttonRef}
        style={[styles.button, isButtonFocused && styles.buttonFocused]}
        onPress={handleStart}
        activeOpacity={0.8}
        focusable={true}
        onFocus={() => { setIsButtonFocused(true); setShowKeyboard(false); }}
        onBlur={() => setIsButtonFocused(false)}
        nextFocusUp={findNodeHandle(inputRef.current) ?? undefined}
      >
        <Text style={[styles.buttonText, isButtonFocused && { color: '#000' }]}>
          AVVIA STREAM
        </Text>
      </TouchableOpacity>

      {Platform.isTV && (
        <View style={styles.tipContainer}>
          <Text style={styles.tip}>Usa le frecce per navigare • OK per confermare</Text>
          <Text style={styles.tip}>Puoi anche usare i tasti numerici del telecomando</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    color: '#e8ff47',
    fontSize: 42,
    fontFamily: 'monospace',
    marginBottom: 50,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  label: {
    color: '#888',
    fontFamily: 'monospace',
    marginBottom: 15,
    fontSize: 14,
    textTransform: 'uppercase',
  },
  input: {
    width: '60%',
    maxWidth: 500,
    backgroundColor: '#111',
    borderWidth: 2,
    borderColor: '#222',
    borderRadius: 12,
    padding: 20,
    color: '#fff',
    fontSize: 28,
    textAlign: 'center',
    fontFamily: 'monospace',
    marginBottom: 16,
  },
  inputFocused: {
    borderColor: '#e8ff47',
    backgroundColor: '#1a1a1a',
    shadowColor: '#e8ff47',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  keyboard: {
    marginBottom: 20,
    alignItems: 'center',
  },
  keyRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  key: {
    width: 80,
    height: 60,
    backgroundColor: '#1e1e1e',
    borderWidth: 2,
    borderColor: '#333',
    borderRadius: 10,
    marginHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: {
    color: '#fff',
    fontSize: 22,
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
  button: {
    width: '60%',
    maxWidth: 500,
    backgroundColor: '#1e1e1e',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    marginTop: 8,
  },
  buttonFocused: {
    backgroundColor: '#e8ff47',
    transform: [{ scale: 1.05 }],
    borderColor: '#fff',
  },
  buttonText: {
    color: '#e8ff47',
    fontWeight: 'bold',
    fontSize: 18,
    letterSpacing: 1,
  },
  tipContainer: {
    marginTop: 40,
    alignItems: 'center',
  },
  tip: {
    color: '#444',
    fontSize: 12,
    fontFamily: 'monospace',
    marginTop: 5,
  },
});
