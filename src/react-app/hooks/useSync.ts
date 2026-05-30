import { useCallback } from "react";
import { useAuth } from "../auth/AuthContext";
import { pushDelta } from "../../db/sync";

export function useSync() {
  const { token } = useAuth();

  return useCallback(async () => {
    if (!token) return;
    await pushDelta().catch(() => {});
  }, [token]);
}
