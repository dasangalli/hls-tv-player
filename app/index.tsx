import React, { useState, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';

export default function HomeScreen() {
  const [id, setId] = useState('');
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);

  // Scatta ogni volta che questa schermata diventa attiva
  // (sia al primo mount che quando si torna dalla schermata player)
  useFocusEffect(
    useCallback(() => {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100); // piccolo delay per dare tempo al layout di montarsi
      return () => clearTimeout(timer);
    }, [])
  );

  const handleStart = () => {
    if (id.trim()) {
      router.push({ pathname: '/player', params: { id: id.trim() } });
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>HLS TV PLAYER</Text>
      <Text style={styles.label}>INSERISCI ID STREAM</Text>

      <TextInput
        ref={inputRef}
        style={styles.input}
        value={id}
        onChangeText={setId}
        placeholder="Es: 2"
        placeholderTextColor="#444"
        keyboardType="numeric"
        returnKeyType="done"
        onSubmitEditing={handleStart}
        showSoftInputOnFocus={true}
        blurOnSubmit={false}
        focusable={true}
        hasTVPreferredFocus={true}
      />

      <TouchableOpacity
        style={styles.button}
        onPress={handleStart}
        focusable={true}
      >
        <Text style={styles.buttonText}>AVVIA STREAM</Text>
      </TouchableOpacity>

      {Platform.isTV && (
        <Text style={styles.tip}>
          Inserisci ID • premi AVVIA o Invio
        </Text>
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
    marginBottom: 40,
  },
  label: {
    color: '#888',
    fontFamily: 'monospace',
    fontSize: 14,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  input: {
    width: '50%',
    maxWidth: 400,
    backgroundColor: '#111',
    borderWidth: 3,
    borderColor: '#e8ff47',
    borderRadius: 12,
    padding: 20,
    color: '#fff',
    fontSize: 32,
    textAlign: 'center',
    fontFamily: 'monospace',
    marginBottom: 30,
  },
  button: {
    width: '50%',
    maxWidth: 400,
    backgroundColor: '#e8ff47',
    paddingVertical: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 18,
    letterSpacing: 1,
  },
  tip: {
    color: '#444',
    fontSize: 12,
    fontFamily: 'monospace',
    marginTop: 30,
    textAlign: 'center',
  },
});
