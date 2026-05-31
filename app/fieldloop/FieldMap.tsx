"use client";

// FieldMap — real satellite map (Leaflet + Esri World Imagery) with the
// farm's parcels drawn on top. Click a lot for its state card; machines are pins.

import React from "react";
import L from "leaflet";
import {
  FL_ESTADO_META,
  FL_MAP_CENTER,
  FL_MAP_ZOOM,
  flRiskColor,
  type Field,
  type Machine,
} from "./data";

type Selection = string | null;
type SetSelection = React.Dispatch<React.SetStateAction<Selection>>;

interface FieldMapProps {
  fields: Field[];
  machines: Machine[];
  selectedId: Selection;
  onSelect: SetSelection;
  mapStyle: string;
  accent: number;
  actionFieldId: string;
  riskById: Record<string, number> | null;
}

// State-card markup (string) reused inside Leaflet popups.
function flCardHTML(f: Field): string {
  const meta = FL_ESTADO_META[f.estado];
  return `
    <div class="fl-statecard">
      <div class="fl-statecard__head">
        <span class="fl-dot" style="background:${meta.swatch}"></span>
        <div class="fl-statecard__title">${f.nombre}</div>
        <span class="fl-statecard__estado" style="color:${meta.swatch}">${meta.label}</span>
      </div>
      <div class="fl-statecard__grid">
        <div class="fl-stat"><span class="fl-stat__k">Cultivo</span><span class="fl-stat__v">${f.cultivo}</span></div>
        <div class="fl-stat"><span class="fl-stat__k">Humedad</span><span class="fl-stat__v">${f.humedad}%</span></div>
        <div class="fl-stat"><span class="fl-stat__k">Vulnerabilidad</span><span class="fl-stat__v" style="color:${meta.swatch}">${f.vulnerabilidad}</span></div>
      </div>
      <p class="fl-statecard__nota">${f.nota}</p>
      <div class="fl-statecard__foot"><span class="fl-mono">${f.superficie} ha</span></div>
    </div>`;
}

function flLabelHTML(f: Field, isAction: boolean): string {
  const meta = FL_ESTADO_META[f.estado];
  return `
    <span class="fl-flabel__name">${f.nombre}</span>
    <span class="fl-flabel__crop">${f.cultivo}</span>
    ${isAction ? `<span class="fl-flabel__tag" style="color:${meta.swatch}">● Acción ahora</span>` : ""}`;
}

function flPinHTML(m: Machine): string {
  return `
    <div class="fl-pin">
      <span class="fl-pin__code">${m.id}</span>
      <span class="fl-pin__label">${m.tipo} · <span class="fl-mono">${m.estado}</span></span>
    </div>`;
}

function flFillFor(mapStyle: string): number {
  if (mapStyle === "relleno") return 0.42;
  if (mapStyle === "hibrido") return 0.24;
  return 0.07; // contorno
}

