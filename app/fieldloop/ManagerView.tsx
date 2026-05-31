"use client";

// ManagerView — Farm Manager view: interactive map + recommendation engine.

import React from "react";
import FieldMap from "./FieldMap";
import {
  FL_ESTADO_META,
  FL_HORIZON,
  FL_MACHINES,
  FL_SCENARIO,
  flComputeRecommendation,
  flRiskFor,
  type Field,
  type Recommendation,
  type ScenarioKey,
  type Sustentabilidad,
} from "./data";
import type { TweakState } from "./FieldLoopApp";

interface FLSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (v: number) => void;
  hint?: string;
}

function FLSlider({ label, value, min, max, unit, onChange, hint }: FLSliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="fl-eslider">
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
      {hint && <span className="fl-eslider__hint">{hint}</span>}
    </div>
  );
}

function ConfidenceBadge({ rec }: { rec: Recommendation }) {
  const c = rec.confianza;
  const tone = c >= 80 ? "ok" : c >= 66 ? "warn" : "low";
  return (
    <div className={"fl-conf fl-conf--" + tone}>
      <div className="fl-conf__score">
        <span className="fl-conf__check" aria-hidden="true">
          {rec.robusto ? "✓" : "!"}
        </span>
        <div>
          <div className="fl-conf__pct">{c}%</div>
          <div className="fl-conf__cap">probabilidad de éxito</div>
        </div>
      </div>
      <div className="fl-conf__badge">{rec.badge}</div>
    </div>
  );
}

