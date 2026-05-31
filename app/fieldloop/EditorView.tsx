"use client";

// EditorView — "Editor de lotes": edit parcel boundaries on the real map.
// Uses Leaflet-Geoman for vertex drag / add / remove and drawing new lots.

import React from "react";
import L from "leaflet";
import "@geoman-io/leaflet-geoman-free";
import {
  FL_ESTADO_META,
  FL_FIELDS,
  FL_MAP_CENTER,
  FL_MAP_ZOOM,
  flPolygonHa,
  type Estado,
  type Field,
  type LatLng,
  type Machine,
} from "./data";

// Geoman augments L.Map / L.Layer with a `pm` property at runtime. The free
// build's bundled types are loose, so we reach it through a narrow cast.
interface GeomanMap {
  pm: {
    setGlobalOptions: (o: Record<string, unknown>) => void;
    enableDraw: (shape: string, o?: Record<string, unknown>) => void;
    disableDraw: () => void;
  };
}
interface GeomanLayer {
  pm: { enable: (o?: Record<string, unknown>) => void };
}
const mapPm = (m: L.Map) => (m as unknown as GeomanMap).pm;
const layerPm = (l: L.Layer) => (l as unknown as GeomanLayer).pm;

function flEditorLabel(f: Field): string {
  const ha = flPolygonHa(f.geo);
  return `<span class="fl-flabel__name">${f.nombre}</span><span class="fl-flabel__crop">${Math.round(ha)} ha</span>`;
}

