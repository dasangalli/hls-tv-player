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
  TouchableWithoutFeedback,
  TouchableOpacity,
  View,
} from 'react-native';

// Nuovi import
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
const RETRY_DELAYS = [5000, 10000, 20000, 30000];
const CONTROLS_HIDE_DELAY = 3000;

export default function PlayerScreen() {
  // Impedisce allo schermo di spegnersi durante la visione
  useKeepAwake();

  const { id } = useLocalSearchParams<{ id: string }>();
  const playlistUrl = `${BASE_URL}/live/${id}/playlist.m3u8`;

  const [buffering, setBuffering]       = useState(true);
  const [error, setError]               = useState(false);
  const [retryCount, setRetryCount]     = useState(0);
  const [showControls, setShowControls] = useState(false);
  const [sourceKey, setSourceKey]       = useState(0);

  const lastTimeRef      = useRef<number>(0);
  const lastProgressRef  = useRef<number>(Date.now());
  const stallCountRef    = useRef<number>(0);
  const recoveringRef    = useRef<boolean>(false);
  const lastReloadRef    = useRef<number>(0);
  const retryCountRef    = useRef<number>(0);
  const watchdogRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryRef         = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -------------------------------------------------------------------------
  // Rotazione Automatica
  // -------------------------------------------------------------------------
  useEffect(() => {
    async function enableRotation() {
      if (!isTV) {
        // Sblocca tutte le rotazioni quando entri nel player
        await ScreenOrientation.unlockAsync();
      }
    }
    enableRotation();

    return () => {
      // Torna in verticale quando esci dal player (opzionale)
      if (!isTV) {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      }
    };
  }, []);

  // -------------------------------------------------------------------------
  // expo-video player
  // -------------------------------------------------------------------------
  const player = useVideoPlayer({ uri: playlistUrl }, (p) => {
    p.play();
  });

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      router.back();
      return true;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const statusSub = player.addListener('statusChange', (status) => {
      if (status.status === 'readyToPlay') {
        setBuffering(false);
        setError(false);
        retryCountRef.current = 0;
        setRetryCount(0);
        stallCountRef.current = 0;
        recoveringRef.current = false;
        lastProgressRef.current = Date.now();
      }
      if (status.status === 'loading') setBuffering(true);
      if (status.status === 'error') {
        setError(true);
        setBuffering(false);
        scheduleRetry();
      }
    });

    const playingSub = player.addListener('playingChange', (isPlaying) => {
      if (isPlaying) {
        setBuffering(false);
        recoveringRef.current = false;
        stallCountRef.current = 0;
        lastProgressRef.current = Date.now();
      }
    });

    return () => {
      statusSub.remove();
      playingSub.remove();
    };
  }, [player]);

  const scheduleRetry = useCallback(() => {
    if (retryRef.current) clearTimeout(retryRef.current);
    const count = retryCountRef.current;
    const delay = RETRY_DELAYS[Math.min(count, RETRY_DELAYS.length - 1)];
    retryCountRef.current += 1;
    setRetryCount(retryCountRef.current);

    retryRef.current = setTimeout(() => {
      setSourceKey(k => k + 1);
      setError(false);
      setBuffering(true);
      lastProgressRef.current = Date.now();
    }, delay);
  }, []);

  useEffect(() => {
    player.replace({ uri: playlistUrl });
    player.play();
  }, [sourceKey]);

  const recover = useCallback(() => {
    if (recoveringRef.current || error) return;
    recoveringRef.current = true;
    stallCountRef.current++;
    const count = stallCountRef.current;

    if (count <= 2) {
      try { player.seekBy(999999); } catch (e) {}
      setTimeout(() => { recoveringRef.current = false; }, 2000);
      return;
    }

    const now = Date.now();
    if (now - lastReloadRef.current > RELOAD_COOLDOWN_MS) {
      lastReloadRef.current = now;
      setSourceKey(k => k + 1);
      stallCountRef.current = 0;
      lastProgressRef.current = now;
    }
    recoveringRef.current = false;
  }, [player, error]);

  useEffect(() => {
    watchdogRef.current = setInterval(() => {
      if (error || !player) return;
      const currentTime = player.currentTime;
      if (currentTime !== lastTimeRef.current) {
        lastTimeRef.current = currentTime;
        lastProgressRef.current = Date.now();
        stallCountRef.current = 0;
        recoveringRef.current = false;
        if (buffering) setBuffering(false);
        return;
      }
      const elapsed = Date.now() - lastProgressRef.current;
      if (elapsed > STALL_THRESHOLD_MS && player.playing) {
        recover();
      }
    }, WATCHDOG_INTERVAL_MS);

    return () => {
      if (watchdogRef.current) clearInterval(watchdogRef.current);
      if (retryRef.current) clearTimeout(retryRef.current);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, [recover, error, buffering, player]);

  function handleTap() {
    setShowControls(v => !v);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => {
      setShowControls(false);
    }, CONTROLS_HIDE_DELAY);
  }

  return (
    <TouchableWithoutFeedback onPress={handleTap}>
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        
        <VideoView
          player={player}
          style={styles.video}
          contentFit="contain"
          nativeControls={!isTV && showControls}
          allowsFullscreen={false}
          allowsPictureInPicture={false}
        />

        {/* BOTTONE INDIETRO - Visibile se TV o se i controlli sono attivi su mobile */}
        {(showControls || isTV) && (
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#e8ff47" />
            <Text style={styles.backText}>BACK</Text>
          </TouchableOpacity>
        )}

        {buffering && !error && (
          <View style={styles.overlay}>
            <ActivityIndicator color="#e8ff47" size="large" />
            <Text style={styles.overlayText}>buffering…</Text>
          </View>
        )}

        {error && (
          <View style={styles.overlay}>
            <Text style={styles.overlayTextError}>✕</Text>
            <Text style={styles.overlayText}>
              errore — retry {retryCount} in corso…
            </Text>
            <Text style={styles.overlayUrl}>{playlistUrl}</Text>
          </View>
        )}

        <View style={styles.hud}>
          <Text style={styles.hudText}>{id}</Text>
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  video: { ...StyleSheet.absoluteFillObject },
  backButton: {
    position: 'absolute',
    top: 40,
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 10,
    borderRadius: 20,
    zIndex: 10,
  },
  backText: { color: '#e8ff47', marginLeft: 8, fontWeight: 'bold', fontSize: 12 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  overlayText: { color: '#444', fontFamily: 'monospace', fontSize: 13 },
  overlayTextError: { color: '#ff3b3b', fontSize: 32 },
  overlayUrl: { color: '#2a2a2a', fontFamily: 'monospace', fontSize: 10, marginTop: 8 },
  hud: { position: 'absolute', bottom: 16, left: 20, opacity: 0.4 },
  hudText: { color: '#c8c8c8', fontFamily: 'monospace', fontSize: 11 },
});
