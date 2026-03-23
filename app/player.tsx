/**
 * app/player.tsx
 * Player HLS fullscreen — TV e mobile Android
 *
 * Fix rispetto alla versione precedente:
 * - seek usa livello alto ma non MAX_SAFE_INTEGER (causa errori su alcuni player)
 * - bufferConfig solo su Android (ignorato su iOS in alcune versioni)
 * - retry con backoff esponenziale invece di loop fisso a 5s
 * - errore mostrato con contatore retry visibile
 */

import { router, useLocalSearchParams } from 'expo-router';
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
import Video, {
  OnBandwidthUpdateData,
  OnBufferData,
  OnErrorData,
  OnLoadData,
  OnProgressData,
  VideoRef,
} from 'react-native-video';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = 'http://129.153.47.200:8000';

const { width } = Dimensions.get('window');
const isTV = Platform.isTV || (width >= 1280 && !('ontouchstart' in global));

// ExoPlayer buffer config — solo Android
const BUFFER_CONFIG = Platform.OS === 'android' ? {
  minBufferMs:                    15000,
  maxBufferMs:                    60000,
  bufferForPlaybackMs:            2500,
  bufferForPlaybackAfterRebuffer: 5000,
} : undefined;

// Watchdog
const WATCHDOG_INTERVAL_MS = 500;
const STALL_THRESHOLD_MS   = 2000;
const RELOAD_COOLDOWN_MS   = 8000;

// Retry errore con backoff: 5s, 10s, 20s, 30s, 30s...
const RETRY_DELAYS = [5000, 10000, 20000, 30000];

