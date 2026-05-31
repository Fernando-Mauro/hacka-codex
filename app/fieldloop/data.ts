// data.ts — FieldLoop scenario data + the hidden "motor invisible" calc.
// Scenario: ranch land near Monterrey, Nuevo León. A rain window is closing;
// the corn in Lote El Río must be harvested before it lodges (se acame).

export type Estado = "ok" | "precaucion" | "urgente" | "riesgo";
export type Vulnerabilidad = "Baja" | "Media" | "Alta";
export type LatLng = [number, number];

export interface Field {
  id: string;
  nombre: string;
  cultivo: string;
  estado: Estado;
  humedad: number; // % humedad de grano
  vulnerabilidad: Vulnerabilidad;
  superficie: number; // ha
  nota: string;
  geo: LatLng[]; // [lat,lng] vertices
}

export interface Machine {
  id: string;
  tipo: string;
  modelo: string;
  ll: LatLng;
  estado: string;
  asignado: string;
}

export interface EstadoMeta {
  label: string;
  swatch: string;
  hex: string;
}

// ── Field polygons over real ranch land near Monterrey, Nuevo León ──
export const FL_FIELDS: Field[] = [
  {
    id: "norte",
    nombre: "Lote Norte",
    cultivo: "Maíz",
    estado: "ok",
    humedad: 22,
    vulnerabilidad: "Baja",
    superficie: 38,
    nota: "Maduración estable. Sin acción inmediata.",
    geo: [
      [25.8840, -100.0580],
      [25.8842, -100.0510],
      [25.8800, -100.0508],
      [25.8798, -100.0582],
    ],
  },
  {
    id: "elrio",
    nombre: "Lote El Río",
    cultivo: "Maíz",
    estado: "urgente",
    humedad: 31,
    vulnerabilidad: "Alta",
    superficie: 52,
    nota: "Lluvia entrante en ~9 h. Riesgo de acame si no se cosecha hoy.",
    geo: [
      [25.8842, -100.0500],
      [25.8845, -100.0426],
      [25.8796, -100.0430],
      [25.8796, -100.0498],
    ],
  },
  {
    id: "poniente",
    nombre: "Lote Poniente",
    cultivo: "Trigo",
    estado: "precaucion",
    humedad: 18,
    vulnerabilidad: "Media",
    superficie: 29,
    nota: "Ventana de cosecha en 2–3 días. Vigilar humedad.",
    geo: [
      [25.8786, -100.0581],
      [25.8788, -100.0528],
      [25.8740, -100.0526],
      [25.8738, -100.0583],
    ],
  },
  {
    id: "laloma",
    nombre: "Lote La Loma",
    cultivo: "Frijol",
    estado: "riesgo",
    humedad: 27,
    vulnerabilidad: "Alta",
    superficie: 21,
    nota: "Mancha foliar detectada. Requiere revisión agronómica.",
    geo: [
      [25.8788, -100.0516],
      [25.8790, -100.0468],
      [25.8742, -100.0468],
      [25.8741, -100.0514],
    ],
  },
  {
    id: "oriente",
    nombre: "Lote Oriente",
    cultivo: "Alfalfa",
    estado: "ok",
    humedad: 16,
    vulnerabilidad: "Baja",
    superficie: 18,
    nota: "Corte reciente. Rebrote sano.",
    geo: [
      [25.8790, -100.0458],
      [25.8792, -100.0428],
      [25.8744, -100.0430],
      [25.8743, -100.0456],
    ],
  },
];

// Map view config
export const FL_MAP_CENTER: LatLng = [25.8792, -100.0505];
export const FL_MAP_ZOOM = 15;

// ── Machines: clean labelled pins at real coords ──
export const FL_MACHINES: Machine[] = [
  { id: "C1", tipo: "Combinada", modelo: "S7 700", ll: [25.8835, -100.0444], estado: "Lista", asignado: "elrio" },
  { id: "T2", tipo: "Tractor", modelo: "6M", ll: [25.8804, -100.0566], estado: "En espera", asignado: "norte" },
  { id: "T3", tipo: "Tractor", modelo: "5E", ll: [25.8742, -100.0570], estado: "Cargando", asignado: "poniente" },
];

export const FL_ESTADO_META: Record<Estado, EstadoMeta> = {
  ok: { label: "Saludable", swatch: "var(--green)", hex: "#46a86a" },
  precaucion: { label: "Precaución", swatch: "var(--amber)", hex: "#e3a92c" },
  urgente: { label: "Urgente", swatch: "var(--amber)", hex: "#e3a92c" },
  riesgo: { label: "En riesgo", swatch: "var(--red)", hex: "#cc5740" },
};

export interface Paso {
  orden: number;
  titulo: string;
  detalle: string;
  campo: string;
  maquina: string;
}

export interface Sustentabilidad {
  combustible: number;
  emisiones: number;
  horas: string;
}

export interface Recommendation {
  confianza: number;
  badge: string;
  robusto: boolean;
  pasos: Paso[];
  sustentabilidad: Sustentabilidad;
}

