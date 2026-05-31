"""Module 2 — Regret Meter (the core differentiator).

Consumes the [n_candidates, K] value matrix from the simulator and turns it into
a robust decision plus the regret numbers:

- Selection objective: CVaR@20 (mean of the worst 20% of scenarios). We *select*
  on the bad-weather tail and *report* P20 as the headline. CVaR beats pure
  worst-case (a single freak rain draw won't dominate the choice).
- Baseline: the "intuitive" order a competent operator would pick by reading the
  map — estado severity, then area desc. Fair, not a strawman.
- Regret: vs. the baseline ("ahorro") and vs. the per-scenario oracle ("how much
  the recommendation still leaves on the table" — proves near-optimality).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .data import ESTADO_SEVERITY
from .models import FarmState
from .simulator import SimMatrix


@dataclass
class Decision:
    rec_idx: int
    rec_order: tuple[int, ...]
    base_idx: int
    base_order: tuple[int, ...]
    valor_protegido: int
    valor_en_riesgo: int
    ahorro_vs_intuicion: int
    regret_recomendado: int
    confianza: int
    robusto: bool
    umbral_p20: int
    cobertura: int
    baja_presion_clima: bool
    # raw means for sustainability accounting
    wasted_fuel_rec: float
    wasted_fuel_base: float
    machine_hours_rec: float


def baseline_order(farm: FarmState) -> tuple[int, ...]:
    """Intuitive order: harvest the most visibly urgent (and, ties, largest) first."""
    idx = list(range(len(farm.lotes)))
    idx.sort(key=lambda i: (-ESTADO_SEVERITY[farm.lotes[i].estado], -farm.lotes[i].superficie_ha))
    return tuple(idx)


def decide(matrix: SimMatrix, farm: FarmState) -> Decision:
    value = matrix.value  # (C, K)
    C, K = value.shape
    k20 = max(1, int(0.20 * K))

    cvar20 = np.sort(value, axis=1)[:, :k20].mean(axis=1)  # (C,)
    p20 = np.percentile(value, 20, axis=1)
    mean_val = value.mean(axis=1)
    var = value.var(axis=1)
    oracle = value.max(axis=0)  # (K,) mejor posible por escenario (en retrospectiva)
    regret_per = (oracle[None, :] - value).mean(axis=1)  # (C,)

    # recommended: max CVaR, deterministic tiebreak (regret ↑, varianza ↑, orden lexicográfico)
    rank = sorted(range(C), key=lambda i: (-cvar20[i], regret_per[i], var[i], matrix.orders[i]))
    rec_idx = rank[0]
    rec_order = matrix.orders[rec_idx]

    base_order = baseline_order(farm)
    base_idx = matrix.orders.index(base_order) if base_order in matrix.orders else rec_idx

    # Confidence = % of climates where the plan protects ≥90% of what was even
    # *achievable* that day (the per-scenario oracle), NOT of the full ceiling —
    # one combine can't beat the rain on every field, so the ceiling is
    # unreachable and would floor the score. A robust plan tracks the oracle.
    threshold = 0.90 * float(oracle.mean())
    conf_raw = 100.0 * float((value[rec_idx] >= threshold).mean())
    confianza = int(np.clip(round(conf_raw), 46, 98))

    valor_protegido = int(round(mean_val[rec_idx]))
    valor_en_riesgo = int(round(matrix.value_ceiling - mean_val[rec_idx]))
    ahorro = int(round(mean_val[rec_idx] - mean_val[base_idx]))
    regret_rec = int(round(regret_per[rec_idx]))
    cobertura = int(round(100 * matrix.cobertura[rec_idx].mean()))
    baja_presion = mean_val[rec_idx] >= 0.985 * matrix.value_ceiling

    return Decision(
        rec_idx=rec_idx,
        rec_order=rec_order,
        base_idx=base_idx,
        base_order=base_order,
        valor_protegido=valor_protegido,
        valor_en_riesgo=valor_en_riesgo,
        ahorro_vs_intuicion=max(0, ahorro),
        regret_recomendado=max(0, regret_rec),
        confianza=confianza,
        robusto=confianza >= 80,
        umbral_p20=int(round(p20[rec_idx])),
        cobertura=cobertura,
        baja_presion_clima=bool(baja_presion),
        wasted_fuel_rec=float(matrix.wasted_fuel[rec_idx].mean()),
        wasted_fuel_base=float(matrix.wasted_fuel[base_idx].mean()),
        machine_hours_rec=float(matrix.machine_hours[rec_idx].mean()),
    )
