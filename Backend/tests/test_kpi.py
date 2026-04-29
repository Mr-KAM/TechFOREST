"""Tests des routes /api/kpi/*."""

from unittest.mock import patch


FAKE_FORMS = [
    {"uid": "aBC123", "name": "Enquête forêt", "deployment_status": "deployed", "submission_count": 42},
]

FAKE_SUBMISSIONS = [
    {"_id": 1, "surface": "2.5", "arbres": "100", "commentaire": "ok"},
    {"_id": 2, "surface": "3.0", "arbres": "150", "commentaire": "bon"},
    {"_id": 3, "surface": "1.5", "arbres": "80", "commentaire": "moyen"},
]

FAKE_METADATA = {"name": "Enquête forêt", "uid": "aBC123"}


class TestForms:
    """GET /api/kpi/forms"""

    @patch("app.routes.kpi.list_forms", return_value=FAKE_FORMS)
    def test_list_forms(self, mock_list, client, auth_headers):
        resp = client.get("/api/kpi/forms", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["uid"] == "aBC123"
        assert data[0]["name"] == "Enquête forêt"

    def test_list_forms_no_auth(self, client):
        resp = client.get("/api/kpi/forms")
        assert resp.status_code == 401

    @patch("app.routes.kpi.list_forms", side_effect=Exception("timeout"))
    def test_list_forms_kobo_error(self, mock_list, client, auth_headers):
        resp = client.get("/api/kpi/forms", headers=auth_headers)
        assert resp.status_code == 502
        assert "KoboToolbox" in resp.json()["detail"]

    @patch(
        "app.routes.kpi.list_configured_forms",
        return_value=[{**FAKE_FORMS[0], "key": "menaces"}],
    )
    def test_list_configured_forms(self, mock_list, client, auth_headers):
        resp = client.get("/api/kpi/forms/configured", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data == [{**FAKE_FORMS[0], "key": "menaces"}]


class TestSubmissions:
    """GET /api/kpi/forms/{uid}/submissions"""

    @patch("app.routes.kpi.get_form_submissions", return_value=FAKE_SUBMISSIONS)
    def test_get_submissions(self, mock_subs, client, auth_headers):
        resp = client.get("/api/kpi/forms/aBC123/submissions", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 3
        assert data[0]["id"] == 1
        assert "data" in data[0]

    def test_submissions_no_auth(self, client):
        resp = client.get("/api/kpi/forms/aBC123/submissions")
        assert resp.status_code == 401

    @patch("app.routes.kpi.resolve_form_uid", return_value="configured-menaces-uid")
    @patch("app.routes.kpi.get_form_submissions", return_value=FAKE_SUBMISSIONS)
    def test_submissions_with_form_key(self, mock_subs, mock_resolve, client, auth_headers):
        resp = client.get("/api/kpi/forms/menaces/submissions", headers=auth_headers)
        assert resp.status_code == 200
        mock_resolve.assert_called_once_with("menaces")
        mock_subs.assert_called_once_with("configured-menaces-uid")


class TestDashboard:
    """GET /api/kpi/forms/{uid}/dashboard"""

    @patch("app.routes.kpi.get_form_submissions", return_value=FAKE_SUBMISSIONS)
    @patch("app.routes.kpi.get_form_metadata", return_value=FAKE_METADATA)
    def test_dashboard_auto_indicators(self, mock_meta, mock_subs, client, auth_headers):
        resp = client.get("/api/kpi/forms/aBC123/dashboard", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["form_uid"] == "aBC123"
        assert data["form_name"] == "Enquête forêt"
        assert data["total_submissions"] == 3
        # Des indicateurs auto-détectés (surface, arbres sont numériques)
        assert len(data["indicators"]) > 0
        names = [i["indicator_name"] for i in data["indicators"]]
        assert "surface_count" in names
        assert "surface_mean" in names
        assert "arbres_sum" in names

    @patch("app.routes.kpi.get_form_submissions", return_value=FAKE_SUBMISSIONS)
    @patch("app.routes.kpi.get_form_metadata", return_value=FAKE_METADATA)
    def test_dashboard_specific_fields(self, mock_meta, mock_subs, client, auth_headers):
        resp = client.get("/api/kpi/forms/aBC123/dashboard?fields=surface", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        names = [i["indicator_name"] for i in data["indicators"]]
        # Seulement les indicateurs pour "surface"
        assert all("surface" in n for n in names)
        assert not any("arbres" in n for n in names)

    @patch("app.routes.kpi.get_form_submissions", return_value=[])
    @patch("app.routes.kpi.get_form_metadata", return_value=FAKE_METADATA)
    def test_dashboard_no_submissions(self, mock_meta, mock_subs, client, auth_headers):
        resp = client.get("/api/kpi/forms/aBC123/dashboard", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_submissions"] == 0
        assert data["indicators"] == []

    @patch("app.routes.kpi.resolve_form_uid", return_value="configured-menaces-uid")
    @patch("app.routes.kpi.get_form_submissions", return_value=FAKE_SUBMISSIONS)
    @patch("app.routes.kpi.get_form_metadata", return_value=FAKE_METADATA)
    def test_dashboard_with_form_key(self, mock_meta, mock_subs, mock_resolve, client, auth_headers):
        resp = client.get("/api/kpi/forms/menaces/dashboard", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["form_uid"] == "configured-menaces-uid"
        mock_resolve.assert_called_once_with("menaces")
        mock_meta.assert_called_once_with("configured-menaces-uid")
        mock_subs.assert_called_once_with("configured-menaces-uid")

    def test_dashboard_no_auth(self, client):
        resp = client.get("/api/kpi/forms/aBC123/dashboard")
        assert resp.status_code == 401

    @patch("app.routes.kpi.get_form_metadata", side_effect=Exception("Network error"))
    def test_dashboard_kobo_error(self, mock_meta, client, auth_headers):
        resp = client.get("/api/kpi/forms/aBC123/dashboard", headers=auth_headers)
        assert resp.status_code == 502
