import { useState, useEffect } from "react";
import { getDrizzle, type DrizzleDb } from "../../db/drizzle";

export function useDb(): DrizzleDb | null {
  const [db, setDb] = useState<DrizzleDb | null>(null);
  useEffect(() => {
    getDrizzle().then(setDb).catch(console.error);
  }, []);
  return db;
}
