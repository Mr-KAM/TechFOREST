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


# ─── Extraction des points GPS ───────────────────────────────

_GEOFIELD_TOKENS = ("gps", "geopoint", "coord", "_geolocation")


def _parse_geopoint(value) -> tuple[float, float, float | None, float | None] | None:
    """Parse un geopoint Kobo: 'lat lon altitude precision' ou [lat, lon]."""
    if value is None:
        return None
    if isinstance(value, list):
        if len(value) >= 2 and value[0] is not None and value[1] is not None:
            try:
                return float(value[0]), float(value[1]), None, None
            except (ValueError, TypeError):
                return None
        return None
    if isinstance(value, str):
        parts = value.strip().split()
        if len(parts) < 2:
            return None
        try:
            lat = float(parts[0])
            lon = float(parts[1])
            alt = float(parts[2]) if len(parts) > 2 else None
            acc = float(parts[3]) if len(parts) > 3 else None
        except (ValueError, TypeError):
            return None
        if lat == 0 and lon == 0:
            return None
        return lat, lon, alt, acc
    return None


def _walk_geopoints(obj, label_keys: tuple[str, ...] = ()) -> list[dict]:
    """
    Parcourt récursivement obj et retourne tous les points GPS trouvés.
    label_keys = clés (en minuscules) à utiliser comme étiquette descriptive si présentes.
    """
    found: list[dict] = []

    def _walk(node, current_label: str | None):
        if isinstance(node, dict):
            # Capture une étiquette si présente dans ce niveau
            new_label = current_label
            for k, v in node.items():
                if isinstance(v, str) and v:
                    kl = k.lower().split("/")[-1]
                    if kl in label_keys:
                        new_label = v
            for k, v in node.items():
                kl = k.lower()
                if any(t in kl for t in _GEOFIELD_TOKENS):
                    pt = _parse_geopoint(v)
                    if pt:
                        lat, lon, alt, acc = pt
                        found.append({
                            "latitude": lat,
                            "longitude": lon,
                            "altitude": alt,
                            "accuracy": acc,
                            "label": new_label,
                        })
                _walk(v, new_label)
        elif isinstance(node, list):
            for item in node:
                _walk(item, current_label)

    _walk(obj, None)
    return found


# Clés textuelles à utiliser comme étiquette par formulaire
_LABEL_KEYS_BY_FORM: dict[str, tuple[str, ...]] = {
    "monitoring_faune": ("nom_mammifere", "nom_oiseau", "nom_reptile", "nom_amphibien"),
    "monitoring_reboisement": ("arbre_zaranou", "arbre_apoueba"),
    "menaces": ("type_pression",),
    "planting_arbre": (),
}


def _first_image_url(submission: dict) -> str | None:
    """Retourne l'URL de la première pièce jointe image d'une soumission Kobo."""
    for att in submission.get("_attachments", []):
        mime = att.get("mimetype", "")
        if mime.startswith("image/"):
            return att.get("download_url") or att.get("download_large_url") or None
    return None


def extract_locations(form_key: str | None, submissions: list[dict]) -> list[dict]:
    """Extrait tous les points GPS d'une liste de soumissions pour un formulaire."""
    label_keys = _LABEL_KEYS_BY_FORM.get(form_key or "", ())
    points: list[dict] = []
    for sub in submissions:
        sub_id = sub.get("_id")
        submitted_at = sub.get("_submission_time") or sub.get("end") or sub.get("start")
        image_url = _first_image_url(sub)
        # Dédupliquer : un même submission peut avoir _geolocation + Coordonnees_GPS racine
        seen: set[tuple[float, float]] = set()
        for pt in _walk_geopoints(sub, label_keys):
            key = (round(pt["latitude"], 6), round(pt["longitude"], 6))
            if key in seen:
                continue
            seen.add(key)
            points.append({
                **pt,
                "submission_id": sub_id,
                "submitted_at": submitted_at,
                "image_url": image_url,
            })
    return points


# ─── Statistiques par écogarde ───────────────────────────────

