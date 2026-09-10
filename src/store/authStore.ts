import { create } from 'zustand';
import { useFilterStore } from './filterStore';
import type { OfficerAccount } from '../data/officers';

const STORAGE_KEY = 'jaldrishti_demo_officer';
const TOKEN_KEY = 'jaldrishti_auth_token';
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// Single-account prototype, restricted to the Dungarpur District Watershed
// Officer (see server/data/users.json). The backend login *username*
// ('patel') is intentionally distinct from the frontend officer record's
// id ('dungarpur', used for district-scoping elsewhere in the app) — this
// constant is the actual credential sent to POST /api/auth/login, not
// derived from officer.id.
const DUNGARPUR_LOGIN_USERNAME = 'patel';
const DUNGARPUR_LOGIN_PASSWORD = 'Patel@123'; // matches server/data/users.json bcrypt hash

interface AuthState {
  officer: OfficerAccount | null;
  token: string | null;
  authMode: 'real' | null; // 'real' once genuinely authenticated by the backend
  login: (officer: OfficerAccount) => Promise<void>;
  logout: () => void;
}

function loadStoredOfficer(): OfficerAccount | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as OfficerAccount) : null;
  } catch {
    return null;
  }
}

function loadStoredToken(): string | null {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export const useAuthStore = create<AuthState>((set) => ({
  // A stored officer with no token is a stale/invalid session (from a
  // previous demo-mode build) — don't treat it as logged in.
  officer: loadStoredToken() ? loadStoredOfficer() : null,
  token: loadStoredToken(),
  authMode: loadStoredToken() ? 'real' : null,

  login: async (officer) => {
    // Real backend authentication only — bcrypt-verified password, signed
    // JWT. No silent fallback: if the backend is unreachable or rejects
    // the login, this throws and the caller (Login.tsx) shows a clear
    // error rather than quietly dropping into an unauthenticated demo
    // session.
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: DUNGARPUR_LOGIN_USERNAME, password: DUNGARPUR_LOGIN_PASSWORD }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || `Login failed (${res.status}). Is the backend server running?`);
    }

    const data = await res.json();
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(officer));
      sessionStorage.setItem(TOKEN_KEY, data.token);
    } catch { /* ignore */ }
    set({ officer, token: data.token, authMode: 'real' });
    // District scoping is synced reactively in App.tsx (covers both fresh
    // logins and page reloads that rehydrate the officer from sessionStorage).
  },

  logout: () => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
    } catch { /* ignore */ }
    useFilterStore.getState().resetFilters();
    set({ officer: null, token: null, authMode: null });
  },
}));
