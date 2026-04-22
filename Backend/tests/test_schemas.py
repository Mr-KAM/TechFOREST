"""Tests des schémas Pydantic."""

import pytest
from pydantic import ValidationError

from app.schemas.auth import UserCreate, LoginRequest, UserUpdate
from app.schemas.forest import ForestZoneCreate, GEEClipRequest
from app.schemas.kpi import KPIValue, KPIDashboard


class TestAuthSchemas:
    def test_user_create_valid(self):
        user = UserCreate(email="a@b.com", full_name="Test", password="secret")
        assert user.role == "viewer"

    def test_user_create_invalid_email(self):
        with pytest.raises(ValidationError):
            UserCreate(email="bad", full_name="Test", password="secret")

    def test_login_request(self):
        req = LoginRequest(email="a@b.com", password="pass")
        assert req.email == "a@b.com"

    def test_user_update_partial(self):
        update = UserUpdate(full_name="New Name")
        assert update.full_name == "New Name"
        assert update.role is None


class TestForestSchemas:
    def test_zone_create(self):
        zone = ForestZoneCreate(
            name="Test Zone",
            code="tz01",
            geometry={"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 0]]]},
        )
        assert zone.area_ha is None

    def test_gee_clip_request(self):
        req = GEEClipRequest(forest_zone_id=1, layer_type="ndvi")
        assert req.date_start is None
        assert req.date_end is None

    def test_gee_clip_request_with_dates(self):
        req = GEEClipRequest(
            forest_zone_id=1,
            layer_type="ndvi",
            date_start="2023-01-01",
            date_end="2023-12-31",
        )
        assert req.date_start == "2023-01-01"


class TestKPISchemas:
    def test_kpi_value(self):
        kpi = KPIValue(indicator_name="test_count", value=42, unit="ha")
        assert kpi.period is None

    def test_kpi_dashboard(self):
        dashboard = KPIDashboard(
            form_uid="abc",
            form_name="Test Form",
            total_submissions=10,
            indicators=[],
        )
        assert dashboard.indicators == []