# Champs métier potentiels permettant d'identifier l'écogarde (en plus de
# _submitted_by, qui est le username Kobo de l'agent collecteur).
_ECOGARDE_FIELD_HINTS: tuple[str, ...] = (
    "ecogarde",
    "eco_garde",
    "echo_garde",
    "echogarde",
    "nom_agent",
    "agent_terrain",
    "nom_collecteur",
    "collecteur",
    "nom_garde",
)


def _resolve_ecogarde(submission: dict) -> str:
    """Retourne le nom/username de l'écogarde pour une soumission Kobo."""
    # 1) Champ Kobo standard : username de l'utilisateur qui a soumis.
    submitted_by = submission.get("_submitted_by")
    if isinstance(submitted_by, str) and submitted_by.strip():
        return submitted_by.strip()

    # 2) Tentative sur des champs métier connus (récursivement).
    def _scan(node):
        if isinstance(node, dict):
            for k, v in node.items():
                kl = k.lower().split("/")[-1]
                if isinstance(v, str) and v.strip() and any(h in kl for h in _ECOGARDE_FIELD_HINTS):
                    return v.strip()
                found = _scan(v)
                if found:
                    return found
        elif isinstance(node, list):
            for item in node:
                found = _scan(item)
                if found:
                    return found
        return None

    found = _scan(submission)
    if found:
        return found
    return "anonyme"


def compute_ecogarde_stats(
    forms_with_submissions: list[tuple[str, str, list[dict]]],
) -> list[dict]:
    """
    Agrège les statistiques par écogarde sur l'ensemble des formulaires.

    forms_with_submissions : liste de tuples (form_key, form_name, submissions).

    Retourne, par écogarde :
    - total_submissions : nombre total de soumissions
    - total_missions : nombre de jours distincts d'intervention sur le terrain
    - forms_covered : nombre de formulaires (activités) auxquels il a participé
    - by_form : { form_key: nombre de soumissions sur ce formulaire }
    """
    from collections import defaultdict

    stats: dict[str, dict] = defaultdict(
        lambda: {
            "total_submissions": 0,
            "mission_days": set(),
            "by_form": defaultdict(int),
            "forms_covered": set(),
        }
    )

    for form_key, _form_name, submissions in forms_with_submissions:
        for sub in submissions:
            ecogarde = _resolve_ecogarde(sub)
            entry = stats[ecogarde]
            entry["total_submissions"] += 1
            entry["by_form"][form_key] += 1
            entry["forms_covered"].add(form_key)
            submitted_at = (
                sub.get("_submission_time")
                or sub.get("end")
                or sub.get("start")
            )
            if submitted_at:
                day = str(submitted_at)[:10]  # YYYY-MM-DD
                if day:
                    entry["mission_days"].add(day)

    result: list[dict] = []
    for username, e in stats.items():
        result.append(
            {
                "username": username,
                "total_submissions": e["total_submissions"],
                "total_missions": len(e["mission_days"]) or e["total_submissions"],
                "forms_covered": len(e["forms_covered"]),
                "by_form": dict(e["by_form"]),
            }
        )
    result.sort(key=lambda x: x["total_submissions"], reverse=True)
    return result


# ─── Filtrage par forêt ───────────────────────────────────────

# Forêts connues du projet TechFOREST
KNOWN_FORESTS: tuple[str, ...] = ("Zaranou", "Apouéba")

# Champs métier potentiels permettant d'identifier la forêt d'intervention.
_FOREST_FIELD_HINTS: tuple[str, ...] = (
    "nom_foret",
    "foret",
    "forest",
    "nom_forest",
    "nom_site",
    "site",
    "localite",
    "localité",
    "zone_intervention",
    "zone",
)

# Mots-clés permettant d'inférer la forêt à partir d'un nom de champ ou d'une valeur
_FOREST_KEYWORDS: dict[str, str] = {
    "zaranou": "Zaranou",
    "apoueba": "Apouéba",
    "apouéba": "Apouéba",
}


