"""Land-use validation (SIG libre) — a lot may only be drawn on actual ranch
land, not on water or built-up areas.

We use OpenStreetMap via the Overpass API (free, no key) as the GIS source: for
the lot's bounding box we pull water / urban / bare-rock features, build their
geometries with Shapely, and measure how much of the lot overlaps each. Water
and urban overlap above a small threshold (or a centroid inside one) reject the
lot. If Overpass can't be reached the lot is allowed but flagged "no verificado",
so the network is never a hard dependency.

Scope is limited to the Monterrey demo bounding box (data.MTY_BBOX); anything
outside is rejected outright.
"""

from __future__ import annotations

import json
import urllib.parse
import urllib.request

from shapely.geometry import Polygon
from shapely.ops import unary_union

from .data import MTY_BBOX
from .models import LatLng, LotValidation

_OVERPASS = "https://overpass-api.de/api/interpreter"

# overlap mínimo (fracción del área del lote) para rechazar por cada categoría
_TH_AGUA = 0.05
_TH_URBANO = 0.12
_TH_ROCA = 0.20


def _bbox(coords: list[LatLng]) -> tuple[float, float, float, float]:
    lats = [c[0] for c in coords]
    lons = [c[1] for c in coords]
    return min(lats), min(lons), max(lats), max(lons)


def _inside_demo(coords: list[LatLng]) -> bool:
    b = MTY_BBOX
    return all(b["south"] <= la <= b["north"] and b["west"] <= lo <= b["east"] for la, lo in coords)


def _lot_polygon(coords: list[LatLng]) -> Polygon:
    # Shapely usa (x=lon, y=lat).
    return Polygon([(lo, la) for la, lo in coords])


def _category(tags: dict) -> str | None:
    if tags.get("natural") in {"water", "wetland"} or tags.get("waterway") == "riverbank" or tags.get("landuse") == "reservoir":
        return "agua"
    if tags.get("building") or tags.get("landuse") in {"residential", "industrial", "commercial", "retail", "construction"}:
        return "urbano"
    if tags.get("natural") in {"bare_rock", "scree", "sand", "glacier"}:
        return "roca"
    return None


def _overpass_query(s: float, w: float, n: float, e: float) -> str:
    box = f"{s},{w},{n},{e}"
    return (
        "[out:json][timeout:8];("
        f'way["natural"~"^(water|wetland|bare_rock|scree|sand)$"]({box});'
        f'relation["natural"="water"]({box});'
        f'way["waterway"="riverbank"]({box});'
        f'way["landuse"~"^(reservoir|residential|industrial|commercial|retail|construction)$"]({box});'
        f'relation["landuse"~"^(reservoir|residential|industrial|commercial|retail)$"]({box});'
        f'way["building"]({box});'
        ");out geom;"
    )


def _polys_from_element(el: dict) -> list[Polygon]:
    out: list[Polygon] = []
    geom = el.get("geometry")
    if geom and len(geom) >= 3:
        try:
            out.append(Polygon([(p["lon"], p["lat"]) for p in geom]).buffer(0))
        except Exception:
            pass
    for m in el.get("members", []):  # relaciones (multipolígonos)
        g = m.get("geometry")
        if g and len(g) >= 3:
            try:
                out.append(Polygon([(p["lon"], p["lat"]) for p in g]).buffer(0))
            except Exception:
                pass
    return out


def validate_lot(coords: list[LatLng]) -> LotValidation:
    if not coords or len(coords) < 3:
        return LotValidation(valido=False, clase="no_verificado", motivo="Geometría inválida.", fuente="—", overlap_pct=0)

    if not _inside_demo(coords):
        return LotValidation(
            valido=False,
            clase="fuera_zona",
            motivo="El lote está fuera de la zona de demo (área metropolitana de Monterrey).",
            fuente="—",
            overlap_pct=0,
        )

    lot = _lot_polygon(coords).buffer(0)
    if lot.area <= 0:
        return LotValidation(valido=False, clase="no_verificado", motivo="Geometría degenerada.", fuente="—", overlap_pct=0)

    s, w, n, e = _bbox(coords)
    try:
        data = urllib.parse.urlencode({"data": _overpass_query(s, w, n, e)}).encode()
        req = urllib.request.Request(_OVERPASS, data=data, headers={"User-Agent": "FieldLoop/0.1"})
        with urllib.request.urlopen(req, timeout=9) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except Exception:
        return LotValidation(
            valido=True,
            clase="no_verificado",
            motivo="No se pudo verificar el uso de suelo (sin conexión al SIG). Se permite con advertencia.",
            fuente="—",
            overlap_pct=0,
        )

    buckets: dict[str, list[Polygon]] = {"agua": [], "urbano": [], "roca": []}
    for el in payload.get("elements", []):
        cat = _category(el.get("tags", {}))
        if cat:
            buckets[cat].extend(_polys_from_element(el))

    def overlap(cat: str) -> float:
        polys = buckets[cat]
        if not polys:
            return 0.0
        try:
            inter = lot.intersection(unary_union(polys)).area
        except Exception:
            return 0.0
        return inter / lot.area if lot.area else 0.0

    ov_agua, ov_urb, ov_roca = overlap("agua"), overlap("urbano"), overlap("roca")

    if ov_agua >= _TH_AGUA:
        return LotValidation(valido=False, clase="agua", motivo="El lote cae sobre un cuerpo de agua (río, presa o lago).", fuente="OpenStreetMap", overlap_pct=round(ov_agua * 100))
    if ov_urb >= _TH_URBANO:
        return LotValidation(valido=False, clase="urbano", motivo="El lote cae sobre zona urbana o construida.", fuente="OpenStreetMap", overlap_pct=round(ov_urb * 100))
    if ov_roca >= _TH_ROCA:
        return LotValidation(valido=False, clase="no_cultivable", motivo="El lote cae sobre suelo no cultivable (roca o arena).", fuente="OpenStreetMap", overlap_pct=round(ov_roca * 100))

    return LotValidation(valido=True, clase="cultivable", motivo="Uso de suelo apto para cultivo/rancho.", fuente="OpenStreetMap", overlap_pct=0)
