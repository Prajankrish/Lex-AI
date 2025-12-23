// frontend/src/types.ts
export interface Message {
  role: 'user' | 'assistant';
  content: string;
  metadata?: any; // optional metadata for assistant messages
}

export interface ChatResponse {
  markdown: string;
  metadata?: {
    tldr?: string;
    short_answer?: string;
    sections?: string[];
    penalties?: string[];
    key_points?: string[];
    examples?: string[];
    detailed?: string;
  };
  sessionId?: string;
  title?: string;
}

export interface ChatRequest {
  message: string;
  userId: string;
  sessionId?: string;
}

export interface User {
  id: string;
  name: string;
  avatar?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  timestamp: number;
}

export interface HistoryGroup {
  label: string;
  sessions: ChatSession[];
}