export default function FieldMap({
  fields,
  machines,
  selectedId,
  onSelect,
  mapStyle,
  accent,
  actionFieldId,
  riskById,
}: FieldMapProps) {
  const elRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<L.Map | null>(null);
  const layersRef = React.useRef<Record<string, L.Polygon>>({});
  const machinesRef = React.useRef<Record<string, L.Marker>>({});
  const onSelectRef = React.useRef(onSelect);
  // Keep the click/popup handlers bound inside the init-once effect pointing at
  // the latest setter without re-binding them (ref write done in an effect, not
  // during render, per the React purity rules).
  React.useEffect(() => {
    onSelectRef.current = onSelect;
  });

  // init once
  React.useEffect(() => {
    if (mapRef.current || !elRef.current) return;
    const map = L.map(elRef.current, {
      center: FL_MAP_CENTER,
      zoom: FL_MAP_ZOOM,
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: true,
    });
    mapRef.current = map;

    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" }
    ).addTo(map);

    const bounds: L.LatLngTuple[] = [];
    fields.forEach((f) => {
      const meta = FL_ESTADO_META[f.estado];
      const isAction = f.id === actionFieldId;
      const poly = L.polygon(f.geo, {
        color: meta.hex,
        weight: isAction ? 4 : 2.5,
        opacity: 0.95,
        fillColor: meta.hex,
        fillOpacity: flFillFor(mapStyle),
        className: "fl-geo" + (isAction ? " fl-geo--action" : ""),
      }).addTo(map);

      poly.bindPopup(flCardHTML(f), {
        className: "fl-leaflet-popup",
        closeButton: false,
        autoPan: true,
        autoPanPadding: [24, 24],
        maxWidth: 300,
        offset: [0, -2],
      });
      poly.bindTooltip(flLabelHTML(f, isAction), {
        permanent: true,
        direction: "center",
        className: "fl-leaflet-label",
        interactive: false,
      });
      poly.on("click", () => onSelectRef.current(f.id));
      poly.on("popupclose", () => {
        onSelectRef.current((cur) => (cur === f.id ? null : cur));
      });
      layersRef.current[f.id] = poly;
      f.geo.forEach((c) => bounds.push(c));
    });

    machines.forEach((m) => {
      const mk = L.marker(m.ll, {
        icon: L.divIcon({ className: "fl-pinicon", html: flPinHTML(m), iconSize: [0, 0], iconAnchor: [0, 0] }),
        interactive: false,
        keyboard: false,
      }).addTo(map);
      machinesRef.current[m.id] = mk;
    });

    if (bounds.length) map.fitBounds(bounds, { padding: [40, 40] });
    map.on("click", () => onSelectRef.current(null));
    const sizer = setTimeout(() => map.invalidateSize(), 200);

    return () => {
      clearTimeout(sizer);
      map.remove();
      mapRef.current = null;
      layersRef.current = {};
      machinesRef.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // unified styling — colors driven by the risk model when present
  React.useEffect(() => {
    const fillBase = flFillFor(mapStyle);
    const glow = 0.18 + (accent / 100) * 0.5;
    fields.forEach((f) => {
      const poly = layersRef.current[f.id];
      if (!poly) return;
      const meta = FL_ESTADO_META[f.estado];
      const risk = riskById ? riskById[f.id] : null;
      const isAction = f.id === actionFieldId;
      const isSel = f.id === selectedId;
      let color = meta.hex,
        fillOp = fillBase;
      if (risk != null) {
        color = flRiskColor(risk);
        fillOp = Math.min(0.72, fillBase + risk * (mapStyle === "contorno" ? 0.34 : 0.42));
      }
      poly.setStyle({ color, fillColor: color, fillOpacity: fillOp, weight: isSel ? 4.5 : isAction ? 4 : 2.5 });
      const path = (poly as unknown as { _path?: SVGPathElement })._path;
      if (path) {
        path.style.transition = "fill .25s linear, stroke .25s linear, stroke-width .15s";
        const hot = risk != null && risk > 0.6;
        path.style.filter = hot
          ? `drop-shadow(0 0 ${Math.round((risk - 0.6) * 46)}px ${color})`
          : isAction
            ? `drop-shadow(0 0 ${Math.round(glow * 16)}px color-mix(in oklch, ${meta.swatch} 55%, transparent))`
            : "none";
      }
    });
  }, [fields, mapStyle, accent, selectedId, actionFieldId, riskById]);

  // open/close popup when selection changes from elsewhere (panel hover)
  React.useEffect(() => {
    const poly = selectedId ? layersRef.current[selectedId] : null;
    if (poly && !poly.isPopupOpen()) poly.openPopup();
    if (!selectedId && mapRef.current) mapRef.current.closePopup();
  }, [selectedId]);

  return (
    <div className="fl-map">
      <div className="fl-leafletmap" ref={elRef}></div>
    </div>
  );
}
