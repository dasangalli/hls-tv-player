import { router, useLocalSearchParams, Stack } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
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
  AppState,
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

// Soglie watchdog — più conservative per meno stalli percepiti
const WATCHDOG_INTERVAL_MS = 2000;
const STALL_THRESHOLD_MS   = 10000;  // era 8000 — più pazienza prima di intervenire
const RELOAD_COOLDOWN_MS   = 20000;  // era 15000 — più tempo tra un reload e l'altro

const RETRY_DELAYS        = [5000, 10000, 20000, 30000];
const CONTROLS_HIDE_DELAY = 3000;

// Soglie visibility — stesso approccio di index.html
const VISIBILITY_SOFT_THRESHOLD = 30_000;   // < 30s: non fare nulla
const VISIBILITY_REINIT_THRESHOLD = 180_000; // > 3min: reinit completo

export default function PlayerScreen() {
  useKeepAwake();

  const { id } = useLocalSearchParams<{ id: string }>();
  const playlistUrl = `${BASE_URL}/live/${id}/playlist.m3u8`;

  const [buffering, setBuffering]       = useState(true);
  const [error, setError]               = useState(false);
  const [retryCount, setRetryCount]     = useState(0);
  const [showControls, setShowControls] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sourceKey, setSourceKey]       = useState(0);

  // Refs watchdog — zero dipendenze da state
  const lastTimeRef      = useRef<number>(0);
  const lastProgressRef  = useRef<number>(Date.now());
  const stallCountRef    = useRef<number>(0);
  const lastReloadRef    = useRef<number>(0);
  const bufferingRef     = useRef<boolean>(true);
  const errorRef         = useRef<boolean>(false);
  const sourceKeyRef     = useRef<number>(0);
  const retryCountRef    = useRef<number>(0);
  const hiddenAtRef      = useRef<number>(0);  // timestamp quando app va in background

  const watchdogRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryRef         = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -------------------------------------------------------------------------
  // Orientamento
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isTV) ScreenOrientation.unlockAsync();
    return () => {
      if (!isTV) ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, []);

  // -------------------------------------------------------------------------
  // Back button hardware
  // -------------------------------------------------------------------------
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isFullscreen) { setIsFullscreen(false); return true; }
      router.back();
      return true;
    });
    return () => sub.remove();
  }, [isFullscreen]);

  // -------------------------------------------------------------------------
  // Player
  // -------------------------------------------------------------------------
  const player = useVideoPlayer({ uri: playlistUrl }, (p) => {
    p.play();
  });

  useEffect(() => {
    const statusSub = player.addListener('statusChange', (status) => {
      if (status.status === 'readyToPlay') {
        bufferingRef.current = false;
        errorRef.current     = false;
        setBuffering(false);
        setError(false);
        lastProgressRef.current = Date.now();
      }
      if (status.status === 'loading') {
        bufferingRef.current = true;
        setBuffering(true);
      }
      if (status.status === 'error') {
        errorRef.current = true;
        setError(true);
        bufferingRef.current = false;
        setBuffering(false);
        scheduleRetry();
      }
    });

    const playingSub = player.addListener('playingChange', (isPlaying) => {
      if (isPlaying) {
        lastProgressRef.current = Date.now();
      }
    });

    return () => {
      statusSub.remove();
      playingSub.remove();
    };
  }, [player]);

  // -------------------------------------------------------------------------
  // AppState — visibilità app (equivalente di visibilitychange per mobile)
  //
  // Stessa logica di index.html:
  // - Background < 30s   → non fare nulla (buffer ancora valido)
  // - Background 30s-3min → resume soft (player.play senza reload)
  // - Background > 3min   → reinit completo (sourceKey++)
  // -------------------------------------------------------------------------
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        hiddenAtRef.current = Date.now();
        return;
      }

      if (nextState === 'active') {
        const awayMs = Date.now() - hiddenAtRef.current;

        if (awayMs < VISIBILITY_SOFT_THRESHOLD) {
          // < 30s — il buffer è ancora valido, al massimo riprendi
          if (!player.playing) player.play();
          return;
        }

        if (awayMs < VISIBILITY_REINIT_THRESHOLD) {
          // 30s - 3min — resume soft
          player.play();
          lastTimeRef.current     = player.currentTime;
          lastProgressRef.current = Date.now();
          return;
        }

        // > 3min — reinit completo
        errorRef.current     = false;
        bufferingRef.current = true;
        setError(false);
        setBuffering(true);
        lastProgressRef.current = Date.now();
        lastTimeRef.current     = 0;
        sourceKeyRef.current   += 1;
        setSourceKey(sourceKeyRef.current);
      }
    });

    return () => sub.remove();
  }, [player]);

  // -------------------------------------------------------------------------
  // Retry con backoff
  // -------------------------------------------------------------------------
  const scheduleRetry = () => {
    if (retryRef.current) clearTimeout(retryRef.current);
    const count = retryCountRef.current;
    const delay = RETRY_DELAYS[Math.min(count, RETRY_DELAYS.length - 1)];
    retryCountRef.current += 1;
    setRetryCount(retryCountRef.current);

    retryRef.current = setTimeout(() => {
      errorRef.current     = false;
      bufferingRef.current = true;
      setError(false);
      setBuffering(true);
      lastProgressRef.current = Date.now();
      lastTimeRef.current     = 0;
      sourceKeyRef.current   += 1;
      setSourceKey(sourceKeyRef.current);
    }, delay);
  };

  // -------------------------------------------------------------------------
  // Reload al cambio sourceKey
  // -------------------------------------------------------------------------
  useEffect(() => {
    player.replace({ uri: playlistUrl });
    player.play();
    lastProgressRef.current = Date.now();
    lastTimeRef.current     = 0;
  }, [sourceKey]);

  // -------------------------------------------------------------------------
  // Watchdog — dipendenze vuote, creato una volta sola
  // -------------------------------------------------------------------------
  useEffect(() => {
    watchdogRef.current = setInterval(() => {
      if (!player || errorRef.current) return;
      if (!player.playing) return;

      const currentTime = player.currentTime;
      const now         = Date.now();

      if (currentTime !== lastTimeRef.current) {
        // Il video avanza — reset completo
        lastTimeRef.current     = currentTime;
        lastProgressRef.current = now;
        stallCountRef.current   = 0;
        if (bufferingRef.current) {
          bufferingRef.current = false;
          setBuffering(false);
        }
        return;
      }

      // Il video non avanza
      const elapsed = now - lastProgressRef.current;
      if (elapsed > STALL_THRESHOLD_MS) {
        if (!bufferingRef.current) {
          bufferingRef.current = true;
          setBuffering(true);
        }

        if (now - lastReloadRef.current < RELOAD_COOLDOWN_MS) return;

        stallCountRef.current++;
        lastReloadRef.current   = now;
        lastProgressRef.current = now;

        console.warn('[Watchdog] STALL', stallCountRef.current, '— reload');

        errorRef.current     = false;
        bufferingRef.current = true;
        setBuffering(true);
        sourceKeyRef.current += 1;
        setSourceKey(sourceKeyRef.current);
        stallCountRef.current = 0;
      }

    }, WATCHDOG_INTERVAL_MS);

    return () => {
      if (watchdogRef.current)      clearInterval(watchdogRef.current);
      if (retryRef.current)         clearTimeout(retryRef.current);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, []);

  // -------------------------------------------------------------------------
  // Controlli
  // -------------------------------------------------------------------------
  function handleTap() {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setShowControls(false), CONTROLS_HIDE_DELAY);
  }

  const controlsVisible = showControls;

  return (
    <TouchableWithoutFeedback onPress={handleTap}>
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />

        <VideoView
          player={player}
          style={styles.video}
          contentFit={isFullscreen ? 'cover' : 'contain'}
          nativeControls={false}
          allowsFullscreen={false}
          allowsPictureInPicture={false}
        />

        {controlsVisible && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              if (isFullscreen) { setIsFullscreen(false); }
              else { router.back(); }
            }}
          >
            <Ionicons name="arrow-back" size={24} color="#e8ff47" />
            <Text style={styles.backText}>BACK</Text>
          </TouchableOpacity>
        )}

        {controlsVisible && !isFullscreen && (
          <TouchableOpacity
            style={styles.fullscreenButton}
            onPress={() => setIsFullscreen(true)}
          >
            <Ionicons name="expand" size={24} color="#e8ff47" />
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

        {controlsVisible && !isFullscreen && (
          <View style={styles.hud}>
            <Text style={styles.hudText}>{id}</Text>
          </View>
        )}
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
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 10,
    borderRadius: 20,
    zIndex: 10,
  },
  backText: { color: '#e8ff47', marginLeft: 8, fontWeight: 'bold', fontSize: 12 },
  fullscreenButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 10,
    borderRadius: 20,
    zIndex: 10,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  overlayText:      { color: '#444', fontFamily: 'monospace', fontSize: 13 },
  overlayTextError: { color: '#ff3b3b', fontSize: 32 },
  overlayUrl:       { color: '#2a2a2a', fontFamily: 'monospace', fontSize: 10, marginTop: 8 },
  hud:              { position: 'absolute', bottom: 16, left: 20, opacity: 0.4 },
  hudText:          { color: '#c8c8c8', fontFamily: 'monospace', fontSize: 11 },
});
