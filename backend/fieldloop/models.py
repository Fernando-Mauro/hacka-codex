"""Pydantic v2 data models for the FieldLoop decision engine.

These define both the synthetic-farm input contract and the API response
shapes. The response models are intentionally a *superset* of the Next.js
frontend's `Recommendation` type (see app/fieldloop/data.ts) so the frontend
can be wired to `/simulate` later with no shape changes.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field as PField

Estado = Literal["ok", "precaucion", "urgente", "riesgo"]
Vulnerabilidad = Literal["Baja", "Media", "Alta"]
ScenarioKey = Literal["optimista", "esperado", "pesimista"]
LatLng = tuple[float, float]  # (lat, lng)


# ── Inputs (the "data-calibrated base") ─────────────────────────────────────
class Lote(BaseModel):
    """A field/parcel. Mirrors the frontend Field, plus economic + physics
    fields the simulator needs (valor_por_ha, horas_por_ha)."""

    id: str
    nombre: str
    cultivo: str
    estado: Estado
    humedad: float  # % humedad de grano
    vulnerabilidad: Vulnerabilidad
    superficie_ha: float
    valor_por_ha: float  # $ por hectárea (valor económico del cultivo en pie)
    horas_por_ha: float  # horas-máquina para cosechar 1 ha (a velocidad nominal)


class Machine(BaseModel):
    id: str
    tipo: str
    modelo: str
    vel_mult_mean: float = 1.0  # multiplicador de velocidad nominal
    vel_mult_sd: float = 0.18  # incertidumbre de velocidad (datos de la máquina)
    fuel_l_por_ha: float = 11.0  # litros de diésel por ha


class WeatherForecast(BaseModel):
    rain_eta_h: float  # horas hasta la lluvia (pronóstico)
    rain_eta_sd: float = 2.5  # incertidumbre del pronóstico
    rain_prob: float = 0.8  # prob. de que efectivamente llueva en el horizonte


class FarmState(BaseModel):
    nombre: str
    region: str
    lotes: list[Lote]
    machines: list[Machine]
    weather: WeatherForecast


# ── Constraints (the "user constraints on top") ─────────────────────────────
class Constraints(BaseModel):
    """Hard constraints the user imposes; they prune the space of valid plans."""

    operators: int = PField(default=4, ge=0, le=20)
    shift_window_hours: float = PField(default=10.0, gt=0, le=24)
    rain_eta_h: float | None = PField(default=None, ge=0)  # override del pronóstico
    seed: int | None = None  # fija el azar (o cámbialo para "ver otro futuro")


class RiskRequest(BaseModel):
    scenario: ScenarioKey = "esperado"
    rain_eta_h: float | None = PField(default=None, ge=0)


# ── Outputs (frontend-shaped) ───────────────────────────────────────────────
class Paso(BaseModel):
    orden: int
    titulo: str
    detalle: str
    campo: str  # id del lote
    maquina: str  # id de la máquina


class Sustentabilidad(BaseModel):
    combustible: int  # litros ahorrados vs. el orden intuitivo
    emisiones: int  # kg CO₂ evitados
    horas: str  # horas-máquina del plan (1 decimal)


class RegretMeter(BaseModel):
    valor_protegido: int  # $ esperado protegido por el plan recomendado
    valor_en_riesgo: int  # $ esperado en riesgo (perdido) por el plan recomendado
    ahorro_vs_intuicion: int  # $ que el plan recomendado salva vs. el orden intuitivo
    regret_recomendado: int  # $ que aún se pierde vs. el óptimo en retrospectiva
    confianza: int  # % de escenarios que cumplen el umbral de éxito (46–98)
    umbral_p20: int  # $ protegido en el 80% de los climas (percentil 20)
    recomendado_orden: list[str]  # ids de lotes, en orden de cosecha
    intuicion_orden: list[str]
    mensaje: str  # explicación en español llano


class Recommendation(BaseModel):
    """Superset of the frontend `Recommendation` type."""

    confianza: int
    badge: str
    robusto: bool
    pasos: list[Paso]
    sustentabilidad: Sustentabilidad
    regret_meter: RegretMeter
    cobertura: int  # % de hectáreas cosechadas dentro de la jornada
    sim_ms: float  # tiempo de cómputo de la simulación (ms)


class RiskForecast(BaseModel):
    scenario: ScenarioKey
    horizon: int
    fields: dict[str, list[int]]  # id del lote -> arreglo 0..100 de largo horizon+1


class Advisory(BaseModel):
    lote: str
    severidad: Literal["info", "vigilar", "atender"]
    titulo: str
    texto: str


# ── Weather (dynamic, Open-Meteo) ───────────────────────────────────────────
class WeatherDay(BaseModel):
    fecha: str  # ISO date
    prob: int  # probabilidad máxima de precipitación (%)
    mm: float  # precipitación acumulada (mm)


class WeatherReport(BaseModel):
    fuente: Literal["Open-Meteo", "sintético"]
    lat: float
    lon: float
    rain_eta_h: float  # horas hasta el próximo evento de lluvia significativo
    rain_eta_sd: float
    rain_prob: int  # probabilidad del evento (%)
    resumen: str  # texto en español llano
    diario: list[WeatherDay]  # pronóstico día a día (hasta 7 días)


# ── Informe / report ────────────────────────────────────────────────────────
class Lever(BaseModel):
    id: str
    titulo: str  # "+1 operador en turno"
    detalle: str
    delta_confianza: int  # puntos porcentuales
    delta_valor: int  # $ adicionales protegidos
    delta_cobertura: int  # puntos porcentuales
    nuevo_valor_protegido: int


class LoteRiesgo(BaseModel):
    id: str
    nombre: str
    nivel: Literal["bajo", "medio", "alto"]
    causa: str
    riesgo_pct: int  # 0..100 en el horizonte cercano


class ReportResumen(BaseModel):
    valor_protegido: int
    valor_en_riesgo: int
    confianza: int
    robusto: bool
    ahorro_vs_intuicion: int
    co2_evitado: int
    cobertura: int
    badge: str
    mensaje: str
    recomendado_orden: list[str]


class ReportResponse(BaseModel):
    resumen: ReportResumen
    palancas: list[Lever]
    riesgos: list[LoteRiesgo]
    clima: WeatherReport


# ── Land-use validation (SIG libre) ─────────────────────────────────────────
ClaseSuelo = Literal["cultivable", "agua", "urbano", "no_cultivable", "fuera_zona", "no_verificado"]


class LotGeometry(BaseModel):
    geo: list[LatLng]  # [lat, lng] vertices del lote


class LotValidation(BaseModel):
    valido: bool
    clase: ClaseSuelo
    motivo: str
    fuente: str  # "OpenStreetMap" | "—"
    overlap_pct: int  # % del lote sobre el uso de suelo conflictivo
