"""Module 4 — Long-Horizon Advisory.

Surfaces slow, compounding signals a human can't easily perceive day-to-day
(soil degradation, pest pressure from temperature drift, moisture trends). This
is STRATEGIC: it deliberately does NOT affect today's harvest order — it's
separate counsel for the coming weeks. Rule-based, Mexican Spanish.
"""

from __future__ import annotations

from .models import Advisory, FarmState


def advisories(farm: FarmState) -> list[Advisory]:
    out: list[Advisory] = []

    for lo in farm.lotes:
        # Maíz repetido / vulnerabilidad alta → desgaste de suelo y nutrientes
        if lo.cultivo == "Maíz" and lo.vulnerabilidad == "Alta":
            out.append(
                Advisory(
                    lote=lo.nombre,
                    severidad="vigilar",
                    titulo="Desgaste de suelo a la vista",
                    texto=(
                        f"{lo.nombre} lleva ciclos consecutivos de maíz de alta demanda. "
                        "Considere rotar con leguminosa o abono verde el próximo ciclo para "
                        "frenar la pérdida de materia orgánica."
                    ),
                )
            )

        # Humedad de grano elevada → presión de hongos / micotoxinas en almacenamiento
        if lo.humedad >= 28:
            out.append(
                Advisory(
                    lote=lo.nombre,
                    severidad="atender",
                    titulo="Riesgo de hongos en almacenamiento",
                    texto=(
                        f"La humedad de grano en {lo.nombre} ({lo.humedad}%) está por encima del "
                        "rango seguro de almacenamiento. Planee secado antes de ensilar para evitar "
                        "micotoxinas en las próximas semanas."
                    ),
                )
            )

        # Mancha foliar / estado de riesgo agronómico → presión de plaga con deriva térmica
        if lo.estado == "riesgo":
            out.append(
                Advisory(
                    lote=lo.nombre,
                    severidad="vigilar",
                    titulo="Presión de plaga en aumento",
                    texto=(
                        f"El brote foliar en {lo.nombre} tiende a agravarse con noches más cálidas. "
                        "Programe monitoreo agronómico esta semana; no es urgencia de hoy, pero "
                        "compone con el tiempo."
                    ),
                )
            )

    if not out:
        out.append(
            Advisory(
                lote="Rancho",
                severidad="info",
                titulo="Sin señales de largo plazo",
                texto="No se detectan tendencias preocupantes de suelo, humedad o plaga este periodo.",
            )
        )
    return out
