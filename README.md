# Adaptive AI Learning Companion

A **fully on-device AI-powered learning app** built with React + TypeScript using the [`@runanywhere/web`](https://www.npmjs.com/package/@runanywhere/web) SDK. All inference runs locally in the browser via WebAssembly + WebGPU — no server, no API key, 100% private.

> 🏆 Built for HackXtreme Hackathon

---

## ✨ Features

### 💬 Chat Tab — AI Learning Assistant
| Feature | Description |
|---|---|
| **Ask** | Ask any topic and get an AI explanation |
| **Summarize** | Paste notes and get bullet-point summaries |
| **Quiz** | Generate quiz questions from any content |
| **Level Selector** | Beginner / Intermediate / Advanced responses |
| **Streaming** | Real-time token streaming with throttled updates |
| **Chat History** | Auto-saves sessions, load or delete any past chat |
| **Dark / Light Theme** | Toggle with persistence via localStorage |
| **Copy to Clipboard** | One-click copy for any assistant response |
| **Session Memory** | Chats persist across browser refreshes |

### 📷 Vision Tab
- Point your camera and get real-time descriptions from an on-device VLM (LFM2-VL 450M)

### 🎙️ Voice Tab
- Full voice pipeline: VAD detects speech → STT transcribes → LLM responds → TTS speaks back

### 🔧 Tools Tab
- Agentic tool-calling with custom tool registration and execution trace

---

## 🚀 Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).  
Models are downloaded on first use and cached in the browser's OPFS (no re-download on refresh).

---

## 🏗️ Project Structure

```
src/
├── App.tsx                   # Tab navigation & SDK init
├── runanywhere.ts            # SDK setup + model catalog
├── components/
│   ├── ChatTab.tsx           # AI chat with streaming, history, theme
│   ├── VisionTab.tsx         # Camera + VLM inference
│   ├── VoiceTab.tsx          # Full voice pipeline
│   ├── ToolsTab.tsx          # Tool-calling agent
│   └── ModelBanner.tsx       # Model download progress UI
├── hooks/
│   └── useModelLoader.ts     # Shared model load/download hook
├── workers/
│   └── vlm-worker.ts         # VLM Web Worker
└── styles/
    └── index.css             # Design system (dark + light theme)
```

---

## 🧠 How It Works

```
@runanywhere/web (npm)
  ├── WASM engine  (llama.cpp, whisper.cpp, sherpa-onnx)
  ├── Model manager (HuggingFace download → OPFS cache)
  └── TypeScript API (TextGeneration, STT, TTS, VAD, VLM)
```

All models run **100% in-browser** — your data never leaves your device.

---

## 🌐 Deployment

### Vercel
```bash
npm run build
npx vercel --prod
```
The included `vercel.json` already sets the required Cross-Origin Isolation headers.

### Any Static Host
Serve `dist/` with these HTTP headers:
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
```

---

## 🖥️ Browser Requirements

- Chrome 96+ or Edge 96+ (Chrome 120+ recommended)
- WebAssembly + SharedArrayBuffer (requires Cross-Origin Isolation)
- OPFS support (for persistent model cache)
- WebGPU (optional, for accelerated inference)

---

## 📚 References

- [RunAnywhere SDK Docs](https://docs.runanywhere.ai)
- [npm package](https://www.npmjs.com/package/@runanywhere/web)
- [SDK GitHub](https://github.com/RunanywhereAI/runanywhere-sdks)

---

## 📄 License

MIT
