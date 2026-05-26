import { useCallback } from "react";
import { useAuth } from "../auth/AuthContext";
import { useDb } from "./useDb";
import { pushDelta } from "../../db/sync";

export function useSync() {
  const { token } = useAuth();
  const db = useDb();

  return useCallback(async () => {
    if (!db || !token) return;
    await pushDelta(db, token).catch(() => {});
  }, [db, token]);
}