interface FieldEditorMapProps {
  fields: Field[];
  machines: Machine[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onGeometryChange: (id: string, ll: LatLng[], ha: number) => void;
  onCreateLot: (ll: LatLng[], ha: number) => void;
  drawing: boolean;
  onDrawDone: () => void;
}

function FieldEditorMap({
  fields,
  machines,
  selectedId,
  onSelect,
  onGeometryChange,
  onCreateLot,
  drawing,
  onDrawDone,
}: FieldEditorMapProps) {
  const elRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<L.Map | null>(null);
  const layersRef = React.useRef<Record<string, L.Polygon>>({});
  const refs = React.useRef({ onSelect, onGeometryChange, onCreateLot, onDrawDone, fields });
  // Geoman event handlers (bound once at init) read the latest callbacks/fields
  // through this ref; refresh it in an effect rather than during render.
  React.useEffect(() => {
    refs.current = { onSelect, onGeometryChange, onCreateLot, onDrawDone, fields };
  });

  // init once
  React.useEffect(() => {
    if (mapRef.current || !elRef.current) return;
    const map = L.map(elRef.current, {
      center: FL_MAP_CENTER,
      zoom: FL_MAP_ZOOM,
      zoomControl: true,
    });
    mapRef.current = map;

    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" }
    ).addTo(map);

    mapPm(map).setGlobalOptions({ allowSelfIntersection: false, snappable: true, snapDistance: 16 });

    (machines || []).forEach((m) => {
      L.marker(m.ll, {
        icon: L.divIcon({
          className: "fl-pinicon is-ghost",
          html: `<div class="fl-pin"><span class="fl-pin__code">${m.id}</span></div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        }),
        interactive: false,
        keyboard: false,
      }).addTo(map);
    });

    map.on("pm:create", (e: L.LeafletEvent) => {
      const layer = (e as unknown as { layer: L.Polygon }).layer;
      const latlngs = (layer.getLatLngs()[0] as L.LatLng[]).map((p) => [p.lat, p.lng] as LatLng);
      map.removeLayer(layer);
      refs.current.onCreateLot(latlngs, flPolygonHa(latlngs));
      refs.current.onDrawDone();
    });

    const bounds: L.LatLngTuple[] = [];
    fields.forEach((f) => f.geo.forEach((c) => bounds.push(c)));
    if (bounds.length) map.fitBounds(bounds, { padding: [50, 50] });
    const sizer = setTimeout(() => map.invalidateSize(), 200);

    return () => {
      clearTimeout(sizer);
      map.remove();
      mapRef.current = null;
      layersRef.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // reconcile layers when the SET of lots / metadata changes (not geometry)
  const sig = fields.map((f) => `${f.id}:${f.estado}:${f.nombre}`).join("|");
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const present = new Set(fields.map((f) => f.id));

    // remove gone
    Object.keys(layersRef.current).forEach((id) => {
      if (!present.has(id)) {
        map.removeLayer(layersRef.current[id]);
        delete layersRef.current[id];
      }
    });

    fields.forEach((f) => {
      const meta = FL_ESTADO_META[f.estado];
      const existing = layersRef.current[f.id];
      if (!existing) {
        const poly = L.polygon(f.geo, {
          color: meta.hex,
          weight: 2.5,
          opacity: 0.95,
          fillColor: meta.hex,
          fillOpacity: 0.18,
          className: "fl-geo",
        }).addTo(map);
        poly.bindTooltip(flEditorLabel(f), {
          permanent: true,
          direction: "center",
          className: "fl-leaflet-label",
          interactive: false,
        });
        poly.on("click", () => refs.current.onSelect(f.id));
        layerPm(poly).enable();
        const sync = () => {
          const latlngs = (poly.getLatLngs()[0] as L.LatLng[]).map((p) => [p.lat, p.lng] as LatLng);
          const nombre = refs.current.fields.find((x) => x.id === f.id)?.nombre || "";
          poly.setTooltipContent(
            `<span class="fl-flabel__name">${nombre}</span><span class="fl-flabel__crop">${Math.round(
              flPolygonHa(latlngs)
            )} ha</span>`
          );
          refs.current.onGeometryChange(f.id, latlngs, flPolygonHa(latlngs));
        };
        poly.on("pm:edit", sync);
        poly.on("pm:update", sync);
        layersRef.current[f.id] = poly;
      } else {
        existing.setStyle({ color: meta.hex, fillColor: meta.hex });
        const latlngs = (existing.getLatLngs()[0] as L.LatLng[]).map((p) => [p.lat, p.lng] as LatLng);
        existing.setTooltipContent(flEditorLabel({ ...f, geo: latlngs }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  // selection highlight + focus
  React.useEffect(() => {
    Object.entries(layersRef.current).forEach(([id, p]) => {
      p.setStyle({ weight: id === selectedId ? 4.5 : 2.5, fillOpacity: id === selectedId ? 0.28 : 0.18 });
    });
    if (selectedId && layersRef.current[selectedId] && mapRef.current) {
      mapRef.current.fitBounds(layersRef.current[selectedId].getBounds(), { padding: [80, 80], maxZoom: 17 });
    }
  }, [selectedId]);

  // drawing toggle
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (drawing) mapPm(map).enableDraw("Polygon", { finishOnDoubleClick: true });
    else mapPm(map).disableDraw();
  }, [drawing]);

  return (
    <div className="fl-map">
      <div className="fl-leafletmap" ref={elRef}></div>
    </div>
  );
}

function EstadoPicker({ value, onChange }: { value: Estado; onChange: (v: Estado) => void }) {
  return (
    <div className="fl-estpick">
      {(Object.entries(FL_ESTADO_META) as [Estado, { label: string; hex: string }][])
        .filter(([k]) => k !== "urgente")
        .map(([k, m]) => (
          <button
            key={k}
            className={"fl-estpick__btn" + (value === k ? " is-on" : "")}
            style={value === k ? { borderColor: m.hex, color: m.hex } : {}}
            onClick={() => onChange(k)}
          >
            <span className="fl-dot" style={{ background: m.hex }} />
            {m.label}
          </button>
        ))}
    </div>
  );
}

interface EditorViewProps {
  fields: Field[];
  machines: Machine[];
  setFields: React.Dispatch<React.SetStateAction<Field[]>>;
}

export default function EditorView({ fields, machines, setFields }: EditorViewProps) {
  const [selected, setSelected] = React.useState<string | null>(fields[0] ? fields[0].id : null);
  const [drawing, setDrawing] = React.useState(false);

  const updateField = (id: string, patch: Partial<Field>) =>
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const onGeometryChange = (id: string, ll: LatLng[], ha: number) =>
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, geo: ll, superficie: Math.round(ha) } : f)));

  const onCreateLot = (ll: LatLng[], ha: number) => {
    const id = "lote-" + Date.now().toString(36);
    setFields((prev) => [
      ...prev,
      {
        id,
        nombre: "Lote nuevo",
        cultivo: "Sin asignar",
        estado: "ok",
        humedad: 20,
        vulnerabilidad: "Baja",
        superficie: Math.round(ha),
        nota: "Lote dibujado manualmente.",
        geo: ll,
      },
    ]);
    setSelected(id);
  };

  const onDeleteLot = (id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
    setSelected((cur) => (cur === id ? null : cur));
  };

  const resetAll = () => {
    if (!window.confirm("¿Restablecer todos los lotes a su definición inicial?")) return;
    const fresh: Field[] = JSON.parse(JSON.stringify(FL_FIELDS));
    setFields(fresh);
    setSelected(fresh[0] ? fresh[0].id : null);
  };

  return (
    <div className="fl-manager">
      <div className="fl-manager__mapcol">
        <div className="fl-manager__maphead">
          <div className="fl-manager__title">
            <h1>Editor de lotes</h1>
            <span className="fl-manager__sub">Ajusta los límites al terreno real del satélite</span>
          </div>
          <div className="fl-edithint">
            Arrastra los puntos para reformar · usa los puntos intermedios para añadir vértices
          </div>
        </div>
        <FieldEditorMap
          fields={fields}
          machines={machines}
          selectedId={selected}
          onSelect={setSelected}
          onGeometryChange={onGeometryChange}
          onCreateLot={onCreateLot}
          drawing={drawing}
          onDrawDone={() => setDrawing(false)}
        />
      </div>

      <aside className="fl-engine">
        <div className="fl-engine__scroll">
          <button className={"fl-drawbtn" + (drawing ? " is-on" : "")} onClick={() => setDrawing((d) => !d)}>
            {drawing ? "✕ Cancelar dibujo" : "＋ Dibujar nuevo lote"}
          </button>
          {drawing && <p className="fl-drawhint">Haz clic para colocar vértices. Doble clic para cerrar el lote.</p>}

          <div className="fl-lotlist">
            {fields.map((f) => {
              const meta = FL_ESTADO_META[f.estado];
              const isSel = f.id === selected;
              return (
                <div key={f.id} className={"fl-lotrow" + (isSel ? " is-sel" : "")}>
                  <button className="fl-lotrow__head" onClick={() => setSelected(isSel ? null : f.id)}>
                    <span className="fl-dot" style={{ background: meta.hex }} />
                    <span className="fl-lotrow__name">{f.nombre}</span>
                    <span className="fl-lotrow__ha fl-mono">{f.superficie} ha</span>
                  </button>
                  {isSel && (
                    <div className="fl-lotedit">
                      <label className="fl-field-l">
                        Nombre
                        <input
                          className="fl-input"
                          value={f.nombre}
                          onChange={(e) => updateField(f.id, { nombre: e.target.value })}
                        />
                      </label>
                      <label className="fl-field-l">
                        Cultivo
                        <input
                          className="fl-input"
                          value={f.cultivo}
                          onChange={(e) => updateField(f.id, { cultivo: e.target.value })}
                        />
                      </label>
                      <div className="fl-field-l">
                        Estado
                        <EstadoPicker value={f.estado} onChange={(v) => updateField(f.id, { estado: v })} />
                      </div>
                      <div className="fl-lotedit__foot">
                        <span className="fl-mono fl-faint">
                          {f.superficie} ha · {f.geo.length} vértices
                        </span>
                        <button className="fl-del" onClick={() => onDeleteLot(f.id)}>
                          Eliminar lote
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button className="fl-reset" onClick={resetAll}>
            Restablecer lotes
          </button>
          <p className="fl-savenote">Los cambios se guardan automáticamente en este dispositivo.</p>
        </div>
      </aside>
    </div>
  );
}
