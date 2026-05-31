"""Module 1 — Tactical Harvest Simulator.

Given the farm + user constraints, evaluate every valid harvest ORDER under K
uncertain futures (uncertain harvester speed + uncertain rain arrival) and
return a [n_candidates, K] matrix of economic value protected, plus companion
fuel/hours/coverage matrices.

Design: Common Random Numbers — the K scenarios are sampled ONCE and every
candidate is scored against the same futures, so downstream regret is valid and
the demo is deterministic (seeded). The K axis is fully vectorized in numpy; a
short Python loop runs over the ≤120 candidate orders.
"""

from __future__ import annotations

from dataclasses import dataclass
from itertools import permutations

import numpy as np

from .data import BASE_LOSS, K_DEFAULT, SEED
from .models import Constraints, FarmState

OVERRUN_SATURATION_H = 6.0  # tras esta cantidad de horas bajo lluvia, la pérdida satura
SALVAGE_L_POR_HA = 7.0  # litros extra para levantar/reprocesar cultivo acamado por ha perdida
MAX_EXACT_PERMS = 5040  # 7! — más allá de esto, se muestrea el espacio de órdenes


@dataclass
class Scenarios:
    """Sampled uncertain inputs, shared across all candidates (CRN)."""

    speed_field: np.ndarray  # (n_fields, K) ruido de condición del lote
    machine_vel: np.ndarray  # (M, K) velocidad muestreada por máquina
    machine_fuel: np.ndarray  # (M,) litros/ha por máquina
    rain_arrival: np.ndarray  # (K,) hora de llegada de la lluvia
    M: int  # número de servidores en paralelo = min(máquinas, operadores)


@dataclass
class SimMatrix:
    orders: list[tuple[int, ...]]  # cada orden es una permutación de índices de lote
    value: np.ndarray  # (C, K) valor económico protegido ($)
    fuel_used: np.ndarray  # (C, K) litros consumidos
    wasted_fuel: np.ndarray  # (C, K) litros gastados en cultivo que igual se perdió
    machine_hours: np.ndarray  # (C, K) horas-máquina productivas
    cobertura: np.ndarray  # (C, K) fracción de ha cosechadas en la jornada (0..1)
    value_ceiling: float  # $ total si todo se protege (suma valor_por_ha*ha)
    field_ids: list[str]


def harvest_servers(farm: FarmState, operators: int):
    """Only combines harvest; tractors haul grain. So the number of parallel
    harvest servers is limited by combines AND operators. Extra operators beyond
    the combines give a modest speed boost (more crew = faster turnaround)."""
    combines = [m for m in farm.machines if m.tipo == "Combinada"] or farm.machines
    M = max(1, min(len(combines), operators))
    boost = 1.0 + 0.05 * min(max(operators - 1, 0), 5)  # 1.0 .. 1.25
    return combines[:M], M, boost


def _field_arrays(farm: FarmState):
    ids = [lo.id for lo in farm.lotes]
    area = np.array([lo.superficie_ha for lo in farm.lotes], float)
    hpha = np.array([lo.horas_por_ha for lo in farm.lotes], float)
    valor = np.array([lo.valor_por_ha for lo in farm.lotes], float)
    moisture_factor = np.array([np.clip((lo.humedad - 20) / 100, 0, 0.30) for lo in farm.lotes], float)
    base_loss = np.array([BASE_LOSS[lo.vulnerabilidad] for lo in farm.lotes], float)
    return ids, area, hpha, valor, moisture_factor, base_loss


def sample_scenarios(farm: FarmState, c: Constraints, K: int, rng: np.random.Generator) -> Scenarios:
    n = len(farm.lotes)
    machines, M, boost = harvest_servers(farm, c.operators)

    speed_field = np.clip(rng.normal(1.0, 0.10, size=(n, K)), 0.5, 1.5)
    vel_mean = np.array([m.vel_mult_mean for m in machines], float)[:, None]
    vel_sd = np.array([m.vel_mult_sd for m in machines], float)[:, None]
    machine_vel = np.clip(rng.normal(vel_mean, vel_sd, size=(M, K)), 0.2, 1.8) * boost
    machine_fuel = np.array([m.fuel_l_por_ha for m in machines], float)

    eta = c.rain_eta_h if c.rain_eta_h is not None else farm.weather.rain_eta_h
    rain_arrival = np.clip(rng.normal(eta, farm.weather.rain_eta_sd, size=K), 0.0, np.inf)
    return Scenarios(speed_field, machine_vel, machine_fuel, rain_arrival, M)


def _candidate_orders(n: int, rng: np.random.Generator) -> list[tuple[int, ...]]:
    import math

    if math.factorial(n) <= MAX_EXACT_PERMS:
        return list(permutations(range(n)))
    # espacio demasiado grande: muestrear órdenes aleatorios distintos
    seen: set[tuple[int, ...]] = set()
    while len(seen) < 2000:
        seen.add(tuple(rng.permutation(n)))
    return list(seen)


