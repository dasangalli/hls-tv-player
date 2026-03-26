import { router, useLocalSearchParams, Stack } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Dimensions,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useTVEventHandler,
} from 'react-native';

import * as ScreenOrientation from 'expo-screen-orientation';
import { useKeepAwake } from 'expo-keep-awake';
import { Ionicons } from '@expo/vector-icons';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const BASE_URL = 'http://129.153.47.200:8000';
const { width } = Dimensions.get('window');
const isTV = Platform.isTV || (width >= 1280 && !('ontouchstart' in global));

const WATCHDOG_INTERVAL_MS = 1000;
const STALL_THRESHOLD_MS   = 3000;
const RELOAD_COOLDOWN_MS   = 8000;

export default function PlayerScreen() {
  useKeepAwake(); // Impedisce alla TV di andare in standby
  const { id } = useLocalSearchParams<{ id: string }>();
  const playlistUrl = `${BASE_URL}/live/${id}/playlist.m3u8`;

  const [buffering, setBuffering] = useState(true);
  const [showControls, setShowControls] = useState(false);
  const [sourceKey, setSourceKey] = useState(0);

  const lastTimeRef = useRef<number>(0);
  const lastProgressRef = useRef<number>(Date.now());
  const stallCountRef = useRef<number>(0);
  const lastReloadRef = useRef<number>(0);
  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 1. Inizializzazione Player con User-Agent (per evitare buffering Nginx)
  const player = useVideoPlayer({ 
    uri: playlistUrl,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    }
  }, (p) => {
    p.play();
  });

  // 2. Gestione Telecomando
  useTVEventHandler((evt) => {
    if (!evt) return;
    
    // Mostra info se l'utente tocca un tasto qualsiasi
    if (['up', 'down', 'left', 'right', 'select'].includes(evt.eventType)) {
      triggerControls();
    }

    if (evt.eventType === 'playPause' || (evt.eventType === 'select' && !showControls)) {
      if (player.playing) player.pause();
      else player.play();
    }

    if (evt.eventType === 'back') {
      router.back();
    }
  });

  const triggerControls = () => {
    setShowControls(true);
    setTimeout(() => setShowControls(false), 3500);
  };

  // 3. Watchdog per recupero stalli (Cruciale per il tuo server)
  const recover = useCallback(() => {
    stallCountRef.current++;
    const count = stallCountRef.current;
    
    if (count <= 2) {
      try { player.seekBy(10); } catch (e) {} // Prova a saltare il "buco" nel buffer
      return;
    }

    const now = Date.now();
    if (now - lastReloadRef.current > RELOAD_COOLDOWN_MS) {
      lastReloadRef.current = now;
      setSourceKey(k => k + 1); // Forza il ricaricamento totale
      stallCountRef.current = 0;
    }
  }, [player]);

  useEffect(() => {
    watchdogRef.current = setInterval(() => {
      if (!player || !player.playing) return;

      if (player.currentTime !== lastTimeRef.current) {
        lastTimeRef.current = player.currentTime;
        lastProgressRef.current = Date.now();
        if (buffering) setBuffering(false);
      } else {
        const elapsed = Date.now() - lastProgressRef.current;
        if (elapsed > STALL_THRESHOLD_MS) {
          setBuffering(true);
          recover();
        }
      }
    }, WATCHDOG_INTERVAL_MS);

    return () => {
      if (watchdogRef.current) clearInterval(watchdogRef.current);
    };
  }, [player, recover, buffering]);

  // Ricarica quando il watchdog lo richiede
  useEffect(() => {
    player.replace({ 
      uri: playlistUrl,
      headers: { 'User-Agent': 'Mozilla/5.0 Chrome/122.0.0.0' }
    });
    player.play();
  }, [sourceKey]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      
      <VideoView
        player={player}
        style={styles.video}
        contentFit="contain"
        nativeControls={false}
      />

      {/* Tasto Back (Focalizzabile per telecomando) */}
      {(showControls || isTV) && (
        <TouchableOpacity 
          focusable={true}
          style={styles.backButton} 
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#e8ff47" />
          <Text style={styles.backText}>TORNA ALLA LISTA</Text>
        </TouchableOpacity>
      )}

      {buffering && (
        <View style={styles.overlay}>
          <ActivityIndicator color="#e8ff47" size="large" />
          <Text style={styles.overlayText}>BUFFERING...</Text>
        </View>
      )}

      {showControls && (
        <View style={styles.hud}>
          <Text style={styles.hudText}>CANALE: {id}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  video: { ...StyleSheet.absoluteFillObject },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayText: { color: '#e8ff47', marginTop: 15, fontFamily: 'monospace', fontSize: 12 },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 50,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e8ff47',
  },
  backText: { color: '#e8ff47', marginLeft: 10, fontWeight: 'bold' },
  hud: {
    position: 'absolute',
    bottom: 50,
    left: 50,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 15,
    borderRadius: 5,
  },
  hudText: { color: '#fff', fontFamily: 'monospace' }
});
