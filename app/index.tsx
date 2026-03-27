import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Platform,
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
  const router = useRouter();
  const rootRef = useRef<View>(null);

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
      <Text style={styles.label}>INSERISCI ID STREAM</Text>

      <View style={styles.display}>
        <Text style={styles.displayText}>{id || '—'}</Text>
      </View>

      <View style={styles.keyboard}>
        {KEYS.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.keyRow}>
            {row.map((key) => (
              <Pressable
                key={key}
                focusable={true}
                hasTVPreferredFocus={rowIndex === 0 && key === '1'}
                onPress={() => handleKey(key)}
                style={({ focused }) => [
                  styles.key,
                  key === '✓' && styles.keyConfirm,
                  key === '⌫' && styles.keyDelete,
                  focused && styles.keyFocused,
                ]}
              >
                {({ focused }) => (
                  <Text style={[styles.keyText, focused && styles.keyTextFocused]}>
                    {key}
                  </Text>
                )}
              </Pressable>
            ))}
          </View>
        ))}
      </View>

      <Pressable
        focusable={true}
        onPress={handleStart}
        style={({ focused }) => [
          styles.button,
          focused && styles.buttonFocused,
        ]}
      >
        {({ focused }) => (
          <Text style={[styles.buttonText, focused && styles.buttonTextFocused]}>
            AVVIA STREAM
          </Text>
        )}
      </Pressable>

      {Platform.isTV && (
        <View style={styles.tipContainer}>
          <Text style={styles.tip}>Usa le frecce per navigare • OK per confermare</Text>
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
    fontWeight: 'bold',
    letterSpacing: 2,
    marginBottom: 30,
  },
  label: {
    color: '#888',
    fontFamily: 'monospace',
    fontSize: 14,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  display: {
    width: 260,
    backgroundColor: '#111',
    borderWidth: 2,
    borderColor: '#333',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  displayText: {
    color: '#fff',
    fontSize: 32,
    fontFamily: 'monospace',
    fontWeight: 'bold',
    letterSpacing: 4,
  },
  keyboard: {
    marginBottom: 24,
  },
  keyRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  key: {
    width: 80,
    height: 64,
    backgroundColor: '#1e1e1e',
    borderWidth: 2,
    borderColor: '#333',
    borderRadius: 10,
    marginHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyFocused: {
    backgroundColor: '#e8ff47',
    borderColor: '#ffffff',
    transform: [{ scale: 1.15 }],
    elevation: 12,
  },
  keyConfirm: {
    backgroundColor: '#1a3a1a',
    borderColor: '#2a5a2a',
  },
  keyDelete: {
    backgroundColor: '#3a1a1a',
    borderColor: '#5a2a2a',
  },
  keyText: {
    color: '#fff',
    fontSize: 24,
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
  keyTextFocused: {
    color: '#000',
  },
  button: {
    width: 260,
    backgroundColor: '#1e1e1e',
    paddingVertical: 20,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  buttonFocused: {
    backgroundColor: '#e8ff47',
    borderColor: '#fff',
    transform: [{ scale: 1.05 }],
  },
  buttonText: {
    color: '#e8ff47',
    fontWeight: 'bold',
    fontSize: 18,
    letterSpacing: 1,
  },
  buttonTextFocused: {
    color: '#000',
  },
  tipContainer: {
    marginTop: 30,
  },
  tip: {
    color: '#444',
    fontSize: 12,
    fontFamily: 'monospace',
    textAlign: 'center',
  },
});
