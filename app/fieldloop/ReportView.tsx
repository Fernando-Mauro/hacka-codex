"use client";

// ReportView — "Informe": executive summary + improvement levers + per-lote
// risks + live weather context, all driven by the Monte Carlo engine. Falls
// back to a clear message if the backend is unreachable.

import React from "react";
import { fetchReport, type ReportResponse } from "./api";

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const signed = (n: number) => (n > 0 ? "+" : "") + n.toLocaleString("en-US");
const signedMoney = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");

function MiniSlider({ label, value, min, max, unit, onChange }: {
  label: string; value: number; min: number; max: number; unit: string; onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="fl-eslider fl-report__slider">
      <div className="fl-eslider__top">
        <span className="fl-eslider__label">{label}</span>
        <span className="fl-eslider__val">
          {value}
          <span className="fl-eslider__unit">{unit}</span>
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ "--pct": pct + "%" } as React.CSSProperties}
      />
    </div>
  );
}

export default function ReportView() {
  const [operators, setOperators] = React.useState(4);
  const [jornada, setJornada] = React.useState(10);
  const [report, setReport] = React.useState<ReportResponse | null>(null);
  const [status, setStatus] = React.useState<"loading" | "ok" | "error">("loading");

  React.useEffect(() => {
    let cancelled = false;
    const id = setTimeout(() => {
      fetchReport(operators, jornada)
        .then((r) => {
          if (!cancelled) {
            setReport(r);
            setStatus("ok");
          }
        })
        .catch(() => {
          if (!cancelled) setStatus("error");
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [operators, jornada]);

  const r = report;
  const clima = r?.clima;

  return (
    <div className="fl-report">
      <div className="fl-report__inner">
        <header className="fl-report__head">
          <div className="fl-manager__title">
            <h1>Informe de decisión</h1>
            <span className="fl-manager__sub">Rancho El Fresno · Nuevo León · Monte Carlo bajo incertidumbre</span>
          </div>
          <div className="fl-report__controls">
            <MiniSlider label="Operadores" value={operators} min={1} max={6} unit="" onChange={setOperators} />
            <MiniSlider label="Jornada" value={jornada} min={5} max={14} unit=" h" onChange={setJornada} />
          </div>
        </header>

        {clima && (
          <div className={"fl-wbanner" + (clima.fuente === "Open-Meteo" ? " is-live" : "")}>
            <span className="fl-wbanner__src">{clima.fuente === "Open-Meteo" ? "● Clima en vivo" : "○ Clima sintético"}</span>
            <span className="fl-wbanner__txt">{clima.resumen}</span>
          </div>
        )}

        {status === "error" && !r && (
          <div className="fl-report__empty">
            No se pudo contactar al motor de decisión. Inicia el backend
            (<span className="fl-mono">uv run uvicorn fieldloop.api:app --port 8000</span>) y vuelve a esta pantalla.
          </div>
        )}

        {r && (
          <>
            {/* ── Resumen ejecutivo ─────────────────────────── */}
            <section className="fl-report__section">
              <div className="fl-report__sectitle">Resumen ejecutivo</div>
              <div className="fl-kpis">
                <Kpi k="Valor protegido" v={money(r.resumen.valor_protegido)} tone="green" big />
                <Kpi k="Confianza" v={`${r.resumen.confianza}%`} tone={r.resumen.robusto ? "green" : "amber"} sub={r.resumen.robusto ? "robusto" : "revisar"} />
                <Kpi k="Ahorro vs. intuición" v={money(r.resumen.ahorro_vs_intuicion)} tone="amber" />
                <Kpi k="Valor en riesgo" v={money(r.resumen.valor_en_riesgo)} tone="red" />
                <Kpi k="CO₂ evitado" v={`${r.resumen.co2_evitado} kg`} tone="green" />
                <Kpi k="Cobertura" v={`${r.resumen.cobertura}%`} tone="plain" />
              </div>
              <p className="fl-report__msg">{r.resumen.mensaje}</p>
            </section>

            <div className="fl-report__cols">
              {/* ── Palancas de mejora ──────────────────────── */}
              <section className="fl-report__section">
                <div className="fl-report__sectitle">Palancas de mejora · ¿qué mejorar?</div>
                <div className="fl-levers">
                  {r.palancas.map((p) => (
                    <div key={p.id} className="fl-lever">
                      <div className="fl-lever__top">
                        <span className="fl-lever__title">{p.titulo}</span>
                        <span className="fl-lever__val fl-mono">{signedMoney(p.delta_valor)}</span>
                      </div>
                      <div className="fl-lever__detail">{p.detalle}</div>
                      <div className="fl-lever__chips">
                        <span className="fl-chip">confianza {signed(p.delta_confianza)} pts</span>
                        <span className="fl-chip">cobertura {signed(p.delta_cobertura)} pts</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* ── Riesgos por lote ────────────────────────── */}
              <section className="fl-report__section">
                <div className="fl-report__sectitle">Riesgos por lote</div>
                <div className="fl-risks">
                  {r.riesgos.map((rg) => (
                    <div key={rg.id} className={"fl-risk fl-risk--" + rg.nivel}>
                      <div className="fl-risk__head">
                        <span className="fl-risk__name">{rg.nombre}</span>
                        <span className="fl-risk__badge">{rg.nivel}</span>
                      </div>
                      <div className="fl-risk__bar">
                        <span style={{ width: rg.riesgo_pct + "%" }} />
                      </div>
                      <div className="fl-risk__causa">
                        <span className="fl-mono">{rg.riesgo_pct}%</span> · {rg.causa}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* ── Contexto climático (7 días reales) ────────── */}
            {clima && (
              <section className="fl-report__section">
                <div className="fl-report__sectitle">Contexto climático · 7 días ({clima.fuente})</div>
                <div className="fl-wdays">
                  {clima.diario.map((d, i) => (
                    <div key={i} className="fl-wday">
                      <div className="fl-wday__bar">
                        <span style={{ height: Math.max(4, d.prob) + "%" }} />
                      </div>
                      <div className="fl-wday__prob fl-mono">{d.prob}%</div>
                      <div className="fl-wday__date">{d.fecha.slice(5)}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Kpi({ k, v, tone, sub, big }: { k: string; v: string; tone: string; sub?: string; big?: boolean }) {
  return (
    <div className={"fl-kpi fl-kpi--" + tone + (big ? " fl-kpi--big" : "")}>
      <div className="fl-kpi__k">{k}</div>
      <div className="fl-kpi__v fl-mono">{v}</div>
      {sub && <div className="fl-kpi__sub">{sub}</div>}
    </div>
  );
}
