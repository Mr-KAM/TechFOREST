"""Service KoboToolbox – récupération des formulaires et soumissions."""

import logging

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def _headers() -> dict:
    return {"Authorization": f"Token {settings.KOBO_API_TOKEN}"}


async def list_forms() -> list[dict]:
    """Liste tous les formulaires du compte KoboToolbox."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{settings.KOBO_API_URL}/assets/",
            headers=_headers(),
            params={"format": "json"},
        )
        resp.raise_for_status()
        data = resp.json()
        results = data.get("results", [])
        return [
            {
                "uid": f["uid"],
                "name": f.get("name", ""),
                "deployment_status": f.get("deployment_status", ""),
                "submission_count": f.get("deployment__submission_count", 0),
            }
            for f in results
        ]


async def get_form_submissions(form_uid: str, limit: int = 1000) -> list[dict]:
    """Récupère les soumissions d'un formulaire."""
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.get(
            f"{settings.KOBO_API_URL}/assets/{form_uid}/data/",
            headers=_headers(),
            params={"format": "json", "limit": limit},
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("results", [])


async def get_form_metadata(form_uid: str) -> dict:
    """Récupère les métadonnées d'un formulaire (champs, etc.)."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{settings.KOBO_API_URL}/assets/{form_uid}/",
            headers=_headers(),
            params={"format": "json"},
        )
        resp.raise_for_status()
        return resp.json()


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
