"""Service KoboToolbox – utilise pykobo pour récupérer formulaires et soumissions."""

import logging
from functools import lru_cache

import pykobo

from app.config import get_settings

logger = logging.getLogger(__name__)


@lru_cache()
def _get_manager() -> pykobo.Manager:
    """Crée et cache l'instance pykobo.Manager."""
    settings = get_settings()
    return pykobo.Manager(
        url=settings.URL_KOBO,
        api_version=settings.API_VERSION,
        token=settings.KOBO_API_TOKEN,
    )


def list_forms() -> list[dict]:
    """Liste tous les formulaires du compte KoboToolbox via pykobo."""
    km = _get_manager()
    forms = km.get_forms()
    return [
        {
            "uid": f.uid,
            "name": f.metadata.get("name", ""),
            "deployment_status": "deployed" if f.metadata.get("has_deployment") else "draft",
            "submission_count": f.metadata.get("submission_count", 0),
        }
        for f in forms
    ]


def get_form_submissions(form_uid: str) -> list[dict]:
    """Récupère les soumissions d'un formulaire sous forme de liste de dicts."""
    km = _get_manager()
    form = km.get_form(form_uid)
    form.fetch_data()
    if form.data is None or form.data.empty:
        return []
    # Convertir le DataFrame pandas en list[dict]
    return form.data.to_dict(orient="records")


def get_form_metadata(form_uid: str) -> dict:
    """Récupère les métadonnées d'un formulaire."""
    km = _get_manager()
    form = km.get_form(form_uid)
    return form.metadata


def compute_indicators(submissions: list[dict], numeric_fields: list[str] | None = None) -> list[dict]:
    """
    Calcule des indicateurs KPI basiques à partir des soumissions.
    Pour chaque champ numérique trouvé, calcule : count, sum, mean.
    """
    if not submissions:
        return []

    # Auto-detect numeric fields if not specified
    if numeric_fields is None:
        numeric_fields = []
        sample = submissions[0]
        for key, value in sample.items():
            if key.startswith("_"):
                continue
            try:
                float(value)
                numeric_fields.append(key)
            except (ValueError, TypeError):
                continue

    indicators = []
    for field in numeric_fields:
        values = []
        for sub in submissions:
            try:
                values.append(float(sub.get(field, 0)))
            except (ValueError, TypeError):
                continue

        if values:
            indicators.append({
                "indicator_name": f"{field}_count",
                "value": len(values),
                "unit": "soumissions",
                "period": None,
            })
            indicators.append({
                "indicator_name": f"{field}_sum",
                "value": round(sum(values), 2),
                "unit": None,
                "period": None,
            })
            indicators.append({
                "indicator_name": f"{field}_mean",
                "value": round(sum(values) / len(values), 2),
                "unit": None,
                "period": None,
            })

    return indicators

    return indicators