def _normalize_forest(value: str) -> str:
    """Normalise une chaîne en nom de forêt connu si possible."""
    if not value:
        return ""
    low = value.lower().strip()
    for kw, canonical in _FOREST_KEYWORDS.items():
        if kw in low:
            return canonical
    return value.strip()


def _resolve_forest(form_key: str | None, submission: dict) -> str:
    """Retourne le nom de la forêt pour une soumission donnée."""
    # 1) Cas spécifique reboisement : déduire à partir des repeat groups peuplés.
    if form_key == "monitoring_reboisement":
        has_zaranou = bool(submission.get("repeat_fc_zaranou"))
        has_apoueba = bool(submission.get("repeat_fc_apoueba"))
        if has_zaranou and not has_apoueba:
            return "Zaranou"
        if has_apoueba and not has_zaranou:
            return "Apouéba"
        if has_zaranou and has_apoueba:
            return "Zaranou + Apouéba"

    # 2) Scan récursif des champs métier connus.
    def _scan(node):
        if isinstance(node, dict):
            for k, v in node.items():
                kl = k.lower().split("/")[-1]
                # Le nom de champ contient un indice de forêt
                if any(h in kl for h in _FOREST_FIELD_HINTS):
                    if isinstance(v, str) and v.strip():
                        return _normalize_forest(v)
                # Le nom de champ lui-même contient zaranou/apoueba
                for kw, canonical in _FOREST_KEYWORDS.items():
                    if kw in kl:
                        return canonical
                found = _scan(v)
                if found:
                    return found
        elif isinstance(node, list):
            for item in node:
                found = _scan(item)
                if found:
                    return found
        return None

    found = _scan(submission)
    if found:
        return found
    return "Non spécifiée"


def list_forests_for_form(
    form_key: str | None, submissions: list[dict]
) -> list[str]:
    """Retourne la liste triée des forêts détectées dans les soumissions."""
    forests = {_resolve_forest(form_key, s) for s in submissions}
    return sorted(f for f in forests if f)


def filter_submissions_by_forest(
    form_key: str | None,
    submissions: list[dict],
    forest: str | None,
) -> list[dict]:
    """Filtre les soumissions appartenant à une forêt donnée (None = toutes)."""
    if not forest:
        return submissions
    target = _normalize_forest(forest)
    return [s for s in submissions if _resolve_forest(form_key, s) == target]


def compute_form_indicators_by_forest(
    form_key: str | None,
    submissions: list[dict],
) -> dict[str, list[dict]]:
    """
    Calcule les indicateurs métier ventilés par forêt.
    Retourne {nom_foret: [indicators...]}.
    """
    if not submissions:
        return {}
    buckets: dict[str, list[dict]] = {}
    for sub in submissions:
        forest = _resolve_forest(form_key, sub)
        buckets.setdefault(forest, []).append(sub)
    return {
        forest: compute_form_indicators(form_key, subs)
        for forest, subs in buckets.items()
    }


# ─── Équipes de terrain et chefs de mission ──────────────────

# Champs potentiels pour le nom de l'équipe de terrain.
_TEAM_FIELD_HINTS: tuple[str, ...] = (
    "equipe",
    "équipe",
    "nom_equipe",
    "nom_équipe",
    "team",
    "groupe",
    "patrol_team",
    "equipe_terrain",
    "id_equipe",
    "patrol_group",
    "groupe_patrouille",
    "grp_equipe",
)

# Champs potentiels pour le chef de mission.
_CHEF_MISSION_FIELD_HINTS: tuple[str, ...] = (
    "chef_mission",
    "chef_equipe",
    "chef_équipe",
    "responsable",
    "chef_de_mission",
    "chef_patrol",
    "leader",
    "chef_patrouille",
    "responsable_mission",
    "chef_de_patrouille",
    "superviseur",
    "chef_mission_",
    "nom_chef",
    "chef",
)


