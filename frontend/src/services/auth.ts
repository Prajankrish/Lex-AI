// frontend/src/services/auth.ts
// Auth service supporting Google OAuth and Email authentication

import type { User } from "@/types";

const USER_STORAGE_KEY = "lexai_user";
const TOKEN_STORAGE_KEY = "lexai_token";

function isLocalStorageAvailable(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
  } catch {
    return false;
  }
}

/**
 * Google OAuth login - exchange token for user
 */
export async function loginWithGoogle(googleToken: string): Promise<User> {
  try {
    const response = await fetch('/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: googleToken })
    });

    if (!response.ok) {
      throw new Error('Google authentication failed');
    }

    const data = await response.json();
    const user: User = {
      id: data.user_id,
      name: data.name,
      avatar: data.avatar,
    };

    if (isLocalStorageAvailable()) {
      try {
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
        localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      } catch (err) {
        console.error("Failed to save to localStorage", err);
      }
    }

    return user;
  } catch (err) {
    console.error("Google login error:", err);
    throw err;
  }
}

/**
 * Email login with magic link or password
 */
export async function loginWithEmail(email: string, password?: string): Promise<User> {
  try {
    const response = await fetch('/auth/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
      throw new Error('Email authentication failed');
    }

    const data = await response.json();
    const user: User = {
      id: data.user_id,
      name: data.name,
      avatar: data.avatar,
    };

    if (isLocalStorageAvailable()) {
      try {
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
        localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      } catch (err) {
        console.error("Failed to save to localStorage", err);
      }
    }

    return user;
  } catch (err) {
    console.error("Email login error:", err);
    throw err;
  }
}

/**
 * Demo/local login for testing (no backend required)
 */
export function demoLogin(email: string): User {
  const user: User = {
    id: email,
    name: email.includes("@") ? email.split("@")[0] : email,
    avatar: undefined,
  };

  if (isLocalStorageAvailable()) {
    try {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    } catch (err) {
      console.error("Failed to write localStorage", err);
    }
  }

  return user;
}

/** Remove stored user (logout) */
export function logout(): void {
  if (!isLocalStorageAvailable()) return;
  try {
    localStorage.removeItem(USER_STORAGE_KEY);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch (err) {
    console.error("logout: failed to remove localStorage", err);
  }
}

/** Return current user or null */
export function getCurrentUser(): User | null {
  if (typeof window === "undefined") return null;
  if (!isLocalStorageAvailable()) return null;
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<User> | null;
    // Validate fields
    if (!parsed || typeof parsed.id !== "string" || !parsed.id.trim()) return null;
    if (!parsed.name || typeof parsed.name !== "string") return null;
    return { id: parsed.id, name: parsed.name, avatar: (parsed as any).avatar };
  } catch (err) {
    console.error("getCurrentUser: failed to parse localStorage value", err);
    return null;
  }
}

/** Get stored auth token */
export function getAuthToken(): string | null {
  if (!isLocalStorageAvailable()) return null;
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}
