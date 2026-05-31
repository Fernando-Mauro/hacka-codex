"""Engine — single orchestration entry point shared by the CLI and the API.

`run_simulation(farm, constraints)` returns a fully frontend-shaped, Spanish
`Recommendation` (a superset of the frontend contract): the action sequence, the
sustainability block, and the Regret Meter.
"""

from __future__ import annotations

from time import perf_counter

from .data import CO2_POR_LITRO
from .models import Constraints, FarmState, Paso, Recommendation, RegretMeter, Sustentabilidad
from .regret import Decision, baseline_order, decide
from .simulator import deterministic_assignment, simulate


def _badge(d: Decision) -> str:
    if d.baja_presion_clima:
        return "Sin presión de clima — cualquier orden razonable funciona"
    if d.confianza >= 80:
        return "Robusto frente a lluvias"
    if d.confianza >= 66:
        return "Sensible al clima — confirmar pronóstico"
    return "Ventana ajustada — considere más personal"


def _build_pasos(farm: FarmState, c: Constraints, d: Decision) -> list[Paso]:
    assign = deterministic_assignment(d.rec_order, farm, c.operators)
    maquinas = {m.id: m for m in farm.machines}
    pasos: list[Paso] = []
    for orden, f in enumerate(d.rec_order, start=1):
        lo = farm.lotes[f]
        maq_id = assign[f]
        maq = maquinas[maq_id]
        titulo = f"Cosechar {lo.nombre} con {maq.tipo} {maq_id}"
        if orden == 1:
            detalle = (
                f"Mayor valor económico expuesto a la lluvia. {lo.cultivo} · {int(lo.superficie_ha)} ha. "
                "Prioridad sobre todo lo demás."
            )
        elif lo.estado == "riesgo":
            detalle = (
                f"Riesgo agronómico (no climático): puede ir después de proteger lo que la lluvia amenaza hoy. "
                f"{lo.cultivo} · {int(lo.superficie_ha)} ha."
            )
        elif lo.estado == "ok":
            detalle = f"Madura sin riesgo dentro de la ventana. {lo.cultivo} · {int(lo.superficie_ha)} ha."
        else:
            detalle = f"{lo.cultivo} · {int(lo.superficie_ha)} ha · vulnerabilidad {lo.vulnerabilidad}."
        pasos.append(Paso(orden=orden, titulo=titulo, detalle=detalle, campo=lo.id, maquina=maq_id))
    return pasos


def _sustainability(d: Decision) -> Sustentabilidad:
    combustible = int(round(max(0.0, d.wasted_fuel_base - d.wasted_fuel_rec)))
    emisiones = int(round(combustible * CO2_POR_LITRO))
    return Sustentabilidad(combustible=combustible, emisiones=emisiones, horas=f"{d.machine_hours_rec:.1f}")


def _mensaje(farm: FarmState, d: Decision) -> str:
    nombre = {i: lo.nombre for i, lo in enumerate(farm.lotes)}
    rec_first = nombre[d.rec_order[0]]
    base_first = nombre[d.base_order[0]]
    if d.baja_presion_clima:
        return (
            "Sin presión de clima significativa: el valor protegido es prácticamente el máximo "
            "posible, así que el orden importa poco hoy."
        )
    if d.ahorro_vs_intuicion > 0 and rec_first != base_first:
        return (
            f"Empezar por {rec_first} protege ${d.valor_protegido:,} y evita perder "
            f"${d.ahorro_vs_intuicion:,} frente al orden intuitivo (empezar por {base_first} "
            "por urgencia visible). La diferencia: la urgencia visible no siempre es la urgencia económica."
        )
    return (
        f"El orden recomendado protege ${d.valor_protegido:,}. En estos escenarios el orden "
        "intuitivo logra un resultado similar."
    )


def _no_operators(farm: FarmState) -> Recommendation:
    base = baseline_order(farm)
    regret = RegretMeter(
        valor_protegido=0,
        valor_en_riesgo=int(round(sum(lo.valor_por_ha * lo.superficie_ha for lo in farm.lotes))),
        ahorro_vs_intuicion=0,
        regret_recomendado=0,
        confianza=46,
        umbral_p20=0,
        recomendado_orden=[],
        intuicion_orden=[farm.lotes[i].id for i in base],
        mensaje="Sin operadores en turno no es posible cosechar; todo el valor queda expuesto a la lluvia.",
    )
    return Recommendation(
        confianza=46,
        badge="Sin operadores disponibles — no es posible cosechar hoy",
        robusto=False,
        pasos=[],
        sustentabilidad=Sustentabilidad(combustible=0, emisiones=0, horas="0.0"),
        regret_meter=regret,
        cobertura=0,
        sim_ms=0.0,
    )


def run_simulation(farm: FarmState, c: Constraints) -> Recommendation:
    if min(len(farm.machines), c.operators) <= 0:
        return _no_operators(farm)

    t0 = perf_counter()
    matrix = simulate(farm, c, seed=c.seed)
    d = decide(matrix, farm)
    sim_ms = (perf_counter() - t0) * 1000

    regret = RegretMeter(
        valor_protegido=d.valor_protegido,
        valor_en_riesgo=d.valor_en_riesgo,
        ahorro_vs_intuicion=d.ahorro_vs_intuicion,
        regret_recomendado=d.regret_recomendado,
        confianza=d.confianza,
        umbral_p20=d.umbral_p20,
        recomendado_orden=[farm.lotes[i].id for i in d.rec_order],
        intuicion_orden=[farm.lotes[i].id for i in d.base_order],
        mensaje=_mensaje(farm, d),
    )
    return Recommendation(
        confianza=d.confianza,
        badge=_badge(d),
        robusto=d.robusto,
        pasos=_build_pasos(farm, c, d),
        sustentabilidad=_sustainability(d),
        regret_meter=regret,
        cobertura=d.cobertura,
        sim_ms=round(sim_ms, 1),
    )
