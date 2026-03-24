/**
 * app/player.tsx
 * Player HLS fullscreen — TV e mobile Android
 * Usa expo-video (libreria ufficiale Expo) invece di react-native-video
 *
 * expo-video usa ExoPlayer su Android e AVPlayer su iOS nativamente,
 * senza problemi di compatibilità con compileSdk.
 */

import { router, useLocalSearchParams } from 'expo-router';
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
  View,
} from 'react-native';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = 'http://129.153.47.200:8000';

const { width } = Dimensions.get('window');
const isTV = Platform.isTV || (width >= 1280 && !('ontouchstart' in global));

// Watchdog
const WATCHDOG_INTERVAL_MS = 1000;
const STALL_THRESHOLD_MS   = 3000;
const RELOAD_COOLDOWN_MS   = 8000;

// Retry con backoff
const RETRY_DELAYS = [5000, 10000, 20000, 30000];

// Controlli mobile
const CONTROLS_HIDE_DELAY = 3000;

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export default function PlayerScreen() {
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
  // expo-video player
  // -------------------------------------------------------------------------
  const player = useVideoPlayer(
    { uri: playlistUrl },
    (p) => {
      p.play();
    }
  );

  // -------------------------------------------------------------------------
  // Tasto Back
  // -------------------------------------------------------------------------
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      router.back();
      return true;
    });
    return () => sub.remove();
  }, []);

  // -------------------------------------------------------------------------
  // Ascolta eventi del player
  // -------------------------------------------------------------------------
  useEffect(() => {
    const statusSub = player.addListener('statusChange', (status) => {
      console.log('[Player] Status:', status.status);

      if (status.status === 'readyToPlay') {
        setBuffering(false);
        setError(false);
        retryCountRef.current   = 0;
        setRetryCount(0);
        stallCountRef.current   = 0;
        recoveringRef.current   = false;
        lastProgressRef.current = Date.now();
      }

      if (status.status === 'loading') {
        setBuffering(true);
      }

      if (status.status === 'error') {
        console.error('[Player] Errore:', status.error);
        setError(true);
        setBuffering(false);
        scheduleRetry();
      }
    });

    const playingSub = player.addListener('playingChange', (isPlaying) => {
      if (isPlaying) {
        setBuffering(false);
        recoveringRef.current   = false;
        stallCountRef.current   = 0;
        lastProgressRef.current = Date.now();
      }
    });

    return () => {
      statusSub.remove();
      playingSub.remove();
    };
  }, [player]);

  // -------------------------------------------------------------------------
  // Retry con backoff
  // -------------------------------------------------------------------------
  const scheduleRetry = useCallback(() => {
    if (retryRef.current) clearTimeout(retryRef.current);

    const count = retryCountRef.current;
    const delay = RETRY_DELAYS[Math.min(count, RETRY_DELAYS.length - 1)];
    retryCountRef.current += 1;
    setRetryCount(retryCountRef.current);

    console.warn(`[Player] Retry ${count + 1} tra ${delay / 1000}s`);

    retryRef.current = setTimeout(() => {
      setSourceKey(k => k + 1);
      setError(false);
      setBuffering(true);
      stallCountRef.current   = 0;
      recoveringRef.current   = false;
      lastProgressRef.current = Date.now();
    }, delay);
  }, []);

  // -------------------------------------------------------------------------
  // Reload player (quando sourceKey cambia)
  // -------------------------------------------------------------------------
  useEffect(() => {
    player.replace({ uri: playlistUrl });
    player.play();
  }, [sourceKey]);

  // -------------------------------------------------------------------------
  // Recover scalato
  // -------------------------------------------------------------------------
  const recover = useCallback(() => {
    if (recoveringRef.current || error) return;
    recoveringRef.current = true;

    stallCountRef.current++;
    const count = stallCountRef.current;
    console.warn(`[Watchdog] STALL ${count}`);

    // Interventi 1-2: seek al live edge
    if (count <= 2) {
      console.warn('[Watchdog] Seek live edge');
      try {
        player.seekBy(999999);
      } catch (e) {
        console.warn('[Watchdog] Seek fallito, retry source');
      }
      setTimeout(() => { recoveringRef.current = false; }, 2000);
      return;
    }

    // Intervento 3+: reload source
    console.warn('[Watchdog] Reload source');
    const now = Date.now();
    if (now - lastReloadRef.current > RELOAD_COOLDOWN_MS) {
      lastReloadRef.current = now;
      setSourceKey(k => k + 1);
      stallCountRef.current   = 0;
      lastProgressRef.current = now;
    }
    recoveringRef.current = false;
  }, [player, error]);

  // -------------------------------------------------------------------------
  // Watchdog basato su currentTime del player
  // -------------------------------------------------------------------------
  useEffect(() => {
    watchdogRef.current = setInterval(() => {
      if (error || !player) return;

      const currentTime = player.currentTime;

      if (currentTime !== lastTimeRef.current) {
        lastTimeRef.current     = currentTime;
        lastProgressRef.current = Date.now();
        stallCountRef.current   = 0;
        recoveringRef.current   = false;
        if (buffering) setBuffering(false);
        return;
      }

      const elapsed = Date.now() - lastProgressRef.current;
      if (elapsed > STALL_THRESHOLD_MS && player.playing) {
        recover();
      }
    }, WATCHDOG_INTERVAL_MS);

    return () => {
      if (watchdogRef.current)      clearInterval(watchdogRef.current);
      if (retryRef.current)         clearTimeout(retryRef.current);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, [recover, error, buffering, player]);

  // -------------------------------------------------------------------------
  // Controlli mobile
  // -------------------------------------------------------------------------
  function handleTap() {
    if (isTV) return;
    setShowControls(v => !v);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => {
      setShowControls(false);
    }, CONTROLS_HIDE_DELAY);
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <TouchableWithoutFeedback onPress={handleTap}>
      <View style={styles.container}>

        <VideoView
          player={player}
          style={styles.video}
          contentFit="contain"
          nativeControls={!isTV && showControls}
          allowsFullscreen={false}
          allowsPictureInPicture={false}
        />

        {/* Overlay buffering */}
        {buffering && !error && (
          <View style={styles.overlay}>
            <ActivityIndicator color="#e8ff47" size="large" />
            <Text style={styles.overlayText}>buffering…</Text>
          </View>
        )}

        {/* Overlay errore */}
        {error && (
          <View style={styles.overlay}>
            <Text style={styles.overlayTextError}>✕</Text>
            <Text style={styles.overlayText}>
              errore — retry {retryCount} in corso…
            </Text>
            <Text style={styles.overlayUrl}>{playlistUrl}</Text>
          </View>
        )}

        {/* HUD info */}
        <View style={styles.hud}>
          <Text style={styles.hudText}>{id}</Text>
        </View>

      </View>
    </TouchableWithoutFeedback>
  );
}

// ---------------------------------------------------------------------------
// Stili
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  video: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  overlayText: {
    color: '#444',
    fontFamily: 'monospace',
    fontSize: 13,
    letterSpacing: 1,
    textAlign: 'center',
  },
  overlayTextError: {
    color: '#ff3b3b',
    fontSize: 32,
  },
  overlayUrl: {
    color: '#2a2a2a',
    fontFamily: 'monospace',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 8,
  },
  hud: {
    position: 'absolute',
    bottom: 16,
    left: 20,
    opacity: 0.4,
  },
  hudText: {
    color: '#c8c8c8',
    fontFamily: 'monospace',
    fontSize: 11,
    letterSpacing: 1,
  },
});
