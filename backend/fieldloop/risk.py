"""Module 3 — Time-Lapse Risk Predictor (for the UI's 14-day animation).

Projects each field's risk (0..100) over the next 14 days if no action is taken.
The curve is anchored to the frontend's logistic shape (so the "Ver Futuro"
overlay looks identical) and lightly calibrated by data — grain moisture and rain
probability nudge the starting risk and growth rate.
"""

from __future__ import annotations

import math

from .data import FL_HORIZON, FL_RISK_BASE, FL_RISK_K, FL_SCENARIO_MULT
from .models import FarmState, RiskForecast, ScenarioKey

ANCHOR_W = 0.85  # peso de la curva del frontend (1.0 = idéntica); el resto es data-driven


def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def forecast_risk(
    farm: FarmState,
    scenario: ScenarioKey = "esperado",
    rain_eta_h: float | None = None,
    daily_rain_prob: list[float] | None = None,
) -> RiskForecast:
    """14-day risk per field. When `daily_rain_prob` (0..1 per day, from the live
    forecast) is given, each day's risk reflects that day's real rain chance;
    days beyond the forecast reuse the last available probability."""
    mult = FL_SCENARIO_MULT.get(scenario, 1.0)
    base_prob = farm.weather.rain_prob

    def rp(day: int) -> float:
        if not daily_rain_prob:
            return base_prob
        return daily_rain_prob[min(day, len(daily_rain_prob) - 1)]

    fields: dict[str, list[int]] = {}
    for lo in farm.lotes:
        base0 = FL_RISK_BASE[lo.estado]
        arr = []
        for day in range(FL_HORIZON + 1):
            prob = rp(day)
            # data-driven nudge: humedad alta + lluvia probable elevan el riesgo
            data_base = _sigmoid(0.12 * (lo.humedad - 25) + 1.1 * prob - 0.8)
            base = ANCHOR_W * base0 + (1 - ANCHOR_W) * data_base
            k = FL_RISK_K[lo.vulnerabilidad] * mult * (1 + 0.25 * prob)
            r = base + (1 - base) * (1 - math.exp(-k * day))
            arr.append(int(round(100 * min(max(r, 0.0), 1.0))))
        fields[lo.id] = arr
    return RiskForecast(scenario=scenario, horizon=FL_HORIZON, fields=fields)
