import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import type { Prefs } from "./message";
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export const token = () => randomBytes(32).toString("hex");
const file = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "chainbrief.sqlite");
let connection: DatabaseSync | undefined;
function getConnection() {
  if(connection) return connection;
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const database=new DatabaseSync(file);
  database.exec("PRAGMA busy_timeout=5000;");
  database.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS users(address TEXT PRIMARY KEY, prefs TEXT NOT NULL, verified INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1, verify_hash TEXT, verify_expires INTEGER, unsubscribe_hash TEXT, next_newsletter INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS challenges(id TEXT PRIMARY KEY, address TEXT NOT NULL, message TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, address TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS state(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, address TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', due INTEGER NOT NULL, lease INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0, first_attempt INTEGER NOT NULL DEFAULT 0, provider_id TEXT, error TEXT, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS jobs_due ON jobs(status, due);
`);
  connection=database;return database;
}
// Lazy opening keeps build-time module evaluation free of database writes.
export const db=new Proxy({} as DatabaseSync, {get(_target,key) {
  const database=getConnection();
  const value=Reflect.get(database,key);
  return typeof value==="function"?value.bind(database):value;
}});
export type User = {address: string; prefs: string; verified: number; enabled: number; next_newsletter: number; verify_hash: string | null; verify_expires: number | null; unsubscribe_hash: string | null};
export const getUser = (address: string) => db.prepare("SELECT * FROM users WHERE address=?").get(address.toLowerCase()) as User | undefined;
export const users = () => db.prepare("SELECT * FROM users").all() as User[];
export const prefsOf = (user: User) => JSON.parse(user.prefs) as Prefs;
export function saveUser(address: string, prefs: Prefs) {
  db.prepare("INSERT INTO users(address,prefs) VALUES(?,?) ON CONFLICT(address) DO UPDATE SET prefs=excluded.prefs").run(address.toLowerCase(), JSON.stringify(prefs));
}
export const getState = (key: string) => (db.prepare("SELECT value FROM state WHERE key=?").get(key) as {value: string} | undefined)?.value;
export const setState = (key: string, value: string) => db.prepare("INSERT INTO state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key,value);
export function transaction<T>(f: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {const result = f(); db.exec("COMMIT"); return result;} catch (e) {db.exec("ROLLBACK"); throw e;}
}
export function lock(name: string, seconds = 240) {
  return transaction(() => {
    const key = `lock:${name}`;
    if (Number(getState(key) ?? 0) > Date.now()) return false;
    setState(key, String(Date.now() + seconds * 1000)); return true;
  });
}
export const unlock = (name: string) => setState(`lock:${name}`, "0");
export function rateLimit(key: string, limit = 10, windowMs = 600_000) {
  return transaction(() => {
    const now = Date.now();
    const old = JSON.parse(getState(`rate:${key}`) ?? '{"count":0,"expires":0}');
    const value = old.expires > now ? old : {count: 0, expires: now + windowMs};
    if (value.count >= limit) return false;
    value.count++; setState(`rate:${key}`, JSON.stringify(value)); return true;
  });
}
export type Mail = {to: string; subject: string; text: string};
export function queue(id: string, address: string, kind: string, payload: Mail) {
  const now = Date.now();
  db.prepare("INSERT OR IGNORE INTO jobs(id,address,kind,payload,due,created) VALUES(?,?,?,?,?,?)").run(id,address,kind,JSON.stringify(payload),now,now);
}
