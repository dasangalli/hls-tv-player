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

const WATCHDOG_INTERVAL_MS = 2000;
const STALL_THRESHOLD_MS   = 8000;
const RELOAD_COOLDOWN_MS   = 15000;
const RETRY_DELAYS         = [5000, 10000, 20000, 30000];
const CONTROLS_HIDE_DELAY  = 3000;

export default function PlayerScreen() {
  useKeepAwake();

  const { id } = useLocalSearchParams<{ id: string }>();
  const playlistUrl = `${BASE_URL}/live/${id}/playlist.m3u8`;

  const [buffering, setBuffering]       = useState(true);
  const [error, setError]               = useState(false);
  const [retryCount, setRetryCount]     = useState(0);
  const [showControls, setShowControls] = useState(false);
  const [sourceKey, setSourceKey]       = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false); // ← stato fullscreen

  const lastTimeRef      = useRef<number>(0);
  const lastProgressRef  = useRef<number>(Date.now());
  const stallCountRef    = useRef<number>(0);
  const lastReloadRef    = useRef<number>(0);
  const bufferingRef     = useRef<boolean>(true);
  const errorRef         = useRef<boolean>(false);
  const sourceKeyRef     = useRef<number>(0);
  const retryCountRef    = useRef<number>(0);

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
  // Back button hardware — se in fullscreen, esce dal fullscreen invece di tornare alla home
  // -------------------------------------------------------------------------
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isFullscreen) {
        setIsFullscreen(false);
        return true;
      }
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
        lastTimeRef.current     = currentTime;
        lastProgressRef.current = now;
        stallCountRef.current   = 0;
        if (bufferingRef.current) {
          bufferingRef.current = false;
          setBuffering(false);
        }
        return;
      }

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
  // Tap — mostra controlli per CONTROLS_HIDE_DELAY ms, poi li nasconde
  // -------------------------------------------------------------------------
  function handleTap() {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setShowControls(false), CONTROLS_HIDE_DELAY);
  }

  // I controlli overlay sono visibili se showControls è true
  // In fullscreen, HUD e bottone fullscreen sono nascosti permanentemente
  // e riappaiono solo al tap
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
          allowsFullscreen={false}       // gestiamo noi il fullscreen
          allowsPictureInPicture={false}
          onFullscreenEnter={() => setIsFullscreen(true)}
          onFullscreenExit={() => setIsFullscreen(false)}
        />

        {/* BACK — nascosto in fullscreen, riappare al tap */}
        {controlsVisible && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              if (isFullscreen) {
                setIsFullscreen(false);
              } else {
                router.back();
              }
            }}
          >
            <Ionicons name="arrow-back" size={24} color="#e8ff47" />
            <Text style={styles.backText}>BACK</Text>
          </TouchableOpacity>
        )}

        {/* FULLSCREEN BUTTON — visibile solo quando NON si è in fullscreen, riappare al tap */}
        {controlsVisible && !isFullscreen && (
          <TouchableOpacity
            style={styles.fullscreenButton}
            onPress={() => setIsFullscreen(true)}
          >
            <Ionicons name="expand" size={24} color="#e8ff47" />
          </TouchableOpacity>
        )}

        {/* BUFFERING overlay */}
        {buffering && !error && (
          <View style={styles.overlay}>
            <ActivityIndicator color="#e8ff47" size="large" />
            <Text style={styles.overlayText}>buffering…</Text>
          </View>
        )}

        {/* ERROR overlay */}
        {error && (
          <View style={styles.overlay}>
            <Text style={styles.overlayTextError}>✕</Text>
            <Text style={styles.overlayText}>
              errore — retry {retryCount} in corso…
            </Text>
            <Text style={styles.overlayUrl}>{playlistUrl}</Text>
          </View>
        )}

        {/* HUD con ID canale — nascosto in fullscreen, riappare al tap */}
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
