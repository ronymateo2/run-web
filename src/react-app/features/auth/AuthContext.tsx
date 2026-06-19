import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { GoogleOAuthProvider, GoogleLogin, googleLogout, type CredentialResponse } from "@react-oauth/google";
import { userRepository } from "../../data/repositories";
import { pullDelta, syncNow } from "../../data/sync";
import { api } from "../../api/client";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
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
        let row = await userRepository.getSessionUser();

        if (!row) {
          const saved = localStorage.getItem(LS_KEY);
          if (saved) {
            const parsed = JSON.parse(saved) as { user: AuthUser };
            await userRepository.upsertUser(parsed.user);
            row = await userRepository.getSessionUser();
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
            // Push pending local mutations first, then pull the merged state.
            syncNow()
              .then(() => setLastSyncAt(Date.now()))
              .catch(() => {});
          }
          return;
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Auto-sync: reconnect and tab-refocus both push pending mutations and pull the
  // latest state, so offline work ships as soon as it can instead of waiting for
  // the next app open. Debounced — visibility flaps must not hammer the API.
  useEffect(() => {
    if (!user) return;
    let last = 0;
    const kick = () => {
      if (!navigator.onLine) return;
      if (Date.now() - last < 30_000) return;
      last = Date.now();
      syncNow()
        .then(() => setLastSyncAt(Date.now()))
        .catch(() => {});
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") kick();
    };
    window.addEventListener("online", kick);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", kick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user]);

  const handleGoogleSuccess = useCallback(async (credentialResponse: CredentialResponse) => {
    const idToken = credentialResponse.credential;
    if (!idToken) return;
    setSigningIn(true);
    try {
      let apiUser: AuthUser & { timezone?: string | null };
      try {
        ({ user: apiUser } = await api.post<{ user: AuthUser & { timezone?: string | null } }>(
          "/api/auth/google", { id_token: idToken },
        ));
      } catch (error) {
        console.error("Auth failed", error);
        return;
      }

      // First login won't have a server-side timezone; detect it and persist so
      // exercise/checkin dates land on the user's local day (not UTC).
      let timezone = apiUser.timezone ?? null;
      if (!timezone) {
        const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (detected) {
          timezone = detected;
          api.patch("/api/users/me", { timezone: detected }).catch(() => {});
        }
      }
      await userRepository.upsertUser({
        id: apiUser.id,
        email: apiUser.email,
        name: apiUser.name,
        avatar_url: apiUser.avatar_url ?? null,
        timezone,
      });

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
      await api.post("/api/auth/logout");
    } catch {
      // ignore network errors; clear local state regardless
    }
    await userRepository.clearJwt();
    localStorage.removeItem(LS_KEY);
    setUser(null);
    setToken(null);
  }, []);

  const setTimezone = useCallback(async (tz: string) => {
    await userRepository.setTimezone(tz);
    setUser(prev => prev ? { ...prev, timezone: tz } : prev);
    if (navigator.onLine && token) {
      api.patch("/api/users/me", { timezone: tz }).catch(() => {});
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
