"""Tests unitaires â€“ services (kobo_service.compute_form_indicators)."""

from app.services.kobo_service import compute_form_indicators as compute_indicators


class TestComputeIndicators:
    """Tests du calcul d'indicateurs KPI."""

    def test_auto_detect_numeric_fields(self):
        submissions = [
            {"_id": 1, "surface": "2.5", "arbres": "100", "commentaire": "ok"},
            {"_id": 2, "surface": "3.0", "arbres": "150", "commentaire": "bon"},
        ]
        result = compute_indicators(None, submissions)
        names = [i["indicator_name"] for i in result]
        # Doit dÃ©tecter "surface" et "arbres" comme numÃ©riques
        assert "surface_count" in names
        assert "surface_sum" in names
        assert "surface_mean" in names
        assert "arbres_count" in names
        # Ne doit PAS inclure "commentaire"
        assert "commentaire_count" not in names
        # Pas les champs _id
        assert "_id_count" not in names

    def test_explicit_fields(self):
        submissions = [
            {"surface": "2.5", "arbres": "100"},
            {"surface": "3.0", "arbres": "150"},
        ]
        result = compute_indicators(None, submissions, numeric_fields=["surface"])
        names = [i["indicator_name"] for i in result]
        assert "surface_count" in names
        assert "arbres_count" not in names

    def test_mean_calculation(self):
        submissions = [
            {"val": "10"},
            {"val": "20"},
            {"val": "30"},
        ]
        result = compute_indicators(None, submissions, numeric_fields=["val"])
        mean_ind = next(i for i in result if i["indicator_name"] == "val_mean")
        assert mean_ind["value"] == 20.0

    def test_sum_calculation(self):
        submissions = [
            {"val": "10"},
            {"val": "20"},
            {"val": "30"},
        ]
        result = compute_indicators(None, submissions, numeric_fields=["val"])
        sum_ind = next(i for i in result if i["indicator_name"] == "val_sum")
        assert sum_ind["value"] == 60.0

    def test_count_calculation(self):
        submissions = [
            {"val": "10"},
            {"val": "20"},
            {"val": "invalid"},  # pas numÃ©rique
        ]
        result = compute_indicators(None, submissions, numeric_fields=["val"])
        count_ind = next(i for i in result if i["indicator_name"] == "val_count")
        assert count_ind["value"] == 2  # seulement 2 valeurs valides

    def test_empty_submissions(self):
        result = compute_indicators(None, [])
        assert result == []

    def test_no_numeric_values(self):
        submissions = [
            {"nom": "forÃªt A"},
            {"nom": "forÃªt B"},
        ]
        result = compute_indicators(None, submissions)
        assert result == []

    def test_missing_field_in_some_submissions(self):
        submissions = [
            {"surface": "2.5"},
            {},  # pas de surface
            {"surface": "3.0"},
        ]
        result = compute_indicators(None, submissions, numeric_fields=["surface"])
        # La soumission vide a surface=0 via .get(field, 0)
        count_ind = next(i for i in result if i["indicator_name"] == "surface_count")
        assert count_ind["value"] == 3

