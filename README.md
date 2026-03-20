# HLS TV Player — React Native + EAS Build

Player HLS per Android TV con ExoPlayer. Build interamente in cloud via EAS.

## Struttura

```
HLSTVPlayer/
├── app.json              # config Expo + Android TV (LEANBACK_LAUNCHER)
├── eas.json              # config EAS Build
├── package.json
├── babel.config.js
├── index.js
└── app/
    ├── _layout.tsx       # root layout (StatusBar hidden)
    ├── index.tsx         # schermata inserimento stream ID
    └── player.tsx        # player fullscreen con ExoPlayer
```

## Setup (tutto in cloud)

### 1. Crea il repo GitHub
- Vai su https://github.com/new
- Crea un repo pubblico o privato (es. `hls-tv-player`)
- Carica tutti i file di questa cartella

### 2. Collega EAS al repo
```bash
# Da terminale locale oppure usa GitHub Codespaces (gratuito)
npm install -g eas-cli
eas login
eas build:configure
```

Oppure direttamente da https://expo.dev:
- New Project → Import from GitHub → seleziona il repo

### 3. Avvia la build APK
```bash
eas build --platform android --profile preview
```
Oppure dal sito expo.dev → Builds → New Build → Android → preview

EAS compila nel cloud e ti restituisce un link per scaricare l'APK.

### 4. Installa sulla TV

**Via chiavetta USB:**
1. Copia l'APK sulla chiavetta
2. Sulla TV: File Manager → chiavetta → installa APK

**Via browser TV:**
1. Apri il browser sulla TV
2. Vai al link EAS dell'APK
3. Scarica e installa

**Abilita prima le origini sconosciute:**
Impostazioni → Sicurezza → Origini sconosciute → ON

## Configurazione

L'URL del server è hardcodato in `app/player.tsx`:
```typescript
const BASE_URL = 'http://129.153.47.200:8000';
```
Cambialo prima della build se necessario.

## Uso

1. Apri l'app sulla TV
2. Inserisci lo stream ID (es. `1`) con la tastiera della TV
3. Premi Invio o il pulsante ▶ avvia
4. Il player si avvia in fullscreen automaticamente
5. Tasto Back del telecomando → torna alla schermata ID

L'ultimo stream ID usato viene ricordato automaticamente.

## Logica anti-stallo

Identica all'index.html, adattata per ExoPlayer:

| stallCount | Intervento |
|---|---|
| 1-2 | Seek al live edge |
| 3 | Reset source (remount Video) |
| 4+ | Reload completo con cooldown 8s |

In più: `onBuffer` (evento nativo ExoPlayer) rileva il buffering istantaneamente,
senza aspettare il watchdog — equivalente all'evento `waiting` del browser.
