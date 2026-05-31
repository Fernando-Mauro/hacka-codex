"""Synthetic, internally-consistent fictional farm (Mexican Spanish) plus the
shared calibration constants. The 5 lotes mirror the frontend dataset exactly
(ids, nombre, cultivo, estado, humedad, vulnerabilidad, superficie) and gain
the economic/physics fields the simulator needs.

Scenario: Rancho El Fresno, ranch land near Monterrey, Nuevo León. A rain
window is closing; the corn in Lote El Río risks lodging (acame) if not
harvested today.
"""

from __future__ import annotations

from .models import FarmState, Lote, Machine, WeatherForecast

# Economic value of standing crop ($/ha) and machine-hours to harvest 1 ha.
VALOR_POR_HA: dict[str, float] = {"Maíz": 850, "Trigo": 700, "Frijol": 1100, "Alfalfa": 600}
# Machine-hours for the combine to harvest 1 ha. Tuned so a single combine can
# *just* finish the big urgent field (El Río, 52 ha → ~8.3 h) before the ~9 h
# rain if it's prioritized — and miss it if it isn't. This is what makes the
# harvest ORDER matter.
HORAS_POR_HA: dict[str, float] = {"Maíz": 0.15, "Trigo": 0.13, "Frijol": 0.15, "Alfalfa": 0.10}

# Lodging / rain loss fraction by vulnerability (fraction of value lost if the
# field is caught standing in the rain).
BASE_LOSS: dict[str, float] = {"Baja": 0.05, "Media": 0.18, "Alta": 0.35}

# ── Risk-curve constants (anchored to the frontend so "Ver Futuro" matches) ──
FL_RISK_BASE: dict[str, float] = {"ok": 0.06, "precaucion": 0.45, "urgente": 0.5, "riesgo": 0.78}
FL_RISK_K: dict[str, float] = {"Baja": 0.015, "Media": 0.06, "Alta": 0.14}
FL_SCENARIO_MULT: dict[str, float] = {"optimista": 0.42, "esperado": 1.0, "pesimista": 1.85}
FL_HORIZON = 14

# Estado severity for the "intuitive" baseline order (higher = harvest sooner).
ESTADO_SEVERITY: dict[str, int] = {"riesgo": 3, "urgente": 2, "precaucion": 1, "ok": 0}

CO2_POR_LITRO = 2.64  # kg CO₂ por litro de diésel

# Coordenadas reales del Rancho El Fresno (zona de ranchos al norte de Monterrey),
# usadas para el pronóstico dinámico del clima (Open-Meteo).
RANCHO_LAT = 25.8792
RANCHO_LON = -100.0505

# Zona de demo acotada al área metropolitana de Monterrey, N.L. Incluye la ciudad
# (uso de suelo urbano), el Río Santa Catarina y la Presa La Boca (agua), y la
# zona de ranchos al oriente. Fuera de este bbox no se permite dibujar lotes.
MTY_BBOX = {"south": 25.40, "west": -100.60, "north": 25.98, "east": -99.90}

SEED = 42
K_DEFAULT = 1000


def _lote(id, nombre, cultivo, estado, humedad, vuln, sup) -> Lote:
    return Lote(
        id=id,
        nombre=nombre,
        cultivo=cultivo,
        estado=estado,
        humedad=humedad,
        vulnerabilidad=vuln,
        superficie_ha=sup,
        valor_por_ha=VALOR_POR_HA[cultivo],
        horas_por_ha=HORAS_POR_HA[cultivo],
    )


def make_farm() -> FarmState:
    """Build the canonical synthetic farm."""
    lotes = [
        _lote("norte", "Lote Norte", "Maíz", "ok", 22, "Baja", 38),
        _lote("elrio", "Lote El Río", "Maíz", "urgente", 31, "Alta", 52),
        _lote("poniente", "Lote Poniente", "Trigo", "precaucion", 18, "Media", 29),
        _lote("laloma", "Lote La Loma", "Frijol", "riesgo", 27, "Alta", 21),
        _lote("oriente", "Lote Oriente", "Alfalfa", "ok", 16, "Baja", 18),
    ]
    machines = [
        Machine(id="C1", tipo="Combinada", modelo="S7 700", vel_mult_mean=1.0, vel_mult_sd=0.16, fuel_l_por_ha=13.0),
        Machine(id="T2", tipo="Tractor", modelo="6M", vel_mult_mean=0.95, vel_mult_sd=0.18, fuel_l_por_ha=9.0),
        Machine(id="T3", tipo="Tractor", modelo="5E", vel_mult_mean=0.9, vel_mult_sd=0.2, fuel_l_por_ha=8.0),
    ]
    weather = WeatherForecast(rain_eta_h=10.0, rain_eta_sd=1.8, rain_prob=0.8)
    return FarmState(nombre="Rancho El Fresno", region="Nuevo León", lotes=lotes, machines=machines, weather=weather)
