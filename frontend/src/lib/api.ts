"use client";

import type { Location,Product } from "@/types/api";
import { useCallback,useEffect,useState } from "react";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api").replace(/\/$/, "");
const SESSION_KEY = `saqta.session.v1:${API_URL}`;
export const SESSION_EVENT = "saqta:session-updated";
export function sessionToken(): string | null {
  if (typeof window === "undefined") return null;
  try { return window.sessionStorage.getItem(SESSION_KEY); } catch { return null; }
}
export function setSessionToken(token: string | null) {
  try { if (token) window.sessionStorage.setItem(SESSION_KEY, token); else window.sessionStorage.removeItem(SESSION_KEY); }
  catch { throw new Error("Браузер не разрешает хранить сеанс. Разрешите sessionStorage для входа."); }
  window.dispatchEvent(new Event(SESSION_EVENT));
}
function authenticatedHeaders(init: RequestInit): Headers {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const token = sessionToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}
export class ApiError extends Error {
  status: number;
  rows: { row: number; message: string }[];
  constructor(message: string, status: number, rows: { row: number; message: string }[] = []) { super(message); this.name = "ApiError"; this.status = status; this.rows = rows; }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try { response = await fetch(`${API_URL}${path}`, { ...init, headers: authenticatedHeaders(init), cache: "no-store" }); }
  catch { throw new ApiError("Нет связи с сервером SAQTA. Проверьте подключение и повторите запрос.", 0); }
  if (!response.ok) {
    let detail = `Ошибка запроса (${response.status})`; let rows: { row: number; message: string }[] = [];
    try { const body = await response.json(); detail = typeof body.detail === "string" ? body.detail : Array.isArray(body.detail) ? body.detail.map((item: { msg: string; loc?: string[] }) => `${item.loc?.slice(1).join(".") || "Данные"}: ${item.msg}`).join("; ") : body.detail?.message || detail; rows = body.errors || body.detail?.errors || []; } catch { /* Non-JSON server errors retain their safe status message. */ }
    throw new ApiError(detail, response.status, rows);
  }
  return response.json() as Promise<T>;
}
export function post<T>(path: string, body: unknown) { return api<T>(path, { method: "POST", body: JSON.stringify(body) }); }
export function patch<T>(path: string, body: unknown) { return api<T>(path, { method: "PATCH", body: JSON.stringify(body) }); }
export function query(params: Record<string, string | number | undefined>) { const value = new URLSearchParams(); Object.entries(params).forEach(([key, item]) => { if (item !== undefined && item !== "") value.set(key, String(item)); }); return value.size ? `?${value.toString()}` : ""; }
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Не удалось выполнить действие. Попробуйте ещё раз.";

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [status, setStatus] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => { const sessionChanged = () => { setData(null); setLoading(true); reload(); }; window.addEventListener(SESSION_EVENT, sessionChanged); return () => window.removeEventListener(SESSION_EVENT, sessionChanged); }, [reload]);
  useEffect(() => { let active = true; async function loadData() { await Promise.resolve(); if (!active) return; if (!path) { setLoading(false); return; } setLoading(true); setError(""); setStatus(null); try { const value = await api<T>(path); if (active) setData(value); } catch (reason) { if (active) { setData(null); setError(errorMessage(reason)); setStatus(reason instanceof ApiError ? reason.status : 0); } } finally { if (active) setLoading(false); } } void loadData(); return () => { active = false; }; }, [path, revision]);
  return { data, loading, error, status, reload };
}
export function useReference() {
  const products = useApi<Product[]>("/products"); const locations = useApi<Location[]>("/locations");
  return { products: products.data || [], locations: locations.data || [], loading: products.loading || locations.loading, error: products.error || locations.error, reload: () => { products.reload(); locations.reload(); } };
}
export function defaultPeriod(days = 30) { const end = new Date(); const start = new Date(); start.setDate(start.getDate() - days + 1); const fmt = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: "Asia/Qyzylorda" }); return { start: fmt(start), end: fmt(end) }; }
export async function downloadCsv(params: Record<string, string | number | undefined> = {}) { const token = sessionToken(); const response = await fetch(`${API_URL}/export${query(params)}`, ...(token ? [{ headers: { Authorization: `Bearer ${token}` } }] as const : [])); if (!response.ok) throw new Error("Не удалось выгрузить CSV. Проверьте вход и права доступа."); const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "saqta-records.csv"; anchor.click(); URL.revokeObjectURL(url); }
