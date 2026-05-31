"use client";

// FieldLoopApp — shell: header, view toggle, sync indicator, view routing.
//
// The design prototype shipped a floating "Tweaks" panel wired to the Claude
// Design host (postMessage protocol) that let the designer flip lot style,
// alert intensity and panel position live. That panel is design-tooling, not
// product UI, so it is not reproduced here — instead its default-loaded values
// are baked in as the product's shipping configuration.

import React from "react";
import ManagerView from "./ManagerView";
import OperatorView from "./OperatorView";
import EditorView from "./EditorView";
import { FL_FIELDS, FL_MACHINES, type Field } from "./data";

export interface TweakState {
  mapStyle: string; // relleno | contorno | hibrido
  accent: number; // 0–100 alert intensity
  panelPos: string; // lateral | flotante
}

const FL_TWEAKS: TweakState = {
  mapStyle: "contorno",
  accent: 55,
  panelPos: "lateral",
};

type ViewId = "manager" | "operator" | "editor";

function SyncIndicator() {
  return (
    <div className="fl-sync" title="Datos en tiempo real">
      <span className="fl-sync__dot" />
      <span className="fl-sync__text">
        Sincronizado con <strong>John Deere Operations Center</strong>
      </span>
    </div>
  );
}

function ViewToggle({ view, setView }: { view: ViewId; setView: (v: ViewId) => void }) {
  const tabs: { id: ViewId; label: string }[] = [
    { id: "manager", label: "Manager" },
    { id: "operator", label: "Operador" },
    { id: "editor", label: "Editor de lotes" },
  ];
  return (
    <div className="fl-toggle" role="tablist" aria-label="Vista">
      {tabs.map((v) => (
        <button
          key={v.id}
          role="tab"
          aria-selected={view === v.id}
          className={"fl-toggle__btn" + (view === v.id ? " is-active" : "")}
          onClick={() => setView(v.id)}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

const FL_STORE_KEY = "fieldloop.fields.v2";
function flLoadFields(): Field[] {
  try {
    const raw = localStorage.getItem(FL_STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed as Field[];
    }
  } catch {
    /* ignore corrupt storage */
  }
  return JSON.parse(JSON.stringify(FL_FIELDS));
}

export default function FieldLoopApp() {
  const [view, setView] = React.useState<ViewId>("manager");
  const [fields, setFields] = React.useState<Field[]>(flLoadFields);

  React.useEffect(() => {
    try {
      localStorage.setItem(FL_STORE_KEY, JSON.stringify(fields));
    } catch {
      /* storage may be unavailable (private mode) — non-fatal */
    }
  }, [fields]);

  return (
    <div className="fl-app" data-view={view}>
      <header className="fl-header">
        <div className="fl-brand">
          <span className="fl-brand__mark" aria-hidden="true" />
          <span className="fl-brand__name">FieldLoop</span>
        </div>
        <ViewToggle view={view} setView={setView} />
        <SyncIndicator />
      </header>

      <main className="fl-main">
        {view === "manager" && <ManagerView t={FL_TWEAKS} fields={fields} />}
        {view === "operator" && <OperatorView fields={fields} />}
        {view === "editor" && <EditorView fields={fields} machines={FL_MACHINES} setFields={setFields} />}
      </main>
    </div>
  );
}
