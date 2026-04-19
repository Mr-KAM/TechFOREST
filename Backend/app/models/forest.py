from geoalchemy2 import Geometry
from sqlalchemy import Column, Integer, String, Float, DateTime, Text
from sqlalchemy.sql import func

from app.database import Base


class ForestZone(Base):
    """Zones de forêt suivies – limites utilisées pour découper les données GEE."""
    __tablename__ = "forest_zones"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    code = Column(String(50), unique=True, index=True)
    description = Column(Text, nullable=True)
    area_ha = Column(Float, nullable=True)
    geometry = Column(Geometry("MULTIPOLYGON", srid=4326), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class GEELayer(Base):
    """Couches issues de Google Earth Engine, découpées par zone de forêt."""
    __tablename__ = "gee_layers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    layer_type = Column(String(100), nullable=False)  # ndvi, loss, gain, cover, etc.
    description = Column(Text, nullable=True)
    gee_asset_id = Column(String(500), nullable=True)
    date_start = Column(DateTime(timezone=True), nullable=True)
    date_end = Column(DateTime(timezone=True), nullable=True)
    tile_url = Column(Text, nullable=True)
    metadata = Column(Text, nullable=True)  # JSON extra info
    created_at = Column(DateTime(timezone=True), server_default=func.now())
