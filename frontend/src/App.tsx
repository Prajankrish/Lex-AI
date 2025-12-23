// frontend/src/App.tsx  (updated)
import React, { useState, useRef, useEffect } from "react";
import ChatMessage from "@/components/ChatMessage";
import Sidebar from "@/components/Sidebar";
import ProfileModal from "@/components/Profile";
import Login from "@/components/Login";
import { SendIcon, BotIcon, MenuIcon, SparklesIcon } from "@/components/Icons";
import { login, logout, getCurrentUser } from "@/services/auth";
import { sendMessageToBackend, fetchChatSession } from "@/services/api";
import type { Message, User } from "@/types";
import { INITIAL_SUGGESTIONS } from "@/constants";
import LiquidEther from "@/components/LiquidEther";

/** Small debug panel shown on the login screen to inspect localStorage / auth state */
function DebugPanel({ onForceLogin }: { onForceLogin: (email: string) => void }) {
  const [ls, setLs] = useState<string | null>(null);
  const [curr, setCurr] = useState<User | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const refresh = () => {
    try {
      setLs(window.localStorage.getItem("lexai_user"));
    } catch (e) {
      setLs("localStorage unavailable");
    }
    try {
      setCurr(getCurrentUser());
    } catch (e) {
      setCurr(null);
    }
  };

  useEffect(() => refresh(), []);

  const append = (s: string) => setLog((prev) => [s, ...prev].slice(0, 20));

  return (
    <div
      style={{
        position: "fixed",
        left: 12,
        bottom: 12,
        zIndex: 60,
        background: "rgba(17,24,39,0.92)",
        color: "#e5e7eb",
        padding: 12,
        borderRadius: 10,
        border: "1px solid rgba(250,204,21,0.12)",
        maxWidth: 420,
        fontSize: 13,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 8 }}>🔧 Auth Debug</div>

      <div style={{ marginBottom: 8 }}>
        <button
          onClick={() => {
            refresh();
            append("Refreshed");
          }}
          style={{ marginRight: 8 }}
        >
          Refresh
        </button>
        <button
          onClick={() => {
            onForceLogin("demo_user@gmail.com");
            append("Called login(demo_user@gmail.com)");
            setTimeout(refresh, 200);
          }}
          style={{ marginRight: 8 }}
        >
          Login demo_user
        </button>
        <button
          onClick={() => {
            logout();
            append("Called logout()");
            setTimeout(refresh, 200);
          }}
          style={{ marginRight: 8 }}
        >
          Logout
        </button>
        <button
          onClick={() => {
            try {
              localStorage.removeItem("lexai_user");
              append("Cleared localStorage");
            } catch (e) {
              append("clear error");
            }
            setTimeout(refresh, 200);
          }}
        >
          Clear Storage
        </button>
      </div>

      <div style={{ marginBottom: 6 }}>
        <div style={{ fontWeight: 600 }}>localStorage['lexai_user']</div>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            maxHeight: 120,
            overflow: "auto",
            padding: 6,
            background: "#0b1220",
            borderRadius: 6,
          }}
        >
          {ls ?? "—"}
        </pre>
      </div>

      <div style={{ marginBottom: 6 }}>
        <div style={{ fontWeight: 600 }}>getCurrentUser()</div>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            maxHeight: 80,
            overflow: "auto",
            padding: 6,
            background: "#0b1220",
            borderRadius: 6,
          }}
        >
          {curr ? JSON.stringify(curr, null, 2) : "null"}
        </pre>
      </div>

      <div style={{ marginTop: 6 }}>
        <div style={{ fontWeight: 600 }}>Recent actions</div>
        <div style={{ maxHeight: 80, overflow: "auto" }}>{log.map((l, i) => (<div key={i}>• {l}</div>))}</div>
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // client-only init: load user from localStorage
  useEffect(() => {
    const initAuth = () => {
      if (typeof window === "undefined") {
        setInitialized(true);
        return;
      }
      try {
        const stored = getCurrentUser();
        if (stored && typeof stored.id === "string" && stored.id.trim() && typeof stored.name === "string" && stored.name.trim()) {
          setUser(stored);
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error("Error reading stored user:", err);
        setUser(null);
      } finally {
        // allow UI to mount
        setInitialized(true);
      }
    };
    
    initAuth();
  }, []);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => { scrollToBottom(); }, [messages, loading]);

  // auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleLogin = (userId: string) => {
    console.log('🔐 handleLogin called for user:', userId);
    try {
      const stored = getCurrentUser();
      if (stored) {
        console.log("✅ User loaded from storage:", stored.name);
        setUser(stored);
      } else {
        console.error("⚠️ User not found in localStorage");
      }
    } catch (err) {
      console.error("❌ Login failed:", err);
    }
  };

  // wrapper for debug panel
  const forceLogin = (email: string) => {
    handleLogin(email);
  };

  const handleLogout = () => {
    logout();
    setUser(null);
    setMessages([]);
    setCurrentSessionId(null);
  };

  const handleLoadSession = async (sessionId: string) => {
    if (!user) return;
    setLoading(true);
    setCurrentSessionId(sessionId);
    try {
      const history = await fetchChatSession(user.id, sessionId);
      // assume history is array of Message
      setMessages(history || []);
      if (window.innerWidth < 768) setIsSidebarOpen(false);
    } catch (e) {
      console.error("Failed to load session:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSession = (deletedSessionId: string) => {
    if (currentSessionId === deletedSessionId) handleNewChat();
  };

  // send message to backend and handle assistant response with metadata
  const handleSend = async () => {
    if (!input.trim() || loading || !user) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      const data = await sendMessageToBackend(userMessage.content, user.id, currentSessionId || undefined);

      // backend expected shape: { markdown: string, metadata?: object, sessionId?: string, response?: string }
      const botContent = data.markdown || (data.response as string) || "No answer returned";
      const botMessage: Message = {
        role: "assistant",
        content: botContent,
        // attach metadata as-is (ChatMessage will render it if present)
        ...(data.metadata ? { metadata: data.metadata } : {}),
      };

      setMessages((prev) => [...prev, botMessage]);

      if (!currentSessionId && (data as any).sessionId) {
        setCurrentSessionId((data as any).sessionId);
      }
    } catch (error: any) {
      console.error("handleSend error:", error);
      let errorText = "Unable to connect to LEXAI Core. Please ensure the Python backend is running.";
      if (error && typeof error === "object" && (error.message || error.error)) {
        errorText = (error.message || error.error || errorText) as string;
      }
      const errorMessage: Message = {
        role: "assistant",
        content: `**Connection Error:** ${errorText}`,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setInput("");
    setCurrentSessionId(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  if (!initialized) {
    return (
      <div className="flex items-center justify-center w-screen h-screen bg-gradient-to-br from-charcoal-900 to-charcoal-800">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  // If not logged in, show Login
  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="flex h-screen bg-charcoal-800 font-sans text-gray-100 overflow-hidden relative">
      {/* Full-screen Liquid Ether background */}
      <div className="absolute inset-0 z-0 w-full h-full">
        <LiquidEther
          colors={['#805ad5', '#9f7aea', '#d1d5db']}
          mouseForce={20}
          cursorSize={100}
          isViscous={false}
          viscous={30}
          iterationsViscous={32}
          iterationsPoisson={32}
          resolution={0.5}
          isBounce={false}
          autoDemo={true}
          autoSpeed={0.5}
          autoIntensity={2.2}
          takeoverDuration={0.25}
          autoResumeDelay={3000}
          autoRampDuration={0.6}
        />
      </div>

      {/* Content overlay */}
      <div className="relative z-10 flex w-full h-full">
        <Sidebar
          user={user}
          onNewChat={handleNewChat}
          isOpen={isSidebarOpen}
          toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          onSelectSession={handleLoadSession}
          currentSessionId={currentSessionId}
          onLogout={handleLogout}
          onDeleteSession={handleDeleteSession}
          onOpenProfile={() => setIsProfileOpen(true)}
        />

        <div className="flex-1 flex flex-col h-full relative w-full max-w-full bg-charcoal-800/60 backdrop-blur-lg">
        <div className="sticky top-0 z-10 p-3 flex items-center justify-between md:justify-start gap-3 bg-charcoal-900/90 backdrop-blur-md border-b border-violet-900/30">
          <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 rounded-md hover:bg-zinc-800 text-zinc-400">
            <MenuIcon />
          </button>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-charcoal-700 cursor-pointer transition-colors group">
            <span className="text-lg font-semibold text-gray-100 group-hover:text-gray-50">LEXAI 1.0</span>
            <span className="text-xs bg-violet-600/30 text-violet-300 px-1.5 py-0.5 rounded font-medium border border-violet-600/50">Alpha</span>
          </div>
          <div className="ml-auto hidden md:flex items-center gap-3">
            <button
              onClick={() => setIsProfileOpen(true)}
              className="text-sm text-gray-300 hover:text-gray-100 bg-transparent px-3 py-2 rounded-md hover:bg-violet-900/20 transition-colors"
            >
              Profile
            </button>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-300 hover:text-gray-100 bg-transparent px-3 py-2 rounded-md hover:bg-violet-900/20 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scroll-smooth custom-scrollbar w-full">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center px-4 pb-20">
              <h2 className="text-2xl font-bold mb-8 text-gray-100">Hello, {user.name}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
                {INITIAL_SUGGESTIONS.map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => setInput(suggestion)}
                    className="group relative bg-charcoal-700/50 hover:bg-charcoal-700 border border-violet-900/30 hover:border-violet-700/50 rounded-xl p-4 text-sm text-left transition-all duration-200"
                  >
                    <div className="font-medium text-gray-200 mb-1 truncate">{suggestion}</div>
                    <div className="text-xs text-gray-500 group-hover:text-gray-400">Legal query</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col pb-32">
              {messages.map((msg, idx) => (<ChatMessage key={idx} message={msg} />))}
              {loading && (
                <div className="w-full max-w-3xl mx-auto p-4 md:py-6 flex gap-4 animate-pulse">
                  <div className="w-8 h-8 rounded-full bg-violet-600 text-white flex items-center justify-center border border-violet-500"><BotIcon /></div>
                  <div className="flex items-center"><span className="typing-cursor text-violet-400 font-mono text-sm">Thinking...</span></div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-charcoal-900 via-charcoal-900/95 to-transparent pt-10 pb-6 px-4">
          <div className="max-w-3xl mx-auto w-full">
            <div className="relative flex flex-col w-full bg-charcoal-700 rounded-3xl border border-violet-600/20 shadow-2xl focus-within:border-violet-500/50 transition-all overflow-hidden">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message LEXAI..."
                className="w-full bg-transparent text-gray-100 placeholder-gray-500 focus:outline-none resize-none px-4 py-4 min-h-[52px] max-h-[200px] overflow-y-auto custom-scrollbar"
                rows={1}
                style={{ paddingRight: "48px" }}
              />
              <div className="absolute bottom-3 right-3">
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || loading}
                  className={`p-2 rounded-xl transition-all duration-200 ${input.trim() && !loading ? "bg-violet-600 text-white hover:bg-violet-700 shadow-lg shadow-violet-600/50" : "bg-charcoal-600/50 text-gray-600 cursor-not-allowed"}`}
                >
                  <SendIcon />
                </button>
              </div>
            </div>
            <div className="text-center mt-2 text-[11px] text-gray-500 font-medium">LEXAI can make mistakes. Consider checking important legal information.</div>
          </div>
        </div>
        </div>
      </div>
      <ProfileModal user={user} open={isProfileOpen} onClose={() => setIsProfileOpen(false)} onUpdateLocalUser={(u) => setUser(u)} />
    </div>
  );
}

export default App;
