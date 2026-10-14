export type Prefs = {
  email: string; topics: string[]; newsAlerts?: string[];
  alerts: { symbol: string; below: number }[];
};
export function validatePrefs(value: unknown): Prefs {
  const p = value as Prefs;
  if (!p || typeof p.email !== "string" || p.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) throw new Error("Enter a valid email address.");
  if (!Array.isArray(p.topics) || p.topics.length < 1 || p.topics.length > 20 || p.topics.some(t => typeof t !== "string" || !t.trim() || t.length > 80)) throw new Error("Choose 1–20 topics, at most 80 characters each.");
  const topics = [...new Set(p.topics.map(t => t.trim()))];
  if (topics.length !== p.topics.length) throw new Error("Remove duplicate topics.");
  if (!Array.isArray(p.alerts) || p.alerts.length > 5 || p.alerts.some(a => !a || typeof a.symbol !== "string" || !/^[A-Z0-9.:-]{1,20}$/.test(a.symbol) || typeof a.below !== "number" || !Number.isFinite(a.below) || a.below <= 0)) throw new Error("Enter a valid symbol and a positive alert threshold.");
  const newsAlerts=p.newsAlerts??[];
  if(!Array.isArray(newsAlerts)||newsAlerts.length>5||newsAlerts.some(t=>typeof t!=="string"||!t.trim()||t.length>80)) throw new Error("Choose at most five news alert queries.");
  return {email: p.email.trim().toLowerCase(), topics, alerts: p.alerts, newsAlerts: [...new Set(newsAlerts.map(t=>t.trim()))]};
}
