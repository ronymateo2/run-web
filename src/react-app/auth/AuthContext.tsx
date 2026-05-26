import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { GoogleOAuthProvider, GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { getDb, queryOne, exec } from "../../db/client";
import { pullDelta, pushDelta } from "../../db/sync";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8787";
const LS_KEY = "rurana_session";

export interface AuthUser {
  id: string; email: string; name: string; avatar_url?: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  GoogleSignInButton: () => React.ReactElement;
  signOut: () => void;
}

const AuthContext = createContext<AuthState>({
  user: null, token: null, loading: true,
  GoogleSignInButton: () => <></>,
  signOut: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

function AuthProviderInner({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session from local SQLite on mount, with localStorage fallback
  useEffect(() => {
    (async () => {
      try {
        const db = await getDb();
        let row = await queryOne<{ id: string; email: string; name: string; avatar_url: string; jwt: string }>(
          db, `SELECT id, email, name, avatar_url, jwt FROM users LIMIT 1`
        );

        // localStorage fallback: OPFS may be in-memory (cleared on refresh)
        if (!row?.jwt) {
          const saved = localStorage.getItem(LS_KEY);
          if (saved) {
            const parsed = JSON.parse(saved) as { user: AuthUser; jwt: string };
            await exec(db, `
              INSERT INTO users (id, email, name, avatar_url, jwt, last_sync, created_at)
              VALUES (?, ?, ?, ?, ?, 0, ?)
              ON CONFLICT(id) DO UPDATE SET name = excluded.name, avatar_url = excluded.avatar_url, jwt = excluded.jwt
            `, [parsed.user.id, parsed.user.email, parsed.user.name, parsed.user.avatar_url ?? null, parsed.jwt, Date.now()]);
            row = { ...parsed.user, jwt: parsed.jwt };
          }
        }

        if (row?.jwt) {
          // Pull before setLoading(false) so HomeScreen renders with data already in SQLite.
          if (navigator.onLine) await pullDelta(db, row.jwt).catch(() => {});
          setUser({ id: row.id, email: row.email, name: row.name, avatar_url: row.avatar_url });
          setToken(row.jwt);
          if (navigator.onLine) pushDelta(db, row.jwt).catch(() => {});
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleGoogleSuccess = useCallback(async (credentialResponse: CredentialResponse) => {
    const idToken = credentialResponse.credential;
    if (!idToken) return;

    const apiRes = await fetch(`${API_BASE}/api/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_token: idToken }),
    });
    if (!apiRes.ok) { console.error("Auth failed"); return; }

    const { token: jwt, user: apiUser } = await apiRes.json() as { token: string; user: AuthUser };

    const db = await getDb();
    await exec(db, `
      INSERT INTO users (id, email, name, avatar_url, jwt, last_sync, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, avatar_url = excluded.avatar_url, jwt = excluded.jwt
    `, [apiUser.id, apiUser.email, apiUser.name, apiUser.avatar_url ?? null, jwt, Date.now()]);

    localStorage.setItem(LS_KEY, JSON.stringify({ user: apiUser, jwt }));
    if (navigator.onLine) await pullDelta(db, jwt).catch(() => {});
    setUser(apiUser);
    setToken(jwt);
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
    const db = await getDb();
    await exec(db, `UPDATE users SET jwt = NULL`);
    localStorage.removeItem(LS_KEY);
    setUser(null);
    setToken(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, GoogleSignInButton, signOut }}>
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
