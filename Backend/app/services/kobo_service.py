"""Service KoboToolbox – utilise pykobo pour récupérer formulaires et soumissions."""

import logging
from functools import lru_cache

import pykobo
import requests

from app.config import get_settings

logger = logging.getLogger(__name__)


def _get_form_key_by_uid(form_uid: str) -> str | None:
    settings = get_settings()
    for form_key, configured_uid in settings.kobo_form_uids.items():
        if configured_uid and configured_uid == form_uid:
            return form_key
    return None


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
            "key": _get_form_key_by_uid(f.uid),
            "uid": f.uid,
            "name": f.metadata.get("name", ""),
            "deployment_status": "deployed" if f.metadata.get("has_deployment") else "draft",
            "submission_count": f.metadata.get("submission_count", 0),
        }
        for f in forms
    ]


def resolve_form_uid(form_identifier: str) -> str:
    """Résout un alias métier configuré ou retourne directement l'UID fourni."""
    normalized_identifier = form_identifier.strip().lower()
    settings = get_settings()
    configured_uid = settings.kobo_form_uids.get(normalized_identifier)
    if configured_uid:
        return configured_uid
    return form_identifier.strip()


def list_configured_forms() -> list[dict]:
    """Retourne uniquement les formulaires dont l'UID est configuré dans l'environnement."""
    return [form for form in list_forms() if form.get("key")]


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


def get_form_key(form_uid: str) -> str | None:
    """Retourne la clé métier configurée pour un UID de formulaire, ou None."""
    return _get_form_key_by_uid(form_uid)


