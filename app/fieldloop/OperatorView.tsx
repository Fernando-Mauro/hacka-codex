"use client";

// OperatorView — Field Operator view. One urgent, hyper-actionable card.

import React from "react";
import { FL_FIELDS, type Field } from "./data";

// Deadline ~2h 45m out from when the operator opens the task.
const DEADLINE_MS = (2 * 3600 + 45 * 60) * 1000;

function fmtClock(remaining: number): string {
  const h = Math.floor(remaining / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// Live countdown. `remaining` starts at the full duration (a pure constant) and
// is only ever advanced from the interval callback — no Date.now() in render,
// no synchronous setState in the effect body.
function useCountdown(durationMs: number) {
  const [remaining, setRemaining] = React.useState(durationMs);
  React.useEffect(() => {
    const end = Date.now() + durationMs;
    const id = setInterval(() => setRemaining(Math.max(0, end - Date.now())), 1000);
    return () => clearInterval(id);
  }, [durationMs]);
  return remaining;
}

type OpStatus = "pending" | "done" | "issue";

export default function OperatorView({ fields }: { fields: Field[] }) {
  const remaining = useCountdown(DEADLINE_MS);
  const text = fmtClock(remaining);
  const [status, setStatus] = React.useState<OpStatus>("pending");

  const field = (fields || FL_FIELDS).find((f) => f.id === "elrio") ?? FL_FIELDS[1];

  if (status !== "pending") {
    const done = status === "done";
    return (
      <div className="fl-operator">
        <div className={"fl-opcard fl-opcard--result " + (done ? "is-done" : "is-issue")}>
          <div className="fl-opresult__icon">{done ? "✓" : "!"}</div>
          <div className="fl-opresult__title">{done ? "Tarea confirmada" : "Problema reportado"}</div>
          <div className="fl-opresult__sub">
            {done
              ? "El manager fue notificado. La cosecha de Lote El Río está en curso."
              : "Un supervisor revisará Lote El Río. Espera nuevas instrucciones."}
          </div>
          <button className="fl-btn fl-btn--ghost" onClick={() => setStatus("pending")}>
            Volver a la tarea
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fl-operator">
      <div className="fl-opcard">
        <div className="fl-opcard__banner">
          <span className="fl-dot fl-dot--pulse" style={{ background: "var(--amber)" }} />
          Prioridad máxima
        </div>

        <div className="fl-opcard__now">Haz esto ahora</div>

        <div className="fl-opcard__action">
          Cosechar <strong>{field.nombre}</strong> con la Combinada <strong>C1</strong>
        </div>

        <div className="fl-opcard__meta">
          <div className="fl-opmeta">
            <span className="fl-opmeta__k">Cultivo</span>
            <span className="fl-opmeta__v">{field.cultivo}</span>
          </div>
          <div className="fl-opmeta">
            <span className="fl-opmeta__k">Humedad</span>
            <span className="fl-opmeta__v">{field.humedad}%</span>
          </div>
          <div className="fl-opmeta">
            <span className="fl-opmeta__k">Superficie</span>
            <span className="fl-opmeta__v">{field.superficie} ha</span>
          </div>
        </div>

        <div className="fl-opcard__timer">
          <span className="fl-optimer__label">Antes de la lluvia</span>
          <span className="fl-optimer__clock">{text}</span>
        </div>

        <div className="fl-opcard__btns">
          <button className="fl-btn fl-btn--primary" onClick={() => setStatus("done")}>
            Confirmar inicio
          </button>
          <button className="fl-btn fl-btn--ghost" onClick={() => setStatus("issue")}>
            Reportar problema
          </button>
        </div>
      </div>
    </div>
  );
}
