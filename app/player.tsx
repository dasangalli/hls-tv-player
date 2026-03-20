/**
 * app/player.tsx
 * Player HLS fullscreen con ExoPlayer (Android TV)
 *
 * Logica anti-stallo equivalente all'index.html ma ottimizzata per ExoPlayer:
 * - bufferConfig: parametri buffer nativi ExoPlayer
 * - onBuffer: evento nativo di buffering (equivalente all'evento "waiting" del browser)
 * - Watchdog con interventi scalati: seek live edge → recoverMediaError → reload
 * - Nessun controllo UI — autoplay fullscreen
 */

import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  StyleSheet,
  Text,
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

// ExoPlayer buffer config — specchio dei parametri HLS.js in index.html
const BUFFER_CONFIG = {
  minBufferMs:                    15000,
  maxBufferMs:                    60000,
  bufferForPlaybackMs:            2500,
  bufferForPlaybackAfterRebuffer: 5000,
};

// Watchdog
const WATCHDOG_INTERVAL_MS = 500;    // controlla ogni 500ms
const STALL_THRESHOLD_MS   = 2000;   // dichiara stallo dopo 2s fermi
const RELOAD_COOLDOWN_MS   = 8000;   // pausa minima tra reload completi
const ERROR_RETRY_DELAY_MS = 5000;   // attesa dopo errore fatale

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const playlistUrl = `${BASE_URL}/live/${id}/playlist.m3u8`;

  const videoRef         = useRef<VideoRef>(null);
  const lastTimeRef      = useRef<number>(0);
  const lastProgressRef  = useRef<number>(Date.now());
  const stallCountRef    = useRef<number>(0);
  const recoveringRef    = useRef<boolean>(false);
  const lastReloadRef    = useRef<number>(0);
  const watchdogRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryRef         = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceKeyRef     = useRef<number>(0);

  const [sourceKey, setSourceKey] = useState(0);
  const [buffering, setBuffering] = useState(true);
  const [error, setError]         = useState(false);
  const [latency, setLatency]     = useState<number | null>(null);
  const [bitrate, setBitrate]     = useState<number | null>(null);

  // -------------------------------------------------------------------------
  // Tasto back → torna alla home
  // -------------------------------------------------------------------------
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      router.back();
      return true;
    });
    return () => sub.remove();
  }, []);

  // -------------------------------------------------------------------------
  // Recover scalato (identico alla logica in index.html)
  // -------------------------------------------------------------------------
  const recover = useCallback(() => {
    if (recoveringRef.current) return;
    recoveringRef.current = true;

    stallCountRef.current++;
    const count = stallCountRef.current;
    console.warn(`[Watchdog] STALL ${count}`);

    // Interventi 1 e 2: seek al live edge
    if (count <= 2) {
      console.warn('[Watchdog] Seek live edge');
      videoRef.current?.seek(Number.MAX_SAFE_INTEGER);
      setTimeout(() => { recoveringRef.current = false; }, 2000);
      return;
    }

    // Intervento 3: reset del source (equivalente a recoverMediaError)
    if (count === 3) {
      console.warn('[Watchdog] Reset source');
      const now = Date.now();
      if (now - lastReloadRef.current > RELOAD_COOLDOWN_MS) {
        lastReloadRef.current = now;
        sourceKeyRef.current += 1;
        setSourceKey(sourceKeyRef.current);
        stallCountRef.current  = 0;
        lastProgressRef.current = now;
      }
      recoveringRef.current = false;
      return;
    }

    // Intervento 4+: reload completo
    console.warn('[Watchdog] RELOAD');
    const now = Date.now();
    if (now - lastReloadRef.current > RELOAD_COOLDOWN_MS) {
      lastReloadRef.current = now;
      sourceKeyRef.current += 1;
      setSourceKey(sourceKeyRef.current);
      stallCountRef.current   = 0;
      lastProgressRef.current = now;
    }
    recoveringRef.current = false;
  }, []);

  // -------------------------------------------------------------------------
  // Watchdog setInterval
  // -------------------------------------------------------------------------
  useEffect(() => {
    watchdogRef.current = setInterval(() => {
      const now = Date.now();

      if (lastTimeRef.current !== lastTimeRef.current) return; // guard

      const elapsed = now - lastProgressRef.current;
      if (elapsed > STALL_THRESHOLD_MS) {
        recover();
      }
    }, WATCHDOG_INTERVAL_MS);

    return () => {
      if (watchdogRef.current) clearInterval(watchdogRef.current);
      if (retryRef.current)    clearTimeout(retryRef.current);
    };
  }, [recover]);

  // -------------------------------------------------------------------------
  // Callback Video
  // -------------------------------------------------------------------------

  const onLoad = useCallback((_data: OnLoadData) => {
    setBuffering(false);
    setError(false);
    stallCountRef.current    = 0;
    recoveringRef.current    = false;
    lastProgressRef.current  = Date.now();
  }, []);

  const onProgress = useCallback((data: OnProgressData) => {
    if (data.currentTime !== lastTimeRef.current) {
      lastTimeRef.current     = data.currentTime;
      lastProgressRef.current = Date.now();
      stallCountRef.current   = 0;
      recoveringRef.current   = false;
    }

    setBuffering(false);

    // Latenza approssimata
    if (data.seekableDuration > 0) {
      setLatency(data.seekableDuration - data.currentTime);
    }
  }, []);

  // onBuffer — evento nativo ExoPlayer, equivalente all'evento "waiting" del browser
  const onBuffer = useCallback((data: OnBufferData) => {
    if (data.isBuffering) {
      setBuffering(true);
      console.warn('[Buffer] Buffering...');
      // Non chiamare recover() subito — aspetta il watchdog (2s)
      // I micro-buffering normali si risolvono da soli
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
      console.warn('[Player] Retry dopo errore');
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
    <View style={styles.container}>

      {/* Video fullscreen */}
      <Video
        key={sourceKey}
        ref={videoRef}
        source={{ uri: playlistUrl }}
        style={styles.video}
        resizeMode="contain"
        // ExoPlayer buffer config
        bufferConfig={BUFFER_CONFIG}
        // iOS AVPlayer
        automaticallyWaitsToMinimizeStalling
        preferredForwardBufferDuration={60}
        // Comportamento
        allowsExternalPlayback={false}
        pictureInPicture={false}
        playInBackground={false}
        controls={false}
        // Callbacks
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

      {/* HUD info (angolo in basso a sinistra) */}
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
