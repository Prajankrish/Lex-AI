// frontend/src/services/api.ts
import { API_BASE_URL } from '@/constants';
import type { ChatResponse } from '@/types';

const API_PREFIX = (() => {
  const env = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (env && env.trim().length) return env.replace(/\/+$/, '');
  return '';
})();

function buildUrl(path: string) {
  return API_PREFIX ? `${API_PREFIX}${path}` : `/api${path}`;
}

type SendPayload = {
  message: string;
  user_id: string;
  session_id?: string | null;
};

export const sendMessageToBackend = async (
  message: string,
  userId: string,
  sessionId?: string | null
): Promise<ChatResponse> => {
  const payload: SendPayload = { message, user_id: userId, session_id: sessionId ?? undefined };

  const res = await fetch(buildUrl('/chat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || `Server Error: ${res.status}`);
  }

  const data = (await res.json()) as ChatResponse & { sessionId?: string };
  // Backend may return either `markdown` or `response` field (legacy vs new).
  const markdown = (data as any).markdown ?? (data as any).response ?? "";
  return {
    markdown,
    metadata: (data as any).metadata,
    sessionId: (data as any).sessionId,
    title: (data as any).title ?? (data as any).sessionId ?? undefined,
  };
};

export const fetchUserHistory = async (userId: string) => {
  const res = await fetch(buildUrl(`/history?user_id=${encodeURIComponent(userId)}`));
  if (!res.ok) throw new Error('Failed to load history');
  const data = await res.json();
  return data.history || [];
};

export const fetchChatSession = async (userId: string, sessionId: string) => {
  const res = await fetch(buildUrl(`/chat/${encodeURIComponent(sessionId)}?user_id=${encodeURIComponent(userId)}`));
  if (!res.ok) throw new Error('Failed to load session');
  const data = await res.json();
  // messages: {role, content, metadata, timestamp}
  return data.messages || [];
};

export const deleteChatSession = async (userId: string, sessionId: string) => {
  const res = await fetch(buildUrl(`/chat/${encodeURIComponent(sessionId)}?user_id=${encodeURIComponent(userId)}`), {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to delete session');
  }
};

// Profile APIs
export type Profile = {
  user_id: string;
  name: string;
  email?: string;
  provider?: string;
  avatar?: string;
  created_at?: string;
  last_login?: string;
};

export async function getProfile(userId: string): Promise<Profile> {
  const res = await fetch(buildUrl(`/profile?user_id=${encodeURIComponent(userId)}`));
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to fetch profile');
  }
  return res.json();
}

export async function updateProfile(params: { userId: string; name?: string; oldPassword?: string; newPassword?: string; }): Promise<Profile> {
  const payload: any = { user_id: params.userId };
  if (typeof params.name === 'string') payload.name = params.name;
  if (params.oldPassword) payload.old_password = params.oldPassword;
  if (params.newPassword) payload.new_password = params.newPassword;

  const res = await fetch(buildUrl(`/profile`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to update profile');
  }
  return res.json();
}
