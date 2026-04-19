"""Service Google Earth Engine – découpe des couches par limites de forêt."""

import json
import logging

import ee
from google.oauth2 import service_account

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_initialized = False


def _init_gee():
    """Initialise la connexion à GEE avec un compte de service."""
    global _initialized
    if _initialized:
        return

    if settings.GEE_PRIVATE_KEY_FILE:
        credentials = service_account.Credentials.from_service_account_file(
            settings.GEE_PRIVATE_KEY_FILE,
            scopes=["https://www.googleapis.com/auth/earthengine"],
        )
        ee.Initialize(credentials=credentials)
    else:
        ee.Initialize()

    _initialized = True
    logger.info("Google Earth Engine initialisé")


def _geojson_to_ee_geometry(geojson: dict) -> ee.Geometry:
    """Convertit un GeoJSON geometry en ee.Geometry."""
    return ee.Geometry(geojson)


def get_tree_cover(geometry_geojson: dict, year: int = 2020) -> dict:
    """
    Couverture forestière (Hansen Global Forest Change).
    Retourne une tile URL et des statistiques.
    """
    _init_gee()
    region = _geojson_to_ee_geometry(geometry_geojson)

    dataset = ee.Image("UMD/hansen/global_forest_change_2023_v1_11")
    tree_cover = dataset.select("treecover2000").clip(region)

    stats = tree_cover.reduceRegion(
        reducer=ee.Reducer.mean().combine(ee.Reducer.minMax(), sharedInputs=True),
        geometry=region,
        scale=30,
        maxPixels=1e9,
    ).getInfo()

    vis_params = {"min": 0, "max": 100, "palette": ["red", "yellow", "green"]}
    map_id = tree_cover.getMapId(vis_params)

    return {
        "tile_url": map_id["tile_fetcher"].url_format,
        "stats": stats,
    }


def get_forest_loss(geometry_geojson: dict, year_start: int = 2001, year_end: int = 2023) -> dict:
    """Perte de forêt (Hansen) découpée par zone."""
    _init_gee()
    region = _geojson_to_ee_geometry(geometry_geojson)

    dataset = ee.Image("UMD/hansen/global_forest_change_2023_v1_11")
    loss_year = dataset.select("lossyear").clip(region)

    # Filtrer par intervalle d'années
    mask = loss_year.gte(year_start - 2000).And(loss_year.lte(year_end - 2000))
    loss_filtered = loss_year.updateMask(mask)

    stats = loss_filtered.reduceRegion(
        reducer=ee.Reducer.count(),
        geometry=region,
        scale=30,
        maxPixels=1e9,
    ).getInfo()

    vis_params = {"min": 1, "max": 23, "palette": ["yellow", "red"]}
    map_id = loss_filtered.getMapId(vis_params)

    return {
        "tile_url": map_id["tile_fetcher"].url_format,
        "stats": stats,
    }


def get_forest_gain(geometry_geojson: dict) -> dict:
    """Gain de forêt (Hansen) découpé par zone."""
    _init_gee()
    region = _geojson_to_ee_geometry(geometry_geojson)

    dataset = ee.Image("UMD/hansen/global_forest_change_2023_v1_11")
    gain = dataset.select("gain").clip(region)

    stats = gain.reduceRegion(
        reducer=ee.Reducer.sum(),
        geometry=region,
        scale=30,
        maxPixels=1e9,
    ).getInfo()

    vis_params = {"min": 0, "max": 1, "palette": ["black", "cyan"]}
    map_id = gain.getMapId(vis_params)

    return {
        "tile_url": map_id["tile_fetcher"].url_format,
        "stats": stats,
    }


def get_ndvi(geometry_geojson: dict, date_start: str = "2023-01-01", date_end: str = "2023-12-31") -> dict:
    """NDVI moyen (Sentinel-2) découpé par zone de forêt."""
    _init_gee()
    region = _geojson_to_ee_geometry(geometry_geojson)

    collection = (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterBounds(region)
        .filterDate(date_start, date_end)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
    )

    def add_ndvi(image):
        ndvi = image.normalizedDifference(["B8", "B4"]).rename("NDVI")
        return image.addBands(ndvi)

    ndvi_composite = collection.map(add_ndvi).select("NDVI").median().clip(region)

    stats = ndvi_composite.reduceRegion(
        reducer=ee.Reducer.mean().combine(ee.Reducer.minMax(), sharedInputs=True),
        geometry=region,
        scale=10,
        maxPixels=1e9,
    ).getInfo()

    vis_params = {"min": -0.1, "max": 0.8, "palette": ["brown", "yellow", "green", "darkgreen"]}
    map_id = ndvi_composite.getMapId(vis_params)

    return {
        "tile_url": map_id["tile_fetcher"].url_format,
        "stats": stats,
    }


# Mapping des types de couches aux fonctions
LAYER_HANDLERS = {
    "tree_cover": get_tree_cover,
    "forest_loss": get_forest_loss,
    "forest_gain": get_forest_gain,
    "ndvi": get_ndvi,
}
