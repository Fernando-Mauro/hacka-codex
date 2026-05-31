"""FastAPI surface for the FieldLoop decision engine.

Endpoints:
  GET  /health        — liveness probe.
  GET  /farm          — the synthetic farm (so the frontend can load the dataset).
  GET  /weather       — live 7-day forecast (Open-Meteo) for the ranch.
  POST /simulate      — tactical recommendation + Regret Meter (frontend-shaped).
  POST /forecast_risk — 14-day per-field risk arrays for the "Ver Futuro" animation.
  GET  /report        — decision report: KPIs + improvement levers + risks + weather.
  GET  /advisories    — long-horizon strategic advisories (Module 4).

Run:  uv run uvicorn fieldloop.api:app --reload --port 8000
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .advisory import advisories
from .data import MTY_BBOX, make_farm
from .engine import run_simulation
from .landuse import validate_lot
from .models import (
    Advisory,
    Constraints,
    FarmState,
    LotGeometry,
    LotValidation,
    Recommendation,
    ReportResponse,
    RiskForecast,
    RiskRequest,
    WeatherReport,
)
from .report import build_report
from .risk import forecast_risk
from .weather import daily_rain_prob, get_weather, to_forecast

app = FastAPI(
    title="FieldLoop Decision Engine",
    version="0.2.0",
    description="Simulador Monte Carlo de cosecha robusta bajo incertidumbre, con "
    "clima dinámico (Open-Meteo). Capa de decisión que complementa John Deere "
    "Operations Center.",
)

# The Next.js frontend runs on :3000 in dev. Allow it (and common local hosts).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# The base farm is synthetic and stateless; build it once per process.
_BASE_FARM = make_farm()


def live_farm() -> FarmState:
    """The farm with its weather replaced by the live (cached) forecast."""
    return _BASE_FARM.model_copy(update={"weather": to_forecast(get_weather())})


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/farm", response_model=FarmState)
def get_farm() -> FarmState:
    return live_farm()


@app.get("/weather", response_model=WeatherReport)
def weather() -> WeatherReport:
    """Live 7-day forecast for the ranch (Open-Meteo, cached 30 min, synthetic
    fallback if the service is unreachable)."""
    return get_weather()


@app.post("/simulate", response_model=Recommendation)
def simulate(constraints: Constraints) -> Recommendation:
    """Run the tactical Monte Carlo simulator under the given user constraints
    (against the live weather) and return the robust recommendation + Regret Meter."""
    return run_simulation(live_farm(), constraints)


@app.post("/forecast_risk", response_model=RiskForecast)
def forecast(req: RiskRequest) -> RiskForecast:
    """14-day risk trajectory per field (0..100), driven by the real daily rain
    probability for the chosen scenario."""
    w = get_weather()
    return forecast_risk(live_farm(), req.scenario, req.rain_eta_h, daily_rain_prob=daily_rain_prob(w))


@app.get("/report", response_model=ReportResponse)
def report(operators: int = 4, shift_window_hours: float = 10.0) -> ReportResponse:
    """Decision report: executive KPIs, improvement levers, per-lote risks and the
    live weather context."""
    c = Constraints(operators=operators, shift_window_hours=shift_window_hours)
    return build_report(live_farm(), c, get_weather())


@app.get("/advisories", response_model=list[Advisory])
def get_advisories() -> list[Advisory]:
    return advisories(_BASE_FARM)


@app.get("/demo_zone")
def demo_zone() -> dict[str, float]:
    """Bounding box of the Monterrey demo area (so the editor can fence drawing)."""
    return MTY_BBOX


@app.post("/validate_lot", response_model=LotValidation)
def validate_lot_endpoint(lot: LotGeometry) -> LotValidation:
    """Validate a drawn lot's land use against OpenStreetMap (water / urban /
    rock are rejected); anything outside the demo zone is rejected."""
    return validate_lot(lot.geo)
