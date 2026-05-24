import asyncio
import json
import logging
import os

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from geoalchemy2.shape import to_shape
from sqlalchemy.orm import Session

from app.concurrency import run_sync
from app.config import get_settings
from app.database import get_db
from app.models.forest import ForestZone, GEELayer
from app.models.user import User
from app.schemas.forest import (
    ForestZoneCreate,
    ForestZoneRead,
    GEEClipRequest,
    GEEClipResponse,
    GEELayerRead,
)
from app.security import get_current_user
from app.services.gee_service import LAYER_HANDLERS

settings = get_settings()
logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/carto", tags=["Cartographie"])


# ─── Zones de forêt ──────────────────────────────────────────

@router.get("/zones", response_model=list[ForestZoneRead])
def list_zones(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Liste toutes les zones de forêt suivies."""
    zones = db.query(ForestZone).all()
    results = []
    for z in zones:
        geom_shape = to_shape(z.geometry) if z.geometry else None
        results.append(
            ForestZoneRead(
                id=z.id,
                name=z.name,
                code=z.code,
                description=z.description,
                area_ha=z.area_ha,
                geometry=geom_shape.__geo_interface__ if geom_shape else None,
                created_at=z.created_at,
            )
        )
    return results


@router.get("/zones/{zone_id}", response_model=ForestZoneRead)
def get_zone(
    zone_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Détail d'une zone de forêt."""
    zone = db.query(ForestZone).filter(ForestZone.id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone non trouvée")
    geom_shape = to_shape(zone.geometry) if zone.geometry else None
    return ForestZoneRead(
        id=zone.id,
        name=zone.name,
        code=zone.code,
        description=zone.description,
        area_ha=zone.area_ha,
        geometry=geom_shape.__geo_interface__ if geom_shape else None,
        created_at=zone.created_at,
    )


@router.post("/zones", response_model=ForestZoneRead, status_code=201)
def create_zone(
    payload: ForestZoneCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Créer une nouvelle zone de forêt (GeoJSON geometry attendu)."""
    from shapely.geometry import shape
    from geoalchemy2.shape import from_shape

    geom = shape(payload.geometry)
    zone = ForestZone(
        name=payload.name,
        code=payload.code,
        description=payload.description,
        area_ha=payload.area_ha,
        geometry=from_shape(geom, srid=4326),
    )
    db.add(zone)
    db.commit()
    db.refresh(zone)
    return ForestZoneRead(
        id=zone.id,
        name=zone.name,
        code=zone.code,
        description=zone.description,
        area_ha=zone.area_ha,
        geometry=payload.geometry,
        created_at=zone.created_at,
    )


# ─── GEE Clip / Analyse ──────────────────────────────────────

@router.post("/gee/clip", response_model=GEEClipResponse)
async def clip_gee_layer(
    payload: GEEClipRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Découpe une couche GEE selon les limites d'une zone de forêt.
    layer_type : tree_cover | forest_loss | forest_gain | ndvi | land_cover | elevation | slope | hillshade
    """
    zone = db.query(ForestZone).filter(ForestZone.id == payload.forest_zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone de forêt non trouvée")

    handler = LAYER_HANDLERS.get(payload.layer_type)
    if not handler:
        raise HTTPException(
            status_code=400,
            detail=f"Type de couche inconnu : {payload.layer_type}. "
            f"Types disponibles : {list(LAYER_HANDLERS.keys())}",
        )

    geom_shape = to_shape(zone.geometry)
    geometry_geojson = geom_shape.__geo_interface__

    kwargs = {}
    if payload.layer_type in ("ndvi", "land_cover"):
        if payload.date_start:
            kwargs["date_start"] = payload.date_start
        if payload.date_end:
            kwargs["date_end"] = payload.date_end
    elif payload.layer_type == "forest_loss":
        if payload.date_start:
            kwargs["year_start"] = int(payload.date_start[:4])
        if payload.date_end:
            kwargs["year_end"] = int(payload.date_end[:4])

    try:
        result = await run_sync(handler, geometry_geojson, timeout=120, **kwargs)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Google Earth Engine : timeout (120s)")
    except Exception as exc:
        logger.exception("Erreur GEE clip (%s)", payload.layer_type)
        raise HTTPException(status_code=502, detail=f"Erreur Google Earth Engine : {exc}")

    return GEEClipResponse(
        forest_zone_id=zone.id,
        forest_zone_name=zone.name,
        layer_type=payload.layer_type,
        tile_url=result.get("tile_url"),
        stats=result.get("stats"),
    )


@router.get("/gee/layers", response_model=list[GEELayerRead])
def list_gee_layers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Liste les couches GEE enregistrées en base."""
    return db.query(GEELayer).all()


# ─── GeoJSON brut (pour le frontend) ─────────────────────────

@router.get("/geojson/forets")
def get_forets_geojson(current_user: User = Depends(get_current_user)):
    """Retourne le GeoJSON brut des limites de forêts."""
    filepath = os.path.join(settings.DATA_DIR, "limite_des_forets.geojson")
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Fichier GeoJSON des forêts non trouvé")
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)
    return JSONResponse(content=data)


@router.get("/geojson/pays")
def get_pays_geojson(current_user: User = Depends(get_current_user)):
    """Retourne le GeoJSON brut des limites du pays (Côte d'Ivoire)."""
    filepath = os.path.join(settings.DATA_DIR, "Limite_cote_d'ivoire.geojson")
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Fichier GeoJSON du pays non trouvé")
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)
    return JSONResponse(content=data)