function ActionSequence({ rec, onHoverField }: { rec: Recommendation; onHoverField: (id: string) => void }) {
  return (
    <ol className="fl-seq">
      {rec.pasos.map((p) => (
        <li
          key={p.orden}
          className={"fl-seq__item" + (p.orden === 1 ? " is-primary" : "")}
          onMouseEnter={() => onHoverField(p.campo)}
        >
          <span className="fl-seq__num">{p.orden}</span>
          <div className="fl-seq__body">
            <div className="fl-seq__title">{p.titulo}</div>
            <div className="fl-seq__detail">{p.detalle}</div>
            <div className="fl-seq__meta">
              <span className="fl-chip">{p.maquina}</span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Sustainability({ s }: { s: Sustentabilidad }) {
  const items = [
    { k: "Combustible ahorrado", v: s.combustible, u: "L" },
    { k: "Emisiones evitadas", v: s.emisiones, u: "kg CO₂" },
    { k: "Horas-máquina", v: s.horas, u: "h" },
  ];
  return (
    <div className="fl-sust">
      <div className="fl-sust__head">Impacto del plan</div>
      <div className="fl-sust__grid">
        {items.map((it) => (
          <div key={it.k} className="fl-sust__item">
            <div className="fl-sust__v">
              {it.v}
              <span className="fl-sust__u">{it.u}</span>
            </div>
            <div className="fl-sust__k">{it.k}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface ForecastData {
  health: number;
  lotesRiesgo: number;
  dayLabel: number;
  fecha: string;
}

function Forecast({ f }: { f: ForecastData }) {
  const tone = f.health >= 75 ? "ok" : f.health >= 55 ? "warn" : "low";
  return (
    <div className={"fl-forecast fl-forecast--" + tone}>
      <div className="fl-forecast__head">
        <span>Pronóstico</span>
        <span className="fl-mono">
          Día {f.dayLabel} · {f.fecha}
        </span>
      </div>
      <div className="fl-forecast__body">
        <div className="fl-forecast__health">
          <div className="fl-forecast__pct">
            {f.health}
            <span className="fl-forecast__u">%</span>
          </div>
          <div className="fl-forecast__cap">Salud del cultivo</div>
        </div>
        <div className="fl-forecast__risk">
          <div className="fl-forecast__riskn">{f.lotesRiesgo}</div>
          <div className="fl-forecast__cap">{f.lotesRiesgo === 1 ? "lote en riesgo" : "lotes en riesgo"}</div>
        </div>
      </div>
      <div className="fl-forecast__bar">
        <span style={{ width: f.health + "%" }} />
      </div>
    </div>
  );
}

interface TimelineProps {
  day: number;
  setDay: React.Dispatch<React.SetStateAction<number>>;
  playing: boolean;
  togglePlay: () => void;
  scenario: ScenarioKey;
  setScenario: (s: ScenarioKey) => void;
}

function Timeline({ day, setDay, playing, togglePlay, scenario, setScenario }: TimelineProps) {
  const H = FL_HORIZON;
  return (
    <div className="fl-timeline">
      <button className="fl-tl__play" onClick={togglePlay} aria-label={playing ? "Pausar" : "Reproducir"}>
        {playing ? "❚❚" : "▶"}
      </button>
      <div className="fl-tl__main">
        <div className="fl-tl__top">
          <span className="fl-tl__title">Ver futuro</span>
          <div className="fl-tl__scn">
            {(Object.entries(FL_SCENARIO) as [ScenarioKey, { label: string }][]).map(([k, s]) => (
              <button
                key={k}
                className={"fl-tl__scnbtn" + (scenario === k ? " is-on" : "")}
                onClick={() => setScenario(k)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <input
          className="fl-tl__slider"
          type="range"
          min={0}
          max={H - 1}
          step={0.1}
          value={day}
          onChange={(e) => setDay(Number(e.target.value))}
        />
        <div className="fl-tl__scale">
          <span>Hoy</span>
          <span className="fl-tl__cur fl-mono">Día {Math.round(day) + 1}</span>
          <span>+{H} días</span>
        </div>
      </div>
    </div>
  );
}

interface RecommendationPanelProps {
  ventana: number;
  personal: number;
  setVentana: (v: number) => void;
  setPersonal: (v: number) => void;
  rec: Recommendation;
  onHoverField: (id: string) => void;
  floating: boolean;
  forecast: ForecastData;
}

function RecommendationPanel({
  ventana,
  personal,
  setVentana,
  setPersonal,
  rec,
  onHoverField,
  floating,
  forecast,
}: RecommendationPanelProps) {
  return (
    <aside className={"fl-engine" + (floating ? " is-floating" : "")}>
      <div className="fl-engine__scroll">
        <Forecast f={forecast} />

        <div className="fl-engine__inputs">
          <FLSlider
            label="Ventana de clima"
            value={ventana}
            min={1}
            max={5}
            unit=" días"
            hint="Días de buen clima previstos"
            onChange={setVentana}
          />
          <FLSlider
            label="Personal disponible hoy"
            value={personal}
            min={1}
            max={6}
            unit=""
            hint="Operadores en turno"
            onChange={setPersonal}
          />
        </div>

        <div className="fl-engine__rec">
          <div className="fl-engine__rectitle">Acción recomendada</div>
          <ConfidenceBadge rec={rec} />
          <ActionSequence rec={rec} onHoverField={onHoverField} />
        </div>

        <Sustainability s={rec.sustentabilidad} />
      </div>
    </aside>
  );
}

export default function ManagerView({ t, fields }: { t: TweakState; fields: Field[] }) {
  const [selected, setSelected] = React.useState<string | null>(null);
  const [ventana, setVentana] = React.useState(2);
  const [personal, setPersonal] = React.useState(4);
  const [day, setDay] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [scenario, setScenario] = React.useState<ScenarioKey>("esperado");

  const rec = React.useMemo(() => flComputeRecommendation(ventana, personal), [ventana, personal]);

  // risk per lote for the current day + scenario
  const riskById = React.useMemo(() => {
    const out: Record<string, number> = {};
    fields.forEach((f) => {
      out[f.id] = flRiskFor(f, day, scenario);
    });
    return out;
  }, [fields, day, scenario]);

  // forecast metrics
  const forecast = React.useMemo<ForecastData>(() => {
    let wsum = 0,
      rsum = 0,
      riesgo = 0;
    fields.forEach((f) => {
      const w = f.superficie || 1;
      const r = riskById[f.id];
      wsum += w;
      rsum += r * w;
      if (r > 0.6) riesgo++;
    });
    const avg = wsum ? rsum / wsum : 0;
    const base = new Date(2026, 4, 31);
    const d = new Date(base.getTime() + Math.round(day) * 86400000);
    const fecha = d.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });
    return { health: Math.round((1 - avg) * 100), lotesRiesgo: riesgo, dayLabel: Math.round(day) + 1, fecha };
  }, [fields, riskById, day]);

  // auto-play
  React.useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const speed = 2.2; // días por segundo
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setDay((d) => {
        const nd = d + dt * speed;
        if (nd >= FL_HORIZON - 1) {
          setPlaying(false);
          return FL_HORIZON - 1;
        }
        return nd;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const togglePlay = () => {
    setPlaying((p) => {
      if (!p && day >= FL_HORIZON - 1) setDay(0);
      return !p;
    });
  };

  const floating = t.panelPos === "flotante";
  const totalHa = fields.reduce((a, f) => a + (f.superficie || 0), 0);

  return (
    <div className={"fl-manager" + (floating ? " layout-floating" : "")}>
      <div className="fl-manager__mapcol">
        <div className="fl-manager__maphead">
          <div className="fl-manager__title">
            <h1>Rancho El Fresno</h1>
            <span className="fl-manager__sub">
              Nuevo León · {totalHa} ha · {fields.length} lotes
            </span>
          </div>
          <div className="fl-legend">
            {(Object.entries(FL_ESTADO_META) as [string, { label: string; swatch: string }][])
              .filter(([k]) => k !== "urgente")
              .map(([k, m]) => (
                <span key={k} className="fl-legend__item">
                  <span className="fl-dot" style={{ background: m.swatch }} />
                  {m.label}
                </span>
              ))}
          </div>
        </div>
        <div className="fl-mapstage">
          <FieldMap
            fields={fields}
            machines={FL_MACHINES}
            selectedId={selected}
            onSelect={setSelected}
            mapStyle={t.mapStyle}
            accent={t.accent}
            actionFieldId="elrio"
            riskById={riskById}
          />
          <Timeline
            day={day}
            setDay={setDay}
            playing={playing}
            togglePlay={togglePlay}
            scenario={scenario}
            setScenario={setScenario}
          />
        </div>
      </div>
      <RecommendationPanel
        ventana={ventana}
        personal={personal}
        setVentana={setVentana}
        setPersonal={setPersonal}
        rec={rec}
        onHoverField={setSelected}
        floating={floating}
        forecast={forecast}
      />
    </div>
  );
}
