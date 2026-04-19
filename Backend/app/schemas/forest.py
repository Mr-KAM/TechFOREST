from datetime import datetime

from pydantic import BaseModel


class ForestZoneCreate(BaseModel):
    name: str
    code: str
    description: str | None = None
    area_ha: float | None = None
    geometry: dict  # GeoJSON geometry


class ForestZoneRead(BaseModel):
    id: int
    name: str
    code: str
    description: str | None = None
    area_ha: float | None = None
    geometry: dict | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class GEELayerRead(BaseModel):
    id: int
    name: str
    layer_type: str
    description: str | None = None
    gee_asset_id: str | None = None
    tile_url: str | None = None
    date_start: datetime | None = None
    date_end: datetime | None = None

    model_config = {"from_attributes": True}


class GEEClipRequest(BaseModel):
    """Requête pour découper une couche GEE selon une zone de forêt."""
    forest_zone_id: int
    layer_type: str  # ndvi, tree_cover, forest_loss, forest_gain
    date_start: str | None = None  # YYYY-MM-DD
    date_end: str | None = None


class GEEClipResponse(BaseModel):
    forest_zone_id: int
    forest_zone_name: str
    layer_type: str
    tile_url: str | None = None
    stats: dict | None = None  # min, max, mean, etc.
