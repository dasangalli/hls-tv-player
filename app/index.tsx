import React, { useState } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  Platform,
  useTVEventHandler 
} from 'react-native';
import { useRouter } from 'expo-router';

export default function HomeScreen() {
  const [id, setId] = useState('');
  const router = useRouter();

  // Gestore per i tasti fisici del telecomando (0-9 e Back)
  useTVEventHandler((evt) => {
    if (!evt) return;
    
    // Se l'utente preme i tasti numerici fisici sul telecomando
    if (['0','1','2','3','4','5','6','7','8','9'].includes(evt.eventType)) {
      setId((prev) => prev + evt.eventType);
    }
    
    // Se preme il tasto "Cancella" o simile (opzionale)
    if (evt.eventType === 'longSelect') {
      setId('');
    }
  });

  const handleStart = () => {
    if (id.trim()) {
      router.push({ pathname: '/player', params: { id: id.trim() } });
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>HLS TV PLAYER</Text>
      
      <Text style={styles.label}>INSERISCI ID STREAM:</Text>
      
      <TextInput
        style={styles.input}
        value={id}
        onChangeText={setId}
        placeholder="Es: 2"
        placeholderTextColor="#444"
        keyboardType="numeric" // Apre il tastierino numerico su TV
        
        // --- PROPRIETÀ TV ---
        focusable={true} 
        hasTVPreferredFocus={true} // Il cursore parte da qui
        nextFocusDown={1} // ID del prossimo elemento (il tasto avvia)
      />

      <TouchableOpacity 
        style={styles.button}
        onPress={handleStart}
        activeOpacity={0.7}
        
        // --- PROPRIETÀ TV ---
        focusable={true}
        nativeID="1" // Collegato al nextFocusDown del TextInput
      >
        <Text style={styles.buttonText}>AVVIA STREAM</Text>
      </TouchableOpacity>

      {Platform.isTV && (
        <Text style={styles.tip}>Usa le frecce per navigare, OK per confermare</Text>
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
    fontSize: 32,
    fontFamily: 'monospace',
    marginBottom: 40,
    fontWeight: 'bold',
  },
  label: {
    color: '#c8c8c8',
    fontFamily: 'monospace',
    marginBottom: 10,
    fontSize: 14,
  },
  input: {
    width: '80%',
    maxWidth: 400,
    backgroundColor: '#111',
    borderWidth: 2,
    borderColor: '#1e1e1e',
    borderRadius: 8,
    padding: 15,
    color: '#fff',
    fontSize: 24,
    textAlign: 'center',
    fontFamily: 'monospace',
    marginBottom: 20,
    // Effetto focus per Android TV (gestito dal sistema o personalizzabile)
  },
  button: {
    width: '80%',
    maxWidth: 400,
    backgroundColor: '#e8ff47',
    padding: 18,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 16,
    letterSpacing: 1,
  },
  tip: {
    color: '#444',
    fontSize: 12,
    marginTop: 30,
    fontFamily: 'monospace',
  }
});
