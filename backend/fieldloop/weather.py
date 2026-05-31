"""Dynamic weather — the "¿lloverá?" uncertainty, sourced live from Open-Meteo.

Open-Meteo is free and needs no API key. We pull the hourly precipitation
probability/amount for the ranch coordinates, derive the next significant rain
event (which feeds the tactical Monte Carlo as `rain_eta_h` + `rain_prob`), and
keep the 7-day daily outlook (which feeds the "Ver Futuro" timeline and the
report). Everything degrades gracefully to a synthetic forecast if the API is
unreachable, so the app never hard-depends on the network.
"""

from __future__ import annotations

import json
import time
import urllib.request
from datetime import datetime, timedelta, timezone

from .data import RANCHO_LAT, RANCHO_LON
from .models import WeatherDay, WeatherForecast, WeatherReport

_URL = (
    "https://api.open-meteo.com/v1/forecast"
    "?latitude={lat}&longitude={lon}"
    "&hourly=precipitation,precipitation_probability"
    "&daily=precipitation_sum,precipitation_probability_max"
    "&forecast_days=7&timezone=auto"
)
_TTL_S = 1800  # cachear 30 min para no martillar el API
_cache: dict[str, object] = {"t": 0.0, "report": None}


def _synthetic() -> WeatherReport:
    """Fallback determinista cuando el API no responde."""
    diario = [WeatherDay(fecha=f"+{d}d", prob=[70, 55, 30, 25, 20, 35, 45][d], mm=[6.0, 3.0, 0.5, 0.2, 0.1, 1.0, 2.0][d]) for d in range(7)]
    return WeatherReport(
        fuente="sintético",
        lat=RANCHO_LAT,
        lon=RANCHO_LON,
        rain_eta_h=10.0,
        rain_eta_sd=1.8,
        rain_prob=70,
        resumen="Pronóstico sintético (sin conexión al servicio de clima): lluvia en ~10 h, 70% prob.",
        diario=diario,
    )


def _parse(payload: dict) -> WeatherReport:
    hourly = payload["hourly"]
    times = [datetime.fromisoformat(t) for t in hourly["time"]]
    probs = [p if p is not None else 0 for p in hourly["precipitation_probability"]]
    precs = [p if p is not None else 0.0 for p in hourly["precipitation"]]

    off = int(payload.get("utc_offset_seconds", 0))
    now_local = (datetime.now(timezone.utc) + timedelta(seconds=off)).replace(tzinfo=None)
    i0 = next((i for i, t in enumerate(times) if t >= now_local), 0)

    # próximo evento de lluvia significativo en las próximas 48 h
    eta_h = 48.0
    event_prob = 0
    horizon = min(i0 + 48, len(times))
    for j in range(i0, horizon):
        if probs[j] >= 50 or precs[j] >= 0.2:
            eta_h = float(j - i0)
            event_prob = int(probs[j])
            break
    if event_prob == 0:  # sin evento claro: usar el pico de las próximas 24 h
        window = probs[i0 : min(i0 + 24, len(times))] or [0]
        event_prob = int(max(window))

    sd = min(max(eta_h * 0.2, 1.0), 3.0)

    daily = payload["daily"]
    dias = []
    for d, fecha in enumerate(daily["time"][:7]):
        prob = daily["precipitation_probability_max"][d]
        mm = daily["precipitation_sum"][d]
        dias.append(WeatherDay(fecha=fecha, prob=int(prob if prob is not None else 0), mm=float(mm if mm is not None else 0.0)))

    if eta_h >= 48:
        resumen = f"Sin lluvia significativa prevista en las próximas 48 h (pico {event_prob}%)."
    else:
        resumen = f"Lluvia en ~{eta_h:.0f} h, {event_prob}% de probabilidad (Open-Meteo)."

    return WeatherReport(
        fuente="Open-Meteo",
        lat=RANCHO_LAT,
        lon=RANCHO_LON,
        rain_eta_h=eta_h,
        rain_eta_sd=sd,
        rain_prob=event_prob,
        resumen=resumen,
        diario=dias,
    )


def get_weather(lat: float = RANCHO_LAT, lon: float = RANCHO_LON, force: bool = False) -> WeatherReport:
    now = time.time()
    cached = _cache.get("report")
    if cached is not None and not force and now - float(_cache["t"]) < _TTL_S:
        return cached  # type: ignore[return-value]
    try:
        req = urllib.request.Request(_URL.format(lat=lat, lon=lon), headers={"User-Agent": "FieldLoop/0.1"})
        with urllib.request.urlopen(req, timeout=4) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        report = _parse(payload)
    except Exception:
        report = _synthetic()
    _cache["t"] = now
    _cache["report"] = report
    return report


def to_forecast(w: WeatherReport) -> WeatherForecast:
    """Adapt the live report into the WeatherForecast the simulator consumes."""
    return WeatherForecast(rain_eta_h=w.rain_eta_h, rain_eta_sd=w.rain_eta_sd, rain_prob=w.rain_prob / 100.0)


def daily_rain_prob(w: WeatherReport) -> list[float]:
    """Per-day rain probability (0..1) for the risk timeline."""
    return [d.prob / 100.0 for d in w.diario]
