import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FiSun, FiMoon, FiMenu, FiPlus, FiFolder, FiTrash2, FiMessageSquare, FiCopy, FiCheck, FiStopCircle, FiX, FiLogOut, FiUser, FiImage } from 'react-icons/fi';
import { ModelCategory } from '@runanywhere/web';
import { TextGeneration, VLMWorkerBridge } from '@runanywhere/web-llamacpp';
import { useModelLoader } from '../hooks/useModelLoader';
import { ModelBanner } from './ModelBanner';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  type?: 'explanation' | 'summarize';
  stats?: { tokens: number; tokPerSec: number; latencyMs: number };
  imagePreview?: string;
}

interface Session {
  id: string;
  timestamp: number;
  preview: string;
  messages: Message[];
}

const SESSION_KEY = 'ai-learning-messages';
const HISTORY_KEY = 'ai-learning-history';
const THEME_KEY = 'ai-learning-theme';

export function ChatTab() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const textLoader = useModelLoader(ModelCategory.Language, true);
  const vlmLoader = useModelLoader(ModelCategory.Multimodal, true);
  
  const [image, setImage] = useState<File | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loader = image ? vlmLoader : textLoader;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [level, setLevel] = useState<'Beginner' | 'Intermediate' | 'Advanced'>('Beginner');
  const [actionMode, setActionMode] = useState<'chat' | 'summarize' | 'quiz'>('chat');
  const [generating, setGenerating] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [showSidebar, setShowSidebar] = useState(false);
  const [history, setHistory] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState<string>(() => localStorage.getItem('active_session_id') || Date.now().toString());

  const getBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const getRgbPixelsFromBase64 = (base64: string, maxWidth = 384): Promise<{ pixels: Uint8Array; width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      // 2MB Base64 string payload size check (approximate, since DataURL prefix adds slight overhead)
      const approxBytes = base64.length * 0.75;
      if (approxBytes > 2 * 1024 * 1024) {
         return reject(new Error('Image exceeds 2MB limit. Try a smaller image.'));
      }

      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        
        // Resize strictly to 384px to prevent VLM context-window crashes / OOM in WASM Worker
        if (width > maxWidth) {
          const ratio = maxWidth / width;
          width = maxWidth;
          height = Math.floor(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('No canvas context'));
        ctx.drawImage(img, 0, 0, width, height);
        
        const imageData = ctx.getImageData(0, 0, width, height);
        const rgba = imageData.data;
        // Strictly use RGB (3 channels) as VLMWorkerBridge processes raw RGB arrays, not RGBA
        const rgb = new Uint8Array((width * height) * 3);
        for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
          rgb[j] = rgba[i];
          rgb[j + 1] = rgba[i + 1];
          rgb[j + 2] = rgba[i + 2];
        }
        resolve({ pixels: rgb, width, height });
      };
      img.onerror = () => reject(new Error('Failed to load image into canvas.'));
      img.src = base64;
    });
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setImage(file);
      const base64 = await getBase64(file);
      setImageBase64(base64);
    } else {
      setImage(null);
      setImageBase64(null);
    }
  };

  const removeImage = () => {
    setImage(null);
    setImageBase64(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Profile State
  interface TopicProgress {
    topic: string;
    total: number;
    completed: number;
  }
  interface ProfileState {
    totalXP: number;
    level: number;
    quizzesAttempted: number;
    correctAnswersTotal: number;
    totalQuestionsAnswered: number;
    topicProgress: TopicProgress[];
    lastActiveDate: string;
    streak: number;
  }
  const [profile, setProfile] = useState<ProfileState>(() => {
    const profileKey = `profile_${user?.username || 'user'}`;
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    try {
      const saved = localStorage.getItem(profileKey);
      if (saved) {
        const p: ProfileState = JSON.parse(saved);
        if (p.lastActiveDate === todayStr) {
          // unchanged
        } else if (p.lastActiveDate === yesterdayStr) {
          p.streak = (p.streak || 0) + 1;
        } else {
          p.streak = 1;
        }
        p.lastActiveDate = todayStr;
        return p;
      }
    } catch {}
    
    return {
      totalXP: 0,
      level: 1,
      quizzesAttempted: 0,
      correctAnswersTotal: 0,
      totalQuestionsAnswered: 0,
      topicProgress: [],
      lastActiveDate: todayStr,
      streak: 1
    };
  });

  useEffect(() => {
    localStorage.setItem(`profile_${user?.username || 'user'}`, JSON.stringify(profile));
  }, [profile, user]);

  const [xpPopup, setXpPopup] = useState<number | null>(null);

  // Quiz States
  const [quizState, setQuizState] = useState({
    active: false,
    topic: '',
    questions: [] as any[],
    currentQuestion: 0,
    userAnswers: [] as string[],
    score: 0,
    points: 0,
    completed: false,
    timeLeft: 30,
    timerActive: false,
    showFeedback: false,
    isCorrect: false,
    userAnswerInput: ''
  });

  useEffect(() => {
    localStorage.setItem('active_session_id', sessionId);
  }, [sessionId]);

  const cancelRef = useRef<(() => void) | null>(null);
  const generatingRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);

  const handleQuizSubmitTimeout = useCallback(() => {
    setQuizState(prev => ({
      ...prev,
      timerActive: false,
      isCorrect: false,
      showFeedback: true,
      userAnswers: [...prev.userAnswers, '']
    }));
  }, []);

  useEffect(() => {
    if (!quizState.timerActive || quizState.showFeedback || !quizState.active || quizState.questions.length === 0 || quizState.completed) return;
    const interval = setInterval(() => {
      setQuizState((prev) => {
        if (prev.timeLeft <= 1) {
          clearInterval(interval);
          handleQuizSubmitTimeout();
          return { ...prev, timeLeft: 0 };
        }
        return { ...prev, timeLeft: prev.timeLeft - 1 };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [quizState.timerActive, quizState.showFeedback, quizState.active, quizState.questions.length, quizState.completed, handleQuizSubmitTimeout]);

  // ── Theme ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY) as 'dark' | 'light' | null;
    if (saved) setTheme(saved);
  }, []);

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  // ── Session messages ───────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setMessages(parsed);
      }
    } catch {
      localStorage.removeItem(SESSION_KEY);
    }
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(messages));
      } catch {
        /* storage full */
      }
    }
  }, [messages]);

  // ── History — load from MongoDB (fallback to localStorage) ──────────────
  useEffect(() => {
    authAPI
      .getHistory()
      .then((data) => {
        if (Array.isArray(data.chatHistory) && data.chatHistory.length > 0) {
          setHistory(data.chatHistory);
        } else {
          // Fallback: migrate existing localStorage history to DB
          try {
            const saved = localStorage.getItem(HISTORY_KEY);
            if (saved) {
              const parsed = JSON.parse(saved);
              if (Array.isArray(parsed) && parsed.length > 0) {
                setHistory(parsed);
                authAPI.saveHistory(parsed).catch(() => {});
              }
            }
          } catch { /* ignore */ }
        }
      })
      .catch(() => {
        // Offline fallback
        try {
          const saved = localStorage.getItem(HISTORY_KEY);
          if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) setHistory(parsed);
          }
        } catch {
          localStorage.removeItem(HISTORY_KEY);
        }
      });
  }, []);

  const saveSessionToHistory = useCallback((msgs: Message[], currentSessionId: string) => {
    if (msgs.length < 2) return;
    const preview = msgs.find((m) => m.role === 'user')?.text?.slice(0, 60) ?? 'Chat session';
    
    setHistory((prev) => {
      const existingIndex = prev.findIndex(s => s.id === currentSessionId);
      let updated;
      if (existingIndex >= 0) {
        updated = [...prev];
        updated[existingIndex] = { ...updated[existingIndex], preview, messages: msgs, timestamp: Date.now() };
        updated.sort((a, b) => b.timestamp - a.timestamp);
      } else {
        const newSession: Session = {
          id: currentSessionId,
          timestamp: Date.now(),
          preview,
          messages: msgs,
        };
        updated = [newSession, ...prev].slice(0, 20);
      }
      // Save to localStorage as offline cache
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
      // Save to MongoDB
      authAPI.saveHistory(updated).catch(() => {});
      return updated;
    });
  }, []);

  const loadSession = useCallback((session: Session) => {
    setSessionId(session.id);
    setMessages(session.messages);
    localStorage.setItem(SESSION_KEY, JSON.stringify(session.messages));
    setShowSidebar(false);
  }, []);

  const deleteSession = useCallback((id: string) => {
    setHistory((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
      // Sync deletion to MongoDB
      authAPI.saveHistory(updated).catch(() => {});
      return updated;
    });
  }, []);

  // ── Clear chat ─────────────────────────────────────────────────────────────
  const handleClearChat = useCallback(() => {
    if (messages.length > 0) saveSessionToHistory(messages, sessionId);
    setMessages([]);
    setSessionId(Date.now().toString());
    localStorage.removeItem(SESSION_KEY);
  }, [messages, sessionId, saveSessionToHistory]);

  const handleNewChat = useCallback(() => {
    if (messages.length > 0) saveSessionToHistory(messages, sessionId);
    setMessages([]);
    setSessionId(Date.now().toString());
    localStorage.removeItem(SESSION_KEY);
  }, [messages, sessionId, saveSessionToHistory]);

  const toggleSidebar = () => setShowSidebar(!showSidebar);

  // ── Copy ───────────────────────────────────────────────────────────────────
  const handleCopy = useCallback((text: string, index: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    });
  }, []);

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // ── Core generation ────────────────────────────────────────────────────────
  const generateResponse = useCallback(async (
  userText: string,
  modifiedPrompt: string,
  msgType: 'explanation' | 'summarize' = 'explanation'
) => {
  if (generatingRef.current) return;

  generatingRef.current = true;
  setGenerating(true);

  const activeImageFile = image;
  const activeImagePreview = imageBase64 ?? undefined;

  try {
    const needsVision = !!activeImageFile;
    const activeLoader = needsVision ? vlmLoader : textLoader;

    if (activeLoader.state !== 'ready') {
      const ok = await activeLoader.ensure();
      if (!ok) throw new Error("Model not loaded");
    }

    // Add user + placeholder message
    setMessages((prev) => [
      ...prev,
      { role: 'user', text: userText, imagePreview: activeImagePreview },
      { role: 'assistant', text: needsVision ? '🧠 Analyzing image...' : 'Generating...', type: msgType }
    ]);

    setInput('');

    // ============================
    // 🔥 VISION PATH (FIXED)
    // ============================
    if (activeImageFile) {
      let instruction = "Analyze the image and respond.";
      if (msgType === 'summarize') {
        instruction = "Extract text from the image and summarize.";
      }

      const visionPrompt = `Instruction: ${instruction}\n\nUser: ${modifiedPrompt}`;

      console.log('[Vision] Start', {
        fileName: activeImageFile.name,
        promptLength: visionPrompt.length
      });

      const bridge = VLMWorkerBridge.shared;

      if (!bridge.isModelLoaded) {
        throw new Error("VLM model not loaded");
      }

      // Convert image → RGB pixels (stable)
      const { pixels, width, height } = await fileToRgbPixels(activeImageFile, 128);

      console.log('[Vision] Image ready', {
        width,
        height,
        pixels: pixels.length
      });

      const t0 = performance.now();

      // ❌ NO TIMEOUT (important fix)
      const result = await bridge.process(
        pixels,
        width,
        height,
        visionPrompt,
        {
          maxTokens: 32,
          temperature: 0.2
        }
      ) as any;

      const totalMs = performance.now() - t0;

      // Safe extraction
      let reply =
        (typeof result === 'string' && result) ||
        result?.text ||
        result?.output ||
        result?.response ||
        '';

      reply = reply?.trim();

      if (!reply) {
        throw new Error("Vision returned empty response");
      }

      // Update assistant message
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          text: reply,
          stats: {
            tokens: 0,
            tokPerSec: 0,
            latencyMs: totalMs,
          },
        };
        return updated;
      });

      removeImage(); // ✅ clear after success
    }

    // ============================
    // 🔥 TEXT PATH (UNCHANGED)
    // ============================
    else {
      const { stream, result: resultPromise, cancel } =
        await TextGeneration.generateStream(modifiedPrompt, {
          maxTokens: 500,
          temperature: 0.5
        });

      cancelRef.current = cancel;

      let output = "";

      for await (const token of stream) {
        output += token;
      }

      const result = await resultPromise;

      const reply = result.text || output;

      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          text: reply
        };
        return updated;
      });
    }

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";

    setMessages((prev) => {
      const updated = [...prev];
      updated[updated.length - 1] = {
        role: 'assistant',
        text: `Error: ${msg}`
      };
      return updated;
    });
  } finally {
    generatingRef.current = false;
    setGenerating(false);
    cancelRef.current = null;
  }
}, [image, imageBase64, vlmLoader, loader]);
const send = useCallback(async () => {
  const text = input.trim();
  if (!text || generating) return;

  let prompt = text;
  if (level === 'Beginner') {
    prompt = `Be concise. Explain ${text} in simple terms with one short example.`;
  } else if (level === 'Intermediate') {
    prompt = `Be concise. Explain ${text} clearly with moderate detail in a few sentences.`;
  } else if (level === 'Advanced') {
    prompt = `Be concise. Explain ${text} in a technical way with key details only.`;
  }

  await generateResponse(text, prompt, 'explanation');
}, [input, generating, level, generateResponse]);

