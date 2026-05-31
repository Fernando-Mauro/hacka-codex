// api.ts — thin client for the FieldLoop decision-engine backend (FastAPI).
//
// Every call throws on failure (network down, non-2xx, or timeout) so callers
// can fall back to the client-side stubs in data.ts and keep the UI working
// when the backend isn't running.

import type { Recommendation, ScenarioKey } from "./data";

// Backend URL resolution, in priority order:
//   1. NEXT_PUBLIC_API_BASE — set this in Vercel to point anywhere (overrides all).
//   2. Production build (Vercel) with no env var → the tunneled backend (ngrok).
//   3. Local dev → localhost (as it works today).
// So a deploy works out of the box, and you can still redirect it via one env var.
// NOTE: ngrok-free URLs change on every restart — when the tunnel changes, either
// update this constant or (better) set NEXT_PUBLIC_API_BASE in Vercel.
const PROD_API_BASE = "https://9f7e-82-140-171-225.ngrok-free.app";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") ||
  (process.env.NODE_ENV === "production" ? PROD_API_BASE : "http://localhost:8000");

export interface RegretMeter {
  valor_protegido: number;
  valor_en_riesgo: number;
  ahorro_vs_intuicion: number;
  regret_recomendado: number;
  confianza: number;
  umbral_p20: number;
  recomendado_orden: string[];
  intuicion_orden: string[];
  mensaje: string;
}

// The engine response is a superset of the frontend's Recommendation type.
export interface EngineRecommendation extends Recommendation {
  regret_meter: RegretMeter;
  cobertura: number;
  sim_ms: number;
}

export interface RiskForecast {
  scenario: ScenarioKey;
  horizon: number;
  fields: Record<string, number[]>; // id del lote -> arreglo 0..100 (largo horizon+1)
}

export interface SimulateConstraints {
  operators: number;
  shift_window_hours: number;
  rain_eta_h?: number;
  seed?: number;
}

export interface WeatherDay {
  fecha: string;
  prob: number;
  mm: number;
}

export interface WeatherReport {
  fuente: "Open-Meteo" | "sintético";
  lat: number;
  lon: number;
  rain_eta_h: number;
  rain_eta_sd: number;
  rain_prob: number;
  resumen: string;
  diario: WeatherDay[];
}

export interface Lever {
  id: string;
  titulo: string;
  detalle: string;
  delta_confianza: number;
  delta_valor: number;
  delta_cobertura: number;
  nuevo_valor_protegido: number;
}

export interface LoteRiesgo {
  id: string;
  nombre: string;
  nivel: "bajo" | "medio" | "alto";
  causa: string;
  riesgo_pct: number;
}

export interface ReportResumen {
  valor_protegido: number;
  valor_en_riesgo: number;
  confianza: number;
  robusto: boolean;
  ahorro_vs_intuicion: number;
  co2_evitado: number;
  cobertura: number;
  badge: string;
  mensaje: string;
  recomendado_orden: string[];
}

export interface ReportResponse {
  resumen: ReportResumen;
  palancas: Lever[];
  riesgos: LoteRiesgo[];
  clima: WeatherReport;
}

const TIMEOUT_MS = 6000;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(API_BASE + path, {
      ...init,
      // ngrok-free serves an HTML interstitial to browsers; this header makes it
      // pass the request straight through (harmless for other backends).
      headers: { "ngrok-skip-browser-warning": "true", ...(init?.headers || {}) },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function postJSON<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function fetchRecommendation(c: SimulateConstraints): Promise<EngineRecommendation> {
  return postJSON<EngineRecommendation>("/simulate", c);
}

export function fetchRiskForecast(scenario: ScenarioKey): Promise<RiskForecast> {
  return postJSON<RiskForecast>("/forecast_risk", { scenario });
}

export function fetchWeather(): Promise<WeatherReport> {
  return request<WeatherReport>("/weather");
}

export function fetchReport(operators: number, shiftWindowHours: number): Promise<ReportResponse> {
  const qs = `?operators=${operators}&shift_window_hours=${shiftWindowHours}`;
  return request<ReportResponse>("/report" + qs);
}

export type ClaseSuelo = "cultivable" | "agua" | "urbano" | "no_cultivable" | "fuera_zona" | "no_verificado";

export interface LotValidation {
  valido: boolean;
  clase: ClaseSuelo;
  motivo: string;
  fuente: string;
  overlap_pct: number;
}

export interface DemoZone {
  south: number;
  west: number;
  north: number;
  east: number;
}

export function validateLot(geo: [number, number][]): Promise<LotValidation> {
  return postJSON<LotValidation>("/validate_lot", { geo });
}

export function fetchDemoZone(): Promise<DemoZone> {
  return request<DemoZone>("/demo_zone");
}
