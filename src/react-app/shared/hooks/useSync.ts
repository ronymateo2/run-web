import { useCallback } from "react";
import { useAuth } from "@features/auth/AuthContext";
import { pushDelta } from "@data/sync";

export function useSync() {
  const { token } = useAuth();

  return useCallback(async () => {
    if (!token) return;
    await pushDelta().catch(() => {});
  }, [token]);
}