// Controlli mobile
const CONTROLS_HIDE_DELAY = 3000;

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const playlistUrl = `${BASE_URL}/live/${id}/playlist.m3u8`;

  const videoRef          = useRef<VideoRef>(null);
  const lastTimeRef       = useRef<number>(0);
  const lastProgressRef   = useRef<number>(Date.now());
  const stallCountRef     = useRef<number>(0);
  const recoveringRef     = useRef<boolean>(false);
  const lastReloadRef     = useRef<number>(0);
  const watchdogRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryRef          = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef     = useRef<number>(0);
  const sourceKeyRef      = useRef<number>(0);

  const [sourceKey, setSourceKey]       = useState(0);
  const [buffering, setBuffering]       = useState(true);
  const [error, setError]               = useState(false);
  const [retryCount, setRetryCount]     = useState(0);
  const [latency, setLatency]           = useState<number | null>(null);
  const [bitrate, setBitrate]           = useState<number | null>(null);
  const [showControls, setShowControls] = useState(false);

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
  // Controlli mobile
  // -------------------------------------------------------------------------
  function handleTap() {
    if (isTV) return;
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => {
      setShowControls(false);
    }, CONTROLS_HIDE_DELAY);
  }

  // -------------------------------------------------------------------------
  // Retry con backoff
  // -------------------------------------------------------------------------
  const scheduleRetry = useCallback(() => {
    if (retryRef.current) clearTimeout(retryRef.current);

    const count = retryCountRef.current;
    const delay = RETRY_DELAYS[Math.min(count, RETRY_DELAYS.length - 1)];
    retryCountRef.current += 1;

    console.warn(`[Player] Retry ${count + 1} tra ${delay / 1000}s`);
    setRetryCount(retryCountRef.current);

    retryRef.current = setTimeout(() => {
      sourceKeyRef.current += 1;
      setSourceKey(sourceKeyRef.current);
      setError(false);
      setBuffering(true);
      stallCountRef.current   = 0;
      recoveringRef.current   = false;
      lastProgressRef.current = Date.now();
    }, delay);
  }, []);

  // -------------------------------------------------------------------------
  // Recover scalato
  // -------------------------------------------------------------------------
  const recover = useCallback(() => {
    if (recoveringRef.current) return;
    recoveringRef.current = true;

    stallCountRef.current++;
    const count = stallCountRef.current;
    console.warn(`[Watchdog] STALL ${count}`);

    // Interventi 1-2: seek al live edge
    // Usa un valore alto ma non MAX_SAFE_INTEGER che causa errori su alcuni player
    if (count <= 2) {
      console.warn('[Watchdog] Seek live edge');
      videoRef.current?.seek(999999);
      setTimeout(() => { recoveringRef.current = false; }, 2000);
      return;
    }

    // Intervento 3+: reload source
    console.warn('[Watchdog] Reload source');
    const now = Date.now();
    if (now - lastReloadRef.current > RELOAD_COOLDOWN_MS) {
      lastReloadRef.current   = now;
      sourceKeyRef.current   += 1;
      setSourceKey(sourceKeyRef.current);
      stallCountRef.current   = 0;
      lastProgressRef.current = now;
    }
    recoveringRef.current = false;
  }, []);

  // -------------------------------------------------------------------------
  // Watchdog
  // -------------------------------------------------------------------------
  useEffect(() => {
    watchdogRef.current = setInterval(() => {
      if (error) return;
      const elapsed = Date.now() - lastProgressRef.current;
      if (elapsed > STALL_THRESHOLD_MS) {
        recover();
      }
    }, WATCHDOG_INTERVAL_MS);

    return () => {
      if (watchdogRef.current)      clearInterval(watchdogRef.current);
      if (retryRef.current)         clearTimeout(retryRef.current);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, [recover, error]);

  // -------------------------------------------------------------------------
  // Callback Video
  // -------------------------------------------------------------------------

  const onLoad = useCallback((_data: OnLoadData) => {
    console.log('[Player] onLoad');
    setBuffering(false);
    setError(false);
    retryCountRef.current   = 0;
    setRetryCount(0);
    stallCountRef.current   = 0;
    recoveringRef.current   = false;
    lastProgressRef.current = Date.now();
  }, []);

  const onProgress = useCallback((data: OnProgressData) => {
    if (data.currentTime !== lastTimeRef.current) {
      lastTimeRef.current     = data.currentTime;
      lastProgressRef.current = Date.now();
      stallCountRef.current   = 0;
      recoveringRef.current   = false;
    }
    setBuffering(false);
    setError(false);
    if (data.seekableDuration > 0) {
      setLatency(data.seekableDuration - data.currentTime);
    }
  }, []);

  const onBuffer = useCallback((data: OnBufferData) => {
    if (data.isBuffering) {
      setBuffering(true);
      console.warn('[Buffer] Buffering...');
    } else {
      setBuffering(false);
      recoveringRef.current   = false;
      stallCountRef.current   = 0;
      lastProgressRef.current = Date.now();
    }
  }, []);

  const onBandwidthUpdate = useCallback((data: OnBandwidthUpdateData) => {
    setBitrate(Math.round(data.bitrate / 1000));
  }, []);

  const onError = useCallback((err: OnErrorData) => {
    console.error('[Player] Errore:', JSON.stringify(err));
    setError(true);
    setBuffering(false);
    scheduleRetry();
  }, [scheduleRetry]);

  const onReadyForDisplay = useCallback(() => {
    console.log('[Player] Ready for display');
    setBuffering(false);
  }, []);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <TouchableWithoutFeedback onPress={handleTap}>
      <View style={styles.container}>

        <Video
          key={sourceKey}
          ref={videoRef}
          source={{
            uri: playlistUrl,
            headers: {
              'User-Agent': 'Mozilla/5.0',
            },
          }}
          style={styles.video}
          resizeMode="contain"
          bufferConfig={BUFFER_CONFIG}
          automaticallyWaitsToMinimizeStalling
          preferredForwardBufferDuration={60}
          allowsExternalPlayback={false}
          pictureInPicture={false}
          playInBackground={false}
          controls={!isTV && showControls}
          onLoad={onLoad}
          onProgress={onProgress}
          onBuffer={onBuffer}
          onBandwidthUpdate={onBandwidthUpdate}
          onError={onError}
          onReadyForDisplay={onReadyForDisplay}
          progressUpdateInterval={500}
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
          {latency != null && (
            <Text style={styles.hudText}>latency {latency.toFixed(1)}s</Text>
          )}
          {bitrate != null && (
            <Text style={styles.hudText}>{bitrate} kbps</Text>
          )}
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
    flexDirection: 'row',
    gap: 20,
    opacity: 0.4,
  },
  hudText: {
    color: '#c8c8c8',
    fontFamily: 'monospace',
    fontSize: 11,
    letterSpacing: 1,
  },
});
