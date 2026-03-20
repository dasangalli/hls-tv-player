/**
 * app/player.tsx
 * Player HLS fullscreen — TV e mobile Android
 *
 * TV:     autoplay fullscreen, nessun controllo touch, tasto Back per tornare
 * Mobile: autoplay fullscreen, tap per mostrare/nascondere i controlli nativi,
 *         tasto Back per tornare alla home
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

// ExoPlayer buffer config
const BUFFER_CONFIG = {
  minBufferMs:                    15000,
  maxBufferMs:                    60000,
  bufferForPlaybackMs:            2500,
  bufferForPlaybackAfterRebuffer: 5000,
};

// Watchdog
const WATCHDOG_INTERVAL_MS = 500;
const STALL_THRESHOLD_MS   = 2000;
const RELOAD_COOLDOWN_MS   = 8000;
const ERROR_RETRY_DELAY_MS = 5000;

// Controlli mobile: nascondono dopo 3s
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
  const sourceKeyRef      = useRef<number>(0);

  const [sourceKey, setSourceKey]       = useState(0);
  const [buffering, setBuffering]       = useState(true);
  const [error, setError]               = useState(false);
  const [latency, setLatency]           = useState<number | null>(null);
  const [bitrate, setBitrate]           = useState<number | null>(null);
  const [showControls, setShowControls] = useState(false); // solo mobile

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
  // Controlli mobile — tap per mostrare, nascondono dopo 3s
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
  // Recover scalato
  // -------------------------------------------------------------------------
  const recover = useCallback(() => {
    if (recoveringRef.current) return;
    recoveringRef.current = true;

    stallCountRef.current++;
    const count = stallCountRef.current;
    console.warn(`[Watchdog] STALL ${count}`);

    // Interventi 1-2: seek al live edge
    if (count <= 2) {
      console.warn('[Watchdog] Seek live edge');
      videoRef.current?.seek(Number.MAX_SAFE_INTEGER);
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
      const elapsed = Date.now() - lastProgressRef.current;
      if (elapsed > STALL_THRESHOLD_MS) {
        recover();
      }
    }, WATCHDOG_INTERVAL_MS);

    return () => {
      if (watchdogRef.current)   clearInterval(watchdogRef.current);
      if (retryRef.current)      clearTimeout(retryRef.current);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, [recover]);

  // -------------------------------------------------------------------------
  // Callback Video
  // -------------------------------------------------------------------------

  const onLoad = useCallback((_data: OnLoadData) => {
    setBuffering(false);
    setError(false);
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
    if (data.seekableDuration > 0) {
      setLatency(data.seekableDuration - data.currentTime);
    }
  }, []);

  const onBuffer = useCallback((data: OnBufferData) => {
    if (data.isBuffering) {
      setBuffering(true);
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

  const onError = useCallback((_error: OnErrorData) => {
    console.error('[Player] Errore:', _error);
    setError(true);
    setBuffering(false);
    retryRef.current = setTimeout(() => {
      sourceKeyRef.current += 1;
      setSourceKey(sourceKeyRef.current);
      setError(false);
      setBuffering(true);
      stallCountRef.current   = 0;
      recoveringRef.current   = false;
      lastProgressRef.current = Date.now();
    }, ERROR_RETRY_DELAY_MS);
  }, []);

  const onReadyForDisplay = useCallback(() => {
    setBuffering(false);
  }, []);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <TouchableWithoutFeedback onPress={handleTap}>
      <View style={styles.container}>

        {/* Video fullscreen */}
        <Video
          key={sourceKey}
          ref={videoRef}
          source={{ uri: playlistUrl }}
          style={styles.video}
          resizeMode="contain"
          bufferConfig={BUFFER_CONFIG}
          automaticallyWaitsToMinimizeStalling
          preferredForwardBufferDuration={60}
          allowsExternalPlayback={false}
          pictureInPicture={false}
          playInBackground={false}
          // Su TV nessun controllo, su mobile controlli nativi al tap
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
            <Text style={styles.overlayText}>errore — retry in corso…</Text>
          </View>
        )}

        {/* HUD info — angolo in basso a sinistra */}
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
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  overlayText: {
    color: '#444',
    fontFamily: 'monospace',
    fontSize: 14,
    letterSpacing: 1,
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
