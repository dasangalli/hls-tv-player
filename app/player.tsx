import React, { useMemo } from 'react';
import { StyleSheet, View, StatusBar } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { WebView } from 'react-native-webview';

const BASE_URL = 'http://129.153.47.200:8000';

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const injectedHTML = useMemo(() => {
    const playlistUrl = `${BASE_URL}/live/${id}/playlist.m3u8`;

    return `
      <!DOCTYPE html>
      <html lang="it">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500&display=swap" rel="stylesheet">
        <script src="https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.7/hls.min.js"></script>
        <style>
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          :root { --bg:#0a0a0a; --surface:#111; --border:#1e1e1e; --accent:#e8ff47; --text:#c8c8c8; --muted:#444; --mono:'IBM Plex Mono', monospace; }
          html, body { height:100%; background:var(--bg); color:var(--text); font-family:var(--mono); font-size:13px; line-height:1.6; overflow:hidden; }
          .shell { display:grid; grid-template-rows:auto 1fr auto; height:100vh; max-width:1200px; margin:0 auto; padding:0 24px; }
          header { display:flex; align-items:center; gap:16px; padding:18px 0 16px; border-bottom:1px solid var(--border); }
          .dot { width:8px; height:8px; border-radius:50%; background:var(--muted); transition:.3s; }
          .dot.live { background:#ff3b3b; box-shadow:0 0 8px #ff3b3b88; animation:pulse 2s infinite; }
          .dot.ready { background:var(--accent); box-shadow:0 0 8px var(--accent); }
          @keyframes pulse { 0%,100%{opacity:1;} 50%{opacity:.4;} }
          .stream-id { color:var(--accent); font-weight:500; letter-spacing:.08em; }
          .status-text { margin-left:auto; font-size:11px; color:var(--muted); }
          .video-wrap { position:relative; display:flex; align-items:center; justify-content:center; padding:24px 0; }
          video { width:100%; max-height:calc(100vh - 130px); aspect-ratio:16/9; background:#000; border:1px solid var(--border); }
          .overlay { position:absolute; inset:24px 0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; background:#000; border:1px solid var(--border); opacity:0; pointer-events:none; transition:.3s; }
          .overlay.visible { opacity:1; pointer-events:auto; }
          footer { display:flex; gap:24px; padding:14px 0; border-top:1px solid var(--border); font-size:11px; color:var(--muted); }
          .playlist-url { margin-left:auto; font-size:10px; color:#2a2a2a; max-width:420px; overflow:hidden; text-overflow:ellipsis; }
        </style>
      </head>
      <body>
        <div class="shell">
          <header>
            <div class="dot" id="dot"></div>
            <span class="stream-id">${id}</span>
            <span class="status-text" id="statusText">init…</span>
          </header>
          <div class="video-wrap">
            <video id="video" controls playsinline></video>
            <div class="overlay" id="overlay"><div id="overlayMsg">loading…</div></div>
          </div>
          <footer>
            <span>HLS.js \${Hls.version}</span>
            <span id="latency"></span>
            <span class="playlist-url">${playlistUrl}</span>
          </footer>
        </div>

        <script>
          const video = document.getElementById("video");
          const dot = document.getElementById("dot");
          const statusText = document.getElementById("statusText");
          const overlay = document.getElementById("overlay");
          const overlayMsg = document.getElementById("overlayMsg");
          const latencyEl = document.getElementById("latency");
          const playlistUrl = "${playlistUrl}";

          function setStatus(state, msg) {
            statusText.textContent = msg;
            dot.className = "dot";
            overlay.classList.remove("visible");
            if (state === "live") dot.classList.add("live");
            if (state === "ready") dot.classList.add("ready");
            if (state === "error" || state === "wait") overlay.classList.add("visible");
          }

          if (Hls.isSupported()) {
            const hls = new Hls({
              // --- TUTTI I TUOI PARAMETRI ORIGINALI ---
              lowLatencyMode: false,
              backBufferLength: 30,
              maxBufferLength: 60,
              maxMaxBufferLength: 120,
              maxBufferSize: 80*1000*1000,
              maxBufferHole: 5.0,
              liveSyncDurationCount: 8,
              liveMaxLatencyDurationCount: 15,
              fragLoadingMaxRetry: 12,
              fragLoadingRetryDelay: 500,
              fragLoadingMaxRetryTimeout: 10000,
              manifestLoadingMaxRetry: 10,
              manifestLoadingRetryDelay: 800,
              manifestLoadingMaxRetryTimeout: 8000,
              startFragPrefetch: true,
              enableWorker: true,
              liveDurationInfinity: true,
              nudgeMaxRetry: 15,
              nudgeOffset: 1.0,
            });

            hls.loadSource(playlistUrl);
            hls.attachMedia(video);

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              setStatus("ready", "buffering…");
              video.play().catch(() => {});
            });

            hls.on(Hls.Events.FRAG_CHANGED, () => setStatus("live", "live"));

            // --- TUA LOGICA WATCHDOG (LIV 1 E 2) ---
            let lastTime = 0, stallCount = 0, lastProgressTs = Date.now(), recovering = false;

            function recover() {
              if (recovering) return;
              recovering = true; stallCount++;
              if (stallCount <= 2) {
                if (hls.liveSyncPosition) { video.currentTime = hls.liveSyncPosition; }
                else { video.currentTime += 2.0; }
                setTimeout(() => { recovering = false; }, 2000);
              } else if (stallCount === 3) {
                hls.recoverMediaError();
                setTimeout(() => { recovering = false; }, 3000);
              } else {
                hls.stopLoad(); hls.startLoad(-1);
                stallCount = 0; lastProgressTs = Date.now(); recovering = false;
              }
            }

            video.addEventListener("waiting", () => {
              setStatus("ready", "buffering…");
              setTimeout(() => {
                if (!video.paused && video.currentTime === lastTime) recover();
              }, 2000);
            });

            video.addEventListener("playing", () => {
              recovering = false; stallCount = 0; lastProgressTs = Date.now();
              setStatus("live", "live");
            });

            setInterval(() => {
              if (!video || video.paused) return;
              if (video.currentTime !== lastTime) {
                lastTime = video.currentTime; lastProgressTs = Date.now();
                stallCount = 0; recovering = false;
              } else if (Date.now() - lastProgressTs > 2000) {
                recover();
              }
            }, 500);

            // Visibility Re-init
            document.addEventListener("visibilitychange", () => {
              if (document.visibilityState === "visible") {
                hls.stopLoad(); hls.detachMedia();
                lastTime = 0; stallCount = 0; recovering = false; lastProgressTs = Date.now();
                hls.attachMedia(video); hls.startLoad(-1);
                video.play().catch(() => {});
                setStatus("ready", "buffering…");
              }
            });

            // Latency Monitor
            setInterval(() => {
              if (hls.latency) { latencyEl.textContent = "latency " + hls.latency.toFixed(1) + "s"; }
            }, 2000);

            hls.on(Hls.Events.ERROR, (_, data) => {
              if (data.fatal) {
                overlayMsg.innerHTML = "errore " + data.type;
                setStatus("error", "errore");
                setTimeout(() => { window.location.reload(); }, 5000);
              }
            });
            setStatus("wait", "loading…");
          } else {
            video.src = playlistUrl;
            video.play().catch(() => {});
            setStatus("live", "live (nativo)");
          }
        </script>
      </body>
      </html>
    `;
  }, [id]);

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <Stack.Screen options={{ headerShown: false }} />

      <WebView
        originWhitelist={['*']}
        source={{ html: injectedHTML }}
        style={styles.webview}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        mixedContentMode="always"
        allowsFullscreenVideo={true}
        // User Agent da browser desktop per sicurezza extra
        userAgent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  webview: { flex: 1, backgroundColor: '#000' },
});
