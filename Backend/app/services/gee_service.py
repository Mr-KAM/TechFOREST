"""Service Google Earth Engine – découpe des couches par limites de forêt."""

import json
import logging
import os

import ee

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_initialized = False


def _init_gee():
    """Initialise la connexion à GEE.

    Stratégie d'authentification (dans l'ordre) :
    1. Service account JSON (GEE_CREDENTIALS_FILE pointe vers un fichier type "service_account")
    2. Credentials persistants (~/.config/earthengine/credentials, créés par `earthengine authenticate`)
    3. Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS)
    """
    global _initialized
    if _initialized:
        return

    project = settings.GEE_PROJECT_ID
    cred_file = settings.GEE_CREDENTIALS_FILE

    # 1) Tenter avec un service account key file
    if cred_file and os.path.isfile(cred_file):
        try:
            with open(cred_file, "r") as f:
                key_data = json.load(f)
            if key_data.get("type") == "service_account":
                credentials = ee.ServiceAccountCredentials(
                    key_data["client_email"], cred_file
                )
                ee.Initialize(credentials=credentials, project=project)
                _initialized = True
                logger.info("GEE initialisé via service account (%s)", key_data["client_email"])
                return
            else:
                logger.debug("GEE credentials file is not a service account (type=%s), skipping", key_data.get("type"))
        except Exception as exc:
            logger.warning("Impossible de charger le service account key: %s", exc)

    # 2) Tenter avec les credentials persistants (earthengine authenticate)
    try:
        ee.Initialize(project=project)
        _initialized = True
        logger.info("GEE initialisé via credentials persistants (project: %s)", project)
        return
    except Exception as exc:
        logger.warning("Credentials persistants GEE non disponibles: %s", exc)

    # 3) Tenter avec Application Default Credentials
    try:
        credentials, _ = __import__("google.auth", fromlist=["default"]).default(
            scopes=["https://www.googleapis.com/auth/earthengine"]
        )
        ee.Initialize(credentials=credentials, project=project)
        _initialized = True
        logger.info("GEE initialisé via Application Default Credentials")
        return
    except Exception as exc:
        logger.warning("Application Default Credentials non disponibles: %s", exc)

    raise RuntimeError(
        "Impossible d'initialiser Google Earth Engine. "
        "Options : (a) fournir un service account JSON via GEE_CREDENTIALS_FILE, "
        "(b) exécuter 'earthengine authenticate', "
        "(c) monter les credentials dans le conteneur Docker "
        "(-v ~/.config/earthengine:/root/.config/earthengine)."
    )


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


def get_land_cover(geometry_geojson: dict, date_start: str = "2023-01-01", date_end: str = "2023-12-31") -> dict:
    """
    Classification d'occupation du sol (Dynamic World).
    Classes : water, trees, grass, flooded_vegetation, crops, shrub_and_scrub,
              built, bare, snow_and_ice.
    Retourne le mode (classe la plus fréquente) sur la période.
    """
    _init_gee()
    region = _geojson_to_ee_geometry(geometry_geojson)

    collection = (
        ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1")
        .filterBounds(region)
        .filterDate(date_start, date_end)
    )

    # Mode (classe la plus fréquente par pixel)
    land_cover = collection.select("label").mode().clip(region)

    # Statistiques : surface (pixels) par classe
    class_names = [
        "water", "trees", "grass", "flooded_vegetation", "crops",
        "shrub_and_scrub", "built", "bare", "snow_and_ice",
    ]
    histogram = land_cover.reduceRegion(
        reducer=ee.Reducer.frequencyHistogram(),
        geometry=region,
        scale=10,
        maxPixels=1e9,
    ).getInfo()

    stats = {"class_names": class_names, "histogram": histogram.get("label", {})}

    vis_params = {
        "min": 0,
        "max": 8,
        "palette": [
            "#419BDF",  # water
            "#397D49",  # trees
            "#88B053",  # grass
            "#7A87C6",  # flooded_vegetation
            "#E49635",  # crops
            "#DFC35A",  # shrub_and_scrub
            "#C4281B",  # built
            "#A59B8F",  # bare
            "#B39FE1",  # snow_and_ice
        ],
    }
    map_id = land_cover.getMapId(vis_params)

    return {
        "tile_url": map_id["tile_fetcher"].url_format,
        "stats": stats,
    }


def get_elevation(geometry_geojson: dict) -> dict:
    """
    Modèle numérique de terrain – SRTM 30 m.
    Retourne l'altitude (elevation) avec statistiques min/max/mean.
    """
    _init_gee()
    region = _geojson_to_ee_geometry(geometry_geojson)

    dem = ee.Image("USGS/SRTMGL1_003").select("elevation").clip(region)

    stats = dem.reduceRegion(
        reducer=ee.Reducer.mean().combine(ee.Reducer.minMax(), sharedInputs=True),
        geometry=region,
        scale=30,
        maxPixels=1e9,
    ).getInfo()

    vis_params = {"min": 0, "max": 1000, "palette": ["006633", "E5FFCC", "662A00", "D8D8D8", "F5F5F5"]}
    map_id = dem.getMapId(vis_params)

    return {
        "tile_url": map_id["tile_fetcher"].url_format,
        "stats": stats,
    }


def get_slope(geometry_geojson: dict) -> dict:
    """
    Pente du terrain (degrés) dérivée du SRTM 30 m.
    """
    _init_gee()
    region = _geojson_to_ee_geometry(geometry_geojson)

    dem = ee.Image("USGS/SRTMGL1_003").select("elevation")
    slope = ee.Terrain.slope(dem).clip(region)

    stats = slope.reduceRegion(
        reducer=ee.Reducer.mean().combine(ee.Reducer.minMax(), sharedInputs=True),
        geometry=region,
        scale=30,
        maxPixels=1e9,
    ).getInfo()

    vis_params = {"min": 0, "max": 45, "palette": ["green", "yellow", "orange", "red"]}
    map_id = slope.getMapId(vis_params)

    return {
        "tile_url": map_id["tile_fetcher"].url_format,
        "stats": stats,
    }


def get_hillshade(geometry_geojson: dict) -> dict:
    """
    Ombrage du relief (hillshade) dérivé du SRTM 30 m.
    """
    _init_gee()
    region = _geojson_to_ee_geometry(geometry_geojson)

    dem = ee.Image("USGS/SRTMGL1_003").select("elevation")
    hillshade = ee.Terrain.hillshade(dem).clip(region)

    stats = hillshade.reduceRegion(
        reducer=ee.Reducer.mean().combine(ee.Reducer.minMax(), sharedInputs=True),
        geometry=region,
        scale=30,
        maxPixels=1e9,
    ).getInfo()

    vis_params = {"min": 0, "max": 255}
    map_id = hillshade.getMapId(vis_params)

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
    "land_cover": get_land_cover,
    "elevation": get_elevation,
    "slope": get_slope,
    "hillshade": get_hillshade,
}
