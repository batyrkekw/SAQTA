"use client";

import { useCallback, useEffect, useState } from "react";
import type { Location, Product } from "@/types/api";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api").replace(/\/$/, "");
export class ApiError extends Error {
  status: number;
  rows: { row: number; message: string }[];
  constructor(message: string, status: number, rows: { row: number; message: string }[] = []) { super(message); this.name = "ApiError"; this.status = status; this.rows = rows; }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try { response = await fetch(`${API_URL}${path}`, { ...init, headers: { ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...init.headers }, cache: "no-store" }); }
  catch { throw new ApiError("Нет связи с сервером SAQTA. Проверьте запуск API и NEXT_PUBLIC_API_URL.", 0); }
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
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => { let active = true; async function loadData() { await Promise.resolve(); if (!active) return; if (!path) { setLoading(false); return; } setLoading(true); setError(""); try { const value = await api<T>(path); if (active) setData(value); } catch (reason) { if (active) setError(errorMessage(reason)); } finally { if (active) setLoading(false); } } void loadData(); return () => { active = false; }; }, [path, revision]);
  return { data, loading, error, reload };
}
export function useReference() {
  const products = useApi<Product[]>("/products"); const locations = useApi<Location[]>("/locations");
  return { products: products.data || [], locations: locations.data || [], loading: products.loading || locations.loading, error: products.error || locations.error, reload: () => { products.reload(); locations.reload(); } };
}
export function defaultPeriod(days = 30) { const end = new Date(); const start = new Date(); start.setDate(start.getDate() - days + 1); const fmt = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: "Asia/Qyzylorda" }); return { start: fmt(start), end: fmt(end) }; }
export async function downloadCsv(params: Record<string, string | number | undefined> = {}) { const response = await fetch(`${API_URL}/export${query(params)}`); if (!response.ok) throw new Error("Не удалось выгрузить CSV."); const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "saqta-records.csv"; anchor.click(); URL.revokeObjectURL(url); }
