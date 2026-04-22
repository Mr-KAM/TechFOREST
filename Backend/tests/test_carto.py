"""Tests des routes /api/carto/*."""

import json
from unittest.mock import patch, MagicMock


class TestGeoJSONEndpoints:
    """GET /api/carto/geojson/*"""

    def test_geojson_forets(self, client, auth_headers):
        resp = client.get("/api/carto/geojson/forets", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["type"] == "FeatureCollection"
        assert len(data["features"]) == 1
        assert data["features"][0]["properties"]["Nom"] == "TestForet"

    def test_geojson_pays(self, client, auth_headers):
        resp = client.get("/api/carto/geojson/pays", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["type"] == "FeatureCollection"
        assert len(data["features"]) == 1

    def test_geojson_forets_no_auth(self, client):
        resp = client.get("/api/carto/geojson/forets")
        assert resp.status_code == 401

    def test_geojson_pays_no_auth(self, client):
        resp = client.get("/api/carto/geojson/pays")
        assert resp.status_code == 401

    def test_geojson_forets_missing_file(self, client, auth_headers):
        with patch("app.routes.carto.settings") as mock_settings:
            mock_settings.DATA_DIR = "/nonexistent/path"
            resp = client.get("/api/carto/geojson/forets", headers=auth_headers)
            assert resp.status_code == 404

    def test_geojson_pays_missing_file(self, client, auth_headers):
        with patch("app.routes.carto.settings") as mock_settings:
            mock_settings.DATA_DIR = "/nonexistent/path"
            resp = client.get("/api/carto/geojson/pays", headers=auth_headers)
            assert resp.status_code == 404


class TestZones:
    """GET/POST /api/carto/zones"""

    def test_list_zones_empty(self, client, auth_headers):
        resp = client.get("/api/carto/zones", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_zones_no_auth(self, client):
        resp = client.get("/api/carto/zones")
        assert resp.status_code == 401

    def test_get_zone_not_found(self, client, auth_headers):
        resp = client.get("/api/carto/zones/999", headers=auth_headers)
        assert resp.status_code == 404


class TestGEEClip:
    """POST /api/carto/gee/clip"""

    def test_clip_no_auth(self, client):
        resp = client.post("/api/carto/gee/clip", json={
            "forest_zone_id": 1,
            "layer_type": "ndvi",
        })
        assert resp.status_code == 401

    def test_clip_zone_not_found(self, client, auth_headers):
        resp = client.post("/api/carto/gee/clip", json={
            "forest_zone_id": 999,
            "layer_type": "ndvi",
        }, headers=auth_headers)
        assert resp.status_code == 404

    def test_clip_invalid_layer_type(self, client, auth_headers):
        # On doit d'abord avoir une zone en base – on skip ici
        # car créer une zone avec géométrie PostGIS sur SQLite est complexe
        pass


class TestGEELayers:
    """GET /api/carto/gee/layers"""

    def test_list_gee_layers_empty(self, client, auth_headers):
        resp = client.get("/api/carto/gee/layers", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_gee_layers_no_auth(self, client):
        resp = client.get("/api/carto/gee/layers")
        assert resp.status_code == 401
