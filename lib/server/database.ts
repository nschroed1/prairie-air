import { env } from 'cloudflare:workers';
export const database = () => {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new Error('County storage is unavailable.');
  return db;
};