def _resolve_team(submission: dict) -> str:
    """Retourne le nom de l'équipe de terrain pour une soumission Kobo."""

    def _scan(node):
        if isinstance(node, dict):
            for k, v in node.items():
                kl = k.lower().split("/")[-1]
                if isinstance(v, str) and v.strip() and any(h in kl for h in _TEAM_FIELD_HINTS):
                    return v.strip()
                found = _scan(v)
                if found:
                    return found
        elif isinstance(node, list):
            for item in node:
                found = _scan(item)
                if found:
                    return found
        return None

    result = _scan(submission)
    return result or "Équipe non identifiée"


def _resolve_chef_mission(submission: dict) -> str | None:
    """Retourne le chef de mission pour une soumission Kobo, ou None si non détecté."""

    def _scan(node):
        if isinstance(node, dict):
            for k, v in node.items():
                kl = k.lower().split("/")[-1]
                if isinstance(v, str) and v.strip() and any(h in kl for h in _CHEF_MISSION_FIELD_HINTS):
                    return v.strip()
                found = _scan(v)
                if found:
                    return found
        elif isinstance(node, list):
            for item in node:
                found = _scan(item)
                if found:
                    return found
        return None

    return _scan(submission)


def compute_team_stats(
    forms_with_submissions: list[tuple[str, str, list[dict]]],
) -> list[dict]:
    """
    Agrège les statistiques par équipe de terrain sur l'ensemble des formulaires.

    Retourne, par équipe :
    - team_name : nom de l'équipe (champ detect ou "Équipe non identifiée")
    - chefs_mission : liste dédupliquée des chefs de mission détectés
    - membres : liste des écogardes membres avec leurs stats individuelles
    - total_submissions, total_missions, forms_covered
    """
    from collections import defaultdict

    teams: dict[str, dict] = {}

    def _get_team(name: str) -> dict:
        if name not in teams:
            teams[name] = {
                "chefs_mission": set(),
                "membres": defaultdict(
                    lambda: {
                        "total_submissions": 0,
                        "mission_days": set(),
                        "forms_covered": set(),
                    }
                ),
                "total_submissions": 0,
                "mission_days": set(),
                "forms_covered": set(),
            }
        return teams[name]

    for form_key, _form_name, submissions in forms_with_submissions:
        for sub in submissions:
            team_name = _resolve_team(sub)
            ecogarde = _resolve_ecogarde(sub)
            chef = _resolve_chef_mission(sub)
            submitted_at = (
                sub.get("_submission_time")
                or sub.get("end")
                or sub.get("start")
            )
            day = str(submitted_at)[:10] if submitted_at else None

            team = _get_team(team_name)
            if chef:
                team["chefs_mission"].add(chef)

            member = team["membres"][ecogarde]
            member["total_submissions"] += 1
            member["forms_covered"].add(form_key)
            if day:
                member["mission_days"].add(day)

            team["total_submissions"] += 1
            team["forms_covered"].add(form_key)
            if day:
                team["mission_days"].add(day)

    result: list[dict] = []
    for team_name, data in teams.items():
        membres = []
        for username, m in data["membres"].items():
            membres.append(
                {
                    "username": username,
                    "total_submissions": m["total_submissions"],
                    "total_missions": len(m["mission_days"]) or m["total_submissions"],
                    "forms_covered": len(m["forms_covered"]),
                }
            )
        membres.sort(key=lambda x: x["total_submissions"], reverse=True)

        result.append(
            {
                "team_name": team_name,
                "chefs_mission": sorted(data["chefs_mission"]),
                "membres": membres,
                "total_submissions": data["total_submissions"],
                "total_missions": len(data["mission_days"]) or data["total_submissions"],
                "forms_covered": len(data["forms_covered"]),
            }
        )

    result.sort(key=lambda x: x["total_submissions"], reverse=True)
    return result


# ─── Tableau de missions par équipe (par soumission) ─────────

_ACTIVITE_LABELS: dict[str, str] = {
    "monitoring_faune": "Suivi faune",
    "monitoring_reboisement": "Suivi reboisement",
    "planting_arbre": "Plantation d'arbres",
    "menaces": "Menaces forestières",
}

