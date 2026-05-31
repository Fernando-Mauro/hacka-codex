"""CLI demo — runs the FieldLoop engine on the synthetic farm and prints the
recommended harvest order, the regret comparison, the 14-day risk arrays, and
the long-horizon advisories. All output in Mexican Spanish.

    uv run python demo.py
"""

from __future__ import annotations

from fieldloop import Constraints, advisories, forecast_risk, make_farm, run_simulation

LINE = "─" * 64


def _bar(pct: int, width: int = 20) -> str:
    fill = int(round(pct / 100 * width))
    return "█" * fill + "·" * (width - fill)


def main() -> None:
    farm = make_farm()
    nombre = {lo.id: lo.nombre for lo in farm.lotes}
    c = Constraints(operators=4, shift_window_hours=10.0)

    print(LINE)
    print(f"  FieldLoop · {farm.nombre} ({farm.region})")
    print(f"  {len(farm.lotes)} lotes · {len(farm.machines)} máquinas · "
          f"lluvia en ~{farm.weather.rain_eta_h:.0f} h · operadores: {c.operators} · "
          f"jornada: {c.shift_window_hours:.0f} h")
    print(LINE)

    rec = run_simulation(farm, c)

    # ── Recomendación ──────────────────────────────────────────────
    print("\n▸ ACCIÓN RECOMENDADA")
    print(f"  Confianza: {rec.confianza}%  ({'ROBUSTO' if rec.robusto else 'revisar'}) — {rec.badge}")
    print(f"  Cobertura de jornada: {rec.cobertura}%   ·   cómputo: {rec.sim_ms} ms")
    print("  Secuencia:")
    for p in rec.pasos:
        print(f"    {p.orden}. {p.titulo}")
        print(f"       {p.detalle}")

    # ── Regret Meter ───────────────────────────────────────────────
    rm = rec.regret_meter
    print("\n▸ REGRET METER  (¿cuánto pierdes si te equivocas?)")
    print(f"  Orden recomendado : {' → '.join(nombre[i] for i in rm.recomendado_orden)}")
    print(f"  Orden intuitivo   : {' → '.join(nombre[i] for i in rm.intuicion_orden)}")
    print(f"  Valor protegido   : ${rm.valor_protegido:,}")
    print(f"  Valor en riesgo   : ${rm.valor_en_riesgo:,}")
    print(f"  Garantía (P20)    : ${rm.umbral_p20:,}  protegido en el 80% de los climas")
    print(f"  Ahorro vs intuición: ${rm.ahorro_vs_intuicion:,}")
    print(f"  Regret residual   : ${rm.regret_recomendado:,}  (vs. el óptimo en retrospectiva)")
    print(f"  → {rm.mensaje}")

    # ── Sustentabilidad ────────────────────────────────────────────
    s = rec.sustentabilidad
    print("\n▸ IMPACTO DEL PLAN")
    print(f"  Combustible ahorrado: {s.combustible} L   ·   "
          f"Emisiones evitadas: {s.emisiones} kg CO₂   ·   "
          f"Horas-máquina: {s.horas} h")

    # ── Riesgo 14 días (Ver Futuro) ────────────────────────────────
    print("\n▸ VER FUTURO · riesgo a 14 días (escenario esperado)")
    fr = forecast_risk(farm, "esperado")
    for lo in farm.lotes:
        arr = fr.fields[lo.id]
        d0, d7, d14 = arr[0], arr[7], arr[14]
        print(f"  {lo.nombre:<16} {_bar(d14)}  hoy {d0:>3} → d7 {d7:>3} → d14 {d14:>3}")

    # ── Asesorías largo plazo ──────────────────────────────────────
    print("\n▸ ASESORÍA DE LARGO PLAZO  (no afecta el orden de hoy)")
    for a in advisories(farm):
        print(f"  [{a.severidad.upper()}] {a.lote} — {a.titulo}")
        print(f"      {a.texto}")

    print("\n" + LINE)


if __name__ == "__main__":
    main()