// ── The hidden engine ───────────────────────────────────────────────
// Monte Carlo lives "in the backend"; the UI only ever sees the outputs
// below. Given a weather window (días) and available staff, produce a
// confidence score + a plain-language action sequence + sustainability.
export function flComputeRecommendation(ventanaDias: number, personal: number): Recommendation {
  // Deterministic stand-in for the simulation result.
  const base = 58;
  const staffGain = Math.min(personal, 6) * 4.2; // diminishing past 6
  const windowGain = Math.min(ventanaDias, 5) * 3.0;
  const tight = ventanaDias <= 1 ? -6 : 0; // very tight window penalty
  let conf = Math.round(base + staffGain + windowGain + tight);
  conf = Math.max(46, Math.min(98, conf));

  const robusto = conf >= 80;
  const badge = robusto
    ? "Robusto frente a lluvias"
    : conf >= 66
      ? "Sensible al clima — confirmar pronóstico"
      : "Ventana ajustada — considere más personal";

  // Plain action sequence — the "qué hago ahora".
  const pasos: Paso[] = [
    {
      orden: 1,
      titulo: "Cosechar Lote El Río con Combinada C1",
      detalle: "Iniciar antes de las 14:00. Prioridad sobre todo lo demás.",
      campo: "elrio",
      maquina: "C1",
    },
    {
      orden: 2,
      titulo: personal >= 3
        ? "Trasladar grano con Tractor T3 en paralelo"
        : "Trasladar grano con Tractor T3 al cerrar El Río",
      detalle: personal >= 3
        ? "Equipo suficiente para operar en paralelo."
        : "Personal limitado: operar en secuencia para no dispersar.",
      campo: "poniente",
      maquina: "T3",
    },
    {
      orden: 3,
      titulo: "Dejar Lote Norte para mañana",
      detalle: "Madura sin riesgo dentro de la ventana de clima.",
      campo: "norte",
      maquina: "T2",
    },
  ];

  // Sustainability — scales gently with how well-sequenced the plan is.
  const eficiencia = conf / 100;
  const combustible = Math.round(28 + eficiencia * 64); // litros ahorrados
  const emisiones = Math.round(combustible * 2.64); // kg CO2 (diesel)
  const horas = (1.2 + eficiencia * 2.4).toFixed(1); // horas-máquina ahorradas

  return {
    confianza: conf,
    badge,
    robusto,
    pasos,
    sustentabilidad: { combustible, emisiones, horas },
  };
}

// Spherical polygon area in hectares from [[lat,lng],...]
export function flPolygonHa(coords: LatLng[]): number {
  if (!coords || coords.length < 3) return 0;
  const R = 6378137,
    rad = Math.PI / 180;
  let area = 0;
  const n = coords.length;
  for (let i = 0; i < n; i++) {
    const [la1, lo1] = coords[i];
    const [la2, lo2] = coords[(i + 1) % n];
    area += (lo2 - lo1) * rad * (2 + Math.sin(la1 * rad) + Math.sin(la2 * rad));
  }
  area = Math.abs((area * R * R) / 2);
  return area / 10000;
}

// ── "Ver Futuro" risk model ─────────────────────────────────────────
// The hidden Monte Carlo is summarised as a single risk trajectory per lot.
// risk(day) grows from a base (set by current estado) toward 1, at a rate
// set by vulnerabilidad and the chosen scenario. day = 0 is hoy.
const FL_RISK_BASE: Record<Estado, number> = { ok: 0.06, precaucion: 0.45, urgente: 0.5, riesgo: 0.78 };
const FL_RISK_K: Record<Vulnerabilidad, number> = { Baja: 0.015, Media: 0.06, Alta: 0.14 };

export type ScenarioKey = "optimista" | "esperado" | "pesimista";
export const FL_SCENARIO: Record<ScenarioKey, { mult: number; label: string }> = {
  optimista: { mult: 0.42, label: "Optimista" },
  esperado: { mult: 1.0, label: "Esperado" },
  pesimista: { mult: 1.85, label: "Pesimista" },
};
export const FL_HORIZON = 14; // días

export function flRiskFor(field: Field, day: number, scenario: ScenarioKey): number {
  const base = FL_RISK_BASE[field.estado] ?? 0.2;
  const k = (FL_RISK_K[field.vulnerabilidad] ?? 0.04) * (FL_SCENARIO[scenario]?.mult ?? 1);
  const r = base + (1 - base) * (1 - Math.exp(-k * day));
  return Math.max(0, Math.min(1, r));
}

function flHex2rgb(h: string): [number, number, number] {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function flLerpColor(a: string, b: string, t: number): string {
  const ca = flHex2rgb(a),
    cb = flHex2rgb(b);
  const c = ca.map((v, i) => Math.round(v + (cb[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
// risk → smooth green→amber→red gradient (weather-radar style)
export function flRiskColor(r: number): string {
  const GREEN = "#46a86a",
    AMBER = "#e3a92c",
    RED = "#cc4633";
  if (r <= 0.5) return flLerpColor(GREEN, AMBER, r / 0.5);
  return flLerpColor(AMBER, RED, Math.min((r - 0.5) / 0.38, 1));
}
