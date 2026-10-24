"use client";

import { Area, Bar, BarChart, CartesianGrid, Legend, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { dateLabel } from "./ui";

export type ChartPoint = { date: string; sales?: number; production?: number; forecast?: number | null; waste?: number; [key: string]: string | number | null | undefined };
const axis = { fontSize: 12, fill: "#637369" };

export function SalesChart({ data, showProduction = true }: { data: ChartPoint[]; showProduction?: boolean }) {
  return <div className="h-[275px] w-full" role="img" aria-label="График продаж, производства и прогноза"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data} margin={{ top: 12, right: 5, left: -25, bottom: 0 }}><defs><linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#237A57" stopOpacity={.16} /><stop offset="100%" stopColor="#237A57" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#EEF1E9" vertical={false} /><XAxis dataKey="date" tickFormatter={dateLabel} tick={axis} axisLine={false} tickLine={false} minTickGap={30} /><YAxis tick={axis} axisLine={false} tickLine={false} /><Tooltip labelFormatter={v => dateLabel(String(v))} contentStyle={{ borderRadius: 12, border: "1px solid #E5E9E0", fontSize: 12 }} /><Legend iconType="circle" iconSize={6} wrapperStyle={{ fontSize: 12, paddingTop: 15 }} />{showProduction && <Line type="monotone" name="Произведено" dataKey="production" stroke="#C4CFC2" strokeWidth={1.5} dot={false} />}<Area type="monotone" name="Продано" dataKey="sales" stroke="#237A57" fill="url(#salesFill)" strokeWidth={2.5} /><Line type="monotone" name="Прогноз" dataKey="forecast" stroke="#A9C85B" strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls /></ComposedChart></ResponsiveContainer></div>;
}

export function WasteChart({ data }: { data: ChartPoint[] }) {
  return <div className="h-[230px] w-full" role="img" aria-label="График количества списаний по датам"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 5, right: 0, left: -25, bottom: 0 }}><CartesianGrid stroke="#EEF1E9" vertical={false} /><XAxis dataKey="date" tickFormatter={dateLabel} tick={axis} axisLine={false} tickLine={false} minTickGap={30} /><YAxis tick={axis} axisLine={false} tickLine={false} /><Tooltip labelFormatter={v => dateLabel(String(v))} contentStyle={{ borderRadius: 12, border: "1px solid #E5E9E0", fontSize: 12 }} /><Bar name="Списано, шт." dataKey="waste" fill="#C3D2AF" radius={[4, 4, 0, 0]} maxBarSize={20} /></BarChart></ResponsiveContainer></div>;
}
