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
// Configurazione
// ---------------------------------------------------------------------------
const BASE_URL = 'http://129.153.47.200:8000';
const { width } = Dimensions.get('window');
const isTV = Platform.isTV || (width >= 1280 && !('ontouchstart' in global));

const WATCHDOG_INTERVAL_MS = 2000;  // Controlla ogni 2 secondi
const STALL_THRESHOLD_MS   = 8000;  // Se fermo per 8s, considera bloccato
const RELOAD_COOLDOWN_MS   = 15000; // Minimo 15s tra un refresh e l'altro
const RETRY_DELAYS         = [5000, 10000, 20000, 30000];
const CONTROLS_HIDE_DELAY  = 3000;

export default function PlayerScreen() {
  useKeepAwake();

  const { id } = useLocalSearchParams<{ id: string }>();
  const playlistUrl = `${BASE_URL}/live/${id}/playlist.m3u8`;

  // Stati UI
  const [buffering, setBuffering]       = useState(true);
  const [error, setError]               = useState(false);
  const [retryCount, setRetryCount]     = useState(0);
  const [showControls, setShowControls] = useState(false);
  const [sourceKey, setSourceKey]       = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Riferimenti per la logica (evitano re-render inutili e chiusure di scope)
  const lastTimeRef      = useRef<number>(0);
  const lastProgressRef  = useRef<number>(Date.now());
  const lastReloadRef    = useRef<number>(0);
  const bufferingRef     = useRef<boolean>(true);
  const errorRef         = useRef<boolean>(false);
  const retryCountRef    = useRef<number>(0);
  const sourceKeyRef     = useRef<number>(0);

  const watchdogRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryRef         = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -------------------------------------------------------------------------
  // 1. Inizializzazione Player
  // -------------------------------------------------------------------------
  const player = useVideoPlayer({ uri: playlistUrl }, (p) => {
    p.play();
  });

  // -------------------------------------------------------------------------
  // 2. Gestione Orientamento e Back Button
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isTV) ScreenOrientation.unlockAsync();
    return () => {
      if (!isTV) ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, []);

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
  // 3. Listener di Stato del Player
  // -------------------------------------------------------------------------
  useEffect(() => {
    const statusSub = player.addListener('statusChange', (status) => {
      if (status.status === 'readyToPlay') {
        console.log('[Player] Ready to play');
        bufferingRef.current = false;
        errorRef.current     = false;
        setBuffering(false);
        setError(false);
        lastProgressRef.current = Date.now();
        retryCountRef.current = 0; // Reset retry al successo
      }
      if (status.status === 'loading') {
        bufferingRef.current = true;
        setBuffering(true);
      }
      if (status.status === 'error') {
        console.error('[Player] Error status:', status.error);
        errorRef.current = true;
        setError(true);
        setBuffering(false);
        scheduleRetry();
      }
    });

    return () => statusSub.remove();
  }, [player]);

  // -------------------------------------------------------------------------
  // 4. Logica di Retry (per errori fatali)
  // -------------------------------------------------------------------------
  const scheduleRetry = () => {
    if (retryRef.current) clearTimeout(retryRef.current);
    
    const count = retryCountRef.current;
    const delay = RETRY_DELAYS[Math.min(count, RETRY_DELAYS.length - 1)];
    retryCountRef.current += 1;
    setRetryCount(retryCountRef.current);

    console.log(`[Retry] Tentativo ${retryCountRef.current} tra ${delay}ms`);

    retryRef.current = setTimeout(() => {
      forceReload();
    }, delay);
  };

  const forceReload = () => {
    errorRef.current     = false;
    bufferingRef.current = true;
    setError(false);
    setBuffering(true);
    lastProgressRef.current = Date.now();
    lastTimeRef.current     = 0;
    sourceKeyRef.current    += 1;
    setSourceKey(sourceKeyRef.current);
  };

  // Trigger fisico del reload quando cambia sourceKey
  useEffect(() => {
    console.log('[Player] Eseguo replace della sorgente (sourceKey:', sourceKey, ')');
    player.replace({ uri: playlistUrl });
    player.play();
  }, [sourceKey]);

  // -------------------------------------------------------------------------
  // 5. Watchdog Avanzato (Rilevamento Stalli)
  // -------------------------------------------------------------------------
  useEffect(() => {
    watchdogRef.current = setInterval(() => {
      // Se c'è già un errore con retry schedulato, o se il player è in pausa manuale, non fare nulla
      if (!player || errorRef.current || player.paused) return;

      const currentTime = player.currentTime;
      const now         = Date.now();

      // Caso A: Il video sta scorrendo normalmente
      if (currentTime !== lastTimeRef.current) {
        lastTimeRef.current     = currentTime;
        lastProgressRef.current = now;
        if (bufferingRef.current) {
          bufferingRef.current = false;
          setBuffering(false);
        }
        return;
      }

      // Caso B: Il video è fermo (currentTime non cambia)
      const elapsedSinceProgress = now - lastProgressRef.current;

      if (elapsedSinceProgress > STALL_THRESHOLD_MS) {
        // Verifica se siamo nel periodo di cooldown per non refreshare a raffica
        if (now - lastReloadRef.current < RELOAD_COOLDOWN_MS) return;

        console.warn('[Watchdog] Stall rilevato (>8s). Forzo refresh...');
        lastReloadRef.current = now;
        forceReload();
      }
    }, WATCHDOG_INTERVAL_MS);

    return () => {
      if (watchdogRef.current)     clearInterval(watchdogRef.current);
      if (retryRef.current)         clearTimeout(retryRef.current);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, [player]);

  // -------------------------------------------------------------------------
  // 6. UI & Controlli
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

        {/* Overlay Controlli */}
        {controlsVisible && (
          <>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => isFullscreen ? setIsFullscreen(false) : router.back()}
            >
              <Ionicons name="arrow-back" size={24} color="#e8ff47" />
              <Text style={styles.backText}>BACK</Text>
            </TouchableOpacity>

            {!isFullscreen && (
              <>
                <TouchableOpacity
                  style={styles.fullscreenButton}
                  onPress={() => setIsFullscreen(true)}
                >
                  <Ionicons name="expand" size={24} color="#e8ff47" />
                </TouchableOpacity>

                <View style={styles.hud}>
                  <Text style={styles.hudText}>{id}</Text>
                </View>
              </>
            )}
          </>
        )}

        {/* Stato Caricamento */}
        {buffering && !error && (
          <View style={styles.overlay}>
            <ActivityIndicator color="#e8ff47" size="large" />
            <Text style={styles.overlayText}>ripristino connessione…</Text>
          </View>
        )}

        {/* Stato Errore */}
        {error && (
          <View style={styles.overlay}>
            <Text style={styles.overlayTextError}>✕</Text>
            <Text style={styles.overlayText}>
              problema di ricezione — retry {retryCount}…
            </Text>
            <Text style={styles.overlayUrl}>{playlistUrl}</Text>
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
  overlayText:      { color: '#888', fontFamily: 'monospace', fontSize: 13 },
  overlayTextError: { color: '#ff3b3b', fontSize: 32 },
  overlayUrl:        { color: '#2a2a2a', fontFamily: 'monospace', fontSize: 10, marginTop: 8 },
  hud:              { position: 'absolute', bottom: 16, left: 20, opacity: 0.4 },
  hudText:          { color: '#c8c8c8', fontFamily: 'monospace', fontSize: 11 },
});
