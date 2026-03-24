import React from 'react';
import { StyleSheet, View, StatusBar, TouchableOpacity, Text } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons'; // Icone standard di Expo

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // URL del tuo server che contiene già il player HLS.js
  const serverUrl = `http://129.153.47.200:8000/?stream=${id}`;

  return (
    <View style={styles.container}>
      {/* Nasconde la barra di stato per un'esperienza full screen */}
      <StatusBar hidden />
      
      {/* Rimuove l'header predefinito di expo-router */}
      <Stack.Screen options={{ headerShown: false }} />

      <WebView
        source={{ uri: serverUrl }}
        style={styles.webview}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        mixedContentMode="always"
        allowsFullscreenVideo={true}
        // User Agent per evitare blocchi lato server
        userAgent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      />

      {/* BOTTONE TORNA INDIETRO */}
      <TouchableOpacity 
        style={styles.backButton} 
        onPress={() => router.back()}
        activeOpacity={0.7}
      >
        <Ionicons name="arrow-back" size={24} color="#e8ff47" />
        <Text style={styles.backText}>INDIETRO</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  webview: {
    flex: 1,
    backgroundColor: '#000',
  },
  backButton: {
    position: 'absolute',
    top: 40, // Spostato un po' più giù per evitare angoli curvi dei telefoni
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)', // Sfondo scuro semi-trasparente
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(232, 255, 71, 0.3)', // Bordo sottile color accent
  },
  backText: {
    color: '#e8ff47',
    marginLeft: 8,
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