# Champs exacts dans les soumissions Kobo pour les membres et chefs
# (format "groupe/champ" tel que retourné par l'API REST KoboToolbox)
_MEMBRE_FIELDS_BY_FOREST: dict[str, str] = {
    "Zaranou": "equipe_collecte/membre_zaranou",
    "Apouéba": "equipe_collecte/membre_apoueba",
}
_CHEF_FIELDS_BY_FOREST: dict[str, str] = {
    "Zaranou": "equipe_collecte/responsable_zaranou",
    "Apouéba": "equipe_collecte/responsable_apoueba",
}
_MEMBRE_FIELDS_ALL = list(_MEMBRE_FIELDS_BY_FOREST.values())
_CHEF_FIELDS_ALL = list(_CHEF_FIELDS_BY_FOREST.values())


def _get_nested_field(sub: dict, *paths: str) -> str | None:
    """
    Lit un champ Kobo depuis une soumission brute, en supportant :
    - la clé plate  "groupe/champ"  (format API REST KoboToolbox)
    - la clé imbriquée sub["groupe"]["champ"]
    Retourne la première valeur non vide trouvée parmi les paths.
    """
    for path in paths:
        # 1) Clé plate directe
        val = sub.get(path)
        if val and isinstance(val, str) and val.strip():
            return val.strip()
        # 2) Navigation imbriquée
        parts = path.split("/")
        node: object = sub
        for part in parts:
            if isinstance(node, dict):
                node = node.get(part)
            else:
                node = None
                break
        if node and isinstance(node, str) and node.strip():
            return node.strip()
    return None


def extract_team_missions(
    forms_with_submissions: list[tuple[str, str, list[dict]]],
) -> list[dict]:
    """
    Produit un tableau plat de missions (une ligne = une soumission).

    Chaque entrée contient :
    - date_mission   : YYYY-MM-DD extrait de _submission_time / end / start
    - activite       : clé métier du formulaire
    - activite_label : libellé humain de l'activité
    - foret          : forêt identifiée (Zaranou, Apouéba, Non spécifiée)
    - membres        : liste des membres d'équipe (peut être vide)
    - chef_equipe    : chef d'équipe (None si non trouvé)
    """
    result: list[dict] = []

    for form_key, form_name, submissions in forms_with_submissions:
        label = _ACTIVITE_LABELS.get(form_key, form_name)
        for sub in submissions:
            raw_date = (
                sub.get("_submission_time")
                or sub.get("end")
                or sub.get("start")
                or ""
            )
            date_mission = str(raw_date)[:10] if raw_date else None
            foret = _resolve_forest(form_key, sub)

            # Sélection des champs selon la forêt détectée
            membre_field = _MEMBRE_FIELDS_BY_FOREST.get(foret)
            chef_field = _CHEF_FIELDS_BY_FOREST.get(foret)

            if membre_field:
                membres_raw = _get_nested_field(sub, membre_field)
                chef_raw = _get_nested_field(sub, chef_field) if chef_field else None
            else:
                membres_raw = _get_nested_field(sub, *_MEMBRE_FIELDS_ALL)
                chef_raw = _get_nested_field(sub, *_CHEF_FIELDS_ALL)

            # Les membres peuvent être séparés par virgule, point-virgule ou espace
            if membres_raw:
                membres_split: list[str] = []
                for sep in (",", ";"):
                    if sep in membres_raw:
                        membres_split = [m.strip() for m in membres_raw.split(sep) if m.strip()]
                        break
                if not membres_split:
                    # Séparation par espace : chaque token est un nom (style Kobo snake_case)
                    membres_split = [m.strip() for m in membres_raw.split() if m.strip()]
                # Dédupliquer en préservant l'ordre
                seen: set[str] = set()
                membres: list[str] = []
                for m in membres_split:
                    if m not in seen:
                        seen.add(m)
                        membres.append(m)
            else:
                membres = []

            result.append(
                {
                    "date_mission": date_mission,
                    "activite": form_key,
                    "activite_label": label,
                    "foret": foret,
                    "membres": membres,
                    "chef_equipe": chef_raw,
                }
            )

    # Tri par date décroissante
    result.sort(key=lambda x: x["date_mission"] or "", reverse=True)
    return result
