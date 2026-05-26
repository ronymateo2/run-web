import { useState, useEffect } from "react";
import { getDb, type Database } from "../../db/client";

export function useDb(): Database | null {
  const [db, setDb] = useState<Database | null>(null);
  useEffect(() => {
    getDb().then(d => setDb(d)).catch(console.error);
  }, []);
  return db;
}
