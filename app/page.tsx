"use client";

import dynamic from "next/dynamic";

// FieldLoop is a fully client-side app: Leaflet, Geoman, localStorage and live
// timers all need the browser, so it is loaded with prerendering disabled.
const FieldLoopApp = dynamic(() => import("./fieldloop/FieldLoopApp"), {
  ssr: false,
  loading: () => <div className="fl-boot">Cargando FieldLoop…</div>,
});

export default function Home() {
  return <FieldLoopApp />;
}