def get_form_submissions_raw(form_uid: str) -> list[dict]:
    """
    Récupère les soumissions brutes via l'API REST KoboToolbox (sans pykobo).
    Nécessaire pour les formulaires avec groupes répétés imbriqués.
    """
    settings = get_settings()
    token = settings.KOBO_API_TOKEN
    base_url = settings.URL_KOBO.rstrip("/")
    headers = {"Authorization": f"Token {token}"}
    all_results: list[dict] = []
    next_url: str | None = f"{base_url}/api/v2/assets/{form_uid}/data/"
    while next_url:
        resp = requests.get(
            next_url,
            headers=headers,
            params={"format": "json", "limit": 100},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        all_results.extend(data.get("results", []))
        next_url = data.get("next")
    return all_results


def compute_form_indicators(
    form_key: str | None,
    submissions: list[dict],
    numeric_fields: list[str] | None = None,
) -> list[dict]:
    """
    Calcule les indicateurs métier spécifiques selon le formulaire.
    Retombe sur le calcul générique si le formulaire n'est pas reconnu.
    """
    if not submissions:
        return []
    dispatch = {
        "monitoring_faune": _indicators_faune,
        "monitoring_reboisement": _indicators_reboisement,
        "planting_arbre": _indicators_planting,
        "menaces": _indicators_menaces,
    }
    fn = dispatch.get(form_key or "")
    if fn:
        return fn(submissions)
    # Fallback générique : compte les soumissions
    return [
        {"indicator_name": "Total soumissions", "value": len(submissions), "unit": "soumissions", "period": None}
    ]


def _indicators_faune(submissions: list[dict]) -> list[dict]:
    mammiferes = sum(len(s.get("Mammiferes") or []) for s in submissions)
    oiseaux = sum(len(s.get("Oiseaux") or []) for s in submissions)
    reptiles = sum(len(s.get("Reptile") or []) for s in submissions)
    amphibiens = sum(len(s.get("Amphibien") or []) for s in submissions)
    invertebre = sum(len(s.get("Invertebre") or []) for s in submissions)
    rongeurs = sum(len(s.get("Rongeurs") or []) for s in submissions)

    especes: set[str] = set()
    for s in submissions:
        for item in s.get("Mammiferes") or []:
            nom = item.get("Mammiferes/grp_mammiferes/Nom_mammifere")
            if nom:
                especes.add(nom.lower().strip())
        for item in s.get("Oiseaux") or []:
            nom = item.get("Oiseaux/grp_oiseaux/Nom_oiseau")
            if nom:
                especes.add(nom.lower().strip())
        for item in s.get("Reptile") or []:
            nom = item.get("Reptile/grp_reptile/Nom_reptile")
            if nom:
                especes.add(nom.lower().strip())
        for item in s.get("Amphibien") or []:
            nom = item.get("Amphibien/grp_amphibien/Nom_amphibien")
            if nom:
                especes.add(nom.lower().strip())

    return [
        {"indicator_name": "Suivis fauniques", "value": len(submissions), "unit": "missions", "period": None},
        {"indicator_name": "Mammifères observés", "value": mammiferes, "unit": "individus", "period": None},
        {"indicator_name": "Oiseaux observés", "value": oiseaux, "unit": "individus", "period": None},
        {"indicator_name": "Reptiles observés", "value": reptiles, "unit": "individus", "period": None},
        {"indicator_name": "Amphibiens observés", "value": amphibiens, "unit": "individus", "period": None},
        {"indicator_name": "Invertébrés observés", "value": invertebre, "unit": "individus", "period": None},
        {"indicator_name": "Rongeurs observés", "value": rongeurs, "unit": "individus", "period": None},
        {"indicator_name": "Espèces identifiées", "value": len(especes), "unit": "espèces", "period": None},
    ]


def _indicators_reboisement(submissions: list[dict]) -> list[dict]:
    arbres = 0
    especes: set[str] = set()
    for s in submissions:
        for item in s.get("repeat_fc_zaranou") or []:
            arbres += 1
            nom = item.get("repeat_fc_zaranou/grp_fc_zaranou/arbre_zaranou")
            if nom:
                especes.add(nom.lower().strip())
        for item in s.get("repeat_fc_apoueba") or []:
            arbres += 1
            nom = item.get("repeat_fc_apoueba/grp_fc_apoueba/arbre_apoueba")
            if nom:
                especes.add(nom.lower().strip())
    return [
        {"indicator_name": "Missions de reboisement", "value": len(submissions), "unit": "missions", "period": None},
        {"indicator_name": "Arbres monitorés", "value": arbres, "unit": "arbres", "period": None},
        {"indicator_name": "Espèces reboisées", "value": len(especes), "unit": "espèces", "period": None},
    ]


def _indicators_planting(submissions: list[dict]) -> list[dict]:
    arbres = 0
    especes = 0
    superficie = 0.0
    for s in submissions:
        try:
            arbres += int(float(s.get("Identification_parcelle/arbres_plante") or 0))
        except (ValueError, TypeError):
            pass
        try:
            especes += int(float(s.get("nbre_espece_parcelle") or 0))
        except (ValueError, TypeError):
            pass
        try:
            val = float(s.get("Identification_parcelle/surface_ha") or 0)
            if val > 0:
                superficie += val
        except (ValueError, TypeError):
            pass
    return [
        {"indicator_name": "Parcelles identifiées", "value": len(submissions), "unit": "parcelles", "period": None},
        {"indicator_name": "Arbres plantés", "value": arbres, "unit": "arbres", "period": None},
        {"indicator_name": "Espèces plantées", "value": especes, "unit": "espèces", "period": None},
        {"indicator_name": "Superficie plantée", "value": round(superficie, 2), "unit": "ha", "period": None},
    ]


def _indicators_menaces(submissions: list[dict]) -> list[dict]:
    signalements = 0
    types_menaces: set[str] = set()
    for s in submissions:
        for item in s.get("rep_menaces") or []:
            signalements += 1
            type_pression = item.get("rep_menaces/principales_menaces/Type_pression") or ""
            for t in type_pression.split():
                if t:
                    types_menaces.add(t.lower())
    return [
        {"indicator_name": "Missions réalisées", "value": len(submissions), "unit": "missions", "period": None},
        {"indicator_name": "Signalements de menaces", "value": signalements, "unit": "signalements", "period": None},
        {"indicator_name": "Types de menaces", "value": len(types_menaces), "unit": "types", "period": None},
    ]



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
