import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { GoogleOAuthProvider, GoogleLogin, googleLogout, type CredentialResponse } from "@react-oauth/google";
import { exec } from "../../db/client";
import { getDrizzle } from "../../db/drizzle";
import { getSessionUser } from "../../db/queries/users";
import { pullDelta, pushDelta } from "../../db/sync";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8787";
const LS_KEY = "rurana_session";

export interface AuthUser {
  id: string; email: string; name: string; avatar_url?: string; timezone?: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  signingIn: boolean;
  lastSyncAt: number;
  GoogleSignInButton: () => React.ReactElement;
  signOut: () => void;
  setTimezone: (tz: string) => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null, token: null, loading: true, signingIn: false, lastSyncAt: 0,
  GoogleSignInButton: () => <></>,
  signOut: () => {},
  setTimezone: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

function AuthProviderInner({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const drizzleDb = await getDrizzle();
        let row = await getSessionUser(drizzleDb);

        if (!row) {
          const saved = localStorage.getItem(LS_KEY);
          if (saved) {
            const parsed = JSON.parse(saved) as { user: AuthUser };
            await exec(`
              INSERT INTO users (id, email, name, avatar_url, last_sync, created_at)
              VALUES (?, ?, ?, ?, 0, ?)
              ON CONFLICT(id) DO UPDATE SET name = excluded.name, avatar_url = excluded.avatar_url
            `, [parsed.user.id, parsed.user.email, parsed.user.name, parsed.user.avatar_url ?? null, Date.now()]);
            row = await getSessionUser(drizzleDb);
          }
        }

        // Session lives in the httpOnly cookie (not JS-readable). A stored profile
        // means "optimistically signed in"; if the cookie expired, sync calls 401
        // and silently no-op until the user signs in again.
        if (row?.id) {
          setUser({
            id: row.id,
            email: row.email ?? '',
            name: row.name ?? '',
            avatar_url: row.avatar_url ?? undefined,
            timezone: row.timezone ?? undefined,
          });
          setToken(row.id); // presence marker only; not a credential
          setLoading(false);
          if (navigator.onLine) {
            pullDelta()
              .then(() => setLastSyncAt(Date.now()))
              .catch(() => {});
            pushDelta().catch(() => {});
          }
          return;
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleGoogleSuccess = useCallback(async (credentialResponse: CredentialResponse) => {
    const idToken = credentialResponse.credential;
    if (!idToken) return;
    setSigningIn(true);
    try {
      const apiRes = await fetch(`${API_BASE}/api/auth/google`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_token: idToken }),
      });
      if (!apiRes.ok) { console.error("Auth failed"); return; }

      const { user: apiUser } = await apiRes.json() as { user: AuthUser & { timezone?: string | null } };

      const timezone = apiUser.timezone ?? null;
      await exec(`
        INSERT INTO users (id, email, name, avatar_url, timezone, last_sync, created_at)
        VALUES (?, ?, ?, ?, ?, 0, ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, avatar_url = excluded.avatar_url, timezone = COALESCE(excluded.timezone, timezone)
      `, [apiUser.id, apiUser.email, apiUser.name, apiUser.avatar_url ?? null, timezone, Date.now()]);

      const userWithTz: AuthUser = { ...apiUser, timezone: timezone ?? undefined };
      localStorage.setItem(LS_KEY, JSON.stringify({ user: userWithTz }));
      setUser(userWithTz);
      setToken(apiUser.id); // presence marker only; the JWT is the httpOnly cookie
      if (navigator.onLine) {
        pullDelta()
          .then(() => setLastSyncAt(Date.now()))
          .catch(() => {});
      }
    } finally {
      setSigningIn(false);
    }
  }, []);

  const GoogleSignInButton = useCallback(() => (
    <GoogleLogin
      onSuccess={handleGoogleSuccess}
      onError={() => console.error("Google login failed")}
      theme="filled_black"
      size="large"
      text="signin_with"
      shape="pill"
    />
  ), [handleGoogleSuccess]);

  const signOut = useCallback(async () => {
    googleLogout();
    // Clear the httpOnly cookie server-side, then drop local state.
    try {
      await fetch(`${API_BASE}/api/auth/logout`, { method: "POST", credentials: "include" });
    } catch {
      // ignore network errors; clear local state regardless
    }
    await exec(`UPDATE users SET jwt = NULL`);
    localStorage.removeItem(LS_KEY);
    setUser(null);
    setToken(null);
  }, []);

  const setTimezone = useCallback(async (tz: string) => {
    await exec(`UPDATE users SET timezone = ?`, [tz]);
    setUser(prev => prev ? { ...prev, timezone: tz } : prev);
    if (navigator.onLine && token) {
      fetch(`${API_BASE}/api/users/me`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: tz }),
      }).catch(() => {});
    }
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, loading, signingIn, lastSyncAt, GoogleSignInButton, signOut, setTimezone }}>
      {children}
    </AuthContext.Provider>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProviderInner>{children}</AuthProviderInner>
    </GoogleOAuthProvider>
  );
}
