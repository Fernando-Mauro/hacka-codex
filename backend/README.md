# FieldLoop — Decision Engine (backend)

Monte Carlo **counterfactual harvest simulator** for FieldLoop. It recommends the
harvest **order** that protects the most **economic value** under uncertainty
(uncertain harvester speed + uncertain rain arrival), and quantifies the cost of
being wrong with a **Regret Meter**.

Positioning: a *decision layer* that complements **John Deere Operations Center**.
Operations Center captures and displays data; FieldLoop **decides under
uncertainty** — optimizing for value protected, not raw hectares.

> Standalone for now. The Next.js frontend (`../app/fieldloop/`) still uses its
> client-side stubs; the API shapes mirror the frontend `Recommendation` contract
> so it can be wired later with no shape changes.

## Run

Requires [`uv`](https://docs.astral.sh/uv/) (Python 3.13).

```bash
cd backend
uv sync                       # create .venv + install deps

uv run python demo.py         # CLI demo (Spanish): order, regret, 14-day risk, advisories
uv run uvicorn fieldloop.api:app --reload --port 8000   # API
```

Open `http://localhost:8000/docs` for the interactive OpenAPI UI.

## The four modules

1. **Tactical simulator** (`simulator.py`) — Common-Random-Numbers Monte Carlo
   (K=1000) over every harvest order. Only the **combine** harvests (tractors haul
   grain), so it's one harvester racing the rain — which is what makes the order
   matter. Vectorized across scenarios; ~30 ms for 120 orders × 1000 sims.
2. **Regret Meter** (`regret.py`) — selects the **robust** order by **CVaR@20**
   (mean of the worst 20% of climates), reports **P20** as the headline, and
   compares against the *intuitive* baseline (harvest the most visibly urgent
   field first). Returns clean ints/strings.
3. **Time-lapse risk** (`risk.py`) — 14-day risk trajectory (0..100) per field for
   the "Ver Futuro" animation, anchored to the frontend's risk curve.
4. **Long-horizon advisory** (`advisory.py`) — strategic, rule-based Spanish
   advisories (soil, storage moisture, pest drift). Deliberately does **not**
   affect today's order.

`engine.run_simulation(farm, constraints)` is the single entry point shared by the
CLI and the API.

## Architecture — two calibration layers

- **Data-calibrated base:** the simulation samples from distributions estimated
  from incoming data (machine harvest-speed, weather forecast), seeded for
  reproducible demos.
- **User constraints on top:** `operators` and `shift_window_hours` are hard
  constraints that prune the space of valid plans.

## API

| Method | Path             | Body / query                                    | Returns |
|--------|------------------|-------------------------------------------------|---------|
| GET    | `/health`        | —                                               | `{"status":"ok"}` |
| GET    | `/farm`          | —                                               | `FarmState` (5 lotes, máquinas, clima en vivo) |
| GET    | `/weather`       | —                                               | `WeatherReport` (Open-Meteo, 7 días) |
| POST   | `/simulate`      | `{operators, shift_window_hours, rain_eta_h?, seed?}` | `Recommendation` (+ Regret Meter) |
| POST   | `/forecast_risk` | `{scenario, rain_eta_h?}`                       | `{scenario, horizon, fields:{id:[..15..]}}` |
| GET    | `/report`        | `?operators=4&shift_window_hours=10`            | `ReportResponse` (KPIs + palancas + riesgos + clima) |
| GET    | `/advisories`    | —                                               | `Advisory[]` |

### Clima dinámico (Open-Meteo)

`/weather` y, por debajo, `/simulate` · `/forecast_risk` · `/report` usan el
pronóstico **real** de [Open-Meteo](https://open-meteo.com) (gratis, sin API key)
para las coordenadas del rancho (Monterrey). Del pronóstico horario se deriva el
**próximo evento de lluvia** (`rain_eta_h` + probabilidad), que es la incertidumbre
que promedia el Monte Carlo; el outlook diario de 7 días alimenta el timeline y el
informe. Se cachea 30 min y **cae a un pronóstico sintético** si el servicio no
responde. Puedes forzar un escenario de lluvia para el demo pasando `rain_eta_h`
en `/simulate`.

### `/simulate` response (superset of the frontend `Recommendation` type)

```jsonc
{
  "confianza": 90,                 // 46..98 ; robusto = confianza >= 80
  "badge": "Robusto frente a lluvias",
  "robusto": true,
  "pasos": [ { "orden": 1, "titulo": "...", "detalle": "...", "campo": "elrio", "maquina": "C1" }, ... ],
  "sustentabilidad": { "combustible": 40, "emisiones": 106, "horas": "8.5" },
  "regret_meter": {
    "valor_protegido": 118184, "valor_en_riesgo": 12516,
    "ahorro_vs_intuicion": 3709, "regret_recomendado": 798,
    "confianza": 90, "umbral_p20": 114543,
    "recomendado_orden": ["elrio","laloma","oriente","poniente","norte"],
    "intuicion_orden":   ["laloma","elrio","poniente","norte","oriente"],
    "mensaje": "Empezar por Lote El Río protege $118,184 y evita perder $3,709 ..."
  },
  "cobertura": 43,                 // % de ha cosechadas dentro de la jornada
  "sim_ms": 39.7
}
```

> **Wiring note (later):** the frontend risk overlay expects `flRiskFor` values in
> **0..1**; `/forecast_risk` returns **0..100** ints — divide by 100 at the
> boundary. Everything else is a drop-in for `flComputeRecommendation`.

## The demo story (default: `operators=4, shift_window_hours=10`)

The engine recommends harvesting **Lote El Río first** — the high-value, rain-
exposed corn — while a competent operator's *intuitive* order starts with **Lote
La Loma** (it's flagged `riesgo` on the map). But La Loma's risk is **foliar
disease** (a 14-day agronomic problem), not today's rain, and it's small. The
Regret Meter shows the intuitive order **loses ~$3,700** by confusing *visible*
urgency with *economic* urgency. Drop `operators` to 1 and the engine honestly
declines to gamble on El Río and protects guaranteed value instead.