def _schedule_finish(order, area, hpha, sc: Scenarios) -> tuple[np.ndarray, np.ndarray]:
    """Vectorized greedy 'earliest-free machine' schedule for one order.

    Returns (finish[n,K], chosen_machine[n,K]). The assignment *pattern* is the
    same across scenarios for a fixed order — only durations differ — so we keep
    machine_free as an (M,K) array and let each scenario pick its own machine.
    """
    K = sc.rain_arrival.shape[0]
    n = area.shape[0]
    machine_free = np.zeros((sc.M, K))
    finish = np.zeros((n, K))
    chosen = np.zeros((n, K), dtype=int)
    idx = np.arange(K)
    for f in order:
        m = np.argmin(machine_free, axis=0)  # (K,) servidor libre más pronto
        vel = sc.machine_vel[m, idx]  # (K,) velocidad de la máquina elegida
        dur = area[f] * hpha[f] / np.clip(vel * sc.speed_field[f], 0.2, None)
        start = machine_free[m, idx]
        end = start + dur
        machine_free[m, idx] = end  # indexación avanzada en AMBOS ejes (la línea delicada)
        finish[f] = end
        chosen[f] = m
    return finish, chosen


def simulate(farm: FarmState, c: Constraints, K: int = K_DEFAULT, seed: int | None = None) -> SimMatrix:
    rng = np.random.default_rng(SEED if seed is None else seed)
    ids, area, hpha, valor, moisture_factor, base_loss = _field_arrays(farm)
    n = len(ids)
    sc = sample_scenarios(farm, c, K, rng)
    orders = _candidate_orders(n, rng)
    window = c.shift_window_hours
    value_per_field = valor * area  # $ máximo por lote
    value_ceiling = float(value_per_field.sum())

    val_rows, fuel_rows, waste_rows, hours_rows, cover_rows = [], [], [], [], []
    for order in orders:
        finish, chosen = _schedule_finish(order, area, hpha, sc)  # (n,K)
        in_window = finish <= window
        before_rain = finish <= sc.rain_arrival[None, :]
        protected = before_rain & in_window

        # overrun: 0 si protegido; (finish-rain)/R si se cosechó tarde; 1 si quedó sin cosechar
        overrun = np.where(
            in_window,
            np.clip((finish - sc.rain_arrival[None, :]) / OVERRUN_SATURATION_H, 0, 1),
            1.0,
        )
        loss_frac = np.clip(base_loss[:, None] + moisture_factor[:, None], 0, 0.95) * (0.4 + 0.6 * overrun)
        protected_frac = np.where(protected, 1.0, 1.0 - loss_frac)

        value = (value_per_field[:, None] * protected_frac).sum(axis=0)  # (K,)

        fuel_field = area[:, None] * sc.machine_fuel[chosen]  # (n,K) litros por lote cosechado
        harvested = in_window
        fuel_used = np.where(harvested, fuel_field, 0.0).sum(axis=0)
        # Combustible desperdiciado = salvamento del cultivo acamado. Cada ha perdida
        # (1 - fracción protegida) exige pasadas extra de máquina. Un plan que pierde
        # menos hectáreas desperdicia menos combustible → ese es el ahorro real.
        ha_perdidas = ((1.0 - protected_frac) * area[:, None]).sum(axis=0)
        wasted_fuel = ha_perdidas * SALVAGE_L_POR_HA
        # horas-máquina productivas = suma de duraciones de lotes cosechados
        kcol = np.arange(finish.shape[1])[None, :]  # (1,K)
        vel_chosen = sc.machine_vel[chosen, kcol]  # (n,K) velocidad de la máquina elegida
        vel_eff = np.clip(vel_chosen * sc.speed_field, 0.2, None)
        duration = area[:, None] * hpha[:, None] / vel_eff
        machine_hours = np.where(harvested, duration, 0.0).sum(axis=0)
        cobertura = np.where(harvested, area[:, None], 0.0).sum(axis=0) / area.sum()

        val_rows.append(value)
        fuel_rows.append(fuel_used)
        waste_rows.append(wasted_fuel)
        hours_rows.append(machine_hours)
        cover_rows.append(cobertura)

    return SimMatrix(
        orders=orders,
        value=np.vstack(val_rows),
        fuel_used=np.vstack(fuel_rows),
        wasted_fuel=np.vstack(waste_rows),
        machine_hours=np.vstack(hours_rows),
        cobertura=np.vstack(cover_rows),
        value_ceiling=value_ceiling,
        field_ids=ids,
    )


def deterministic_assignment(order: tuple[int, ...], farm: FarmState, operators: int) -> dict[int, str]:
    """Which machine harvests each field, using mean speeds and no rain.
    Used to build the human-readable action sequence (pasos)."""
    machines, M, _ = harvest_servers(farm, operators)
    area = np.array([lo.superficie_ha for lo in farm.lotes], float)
    hpha = np.array([lo.horas_por_ha for lo in farm.lotes], float)
    free = np.zeros(M)
    out: dict[int, str] = {}
    for f in order:
        m = int(np.argmin(free))
        dur = area[f] * hpha[f] / machines[m].vel_mult_mean
        free[m] += dur
        out[f] = machines[m].id
    return out