const handleSummarize = useCallback(async () => {
  const text = input.trim();
  if (!text || generating) return;

  let prompt = '';
  if (level === 'Beginner') {
    prompt = `Be concise. Summarize in 3 simple bullet points for a beginner:\n${text}`;
  } else if (level === 'Intermediate') {
    prompt = `Be concise. Summarize in 4 clear bullet points:\n${text}`;
  } else if (level === 'Advanced') {
    prompt = `Be concise. Summarize in 5 structured bullet points:\n${text}`;
  }

  await generateResponse(text, prompt, 'summarize');
}, [input, generating, level, generateResponse]);

const handleQuizGenerate = useCallback(async (topicText: string) => {
  if (generating) return;

  if (textLoader.state !== 'ready') {
    const ok = await textLoader.ensure();
    if (!ok) return;
  }

  setQuizState({
    active: true,
    topic: topicText,
    questions: [],
    currentQuestion: 0,
    userAnswers: [],
    score: 0,
    points: 0,
    completed: false,
    timeLeft: 30,
    timerActive: false,
    showFeedback: false,
    isCorrect: false,
    userAnswerInput: ''
  });

  setGenerating(true);
  generatingRef.current = true;

  const prompt = `Generate 3 quiz questions with answers and explanations in JSON format about: "${topicText}".
The output MUST be a valid JSON array of objects. Do not include any other text except the JSON array.
Format example:
[
  { "question": "What is ...?", "answer": "...", "explanation": "..." }
]`;

  try {
    const { result, cancel } = await TextGeneration.generateStream(prompt, { maxTokens: 1500, temperature: 0.2 });
    cancelRef.current = cancel;

    const res = await result;
    let jsonText = res.text || '';
    const startIdx = jsonText.indexOf('[');
    const endIdx = jsonText.lastIndexOf(']');

    if (startIdx !== -1 && endIdx !== -1) {
      jsonText = jsonText.substring(startIdx, endIdx + 1);
      const parsed = JSON.parse(jsonText);
      setQuizState(prev => ({
        ...prev,
        questions: parsed.slice(0, 3),
        timeLeft: 30,
        timerActive: true
      }));
    } else {
      throw new Error('Could not parse JSON');
    }
  } catch {
    setQuizState(prev => ({ ...prev, active: false }));
    setMessages((p: Message[]) => [
      ...p,
      { role: 'assistant', text: 'Error generating quiz. Please try again with a different topic.' }
    ]);
  } finally {
    generatingRef.current = false;
    setGenerating(false);
    cancelRef.current = null;
  }
}, [generating, textLoader]);
  const handleQuizSubmit = useCallback(() => {
    setQuizState(prev => {
      const correctAns = prev.questions[prev.currentQuestion]?.answer || '';
      const correctLower = correctAns.toLowerCase();
      const userLower = prev.userAnswerInput.toLowerCase();
      
      let match = false;
      if (userLower.trim() === correctLower.trim()) match = true;
      else if (userLower.trim().length > 2 && correctLower.includes(userLower.trim())) match = true;
      else if (userLower.trim().length > 2 && userLower.includes(correctLower.trim())) match = true;
      else if (userLower.trim().length > 0 && correctLower.split(' ').some((w: string) => w.length > 3 && w === userLower.trim())) match = true;

      const pointsEarned = match ? 10 : 0;
      if (pointsEarned > 0) {
        setXpPopup(pointsEarned);
        setTimeout(() => setXpPopup(null), 1000);
      }

      return {
        ...prev,
        timerActive: false,
        isCorrect: match,
        score: match ? prev.score + 1 : prev.score,
        points: prev.points + pointsEarned,
        showFeedback: true,
        userAnswers: [...prev.userAnswers, prev.userAnswerInput]
      };
    });
  }, []);

  const handleQuizNext = useCallback(() => {
    setQuizState(prev => {
      const isLast = prev.currentQuestion >= prev.questions.length - 1;
      
      if (!isLast) {
        return {
          ...prev,
          showFeedback: false,
          userAnswerInput: '',
          currentQuestion: prev.currentQuestion + 1,
          timeLeft: 30,
          timerActive: true
        };
      } else {
        let finalPoints = prev.points;
        let completionBonus = 0;
        if (prev.score === 3) completionBonus = 10;
        else if (prev.score === 2) completionBonus = 5;
        
        finalPoints += completionBonus;

        if (completionBonus > 0) {
           setXpPopup(completionBonus);
           setTimeout(() => setXpPopup(null), 1000);
        }

        setProfile(p => {
          const newXP = (p.totalXP || 0) + finalPoints;
          const newLevel = Math.floor(newXP / 50) + 1; // 50 XP per level

          const newTopicProgress = [...(p.topicProgress || [])];
          const topicIndex = newTopicProgress.findIndex(t => t.topic === prev.topic);
          if (topicIndex >= 0) {
            newTopicProgress[topicIndex] = {
              ...newTopicProgress[topicIndex],
              completed: newTopicProgress[topicIndex].completed + prev.score
            };
          } else {
            newTopicProgress.push({
              topic: prev.topic || 'General Practice',
              total: 30, // Default challenge goal parameter per topic
              completed: prev.score
            });
          }

          return {
            ...p,
            totalXP: newXP,
            level: newLevel,
            quizzesAttempted: p.quizzesAttempted + 1,
            correctAnswersTotal: p.correctAnswersTotal + prev.score,
            totalQuestionsAnswered: p.totalQuestionsAnswered + prev.questions.length,
            topicProgress: newTopicProgress
          };
        });

        return {
          ...prev,
          showFeedback: false,
          userAnswerInput: '',
          points: finalPoints,
          completed: true
        };
      }
    });
  }, []);

  const handleCancel = () => { cancelRef.current?.(); };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  const fileToRgbPixels = async (
  file: File,
  maxWidth = 256
): Promise<{ pixels: Uint8Array; width: number; height: number }> => {
  if (!file.type.startsWith("image/")) {
    throw new Error("Invalid image file");
  }

  const bitmap = await createImageBitmap(file);

  let width = bitmap.width;
  let height = bitmap.height;

  if (width > maxWidth) {
    const scale = maxWidth / width;
    width = maxWidth;
    height = Math.max(1, Math.round(height * scale));
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas error");

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const rgba = ctx.getImageData(0, 0, width, height).data;

  const rgb = new Uint8Array(width * height * 3);

  for (let i = 0, j = 0; i < rgba.length; i += 4) {
    rgb[j++] = rgba[i];
    rgb[j++] = rgba[i + 1];
    rgb[j++] = rgba[i + 2];
  }

  if (rgb.length !== width * height * 3) {
    throw new Error("Pixel mismatch");
  }

  return { pixels: rgb, width, height };
};

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="chat-layout">
      {/* ── Sidebar ── */}
      <div className={`chat-sidebar ${showSidebar ? 'open' : ''}`}>
        <div className="sidebar-header">
           <button className="new-chat-btn" onClick={handleNewChat}>
             <FiPlus style={{ marginRight: '6px' }} /> New Chat
           </button>
           <button className="close-sidebar-btn" onClick={() => setShowSidebar(false)}>
             <FiX />
           </button>
        </div>
        <div className="sidebar-content">
          <div className="history-header">
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><FiFolder /> Chat History</span>
          </div>
          {history.length === 0 ? (
            <p className="history-empty">No saved sessions yet.</p>
          ) : (
            <ul className="history-list">
              {history.map((s) => (
                <li key={s.id} className="history-item">
                  <button className="history-load" onClick={() => loadSession(s)}>
                    <span className="history-preview">{s.preview}</span>
                    <span className="history-time">{formatTime(s.timestamp)}</span>
                  </button>
                  <button className="history-delete" onClick={() => deleteSession(s.id)} title="Delete"><FiTrash2 size={14} /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="chat-panel tab-panel" style={{ display: quizState.active ? 'none' : 'flex' }}>

      {/* ── Header ── */}
      <div className="chat-header">
        <div className="chat-header-actions" style={{ marginRight: '10px', display: 'flex', gap: '10px' }}>
          <button
            className="icon-btn"
            title="Toggle sidebar"
            onClick={toggleSidebar}
          >
            <FiMenu size={20} />
          </button>
          <button
            onClick={() => navigate('/profile')}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px', 
              background: 'transparent', 
              border: '1px solid var(--border-color, #334155)', 
              borderRadius: '20px', 
              padding: '6px 14px', 
              fontSize: '0.85rem',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontWeight: 500,
              transition: 'background 0.2s ease'
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            ⬅ Back to Profile
          </button>
        </div>
        
        <div className="chat-header-title">
          <h1 className="chat-title">Adaptive AI Learning</h1>
          <p className="chat-subtitle">Private · Offline · Smart</p>
        </div>

        <div className="chat-header-actions">
          {/* Profile Level Badge */}
          <div className="profile-badge" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-secondary)', padding: '6px 14px', borderRadius: '16px', marginRight: '10px', fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Lvl {profile.level}</span>
            <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{profile.totalXP} XP</span>
            <span style={{ fontWeight: 'bold', color: '#f97316' }}>🔥 {profile.streak}</span>
          </div>
          {/* Username badge */}
          {user && (
            <span className="user-badge" title={user.email}>
              <FiUser size={13} style={{ marginRight: '4px' }} />
              {user.username}
            </span>
          )}
          {/* Theme toggle */}
          <button
            className="icon-btn theme-toggle"
            title="Toggle theme"
            onClick={toggleTheme}
            style={{ transition: 'transform 0.5s ease', transform: theme === 'dark' ? 'rotate(0deg)' : 'rotate(180deg)' }}
          >
            {theme === 'dark' ? <FiMoon size={20} /> : <FiSun size={20} />}
          </button>
        </div>
      </div>

      {/* ── Model Banner ── */}
      <ModelBanner
        state={loader.state}
        progress={loader.progress}
        error={loader.error}
        onLoad={loader.ensure}
        label="LLM"
      />

      {/* ── Messages ── */}
      <div className="message-list" ref={listRef}>
        {messages.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon"><FiMessageSquare size={40} style={{ opacity: 0.8 }} /></div>
            <h3>Start a conversation</h3>
            <p>Ask a question, paste notes to summarize, or generate a quiz</p>
            <div className="empty-chips">
              <span onClick={() => setInput('What is React?')} className="empty-chip">What is React?</span>
              <span onClick={() => setInput('Explain machine learning')} className="empty-chip">Explain ML</span>
              <span onClick={() => setInput('What is an API?')} className="empty-chip">What is an API?</span>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`message message-${msg.role}`}>
            <div className="message-bubble">
              {msg.role === 'assistant' ? (
                <div className="markdown-content">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text || '...'}</ReactMarkdown>
                </div>
              ) : (
                <>
                  {msg.imagePreview && (
                    <div style={{ marginBottom: '8px' }}>
                      <img src={msg.imagePreview} alt="Uploaded" style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '8px' }} />
                    </div>
                  )}
                  <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                    {msg.text || '...'}
                  </p>
                </>
              )}
              {msg.role === 'assistant' && msg.text && !msg.text.startsWith('Generating') && (
                <div className="message-actions">
                  <button
                    className={`copy-btn${copiedIndex === i ? ' copied' : ''}`}
                    onClick={() => handleCopy(msg.text, i)}
                  >
                    {copiedIndex === i ? <><FiCheck style={{marginRight:'4px'}}/> Copied</> : <><FiCopy style={{marginRight:'4px'}}/> Copy</>}
                  </button>
                  {msg.stats && (
                    <span className="message-stats">
                      {msg.stats.tokens} tok · {msg.stats.tokPerSec.toFixed(1)} tok/s · {(msg.stats.latencyMs / 1000).toFixed(1)}s
                    </span>
                  )}
                </div>
              )}
              {msg.role === 'assistant' && msg.text && !msg.text.startsWith('Generating') && msg.type === 'explanation' && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                  <button 
                    onClick={() => {
                        const prevMsg = messages[i - 1];
                        const topic = prevMsg?.role === 'user' ? prevMsg.text : 'General Knowledge';
                        handleQuizGenerate(topic);
                    }}
                    className="btn-quiz"
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '8px', 
                      padding: '10px 20px', 
                      borderRadius: '999px',
                      fontWeight: 'bold',
                      fontSize: '0.9rem',
                      color: '#fff',
                      cursor: 'pointer',
                      boxShadow: '0 0 15px rgba(245, 158, 11, 0.4)',
                      transition: 'all 0.3s ease',
                      border: 'none',
                      marginTop: '15px'
                    }}
                  >
                    👉 Start Quiz
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Input Bar ── */}
      <div className="input-bar" style={{ display: 'flex', flexDirection: 'column' }}>
        {imageBase64 && (
          <div className="image-preview-container" style={{ position: 'relative', margin: '0 10px 10px 10px', display: 'inline-block', width: 'fit-content' }}>
            <img src={imageBase64} alt="Preview" style={{ height: '80px', borderRadius: '8px', border: '2px solid var(--border-color)', objectFit: 'cover' }} />
            <button
              onClick={removeImage}
              style={{ position: 'absolute', top: '-8px', right: '-8px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <FiX size={14} />
            </button>
          </div>
        )}
        <form
          className="input-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (actionMode === 'summarize') handleSummarize();
            else send();
          }}
        >
          <button
            type="button"
            className="icon-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Upload Image"
            disabled={generating}
            style={{ padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <FiPlus size={20} />
          </button>
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleImageChange}
          />
          <select
            value={actionMode}
            onChange={(e) => setActionMode(e.target.value as any)}
            disabled={generating}
            className="level-select"
          >
            <option value="chat">Ask</option>
            <option value="summarize">Summarize</option>
          </select>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as 'Beginner' | 'Intermediate' | 'Advanced')}
            disabled={generating}
            className="level-select"
          >
            <option value="Beginner">Beginner</option>
            <option value="Intermediate">Intermediate</option>
            <option value="Advanced">Advanced</option>
          </select>

          <input
            type="text"
            className="chat-input-field"
            placeholder="Ask anything or start learning..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={generating}
          />

          {generating && (
            <div style={{ display: 'flex', gap: '4px', margin: '0 10px', alignItems: 'center' }}>
               <span className="dot-anim" style={{width: '6px', height: '6px', backgroundColor: 'var(--highlight-accent)', borderRadius: '50%', animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '-0.32s'}}></span>
               <span className="dot-anim" style={{width: '6px', height: '6px', backgroundColor: 'var(--primary)', borderRadius: '50%', animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '-0.16s'}}></span>
               <span className="dot-anim" style={{width: '6px', height: '6px', backgroundColor: 'var(--highlight-accent)', borderRadius: '50%', animation: 'bounce 1.4s infinite ease-in-out both'}}></span>
            </div>
          )}

          <style dangerouslySetInnerHTML={{__html: `
            @keyframes bounce {
              0%, 80%, 100% { transform: scale(0); }
              40% { transform: scale(1); }
            }
          `}} />

          {generating ? (
            <button type="button" className="btn btn-stop" onClick={handleCancel}>
              <FiStopCircle style={{marginRight: '6px'}} /> Stop
            </button>
          ) : (
            <>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!input.trim() && !image}
              >
                Send
              </button>
            </>
          )}
        </form>
      </div>
      </div>

      {quizState.active && (
        <div className="quiz-panel tab-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px', alignItems: 'center', justifyContent: 'center' }}>
          {generating ? (
            <div className="empty-state">
              <div className="empty-icon"><FiMessageSquare size={40} style={{ opacity: 0.8 }} /></div>
              <h3>Generating Quiz...</h3>
              <p>Preparing 3 questions based on your topic</p>
            </div>
          ) : quizState.questions.length === 0 ? (
            <div className="empty-state">
              <h3>Could not load quiz</h3>
              <button className="btn btn-primary" onClick={() => setQuizState(p => ({...p, active: false}))}>Return to Chat</button>
            </div>
          ) : quizState.completed ? (
            <div className="quiz-completed" style={{ maxWidth: '400px', width: '100%', textAlign: 'center', background: 'var(--bg-secondary)', padding: '30px', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
               <h2 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Quiz Completed!</h2>
               <div style={{ fontSize: '1.2rem', marginBottom: '2rem', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                 <p style={{ margin: 0 }}>Score: <strong>{quizState.score} / {quizState.questions.length}</strong></p>
                 <p style={{ margin: 0 }}>Points Earned: <strong style={{ color: '#22c55e' }}>+{quizState.points}</strong></p>
                 <p style={{ margin: 0 }}>Accuracy: <strong>{Math.round((quizState.score / quizState.questions.length) * 100)}%</strong></p>
                 <p style={{ margin: 0 }}>Level Status: <strong>Level {profile.level}</strong></p>
                 <p style={{ marginTop: '15px', fontSize: '1.4rem', fontStyle: 'italic', color: 'var(--primary-color)' }}>
                   {quizState.score === 3 ? "Excellent 🔥" : quizState.score === 2 ? "Good 👍" : "Keep practicing 💪"}
                 </p>
               </div>
               <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                 <button onClick={() => navigate('/profile')} className="btn btn-primary" style={{ padding: '10px 20px', fontSize: '1.1rem' }}>🏠 Back to Profile</button>
                 <button onClick={() => setQuizState(p => ({
                   ...p, 
                   completed: false, 
                   currentQuestion: 0, 
                   score: 0, 
                   points: 0, 
                   userAnswers: [], 
                   timeLeft: 30, 
                   timerActive: true, 
                   showFeedback: false
                 }))} className="btn btn-secondary" style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '10px 20px', borderRadius: '4px', cursor: 'pointer', fontSize: '1.1rem' }}>Retry Questions</button>
               </div>
            </div>
          ) : (
            <div className="quiz-active" style={{ maxWidth: '600px', width: '100%', background: 'var(--bg-secondary, #1e1e2e)', padding: '30px', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
               {/* Progress bar */}
               <div style={{ width: '100%', height: '6px', background: 'var(--bg-primary)', borderRadius: '3px', marginBottom: '20px', overflow: 'hidden' }}>
                 <div style={{ width: `${(quizState.currentQuestion / quizState.questions.length) * 100}%`, height: '100%', background: 'var(--primary-color)', transition: 'width 0.3s ease' }} />
               </div>

               <div className="quiz-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                 <span>Q{quizState.currentQuestion + 1} of {quizState.questions.length}</span>
                 <span style={{ color: quizState.timeLeft <= 5 ? '#ef4444' : 'inherit', fontWeight: quizState.timeLeft <= 5 ? 'bold' : 'normal' }}>
                   <FiStopCircle style={{display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom'}}/> 
                   Time: {quizState.timeLeft}s
                 </span>
                 <span style={{ fontWeight: 'bold', position: 'relative' }}>
                    +{quizState.points} XP
                    {xpPopup && (
                      <span style={{
                        position: 'absolute',
                        right: 0,
                        top: '-20px',
                        color: '#4ade80',
                        fontWeight: 'bold',
                        fontSize: '1.2rem',
                        animation: 'floatUp 1s ease-out',
                        pointerEvents: 'none',
                        zIndex: 10
                      }}>+{xpPopup} XP</span>
                    )}
                 </span>
               </div>
               
               <style dangerouslySetInnerHTML={{__html: `
                 @keyframes floatUp {
                   0% { opacity: 1; transform: translateY(0) scale(1.2); }
                   100% { opacity: 0; transform: translateY(-30px) scale(1); }
                 }
               `}} />

               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--primary-color)', fontWeight: 'bold' }}>Topic: {quizState.topic || 'General'}</span>
               </div>

               <h3 style={{ fontSize: '1.4rem', marginBottom: '25px', lineHeight: '1.4' }}>{quizState.questions[quizState.currentQuestion].question}</h3>
               
               {!quizState.showFeedback ? (
                 <div className="quiz-input-section" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                   <input 
                     type="text" 
                     value={quizState.userAnswerInput}
                     onChange={(e) => setQuizState(p => ({...p, userAnswerInput: e.target.value}))}
                     onKeyDown={(e) => { if (e.key === 'Enter') handleQuizSubmit(); }}
                     placeholder="Type your answer here..."
                     className="chat-input-field"
                     style={{ padding: '12px', fontSize: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                     autoFocus
                   />
                   <button onClick={handleQuizSubmit} className="btn btn-primary" style={{ padding: '12px', fontSize: '1rem', fontWeight: 'bold' }} disabled={!quizState.userAnswerInput.trim()}>Submit Answer</button>
                 </div>
               ) : (
                 <div className="quiz-feedback" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    {quizState.isCorrect ? (
                      <div className="feedback correct" style={{ padding: '15px', background: 'rgba(34, 197, 94, 0.1)', borderLeft: '4px solid #22c55e', borderRadius: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <h4 style={{ color: '#22c55e', margin: 0, fontSize: '1.1rem' }}>✅ Correct!</h4>
                          <span style={{ color: '#22c55e', fontWeight: 'bold' }}>+10 pts</span>
                        </div>
                        <p style={{ margin: 0, lineHeight: '1.4' }}>{quizState.questions[quizState.currentQuestion].explanation}</p>
                      </div>
                    ) : (
                      <div className="feedback wrong" style={{ padding: '15px', background: 'rgba(239, 68, 68, 0.1)', borderLeft: '4px solid #ef4444', borderRadius: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <h4 style={{ color: '#ef4444', margin: 0, fontSize: '1.1rem' }}>❌ Wrong!</h4>
                          <span style={{ color: '#ef4444', fontWeight: 'bold' }}>+0 pts</span>
                        </div>
                        <p style={{ margin: '0 0 8px 0', lineHeight: '1.4' }}><strong>Correct Answer:</strong> {quizState.questions[quizState.currentQuestion].answer}</p>
                        <p style={{ margin: 0, lineHeight: '1.4' }}><strong>Explanation:</strong> {quizState.questions[quizState.currentQuestion].explanation}</p>
                      </div>
                    )}
                    <button onClick={handleQuizNext} className="btn btn-primary" style={{ padding: '12px', fontSize: '1rem', marginTop: '10px' }}>
                      {quizState.currentQuestion === quizState.questions.length - 1 ? 'Finish Quiz & Claim Points' : 'Next Question'}
                    </button>
                 </div>
               )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
