"""Informe — turns the Monte Carlo output into a decision report: an executive
summary, improvement *levers* (re-run the simulation with one more operator or a
longer shift and report how much confidence/value moves), per-lote risks, and
the live weather context.
"""

from __future__ import annotations

from .data import CO2_POR_LITRO  # noqa: F401  (kept for parity / future use)
from .engine import run_simulation
from .models import (
    Constraints,
    FarmState,
    Lever,
    LoteRiesgo,
    ReportResponse,
    ReportResumen,
    WeatherReport,
)
from .risk import forecast_risk

RISK_HORIZON_DAY = 3  # los riesgos del informe se leen al día +3 (corto plazo)


def _nivel(pct: int) -> str:
    if pct >= 66:
        return "alto"
    if pct >= 40:
        return "medio"
    return "bajo"


def _causa(estado: str, vulnerabilidad: str, humedad: float, eta_h: float) -> str:
    if estado == "urgente" or (vulnerabilidad == "Alta" and humedad >= 28):
        return f"Acame por lluvia entrante (~{eta_h:.0f} h)"
    if estado == "riesgo":
        return "Mancha foliar / plaga — riesgo agronómico (días)"
    if estado == "precaucion":
        return "Ventana de cosecha cerrándose"
    return "Maduración estable"


def _lever(farm: FarmState, base, c: Constraints, lever_id: str, titulo: str, detalle: str, new_c: Constraints) -> Lever:
    alt = run_simulation(farm, new_c)
    return Lever(
        id=lever_id,
        titulo=titulo,
        detalle=detalle,
        delta_confianza=alt.confianza - base.confianza,
        delta_valor=alt.regret_meter.valor_protegido - base.regret_meter.valor_protegido,
        delta_cobertura=alt.cobertura - base.cobertura,
        nuevo_valor_protegido=alt.regret_meter.valor_protegido,
    )


def build_report(farm: FarmState, c: Constraints, weather: WeatherReport) -> ReportResponse:
    base = run_simulation(farm, c)

    # ── Palancas de mejora (sensibilidad de la decisión) ───────────────
    palancas: list[Lever] = []
    if c.operators < 6:
        palancas.append(
            _lever(farm, base, c, "op+1", "+1 operador en turno",
                   "Sumar un operador acelera la cosecha antes de la lluvia.",
                   Constraints(operators=c.operators + 1, shift_window_hours=c.shift_window_hours, rain_eta_h=c.rain_eta_h))
        )
    palancas.append(
        _lever(farm, base, c, "win+2", "+2 h de jornada",
               "Extender la jornada permite alcanzar más lotes dentro del día.",
               Constraints(operators=c.operators, shift_window_hours=min(c.shift_window_hours + 2, 24), rain_eta_h=c.rain_eta_h))
    )
    if c.operators < 5:
        palancas.append(
            _lever(farm, base, c, "op+2", "+2 operadores en turno",
                   "Máxima cuadrilla: protege el mayor valor posible hoy.",
                   Constraints(operators=c.operators + 2, shift_window_hours=c.shift_window_hours, rain_eta_h=c.rain_eta_h))
        )

    # ── Riesgos por lote (al horizonte cercano, con clima real) ────────
    fr = forecast_risk(farm, "esperado", daily_rain_prob=[d.prob / 100.0 for d in weather.diario])
    riesgos: list[LoteRiesgo] = []
    for lo in farm.lotes:
        pct = fr.fields.get(lo.id, [0])[min(RISK_HORIZON_DAY, len(fr.fields.get(lo.id, [0])) - 1)]
        riesgos.append(
            LoteRiesgo(
                id=lo.id,
                nombre=lo.nombre,
                nivel=_nivel(pct),
                causa=_causa(lo.estado, lo.vulnerabilidad, lo.humedad, weather.rain_eta_h),
                riesgo_pct=pct,
            )
        )
    riesgos.sort(key=lambda r: -r.riesgo_pct)

    resumen = ReportResumen(
        valor_protegido=base.regret_meter.valor_protegido,
        valor_en_riesgo=base.regret_meter.valor_en_riesgo,
        confianza=base.confianza,
        robusto=base.robusto,
        ahorro_vs_intuicion=base.regret_meter.ahorro_vs_intuicion,
        co2_evitado=base.sustentabilidad.emisiones,
        cobertura=base.cobertura,
        badge=base.badge,
        mensaje=base.regret_meter.mensaje,
        recomendado_orden=base.regret_meter.recomendado_orden,
    )

    return ReportResponse(resumen=resumen, palancas=palancas, riesgos=riesgos, clima=weather)
