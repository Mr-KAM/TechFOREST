"""Service KoboToolbox – utilise pykobo pour récupérer formulaires et soumissions."""

import logging
from datetime import datetime
from functools import lru_cache
from urllib.parse import quote

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


# Libellés des taxons utilisés par le formulaire faune (valeurs de
# `groupe_faunique` côté Kobo → libellé humain affiché en KPI).
_FAUNE_GROUPS: dict[str, str] = {
    "mammifere": "Mammifères observés",
    "oiseau": "Oiseaux observés",
    "reptile": "Reptiles observés",
    "amphibien": "Amphibiens observés",
    "invertebre": "Invertébrés observés",
    "rongeur": "Rongeurs observés",
}


def _iter_faune_observations(submission: dict):
    """
    Itère sur les observations fauniques d'une soumission du formulaire
    `monitoring_faune` (nouvelle structure : repeat `nouvelle_observation`
    contenant un sous-repeat `observation_faune`).
    """
    for obs in submission.get("nouvelle_observation") or []:
        for item in obs.get("nouvelle_observation/observation_faune") or []:
            yield item


def _iter_points_eau(submission: dict):
    """Itère sur les points d'eau relevés dans une soumission faune."""
    for obs in submission.get("nouvelle_observation") or []:
        for item in obs.get("nouvelle_observation/points_eau") or []:
            yield item


def _parse_kobo_dt(value: str | None) -> datetime | None:
    """Parse un timestamp ISO Kobo (suffixe Z) ou retourne None."""
    if not value or not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _split_tokens(value: str | None) -> list[str]:
    """Découpe une chaîne Kobo (séparateurs , ; espace) en tokens nettoyés."""
    if not value or not isinstance(value, str):
        return []
    for sep in (",", ";"):
        if sep in value:
            return [t.strip() for t in value.split(sep) if t.strip()]
    return [t.strip() for t in value.split() if t.strip()]


def _indicators_faune(submissions: list[dict]) -> list[dict]:
    """
    Indicateurs Suivi faune – nouvelle structure du formulaire.

    Le formulaire utilise un repeat unique `nouvelle_observation` typé par
    `type_observation` (indice / point_eau / observation directe). Lorsqu'il
    s'agit d'une observation de faune, un sous-repeat `observation_faune`
    contient les détails : `groupe_faunique` (mammifere, oiseau, reptile,
    amphibien, invertebre, rongeur), `espece_observee`, `nom_scientifique`,
    `indice_observe` (multi-select), `niveau_certitude` (certain / probable),
    `nombre_individus_indices`, `photo_observation`, `gps_observation`.
    Les métadonnées de mission (date, forêt, équipe, durée, photo) sont dans
    `metadonnees_collecte/*` ainsi que `heure_debut` / `heure_fin`.
    """
    counts_taxon: dict[str, int] = {k: 0 for k in _FAUNE_GROUPS}
    especes: set[str] = set()
    individus_total = 0
    obs_faune_total = 0
    obs_directes = 0
    obs_indices = 0
    certaines = 0
    probables = 0
    indices_collectes = 0
    photos_obs = 0
    obs_geolocalisees = 0

    points_eau_total = 0
    points_eau_geo = 0
    photos_points_eau = 0

    photos_equipe = 0
    missions_zaranou = 0
    missions_apoueba = 0
    jours_enquete: set[str] = set()
    ecogardes: set[str] = set()
    duree_totale_min = 0.0
    duree_samples = 0

    prefix = "nouvelle_observation/observation_faune/"
    pe_prefix = "nouvelle_observation/points_eau/"

    for s in submissions:
        # ── Métadonnées de mission ──────────────────────────────
        foret = (s.get("metadonnees_collecte/foret_communautaire") or "").strip().lower()
        if foret == "zaranou":
            missions_zaranou += 1
        elif foret == "apoueba":
            missions_apoueba += 1

        date_enq = s.get("metadonnees_collecte/date_enquete") or (s.get("_submission_time") or "")[:10]
        if date_enq:
            jours_enquete.add(str(date_enq)[:10])

        if s.get("metadonnees_collecte/photo_equipe"):
            photos_equipe += 1

        for token in _split_tokens(s.get("metadonnees_collecte/membres_mission")):
            ecogardes.add(token.lower())
        for token in _split_tokens(s.get("metadonnees_collecte/responsable_mission")):
            ecogardes.add(token.lower())

        debut = _parse_kobo_dt(s.get("heure_debut"))
        fin = _parse_kobo_dt(s.get("heure_fin"))
        if debut and fin and fin >= debut:
            duree_totale_min += (fin - debut).total_seconds() / 60.0
            duree_samples += 1

        # ── Boucles sur le repeat principal ─────────────────────
        for top in s.get("nouvelle_observation") or []:
            type_obs = (top.get("nouvelle_observation/type_observation") or "").strip().lower()
            if type_obs == "indice":
                obs_indices += 1
            elif type_obs in ("observation", "observation_directe", "directe"):
                obs_directes += 1

        # ── Observations de faune ───────────────────────────────
        for item in _iter_faune_observations(s):
            obs_faune_total += 1
            groupe = (item.get(prefix + "groupe_faunique") or "").strip().lower()
            if groupe in counts_taxon:
                counts_taxon[groupe] += 1
            nom = item.get(prefix + "espece_observee") or item.get(prefix + "nom_scientifique")
            if nom and isinstance(nom, str):
                especes.add(nom.lower().strip())
            try:
                individus_total += int(float(item.get(prefix + "nombre_individus_indices") or 0))
            except (ValueError, TypeError):
                pass
            certitude = (item.get(prefix + "niveau_certitude") or "").strip().lower()
            if certitude == "certain":
                certaines += 1
            elif certitude == "probable":
                probables += 1
            indices_raw = item.get(prefix + "indice_observe") or ""
            if isinstance(indices_raw, str) and indices_raw.strip():
                indices_collectes += len([t for t in indices_raw.split() if t])
            if item.get(prefix + "photo_observation"):
                photos_obs += 1
            if item.get(prefix + "gps_observation"):
                obs_geolocalisees += 1

        # ── Points d'eau ────────────────────────────────────────
        for pe in _iter_points_eau(s):
            points_eau_total += 1
            if pe.get(pe_prefix + "gps_point_eau"):
                points_eau_geo += 1
            if pe.get(pe_prefix + "photo_point_eau"):
                photos_points_eau += 1

    duree_moyenne_min = int(round(duree_totale_min / duree_samples)) if duree_samples else 0
    duree_totale_h = round(duree_totale_min / 60.0, 2)
    obs_par_heure = round(obs_faune_total / duree_totale_h, 2) if duree_totale_h > 0 else 0

    def _pct(numerator: int, denominator: int) -> float:
        return round((numerator / denominator) * 100, 1) if denominator > 0 else 0.0

    taux_certaines = _pct(certaines, obs_faune_total)
    taux_photo = _pct(photos_obs, obs_faune_total)
    taux_geo = _pct(obs_geolocalisees, obs_faune_total)

    indicators: list[dict] = [
        {"indicator_name": "Suivis fauniques", "value": len(submissions), "unit": "missions", "period": None},
        {"indicator_name": "Missions Zaranou", "value": missions_zaranou, "unit": "missions", "period": None},
        {"indicator_name": "Missions Apouéba", "value": missions_apoueba, "unit": "missions", "period": None},
        {"indicator_name": "Jours d'enquête", "value": len(jours_enquete), "unit": "jours", "period": None},
        {"indicator_name": "Écogardes mobilisés", "value": len(ecogardes), "unit": "agents", "period": None},
        {"indicator_name": "Durée moyenne d'une mission", "value": duree_moyenne_min, "unit": "minutes", "period": None},
        {"indicator_name": "Durée totale de collecte", "value": duree_totale_h, "unit": "heures", "period": None},
        {"indicator_name": "Observations par heure", "value": obs_par_heure, "unit": "obs/h", "period": None},
        {"indicator_name": "Photos d'équipe", "value": photos_equipe, "unit": "photos", "period": None},
        {"indicator_name": "Observations faune", "value": obs_faune_total, "unit": "observations", "period": None},
        {"indicator_name": "Espèces identifiées", "value": len(especes), "unit": "espèces", "period": None},
    ]
    for key, label in _FAUNE_GROUPS.items():
        indicators.append(
            {"indicator_name": label, "value": counts_taxon[key], "unit": "observations", "period": None}
        )
    indicators.extend(
        [
            {"indicator_name": "Observations certaines", "value": certaines, "unit": "observations", "period": None},
            {"indicator_name": "Observations probables", "value": probables, "unit": "observations", "period": None},
            {"indicator_name": "Observations directes", "value": obs_directes, "unit": "observations", "period": None},
            {"indicator_name": "Observations par indices", "value": obs_indices, "unit": "observations", "period": None},
            {"indicator_name": "Observations géolocalisées", "value": obs_geolocalisees, "unit": "observations", "period": None},
            {"indicator_name": "Taux observations certaines", "value": taux_certaines, "unit": "%", "period": None},
            {"indicator_name": "Taux observations avec photo", "value": taux_photo, "unit": "%", "period": None},
            {"indicator_name": "Taux observations géolocalisées", "value": taux_geo, "unit": "%", "period": None},
            {"indicator_name": "Indices relevés", "value": indices_collectes, "unit": "indices", "period": None},
            {"indicator_name": "Individus / indices recensés", "value": individus_total, "unit": "individus", "period": None},
            {"indicator_name": "Photos d'observation", "value": photos_obs, "unit": "photos", "period": None},
            {"indicator_name": "Points d'eau relevés", "value": points_eau_total, "unit": "points", "period": None},
            {"indicator_name": "Points d'eau géolocalisés", "value": points_eau_geo, "unit": "points", "period": None},
            {"indicator_name": "Photos de points d'eau", "value": photos_points_eau, "unit": "photos", "period": None},
        ]
    )
    return indicators


_REB_ETAT_VIVANT = {"bon", "bonne", "sain", "saine", "vivant", "vivante", "vert", "verte"}
_REB_ETAT_MORT = {"mort", "morte", "seche", "sèche", "mort_arbre"}

# Score pondéré de santé sanitaire (échelle 0..5) — couvre les libellés
# attendus côté XLSForm (tres_bon_etat, bon_etat, etat_moyen, degrade,
# tres_degrade, mort) ainsi que les libellés alternatifs utilisés dans
# les données réelles (bon, sain, vivant, dégradé, mort_arbre, …).
_REB_HEALTH_SCORE: dict[str, int] = {
    # Très bon état → 5
    "tres_bon_etat": 5, "très_bon_etat": 5, "tres_bon_état": 5, "très_bon_état": 5,
    "tres bon etat": 5, "très bon état": 5, "excellent": 5,
    # Bon état → 4
    "bon_etat": 4, "bon_état": 4, "bon": 4, "bonne": 4,
    "sain": 4, "saine": 4, "vivant": 4, "vivante": 4, "vert": 4, "verte": 4,
    # État moyen → 3
    "etat_moyen": 3, "état_moyen": 3, "moyen": 3, "moyenne": 3, "passable": 3,
    # Dégradé → 2
    "degrade": 2, "dégradé": 2, "dégradée": 2, "degradee": 2,
    "malade": 2, "endommage": 2, "endommagé": 2,
    # Très dégradé → 1
    "tres_degrade": 1, "très_dégradé": 1, "tres degrade": 1, "très dégradé": 1,
    "tres_endommage": 1, "très_endommagé": 1,
    # Mort → 0
    "mort": 0, "morte": 0, "mort_arbre": 0, "seche": 0, "sèche": 0,
}

# Catégories agrégées pour les taux en pourcentage (spec d'audit)
_REB_ETAT_TRES_BON = {k for k, v in _REB_HEALTH_SCORE.items() if v == 5}
_REB_ETAT_BON = {k for k, v in _REB_HEALTH_SCORE.items() if v == 4}
_REB_ETAT_MOYEN = {k for k, v in _REB_HEALTH_SCORE.items() if v == 3}
_REB_ETAT_DEGRADE_LIGHT = {k for k, v in _REB_HEALTH_SCORE.items() if v == 2}
_REB_ETAT_DEGRADE_HEAVY = {k for k, v in _REB_HEALTH_SCORE.items() if v == 1}
_REB_ETAT_MORT_SCORED = {k for k, v in _REB_HEALTH_SCORE.items() if v == 0}


def _split_select_multiple(value) -> list[str]:
    """
    Découpe un champ Kobo `select_multiple`. Tolère :
    - chaîne séparée par espaces (format standard Kobo)
    - chaîne séparée par `;` ou `,` (XLSForm exporté autrement)
    - liste Python déjà parsée
    Retourne des tokens minuscules dédoublonnés (ordre préservé).
    """
    if value is None:
        return []
    if isinstance(value, (list, tuple, set)):
        raw_tokens = [str(t).strip() for t in value if str(t).strip()]
    else:
        s = str(value).strip()
        if not s:
            return []
        if ";" in s:
            raw_tokens = [t.strip() for t in s.split(";") if t.strip()]
        elif "," in s and " " not in s:
            # virgules uniquement (pas un libellé multi-mots)
            raw_tokens = [t.strip() for t in s.split(",") if t.strip()]
        else:
            raw_tokens = [t.strip() for t in s.split() if t.strip()]
    seen: set[str] = set()
    out: list[str] = []
    for t in raw_tokens:
        lo = t.lower()
        if lo not in seen:
            seen.add(lo)
            out.append(lo)
    return out


def _reb_health_score(etat_raw: str | None) -> int | None:
    """Retourne le score 0..5 d'un état sanitaire, None si valeur inconnue/vide."""
    if not etat_raw:
        return None
    key = str(etat_raw).strip().lower()
    return _REB_HEALTH_SCORE.get(key)


def _reb_is_mort(etat_raw: str | None) -> bool:
    key = (etat_raw or "").strip().lower()
    return key in _REB_ETAT_MORT or key in _REB_ETAT_MORT_SCORED


def _reb_is_vivant(etat_raw: str | None) -> bool:
    key = (etat_raw or "").strip().lower()
    return key in _REB_ETAT_VIVANT or key in _REB_ETAT_BON or key in _REB_ETAT_TRES_BON


def _reb_is_degrade(etat_raw: str | None) -> bool:
    key = (etat_raw or "").strip().lower()
    return key in _REB_ETAT_DEGRADE_LIGHT or key in _REB_ETAT_DEGRADE_HEAVY


def _reb_is_bon_etat(etat_raw: str | None) -> bool:
    """Bon ou très bon état (pour taux_arbres_bon_etat)."""
    key = (etat_raw or "").strip().lower()
    return key in _REB_ETAT_BON or key in _REB_ETAT_TRES_BON


def _pct(num: int, total: int) -> float:
    """Pourcentage arrondi à 0.1 ; 0.0 si total nul."""
    return round(num / total * 100, 1) if total > 0 else 0.0


def _indicators_reboisement(submissions: list[dict]) -> list[dict]:
    # Compteurs métier
    arbres = 0
    arbres_vivants = 0
    arbres_bon_etat = 0  # Bon + très bon état (sous-ensemble des vivants)
    arbres_morts = 0
    arbres_degrades = 0
    arbres_geolocalises = 0
    arbres_avec_photo = 0
    arbres_avec_commentaire = 0
    arbres_avec_degradation = 0
    arbres_etat_inconnu = 0
    score_total = 0
    score_count = 0

    parcelles: set[str] = set()
    especes_sci: set[str] = set()
    especes_locales: set[str] = set()
    facteurs_degradation: set[str] = set()
    nb_facteurs_total = 0

    photos_equipe = 0
    photos_arbres = 0
    missions_avec_signature = 0

    membres: set[str] = set()
    responsables: set[str] = set()
    jours: set[str] = set()
    missions_zaranou = 0
    missions_apoueba = 0

    precisions: list[float] = []

    for s in submissions:
        # ── Équipe / mission ────────────────────────────────
        foret = (s.get("equipe_collecte/foret_communautaire") or "").lower().strip()
        if "zaranou" in foret:
            missions_zaranou += 1
        if "apoueba" in foret or "apouéba" in foret:
            missions_apoueba += 1

        date_enq = s.get("equipe_collecte/date_enquete")
        if isinstance(date_enq, str) and date_enq.strip():
            jours.add(date_enq.strip())

        resp = s.get("equipe_collecte/responsable_mission")
        if isinstance(resp, str) and resp.strip():
            responsables.add(resp.strip().lower())

        mem = s.get("equipe_collecte/membres_mission")
        if isinstance(mem, str) and mem.strip():
            for m in mem.split():
                if m:
                    membres.add(m.lower())

        if s.get("equipe_collecte/photo_equipe"):
            photos_equipe += 1

        # Signature : on essaie plusieurs noms de champ (le formulaire
        # XLSForm peut utiliser signature_responsable ou signature)
        if (
            s.get("equipe_collecte/signature_responsable")
            or s.get("equipe_collecte/signature")
            or s.get("signature_responsable")
            or s.get("signature")
        ):
            missions_avec_signature += 1

        # ── Arbres observés ─────────────────────────────────
        for item in s.get("observation_arbre") or []:
            arbres += 1

            num = item.get("observation_arbre/numero_parcelle")
            if num not in (None, ""):
                parcelles.add(str(num).strip())

            nom_loc = item.get("observation_arbre/nom_arbre")
            if isinstance(nom_loc, str) and nom_loc.strip():
                especes_locales.add(nom_loc.strip().lower())

            nom_sci = item.get("observation_arbre/nom_scientifique")
            if isinstance(nom_sci, str) and nom_sci.strip():
                especes_sci.add(nom_sci.strip().lower())

            etat_raw = item.get("observation_arbre/etat_sanitaire") or ""
            etat = etat_raw.lower().strip()
            score = _reb_health_score(etat_raw)
            if score is not None:
                score_total += score
                score_count += 1

            if _reb_is_vivant(etat_raw):
                arbres_vivants += 1
            elif _reb_is_mort(etat_raw):
                arbres_morts += 1
            elif _reb_is_degrade(etat_raw):
                arbres_degrades += 1
            elif etat:
                # Valeur libre non classifiée : on la considère comme dégradée
                # (état non bon) pour rester cohérent avec l'historique du code.
                arbres_degrades += 1
            else:
                arbres_etat_inconnu += 1

            if _reb_is_bon_etat(etat_raw):
                arbres_bon_etat += 1

            tokens = _split_select_multiple(item.get("observation_arbre/facteurs_degradation"))
            if tokens:
                arbres_avec_degradation += 1
                nb_facteurs_total += len(tokens)
                for t in tokens:
                    facteurs_degradation.add(t)

            if item.get("observation_arbre/photo_arbre"):
                arbres_avec_photo += 1
                photos_arbres += 1

            commentaire = item.get("observation_arbre/commentaire_arbre") or item.get(
                "observation_arbre/commentaire"
            )
            if isinstance(commentaire, str) and commentaire.strip():
                arbres_avec_commentaire += 1

            gps = item.get("observation_arbre/gps_arbre")
            pt = _parse_geopoint(gps)
            if pt:
                arbres_geolocalises += 1
                _lat, _lon, _alt, acc = pt
                if acc is not None:
                    precisions.append(acc)

    precision_moyenne = round(sum(precisions) / len(precisions), 1) if precisions else 0
    n_missions = len(submissions)
    arbres_par_mission = round(arbres / n_missions, 2) if n_missions > 0 else 0.0
    indice_sante = round(score_total / score_count, 2) if score_count > 0 else 0.0

    return [
        # Volumétrie
        {"indicator_name": "Missions de reboisement", "value": n_missions, "unit": "missions", "period": None},
        {"indicator_name": "Arbres monitorés", "value": arbres, "unit": "arbres", "period": None},
        {"indicator_name": "Arbres par mission", "value": arbres_par_mission, "unit": "arbres/mission", "period": None},
        {"indicator_name": "Parcelles inventoriées", "value": len(parcelles), "unit": "parcelles", "period": None},
        {"indicator_name": "Missions Zaranou", "value": missions_zaranou, "unit": "missions", "period": None},
        {"indicator_name": "Missions Apouéba", "value": missions_apoueba, "unit": "missions", "period": None},
        {"indicator_name": "Jours d'enquête", "value": len(jours), "unit": "jours", "period": None},
        {"indicator_name": "Écogardes mobilisés", "value": len(membres), "unit": "agents", "period": None},
        {"indicator_name": "Responsables de mission", "value": len(responsables), "unit": "responsables", "period": None},
        # État sanitaire (effectifs)
        {"indicator_name": "Arbres vivants", "value": arbres_vivants, "unit": "arbres", "period": None},
        {"indicator_name": "Arbres en bon état", "value": arbres_bon_etat, "unit": "arbres", "period": None},
        {"indicator_name": "Arbres morts", "value": arbres_morts, "unit": "arbres", "period": None},
        {"indicator_name": "Arbres dégradés", "value": arbres_degrades, "unit": "arbres", "period": None},
        # État sanitaire (pourcentages)
        {"indicator_name": "Taux survie observée", "value": _pct(arbres - arbres_morts, arbres), "unit": "%", "period": None},
        {"indicator_name": "Taux arbres bon état", "value": _pct(arbres_bon_etat, arbres), "unit": "%", "period": None},
        {"indicator_name": "Taux arbres dégradés", "value": _pct(arbres_degrades, arbres), "unit": "%", "period": None},
        {"indicator_name": "Taux arbres morts", "value": _pct(arbres_morts, arbres), "unit": "%", "period": None},
        {"indicator_name": "Indice santé reboisement", "value": indice_sante, "unit": "/5", "period": None},
        # Espèces
        {"indicator_name": "Espèces inventoriées", "value": len(especes_sci), "unit": "espèces", "period": None},
        {"indicator_name": "Espèces locales", "value": len(especes_locales), "unit": "noms", "period": None},
        # Dégradation
        {"indicator_name": "Arbres avec dégradation", "value": arbres_avec_degradation, "unit": "arbres", "period": None},
        {"indicator_name": "Taux arbres avec dégradation", "value": _pct(arbres_avec_degradation, arbres), "unit": "%", "period": None},
        {"indicator_name": "Facteurs de dégradation", "value": len(facteurs_degradation), "unit": "types", "period": None},
        {"indicator_name": "Signalements de dégradation", "value": nb_facteurs_total, "unit": "signalements", "period": None},
        # Géolocalisation
        {"indicator_name": "Arbres géolocalisés", "value": arbres_geolocalises, "unit": "arbres", "period": None},
        {"indicator_name": "Taux arbres géolocalisés", "value": _pct(arbres_geolocalises, arbres), "unit": "%", "period": None},
        {"indicator_name": "Précision GPS moyenne", "value": precision_moyenne, "unit": "m", "period": None},
        # Photos / qualité de collecte
        {"indicator_name": "Photos d'arbres", "value": photos_arbres, "unit": "photos", "period": None},
        {"indicator_name": "Taux arbres avec photo", "value": _pct(arbres_avec_photo, arbres), "unit": "%", "period": None},
        {"indicator_name": "Arbres avec commentaire", "value": arbres_avec_commentaire, "unit": "arbres", "period": None},
        {"indicator_name": "Taux arbres avec commentaire", "value": _pct(arbres_avec_commentaire, arbres), "unit": "%", "period": None},
        {"indicator_name": "Photos d'équipe (reboisement)", "value": photos_equipe, "unit": "photos", "period": None},
        {"indicator_name": "Taux missions avec photo équipe", "value": _pct(photos_equipe, n_missions), "unit": "%", "period": None},
        {"indicator_name": "Taux missions avec signature", "value": _pct(missions_avec_signature, n_missions), "unit": "%", "period": None},
    ]


# ─── Suivi des plantations (planting_arbre) — helpers & libellés ──────

# Libellés humains pour les listes Kobo (codes XLSForm → libellé FR).
_PLANTING_TYPE_REBOISEMENT_LABELS: dict[str, str] = {
    "enrichissement": "Enrichissement",
    "plantation_pure": "Plantation pure",
    "rna": "Régénération naturelle assistée",
}
_PLANTING_ORIGINE_LABELS: dict[str, str] = {
    "pepiniere": "Pépinière",
    "achat": "Achat",
    "don": "Don",
}
_PLANTING_ORGANISME_LABELS: dict[str, str] = {
    "cooperatives": "Coopératives",
    "minef": "MINEF",
    "communaute": "Communauté",
    "autre": "Autre",
}
# Liste `arbre` (espèces locales du formulaire) → nom humain et scientifique.
_PLANTING_SPECIES_LABELS: dict[str, str] = {
    "frake": "Fraké",
    "framire": "Framiré",
    "bois_bete": "Bois bété",
    "gmelina": "Gmelina",
    "badi": "Badi",
    "acajou": "Acajou",
    "fromager": "Fromager",
    "makore": "Makoré",
    "iroko": "Iroko",
    "cedrela": "Cedrela",
    "tiama": "Tiama",
    "petit_cola": "Petit cola",
    "autre": "Autre",
}


def _planting_label(code: str | None, mapping: dict[str, str]) -> str:
    """Convertit un code Kobo en libellé humain (fallback : code titre-case)."""
    if not isinstance(code, str):
        return ""
    key = code.strip().lower()
    if not key:
        return ""
    return mapping.get(key, key.replace("_", " ").capitalize())


def _planting_int(value) -> int:
    """Convertit en int avec tolérance str/float ; 0 si invalide ou négatif."""
    try:
        v = int(float(value))
        return v if v >= 0 else 0
    except (TypeError, ValueError):
        return 0


def _planting_float(value) -> float:
    """Convertit en float avec tolérance ; 0.0 si invalide ou négatif."""
    try:
        v = float(value)
        return v if v >= 0 else 0.0
    except (TypeError, ValueError):
        return 0.0


def _planting_iter_especes(submission: dict):
    """
    Itère sur les espèces plantées d'une soumission (repeat `espece_plantee`).
    Retourne pour chaque entrée le code espèce résolu (nom_arbre, en
    substituant `autre_espece` quand l'utilisateur a choisi "autre") et le
    dict brut pour exploitation directe des autres champs.
    """
    for item in submission.get("espece_plantee") or []:
        nom_raw = item.get("espece_plantee/nom_arbre")
        nom_code = nom_raw.strip().lower() if isinstance(nom_raw, str) else ""
        if nom_code == "autre":
            autre = item.get("espece_plantee/autre_espece")
            if isinstance(autre, str) and autre.strip():
                nom_code = autre.strip().lower()
        yield nom_code, item


def _indicators_planting(submissions: list[dict]) -> list[dict]:
    """
    Indicateurs Suivi des plantations (`planting_arbre`).

    Le formulaire couvre l'identification d'une parcelle reboisée
    (`identification_parcelle/*` : numero, GPS centre, délimitation
    geoshape, surface calculée, origine plants, organisme don,
    type de reboisement) et un repeat `espece_plantee` listant les
    espèces et le nombre de plants par espèce. Le champ déclaré
    `arbres_plante` donne le total saisi par le responsable.
    """
    n_missions = len(submissions)

    # Volumétrie globale
    parcelles: set[str] = set()
    arbres_declares = 0  # somme de identification_parcelle/arbres_plante… non, racine
    plants_comptes_total = 0  # somme nombre_plants sur tous les repeats
    surface_totale = 0.0
    parcelles_avec_surface = 0

    # Espèces
    especes_codes: set[str] = set()
    plants_par_espece: dict[str, int] = {}

    # Typologies
    types_reboisement: dict[str, int] = {}
    origines_plants: dict[str, int] = {}
    organismes_don: dict[str, int] = {}

    # Équipe / mission
    membres: set[str] = set()
    responsables: set[str] = set()
    jours: set[str] = set()
    missions_zaranou = 0
    missions_apoueba = 0

    # Qualité
    photos_equipe = 0
    photos_parcelle = 0
    delimitations = 0
    centres_gps = 0
    signatures = 0
    commentaires = 0
    parcelles_coherentes = 0  # |declared - counted| <= 5% (ou diff <=2)

    for s in submissions:
        # Forêt
        foret_raw = s.get("metadonnees_collecte/equipe_collecte/foret_communautaire") or ""
        foret = foret_raw.lower().strip()
        if "zaranou" in foret:
            missions_zaranou += 1
        if "apoueba" in foret or "apouéba" in foret:
            missions_apoueba += 1

        # Date
        date_enq = s.get("metadonnees_collecte/date_enquete")
        if isinstance(date_enq, str) and date_enq.strip():
            jours.add(date_enq.strip()[:10])

        # Responsable / membres
        resp = s.get("metadonnees_collecte/equipe_collecte/responsable_mission")
        if isinstance(resp, str) and resp.strip():
            responsables.add(resp.strip().lower())
        for m in _split_select_multiple(
            s.get("metadonnees_collecte/equipe_collecte/membres_mission")
        ):
            membres.add(m)

        if s.get("metadonnees_collecte/equipe_collecte/photo_equipe"):
            photos_equipe += 1
        if s.get("signature_responsable"):
            signatures += 1
        commentaire = s.get("commentaires_responsable")
        if isinstance(commentaire, str) and commentaire.strip():
            commentaires += 1

        # Parcelle
        num_raw = s.get("identification_parcelle/numero_parcelle")
        if num_raw not in (None, ""):
            parcelles.add(str(num_raw).strip())

        if s.get("identification_parcelle/photo_parcelle_reboisee"):
            photos_parcelle += 1
        if s.get("identification_parcelle/delimitation_parcelle"):
            delimitations += 1
        if s.get("identification_parcelle/gps_centre_parcelle"):
            centres_gps += 1

        surf = _planting_float(
            s.get("identification_parcelle/surface_calculee_ha")
            or s.get("identification_parcelle/superficie_ha")
        )
        if surf > 0:
            surface_totale += surf
            parcelles_avec_surface += 1

        # Typologies (codes Kobo bruts)
        type_reb = s.get("identification_parcelle/type_reboisement")
        if isinstance(type_reb, str) and type_reb.strip():
            types_reboisement[type_reb.strip().lower()] = (
                types_reboisement.get(type_reb.strip().lower(), 0) + 1
            )
        origine = s.get("identification_parcelle/origine_plants")
        if isinstance(origine, str) and origine.strip():
            origines_plants[origine.strip().lower()] = (
                origines_plants.get(origine.strip().lower(), 0) + 1
            )
        if origine and origine.strip().lower() == "don":
            org = s.get("identification_parcelle/organisme_don")
            if isinstance(org, str) and org.strip():
                organismes_don[org.strip().lower()] = (
                    organismes_don.get(org.strip().lower(), 0) + 1
                )

        # Déclaré total
        declared = _planting_int(s.get("arbres_plante"))
        arbres_declares += declared

        # Espèces du repeat
        counted_local = 0
        for code, item in _planting_iter_especes(s):
            if code:
                especes_codes.add(code)
            plants = _planting_int(item.get("espece_plantee/nombre_plants"))
            plants_comptes_total += plants
            counted_local += plants
            if code:
                plants_par_espece[code] = plants_par_espece.get(code, 0) + plants

        # Cohérence déclaré vs compté
        if declared > 0 or counted_local > 0:
            diff = abs(declared - counted_local)
            seuil = max(2, int(round(max(declared, counted_local) * 0.05)))
            if diff <= seuil:
                parcelles_coherentes += 1

    surface_moyenne = (
        round(surface_totale / parcelles_avec_surface, 2)
        if parcelles_avec_surface > 0
        else 0.0
    )
    plants_moy_parcelle = (
        round(plants_comptes_total / len(parcelles), 1) if parcelles else 0.0
    )
    densite = (
        round(plants_comptes_total / surface_totale, 1) if surface_totale > 0 else 0.0
    )
    ecart_declared = abs(arbres_declares - plants_comptes_total)
    taux_coherence = _pct(parcelles_coherentes, n_missions)

    espece_dominante_code, espece_dominante_value = (
        max(plants_par_espece.items(), key=lambda kv: kv[1])
        if plants_par_espece
        else (None, 0)
    )
    espece_dominante_label = (
        _planting_label(espece_dominante_code, _PLANTING_SPECIES_LABELS)
        if espece_dominante_code
        else "—"
    )

    return [
        # Volumétrie
        {"indicator_name": "Missions de plantation", "value": n_missions, "unit": "missions", "period": None},
        {"indicator_name": "Parcelles plantées", "value": len(parcelles), "unit": "parcelles", "period": None},
        {"indicator_name": "Arbres plantés (déclarés)", "value": arbres_declares, "unit": "arbres", "period": None},
        {"indicator_name": "Plants comptés (espèces)", "value": plants_comptes_total, "unit": "plants", "period": None},
        {"indicator_name": "Écart déclaré vs compté", "value": ecart_declared, "unit": "plants", "period": None},
        {"indicator_name": "Plants moyens par parcelle", "value": plants_moy_parcelle, "unit": "plants/parcelle", "period": None},
        {"indicator_name": "Surface plantée totale", "value": round(surface_totale, 2), "unit": "ha", "period": None},
        {"indicator_name": "Surface moyenne par parcelle", "value": surface_moyenne, "unit": "ha", "period": None},
        {"indicator_name": "Densité moyenne", "value": densite, "unit": "plants/ha", "period": None},
        # Équipe / activité
        {"indicator_name": "Missions Zaranou", "value": missions_zaranou, "unit": "missions", "period": None},
        {"indicator_name": "Missions Apouéba", "value": missions_apoueba, "unit": "missions", "period": None},
        {"indicator_name": "Jours d'enquête", "value": len(jours), "unit": "jours", "period": None},
        # Espèces
        {"indicator_name": "Espèces plantées", "value": len(especes_codes), "unit": "espèces", "period": None},
        {"indicator_name": "Espèce dominante", "value": espece_dominante_value, "unit": espece_dominante_label, "period": None},
        # Typologies de reboisement
        {"indicator_name": "Parcelles en enrichissement", "value": types_reboisement.get("enrichissement", 0), "unit": "parcelles", "period": None},
        {"indicator_name": "Parcelles en plantation pure", "value": types_reboisement.get("plantation_pure", 0), "unit": "parcelles", "period": None},
        {"indicator_name": "Parcelles en RNA", "value": types_reboisement.get("rna", 0), "unit": "parcelles", "period": None},
        # Origine des plants
        {"indicator_name": "Plants issus de pépinière", "value": origines_plants.get("pepiniere", 0), "unit": "parcelles", "period": None},
        # Qualité de collecte
        {"indicator_name": "Taux parcelles délimitées (GPS)", "value": _pct(delimitations, n_missions), "unit": "%", "period": None},
        {"indicator_name": "Taux missions avec commentaire", "value": _pct(commentaires, n_missions), "unit": "%", "period": None},
    ]


def _indicators_menaces(submissions: list[dict]) -> list[dict]:
    return _menaces_compute_all(submissions)["indicators"]


# ─── Suivi des menaces — scoring & helpers ──────────────────

# Score de gravité (faible=1, moyen=2, eleve=3, tres_eleve=4)
_GRAVITE_SCORE: dict[str, int] = {
    "faible": 1, "low": 1,
    "moyen": 2, "moyenne": 2, "moderate": 2, "modere": 2, "modéré": 2,
    "eleve": 3, "élevé": 3, "elevee": 3, "élevée": 3, "high": 3, "haut": 3,
    "tres_eleve": 4, "très_élevé": 4, "tres eleve": 4, "très élevé": 4,
    "tres_elevee": 4, "très_élevée": 4, "very_high": 4, "critique": 4,
}
_GRAVITE_LABELS: dict[str, str] = {
    "faible": "Faible", "moyen": "Moyen", "eleve": "Élevé", "tres_eleve": "Très élevé",
}

# Score d'ancienneté (recent=3 = pression active, ancien=2, tres_ancien=1)
_ANCIENNETE_SCORE: dict[str, int] = {
    "recent": 3, "récent": 3, "récente": 3, "recente": 3, "frais": 3, "fresh": 3,
    "ancien": 2, "ancienne": 2, "old": 2, "moyen_age": 2,
    "tres_ancien": 1, "très_ancien": 1, "tres ancien": 1, "très ancien": 1,
    "tres_ancienne": 1, "très_ancienne": 1, "very_old": 1,
}
_ANCIENNETE_LABELS: dict[str, str] = {
    "recent": "Récent", "ancien": "Ancien", "tres_ancien": "Très ancien",
}

# Clés possibles du repeat group dans les réponses Kobo (le nom a pu changer
# au fil des versions du formulaire). Toutes sont testées dans l'ordre.
_MENACES_REPEAT_KEYS: tuple[str, ...] = (
    "rep_menaces",
    "menaces",
    "signalement_menaces",
    "signalements_menaces",
    "observations_menaces",
    "observation_menaces",
    "menaces_repeat",
    "liste_menaces",
)

# Champs Kobo possibles (le formulaire a évolué : nouveaux noms à plat
# OU anciens noms imbriqués `rep_menaces/principales_menaces/*`).
# Le dernier élément de chaque tuple est toujours le nom court (fallback
# quand la soumission elle-même représente une seule observation).
_MENACES_FIELD_PATHS: dict[str, tuple[str, ...]] = {
    "type_pression": (
        "rep_menaces/type_pression",
        "rep_menaces/principales_menaces/Type_pression",
        "rep_menaces/principales_menaces/type_pression",
        "menaces/type_pression",
        "signalement_menaces/type_pression",
        "metadonnees_collecte/type_pression",
        "type_pression",
    ),
    "autre_pression": (
        "rep_menaces/autre_pression",
        "rep_menaces/principales_menaces/autre_pression",
        "menaces/autre_pression",
        "autre_pression",
    ),
    "indice_pression": (
        "rep_menaces/indice_pression",
        "rep_menaces/principales_menaces/indice_pression",
        "menaces/indice_pression",
        "indice_pression",
    ),
    "nombre_indices": (
        "rep_menaces/nombre_indices",
        "rep_menaces/principales_menaces/nombre_indices",
        "menaces/nombre_indices",
        "nombre_indices",
        "nb_indices",
    ),
    "anciennete_indice": (
        "rep_menaces/anciennete_indice",
        "rep_menaces/principales_menaces/anciennete_indice",
        "menaces/anciennete_indice",
        "anciennete_indice",
        "anciennete",
    ),
    "niveau_gravite": (
        "rep_menaces/niveau_gravite",
        "rep_menaces/principales_menaces/niveau_gravite",
        "menaces/niveau_gravite",
        "niveau_gravite",
        "gravite",
    ),
    "gps_observation": (
        "rep_menaces/gps_observation",
        "rep_menaces/principales_menaces/gps_observation",
        "rep_menaces/gps_agriculture_1",
        "rep_menaces/principales_menaces/gps_agriculture_1",
        "menaces/gps_observation",
        "gps_observation",
        "gps_menace",
        "coordonnees_gps",
    ),
    "photo_observation": (
        "rep_menaces/photo_observation",
        "rep_menaces/principales_menaces/photo_observation",
        "rep_menaces/img_agriculture_1",
        "rep_menaces/principales_menaces/img_agriculture_1",
        "menaces/photo_observation",
        "photo_observation",
        "photo_menace",
        "photo",
    ),
    "commentaire_observation": (
        "rep_menaces/commentaire_observation",
        "rep_menaces/principales_menaces/commentaire_observation",
        "rep_menaces/commentaire",
        "menaces/commentaire_observation",
        "commentaire_observation",
        "commentaire",
    ),
}

# Clé legacy (compatibilité)
_MENACES_REPEAT_KEY = _MENACES_REPEAT_KEYS[0]


def _get_menaces_items(submission: dict) -> list[dict]:
    """Retourne les observations de menaces d'une soumission.

    Essaie chaque clé connue du repeat group. Si aucun repeat n'est trouvé
    mais que la soumission contient directement des champs de menaces, la
    traite comme une observation unique (formulaire sans repeat).
    """
    for key in _MENACES_REPEAT_KEYS:
        items = submission.get(key)
        if items and isinstance(items, list):
            return items
    # Fallback : la soumission elle-même est l'observation (pas de repeat group)
    for paths in _MENACES_FIELD_PATHS.values():
        if _get_field(submission, paths) is not None:
            return [submission]
    return []

# Champs au niveau mission/soumission (root)
_MENACES_SUB_PATHS: dict[str, tuple[str, ...]] = {
    "foret_communautaire": (
        "metadonnees_collecte/foret_communautaire",
        "equipe_collecte/foret_communautaire",
        "foret_communautaire",
    ),
    "date_enquete": (
        "metadonnees_collecte/date_enquete",
        "equipe_collecte/date_enquete",
        "date_enquete",
    ),
    "heure_debut": (
        "metadonnees_collecte/heure_debut",
        "heure_debut",
        "start",
    ),
    "heure_fin": (
        "metadonnees_collecte/heure_fin",
        "heure_fin",
        "end",
    ),
    "photo_equipe": (
        "metadonnees_collecte/photo_equipe",
        "equipe_collecte/photo_equipe",
        "photo_equipe",
    ),
    "membres_mission": (
        "metadonnees_collecte/membres_mission",
        "equipe_collecte/membres_mission",
        "membres_mission",
    ),
    "responsable_mission": (
        "metadonnees_collecte/responsable_mission",
        "equipe_collecte/responsable_mission",
        "responsable_mission",
    ),
    "signature_responsable": (
        "validation/signature_responsable",
        "metadonnees_collecte/signature_responsable",
        "equipe_collecte/signature_responsable",
        "signature_responsable",
        "signature",
    ),
    "commentaires_responsable": (
        "validation/commentaires_responsable",
        "commentaires_responsable",
    ),
}


def _get_field(container: dict, paths: tuple[str, ...]):
    """Premier chemin non-vide trouvé parmi `paths`. Retourne None sinon."""
    if not isinstance(container, dict):
        return None
    for p in paths:
        v = container.get(p)
        if v not in (None, ""):
            return v
    return None


def _gravite_score(raw) -> int | None:
    if raw in (None, ""):
        return None
    return _GRAVITE_SCORE.get(str(raw).strip().lower())


def _gravite_norm(raw) -> str | None:
    """Retourne la clé canonique (faible/moyen/eleve/tres_eleve) si reconnue."""
    if raw in (None, ""):
        return None
    key = str(raw).strip().lower()
    if key in _GRAVITE_LABELS:
        return key
    # mapper d'autres variantes vers la clé canonique
    score = _GRAVITE_SCORE.get(key)
    if score is None:
        return None
    for k, v in _GRAVITE_SCORE.items():
        if v == score and k in _GRAVITE_LABELS:
            return k
    return None


def _anciennete_score(raw) -> int | None:
    if raw in (None, ""):
        return None
    return _ANCIENNETE_SCORE.get(str(raw).strip().lower())


def _anciennete_norm(raw) -> str | None:
    if raw in (None, ""):
        return None
    key = str(raw).strip().lower()
    if key in _ANCIENNETE_LABELS:
        return key
    score = _ANCIENNETE_SCORE.get(key)
    if score is None:
        return None
    for k, v in _ANCIENNETE_SCORE.items():
        if v == score and k in _ANCIENNETE_LABELS:
            return k
    return None


def _menaces_compute_all(submissions: list[dict]) -> dict:
    """
    Cœur de calcul des indicateurs et distributions du suivi des menaces.
    Retourne `{"indicators": [...], "breakdowns": {...}}` pour
    alimenter à la fois `/kpi/indicators` et `/kpi/menaces/breakdowns`.
    """
    from collections import Counter, defaultdict

    n_missions = len(submissions)
    obs_total = 0
    indices_total = 0
    obs_geo = 0
    obs_photo = 0
    obs_commentaire = 0
    missions_signature = 0
    missions_photo_equipe = 0

    duree_totale_h = 0.0

    type_counts: Counter[str] = Counter()
    type_by_forest: dict[str, Counter[str]] = defaultdict(Counter)
    obs_by_forest: Counter[str] = Counter()
    missions_by_forest: Counter[str] = Counter()
    indices_by_type: Counter[str] = Counter()
    indices_by_forest: Counter[str] = Counter()

    indice_counts: Counter[str] = Counter()
    indice_by_type: dict[str, Counter[str]] = defaultdict(Counter)
    indice_by_forest: dict[str, Counter[str]] = defaultdict(Counter)

    gravite_counts: Counter[str] = Counter()
    gravite_by_forest: dict[str, Counter[str]] = defaultdict(Counter)
    gravite_by_type: dict[str, Counter[str]] = defaultdict(Counter)
    gravite_scores: list[int] = []
    gravite_scores_by_forest: dict[str, list[int]] = defaultdict(list)
    gravite_scores_by_type: dict[str, list[int]] = defaultdict(list)
    obs_graves = 0  # niveau eleve ou tres_eleve

    anciennete_counts: Counter[str] = Counter()
    anciennete_by_forest: dict[str, Counter[str]] = defaultdict(Counter)
    anciennete_by_type: dict[str, Counter[str]] = defaultdict(Counter)
    anciennete_scores: list[int] = []
    obs_recentes = 0  # ancienneté = recent

    # Indices synthétiques
    pression_brut = 0.0
    pression_active = 0.0
    pression_by_forest: dict[str, float] = defaultdict(float)
    pression_by_type: dict[str, float] = defaultdict(float)

    types_by_forest_set: dict[str, set[str]] = defaultdict(set)
    autres_libelles: Counter[str] = Counter()
    membres_set: set[str] = set()
    responsables_set: set[str] = set()
    jours: set[str] = set()

    for s in submissions:
        forest = _resolve_forest("menaces", s)
        missions_by_forest[forest] += 1

        # ── Mission / équipe ─────────────────────────────
        date_enq = _get_field(s, _MENACES_SUB_PATHS["date_enquete"])
        if isinstance(date_enq, str) and date_enq.strip():
            jours.add(date_enq.strip()[:10])

        mem = _get_field(s, _MENACES_SUB_PATHS["membres_mission"])
        for m in _split_tokens(mem if isinstance(mem, str) else ""):
            if m:
                membres_set.add(m.lower())

        resp = _get_field(s, _MENACES_SUB_PATHS["responsable_mission"])
        if isinstance(resp, str) and resp.strip():
            responsables_set.add(resp.strip().lower())

        if _get_field(s, _MENACES_SUB_PATHS["photo_equipe"]):
            missions_photo_equipe += 1
        if _get_field(s, _MENACES_SUB_PATHS["signature_responsable"]):
            missions_signature += 1

        # Durée de collecte via start/end Kobo (ou heure_debut/heure_fin)
        debut = _parse_kobo_dt(_get_field(s, _MENACES_SUB_PATHS["heure_debut"]))
        fin = _parse_kobo_dt(_get_field(s, _MENACES_SUB_PATHS["heure_fin"]))
        if debut and fin and fin >= debut:
            duree_totale_h += (fin - debut).total_seconds() / 3600.0

        # ── Observations dans le repeat ──────────────────
        for item in _get_menaces_items(s):
            obs_total += 1
            obs_by_forest[forest] += 1

            # Type de pression
            type_raw = _get_field(item, _MENACES_FIELD_PATHS["type_pression"]) or ""
            type_norm = (
                str(type_raw).strip().lower()
                if isinstance(type_raw, str)
                else ""
            )
            # Si le type est une liste (peu probable), prendre le premier
            if not type_norm and isinstance(type_raw, (list, tuple)) and type_raw:
                type_norm = str(type_raw[0]).strip().lower()
            if type_norm == "autre":
                autre_lib = _get_field(item, _MENACES_FIELD_PATHS["autre_pression"])
                if isinstance(autre_lib, str) and autre_lib.strip():
                    autres_libelles[autre_lib.strip()] += 1
            if type_norm:
                type_counts[type_norm] += 1
                type_by_forest[forest][type_norm] += 1
                types_by_forest_set[forest].add(type_norm)

            # Nombre d'indices (entier)
            n_ind_raw = _get_field(item, _MENACES_FIELD_PATHS["nombre_indices"])
            try:
                n_ind = int(float(n_ind_raw)) if n_ind_raw not in (None, "") else 0
            except (TypeError, ValueError):
                n_ind = 0
            if n_ind < 0:
                n_ind = 0
            indices_total += n_ind
            indices_by_forest[forest] += n_ind
            if type_norm:
                indices_by_type[type_norm] += n_ind

            # Indices de pression (select_multiple)
            ind_tokens = _split_select_multiple(
                _get_field(item, _MENACES_FIELD_PATHS["indice_pression"])
            )
            for tok in ind_tokens:
                indice_counts[tok] += 1
                if type_norm:
                    indice_by_type[type_norm][tok] += 1
                indice_by_forest[forest][tok] += 1

            # Gravité
            grav_raw = _get_field(item, _MENACES_FIELD_PATHS["niveau_gravite"])
            grav_key = _gravite_norm(grav_raw)
            grav_score = _gravite_score(grav_raw)
            if grav_key:
                gravite_counts[grav_key] += 1
                gravite_by_forest[forest][grav_key] += 1
                if type_norm:
                    gravite_by_type[type_norm][grav_key] += 1
            if grav_score is not None:
                gravite_scores.append(grav_score)
                gravite_scores_by_forest[forest].append(grav_score)
                if type_norm:
                    gravite_scores_by_type[type_norm].append(grav_score)
                if grav_score >= 3:  # eleve ou tres_eleve
                    obs_graves += 1

            # Ancienneté
            anc_raw = _get_field(item, _MENACES_FIELD_PATHS["anciennete_indice"])
            anc_key = _anciennete_norm(anc_raw)
            anc_score = _anciennete_score(anc_raw)
            if anc_key:
                anciennete_counts[anc_key] += 1
                anciennete_by_forest[forest][anc_key] += 1
                if type_norm:
                    anciennete_by_type[type_norm][anc_key] += 1
            if anc_score is not None:
                anciennete_scores.append(anc_score)
                if anc_score == 3:
                    obs_recentes += 1

            # Indices synthétiques
            g_for_synth = grav_score if grav_score is not None else 1
            a_for_synth = anc_score if anc_score is not None else 1
            count_for_synth = n_ind if n_ind > 0 else 1
            brut_contrib = count_for_synth * g_for_synth
            active_contrib = count_for_synth * g_for_synth * a_for_synth
            pression_brut += brut_contrib
            pression_active += active_contrib
            pression_by_forest[forest] += active_contrib
            if type_norm:
                pression_by_type[type_norm] += active_contrib

            # Géolocalisation
            if _parse_geopoint(_get_field(item, _MENACES_FIELD_PATHS["gps_observation"])):
                obs_geo += 1
            if _get_field(item, _MENACES_FIELD_PATHS["photo_observation"]):
                obs_photo += 1
            commentaire = _get_field(item, _MENACES_FIELD_PATHS["commentaire_observation"])
            if isinstance(commentaire, str) and commentaire.strip():
                obs_commentaire += 1

    # ── Aggrégats finaux ─────────────────────────────────
    score_moy_gravite = (
        round(sum(gravite_scores) / len(gravite_scores), 2) if gravite_scores else 0.0
    )
    score_activite = (
        round(sum(anciennete_scores) / len(anciennete_scores), 2)
        if anciennete_scores else 0.0
    )
    obs_par_mission = round(obs_total / n_missions, 2) if n_missions > 0 else 0.0
    obs_par_heure = round(obs_total / duree_totale_h, 2) if duree_totale_h > 0 else 0.0
    moy_indices_obs = round(indices_total / obs_total, 2) if obs_total > 0 else 0.0
    taux_graves = _pct(obs_graves, obs_total)
    taux_recentes = _pct(obs_recentes, obs_total)
    taux_geo = _pct(obs_geo, obs_total)
    taux_photo = _pct(obs_photo, obs_total)
    taux_commentaire = _pct(obs_commentaire, obs_total)
    taux_signature = _pct(missions_signature, n_missions)
    taux_photo_equipe = _pct(missions_photo_equipe, n_missions)

    indicators = [
        # Effort de collecte
        {"indicator_name": "Missions réalisées", "value": n_missions, "unit": "missions", "period": None},
        {"indicator_name": "Jours d'enquête", "value": len(jours), "unit": "jours", "period": None},
        {"indicator_name": "Écogardes mobilisés", "value": len(membres_set), "unit": "agents", "period": None},
        {"indicator_name": "Responsables de mission", "value": len(responsables_set), "unit": "responsables", "period": None},
        {"indicator_name": "Durée totale de collecte", "value": round(duree_totale_h, 2), "unit": "h", "period": None},
        {"indicator_name": "Observations par mission", "value": obs_par_mission, "unit": "obs/mission", "period": None},
        {"indicator_name": "Observations par heure", "value": obs_par_heure, "unit": "obs/h", "period": None},
        # Inventaire des menaces
        {"indicator_name": "Signalements de menaces", "value": obs_total, "unit": "signalements", "period": None},
        {"indicator_name": "Types de menaces", "value": len(type_counts), "unit": "types", "period": None},
        {"indicator_name": "Nombre total d'indices", "value": indices_total, "unit": "indices", "period": None},
        {"indicator_name": "Moyenne d'indices par observation", "value": moy_indices_obs, "unit": "indices/obs", "period": None},
        # Indices de pression
        {"indicator_name": "Diversité des indices de pression", "value": len(indice_counts), "unit": "types", "period": None},
        # Gravité
        {"indicator_name": "Score moyen de gravité", "value": score_moy_gravite, "unit": "/4", "period": None},
        {"indicator_name": "Taux de menaces graves", "value": taux_graves, "unit": "%", "period": None},
        # Ancienneté
        {"indicator_name": "Score d'activité (ancienneté)", "value": score_activite, "unit": "/3", "period": None},
        {"indicator_name": "Taux de menaces récentes", "value": taux_recentes, "unit": "%", "period": None},
        # Indices synthétiques
        {"indicator_name": "Indice de pression brut", "value": round(pression_brut, 2), "unit": "score", "period": None},
        {"indicator_name": "Indice de pression active", "value": round(pression_active, 2), "unit": "score", "period": None},
        # Spatial
        {"indicator_name": "Menaces géolocalisées", "value": obs_geo, "unit": "obs", "period": None},
        {"indicator_name": "Taux de menaces géolocalisées", "value": taux_geo, "unit": "%", "period": None},
        # Qualité de la collecte
        {"indicator_name": "Taux observations avec photo", "value": taux_photo, "unit": "%", "period": None},
        {"indicator_name": "Taux observations avec commentaire", "value": taux_commentaire, "unit": "%", "period": None},
        {"indicator_name": "Taux missions avec signature", "value": taux_signature, "unit": "%", "period": None},
        {"indicator_name": "Taux missions avec photo équipe", "value": taux_photo_equipe, "unit": "%", "period": None},
    ]

    # ── Breakdowns détaillés ─────────────────────────────
    def _to_list(counter: Counter, limit: int | None = None, label_key: str = "name") -> list[dict]:
        items = counter.most_common(limit) if limit else counter.most_common()
        return [{label_key: name, "value": value} for name, value in items]

    by_forest_list = [
        {"forest": f, "value": v} for f, v in obs_by_forest.most_common()
    ]
    missions_by_forest_list = [
        {"forest": f, "value": v} for f, v in missions_by_forest.most_common()
    ]
    indices_by_forest_list = [
        {"forest": f, "value": v} for f, v in indices_by_forest.most_common()
    ]
    indices_by_type_list = [
        {"name": t, "value": v} for t, v in indices_by_type.most_common()
    ]

    # Type x Forêt (format long pour BarChart groupé/stacké)
    type_by_forest_long: list[dict] = []
    for forest, ctr in type_by_forest.items():
        for t, v in ctr.most_common():
            type_by_forest_long.append({"forest": forest, "type_pression": t, "value": v})

    # Gravité x Forêt / Type
    gravite_by_forest_long: list[dict] = []
    for forest, ctr in gravite_by_forest.items():
        for g, v in ctr.most_common():
            gravite_by_forest_long.append({"forest": forest, "niveau_gravite": g, "value": v})
    gravite_by_type_long: list[dict] = []
    for tp, ctr in gravite_by_type.items():
        for g, v in ctr.most_common():
            gravite_by_type_long.append({"type_pression": tp, "niveau_gravite": g, "value": v})

    # Ancienneté x Forêt / Type
    anciennete_by_forest_long: list[dict] = []
    for forest, ctr in anciennete_by_forest.items():
        for a, v in ctr.most_common():
            anciennete_by_forest_long.append({"forest": forest, "anciennete_indice": a, "value": v})
    anciennete_by_type_long: list[dict] = []
    for tp, ctr in anciennete_by_type.items():
        for a, v in ctr.most_common():
            anciennete_by_type_long.append({"type_pression": tp, "anciennete_indice": a, "value": v})

    # Indice dominant par type de pression
    indice_dominant_par_type = [
        {
            "type_pression": tp,
            "indice": (ctr.most_common(1)[0][0] if ctr else None),
            "value": (ctr.most_common(1)[0][1] if ctr else 0),
        }
        for tp, ctr in indice_by_type.items()
    ]

    # Matrice complète type × indice (long format)
    indice_detail_par_type: list[dict] = []
    for tp, ctr in indice_by_type.items():
        total_t = sum(ctr.values()) or 1
        for ind, v in ctr.most_common():
            indice_detail_par_type.append({
                "type_pression": tp,
                "indice": ind,
                "value": v,
                "share_pct": round(v / total_t * 100, 1),
            })

    # Indices par forêt (long, top 10 par forêt)
    indice_by_forest_long: list[dict] = []
    for forest, ctr in indice_by_forest.items():
        for ind, v in ctr.most_common(10):
            indice_by_forest_long.append({"forest": forest, "indice": ind, "value": v})

    # Score moyen de gravité par forêt / type
    score_grav_by_forest = [
        {"forest": f, "value": round(sum(vs) / len(vs), 2) if vs else 0.0}
        for f, vs in gravite_scores_by_forest.items()
    ]
    score_grav_by_type = [
        {"type_pression": t, "value": round(sum(vs) / len(vs), 2) if vs else 0.0}
        for t, vs in gravite_scores_by_type.items()
    ]

    # Indice synthétique par forêt / type
    pression_by_forest_list = [
        {"forest": f, "value": round(v, 2)}
        for f, v in sorted(pression_by_forest.items(), key=lambda kv: kv[1], reverse=True)
    ]
    pression_by_type_list = [
        {"type_pression": t, "value": round(v, 2)}
        for t, v in sorted(pression_by_type.items(), key=lambda kv: kv[1], reverse=True)
    ]

    # Profil radar (normalisé 0..100 par type, pour comparer les forêts)
    radar_max_by_type: dict[str, int] = {}
    for forest, ctr in type_by_forest.items():
        for tp, v in ctr.items():
            radar_max_by_type[tp] = max(radar_max_by_type.get(tp, 0), v)
    radar_profile: list[dict] = []
    for forest, ctr in type_by_forest.items():
        for tp, v in ctr.items():
            m = radar_max_by_type.get(tp, 0) or 1
            radar_profile.append({
                "forest": forest,
                "type_pression": tp,
                "value": v,
                "normalized": round(v / m * 100, 1),
            })

    # Jaccard entre paires de forêts (sur types de pression)
    jaccard_pairs: list[dict] = []
    forests_sorted = sorted(types_by_forest_set.keys())
    for i, fa in enumerate(forests_sorted):
        for fb in forests_sorted[i + 1 :]:
            a, b = types_by_forest_set[fa], types_by_forest_set[fb]
            inter = len(a & b)
            union = len(a | b)
            jaccard_pairs.append({
                "forest_a": fa,
                "forest_b": fb,
                "types_a": len(a),
                "types_b": len(b),
                "common": inter,
                "jaccard": round(inter / union, 3) if union > 0 else 0.0,
            })

    # Indice de priorité d'intervention par type (normalisation min-max sur 0..1)
    # 0.4 * gravité + 0.3 * ancienneté + 0.3 * nombre_indices
    priorite_par_type: list[dict] = []
    if type_counts:
        max_count = max(type_counts.values()) or 1
        max_indices = max((indices_by_type.get(t, 0) for t in type_counts), default=0) or 1
        for tp in type_counts:
            g = (sum(gravite_scores_by_type[tp]) / len(gravite_scores_by_type[tp])
                 if gravite_scores_by_type.get(tp) else 0.0)
            anc_scores = []
            # ancienneté moyenne dérivée du compteur anciennete_by_type
            for a_key, n in anciennete_by_type.get(tp, {}).items():
                sc = _ANCIENNETE_SCORE.get(a_key, 0)
                anc_scores.extend([sc] * n)
            a = (sum(anc_scores) / len(anc_scores)) if anc_scores else 0.0
            n_obs = type_counts[tp]
            n_ind = indices_by_type.get(tp, 0)
            score_norm = (
                0.4 * (g / 4.0)
                + 0.3 * (a / 3.0)
                + 0.3 * (n_ind / max_indices)
            )
            priorite_par_type.append({
                "type_pression": tp,
                "score": round(score_norm * 100, 1),
                "nombre_observations": n_obs,
                "nombre_indices": n_ind,
                "score_moyen_gravite": round(g, 2),
                "score_moyen_anciennete": round(a, 2),
            })
        priorite_par_type.sort(key=lambda x: x["score"], reverse=True)

    quality_metrics = {
        "taux_observations_photo_pct": taux_photo,
        "taux_observations_commentaire_pct": taux_commentaire,
        "taux_missions_signature_pct": taux_signature,
        "taux_missions_photo_equipe_pct": taux_photo_equipe,
        "taux_geolocalisees_pct": taux_geo,
        "observations_total": obs_total,
        "missions_total": n_missions,
    }

    summary = {
        "missions_total": n_missions,
        "observations_menaces_total": obs_total,
        "nombre_total_indices": indices_total,
        "score_moyen_gravite": score_moy_gravite,
        "taux_menaces_graves_pct": taux_graves,
        "taux_menaces_recentes_pct": taux_recentes,
        "indice_pression_brut": round(pression_brut, 2),
        "indice_pression_active": round(pression_active, 2),
        "taux_observations_photo_pct": taux_photo,
        "taux_menaces_geolocalisees_pct": taux_geo,
        "duree_totale_heures": round(duree_totale_h, 2),
        "observations_par_mission": obs_par_mission,
        "observations_par_heure": obs_par_heure,
    }

    breakdowns = {
        "summary": summary,
        "types_pression": _to_list(type_counts),
        "indices_pression": _to_list(indice_counts),
        "indices_dominants_par_type": indice_dominant_par_type,
        "indices_detail_par_type": indice_detail_par_type,
        "indices_par_type": indices_by_type_list,
        "indices_par_forest": indices_by_forest_list,
        "indices_pression_par_forest": indice_by_forest_long,
        "observations_par_forest": by_forest_list,
        "missions_par_forest": missions_by_forest_list,
        "types_par_forest": type_by_forest_long,
        "gravite_distribution": [
            {"niveau_gravite": k, "label": _GRAVITE_LABELS[k], "value": gravite_counts.get(k, 0)}
            for k in ["faible", "moyen", "eleve", "tres_eleve"]
        ],
        "gravite_par_forest": gravite_by_forest_long,
        "gravite_par_type": gravite_by_type_long,
        "score_gravite_par_forest": score_grav_by_forest,
        "score_gravite_par_type": score_grav_by_type,
        "anciennete_distribution": [
            {"anciennete_indice": k, "label": _ANCIENNETE_LABELS[k], "value": anciennete_counts.get(k, 0)}
            for k in ["recent", "ancien", "tres_ancien"]
        ],
        "anciennete_par_forest": anciennete_by_forest_long,
        "anciennete_par_type": anciennete_by_type_long,
        "pression_par_forest": pression_by_forest_list,
        "pression_par_type": pression_by_type_list,
        "priorite_par_type": priorite_par_type,
        "radar_profile": radar_profile,
        "jaccard_pairs": jaccard_pairs,
        "quality_metrics": quality_metrics,
        "autres_libelles": [{"name": k, "value": v} for k, v in autres_libelles.most_common()],
    }

    return {"indicators": indicators, "breakdowns": breakdowns}


def compute_menaces_breakdowns(submissions: list[dict]) -> dict:
    """Distributions détaillées pour le formulaire menaces (voir spec d'audit)."""
    return _menaces_compute_all(submissions)["breakdowns"]


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
    Capture également le nom de fichier d'une photo voisine (champ frère contenant "photo").
    """
    found: list[dict] = []

    def _sibling_photo(node: dict) -> str | None:
        for k, v in node.items():
            kl = k.lower().split("/")[-1]
            if "photo" in kl and isinstance(v, str) and v.strip():
                return v.strip()
        return None

    def _walk(node, current_label: str | None):
        if isinstance(node, dict):
            # Capture une étiquette si présente dans ce niveau (priorité = ordre dans label_keys)
            new_label = current_label
            level_label: str | None = None
            level_label_rank = len(label_keys)
            for k, v in node.items():
                if isinstance(v, str) and v:
                    kl = k.lower().split("/")[-1]
                    if kl in label_keys:
                        rank = label_keys.index(kl)
                        if rank < level_label_rank:
                            level_label_rank = rank
                            level_label = v
            if level_label is not None:
                new_label = level_label
            sibling_photo = _sibling_photo(node)
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
                            "photo_filename": sibling_photo,
                        })
                _walk(v, new_label)
        elif isinstance(node, list):
            for item in node:
                _walk(item, current_label)

    _walk(obj, None)
    return found


# Clés textuelles à utiliser comme étiquette par formulaire
_LABEL_KEYS_BY_FORM: dict[str, tuple[str, ...]] = {
    "monitoring_faune": ("espece_observee", "nom_scientifique", "groupe_faunique", "type_observation"),
    "monitoring_reboisement": ("nom_scientifique", "nom_arbre", "etat_sanitaire", "numero_parcelle"),
    "menaces": ("type_pression", "niveau_gravite", "anciennete_indice"),
    "planting_arbre": (
        "identification_parcelle/numero_parcelle",
        "identification_parcelle/type_reboisement",
        "identification_parcelle/origine_plants",
        "metadonnees_collecte/equipe_collecte/foret_communautaire",
    ),
}


_SIGNATURE_TOKENS = ("signature", "sign_")


def _build_attachments_index(submission: dict) -> dict[str, str]:
    """Indexe les pièces jointes images par nom de fichier (basename)."""
    index: dict[str, str] = {}
    for att in submission.get("_attachments", []):
        mime = att.get("mimetype", "")
        if not mime.startswith("image/"):
            continue
        url = att.get("download_url") or att.get("download_large_url")
        if not url:
            continue
        filename = att.get("filename") or ""
        basename = filename.rsplit("/", 1)[-1]
        if basename:
            index[basename] = url
    return index


def _resolve_photo_url(filename: str | None, index: dict[str, str]) -> str | None:
    """Convertit un nom de fichier Kobo en URL téléchargeable via l'index."""
    if not filename:
        return None
    basename = filename.rsplit("/", 1)[-1]
    return index.get(basename)


def _proxify_kobo_url(url: str | None) -> str | None:
    """Transforme une URL Kobo en URL proxy backend (servie avec le bon token côté serveur).

    Les pièces jointes Kobo nécessitent un en-tête Authorization que les
    balises <img> ne peuvent pas envoyer. Le frontend appellera donc le proxy
    `/api/media/kobo-attachment` (en ajoutant `?token=` côté client).
    """
    if not url:
        return None
    return f"/api/media/kobo-attachment?url={quote(url, safe='')}"


def _fallback_image_url(submission: dict, index: dict[str, str]) -> str | None:
    """Retourne une photo générique non-signature pour la soumission."""
    # 1) Photo d'équipe top-level si présente
    for k, v in submission.items():
        kl = k.lower().split("/")[-1]
        if "photo" in kl and isinstance(v, str) and v.strip():
            url = _resolve_photo_url(v, index)
            if url:
                return url
    # 2) Première image qui n'est pas la signature
    sig_basenames: set[str] = set()
    for k, v in submission.items():
        kl = k.lower().split("/")[-1]
        if any(t in kl for t in _SIGNATURE_TOKENS) and isinstance(v, str) and v.strip():
            sig_basenames.add(v.strip().rsplit("/", 1)[-1])
    for basename, url in index.items():
        if basename not in sig_basenames:
            return url
    return None


def extract_locations(form_key: str | None, submissions: list[dict]) -> list[dict]:
    """Extrait tous les points GPS d'une liste de soumissions pour un formulaire."""
    label_keys = _LABEL_KEYS_BY_FORM.get(form_key or "", ())
    points: list[dict] = []
    for sub in submissions:
        sub_id = sub.get("_id")
        submitted_at = sub.get("_submission_time") or sub.get("end") or sub.get("start")
        att_index = _build_attachments_index(sub)
        fallback_url = _fallback_image_url(sub, att_index)
        # Dédupliquer : un même submission peut avoir _geolocation + Coordonnees_GPS racine
        seen: set[tuple[float, float]] = set()
        for pt in _walk_geopoints(sub, label_keys):
            key = (round(pt["latitude"], 6), round(pt["longitude"], 6))
            if key in seen:
                continue
            seen.add(key)
            photo_filename = pt.pop("photo_filename", None)
            image_url = _resolve_photo_url(photo_filename, att_index) or fallback_url
            points.append({
                **pt,
                "submission_id": sub_id,
                "submitted_at": submitted_at,
                "image_url": _proxify_kobo_url(image_url),
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

# Chemins pour extraire les membres de mission selon les différentes structures
# de formulaire. Tous les chemins sont vérifiés et leurs tokens cumulés.
_MEMBRES_PATHS: tuple[str, ...] = (
    "metadonnees_collecte/membres_mission",
    "equipe_collecte/membres_mission",
    "metadonnees_collecte/equipe_collecte/membres_mission",
    "membres_mission",
)
_RESP_PATHS: tuple[str, ...] = (
    "metadonnees_collecte/responsable_mission",
    "equipe_collecte/responsable_mission",
    "metadonnees_collecte/equipe_collecte/responsable_mission",
    "responsable_mission",
)


def _extract_mission_members(submission: dict) -> set[str]:
    """Extrait tous les membres d'une mission depuis les champs membres_mission
    et responsable_mission, couvrant les différentes structures de formulaire."""
    members: set[str] = set()
    for path in _MEMBRES_PATHS:
        val = submission.get(path)
        if val:
            for token in _split_tokens(str(val)):
                t = token.strip().lower()
                if t and t not in ("anonyme", ""):
                    members.add(t)
    for path in _RESP_PATHS:
        val = submission.get(path)
        if isinstance(val, str) and val.strip():
            for token in _split_tokens(val):
                t = token.strip().lower()
                if t and t not in ("anonyme", ""):
                    members.add(t)
    return members


def _resolve_ecogarde(submission: dict) -> str:
    """Retourne le nom/username de l'écogarde pour une soumission Kobo.
    Utilisé pour les statistiques d'équipe (team stats).
    """
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

    Identifie les écogardes à partir des champs membres_mission et
    responsable_mission (les agents terrain réels) plutôt que via _submitted_by
    (la personne qui a soumis le formulaire en ligne).

    forms_with_submissions : liste de tuples (form_key, form_name, submissions).

    Retourne, par écogarde :
    - total_submissions : nombre de missions auxquelles cet écogarde a participé
    - total_missions    : nombre de jours distincts d'intervention
    - forms_covered     : nombre de formulaires (activités) auxquels il a participé
    - by_form           : { form_key: nombre de participations sur ce formulaire }
    - foret             : forêt principale déduite des soumissions (ou None)
    """
    from collections import defaultdict

    stats: dict[str, dict] = defaultdict(
        lambda: {
            "total_submissions": 0,
            "mission_days": set(),
            "by_form": defaultdict(int),
            "forms_covered": set(),
            "forets": defaultdict(int),
        }
    )

    for form_key, _form_name, submissions in forms_with_submissions:
        for sub in submissions:
            members = _extract_mission_members(sub)

            # Fallback vers _submitted_by si aucun membre déclaré
            if not members:
                submitted_by = (sub.get("_submitted_by") or "").strip().lower()
                if submitted_by and submitted_by != "anonyme":
                    members = {submitted_by}

            if not members:
                continue

            submitted_at = (
                sub.get("_submission_time")
                or sub.get("end")
                or sub.get("start")
            )
            day = str(submitted_at)[:10] if submitted_at else None
            foret = _resolve_forest(form_key, sub)

            for member in members:
                entry = stats[member]
                entry["total_submissions"] += 1
                entry["by_form"][form_key] += 1
                entry["forms_covered"].add(form_key)
                if day:
                    entry["mission_days"].add(day)
                if foret:
                    entry["forets"][foret] += 1

    result: list[dict] = []
    for username, e in stats.items():
        days = e["mission_days"]
        forets: dict = e["forets"]
        foret_principal = max(forets, key=forets.__getitem__) if forets else None
        result.append(
            {
                "username": username,
                "total_submissions": e["total_submissions"],
                "total_missions": len(days) or e["total_submissions"],
                "forms_covered": len(e["forms_covered"]),
                "by_form": dict(e["by_form"]),
                "derniere_mission": max(days) if days else None,
                "foret": foret_principal,
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
    """Normalise une chaîne en nom de forêt connu si possible.

    Retourne "" si la valeur ne correspond à aucune forêt connue, afin de
    ne pas polluer la liste des forêts avec des valeurs métier non liées
    (ex: "Arbre abattu" présent dans un champ "zone").
    """
    if not value:
        return ""
    low = value.lower().strip()
    for kw, canonical in _FOREST_KEYWORDS.items():
        if kw in low:
            return canonical
    return ""


def _resolve_forest(form_key: str | None, submission: dict) -> str:
    """Retourne le nom de la forêt pour une soumission donnée."""
    # 1) Cas spécifique reboisement : champ direct equipe_collecte/foret_communautaire,
    #    sinon ancien schéma à base de repeat groups.
    if form_key == "monitoring_reboisement":
        direct = submission.get("equipe_collecte/foret_communautaire")
        if isinstance(direct, str) and direct.strip():
            norm = _normalize_forest(direct)
            if norm:
                return norm
        has_zaranou = bool(submission.get("repeat_fc_zaranou"))
        has_apoueba = bool(submission.get("repeat_fc_apoueba"))
        if has_zaranou and not has_apoueba:
            return "Zaranou"
        if has_apoueba and not has_zaranou:
            return "Apouéba"
        if has_zaranou and has_apoueba:
            return "Zaranou + Apouéba"

    # 1bis) Cas planting_arbre : chemin direct dans metadonnees_collecte/equipe_collecte.
    if form_key == "planting_arbre":
        direct = submission.get("metadonnees_collecte/equipe_collecte/foret_communautaire")
        if isinstance(direct, str) and direct.strip():
            norm = _normalize_forest(direct)
            if norm:
                return norm

    # 2) Scan récursif des champs métier connus.
    def _scan(node):
        if isinstance(node, dict):
            for k, v in node.items():
                kl = k.lower().split("/")[-1]
                # Le nom de champ contient un indice de forêt
                if any(h in kl for h in _FOREST_FIELD_HINTS):
                    if isinstance(v, str) and v.strip():
                        norm = _normalize_forest(v)
                        if norm:
                            return norm
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


def compute_reboisement_breakdowns(submissions: list[dict]) -> dict:
    """
    Calcule des distributions détaillées pour le formulaire reboisement,
    destinées à alimenter des graphiques (top espèces, facteurs,
    sanitaire par espèce / parcelle, similarité Jaccard, qualité de
    collecte, etc.).
    """
    from collections import Counter, defaultdict

    species_counts: Counter[str] = Counter()
    local_names_counts: Counter[str] = Counter()
    factor_counts: Counter[str] = Counter()
    parcelle_counts: Counter[str] = Counter()
    by_responsable: Counter[str] = Counter()
    health_by_forest: dict[str, dict[str, int]] = defaultdict(
        lambda: {"vivants": 0, "morts": 0, "degrades": 0}
    )
    health_by_species: dict[str, dict[str, int]] = defaultdict(
        lambda: {"vivants": 0, "morts": 0, "degrades": 0}
    )
    health_by_parcel: dict[str, dict[str, int]] = defaultdict(
        lambda: {"vivants": 0, "morts": 0, "degrades": 0}
    )
    species_by_forest: dict[str, set[str]] = defaultdict(set)
    factors_by_forest_counts: dict[str, Counter[str]] = defaultdict(Counter)

    # Métriques qualité (au niveau arbre / mission)
    arbres = 0
    arbres_photo = 0
    arbres_commentaire = 0
    n_missions = len(submissions)
    missions_photo_equipe = 0
    missions_signature = 0

    for s in submissions:
        forest = _resolve_forest("monitoring_reboisement", s)
        resp = s.get("equipe_collecte/responsable_mission")
        if isinstance(resp, str) and resp.strip():
            by_responsable[resp.strip()] += 1

        if s.get("equipe_collecte/photo_equipe"):
            missions_photo_equipe += 1
        if (
            s.get("equipe_collecte/signature_responsable")
            or s.get("equipe_collecte/signature")
            or s.get("signature_responsable")
            or s.get("signature")
        ):
            missions_signature += 1

        for item in s.get("observation_arbre") or []:
            arbres += 1

            nom_sci_raw = item.get("observation_arbre/nom_scientifique")
            nom_sci = nom_sci_raw.strip() if isinstance(nom_sci_raw, str) else ""
            if nom_sci:
                species_counts[nom_sci] += 1
                species_by_forest[forest].add(nom_sci.lower())

            nom_loc_raw = item.get("observation_arbre/nom_arbre")
            nom_loc = nom_loc_raw.strip() if isinstance(nom_loc_raw, str) else ""
            if nom_loc:
                local_names_counts[nom_loc] += 1

            num_raw = item.get("observation_arbre/numero_parcelle")
            parcelle = str(num_raw).strip() if num_raw not in (None, "") else ""
            if parcelle:
                parcelle_counts[parcelle] += 1

            tokens = _split_select_multiple(item.get("observation_arbre/facteurs_degradation"))
            for token in tokens:
                factor_counts[token] += 1
                factors_by_forest_counts[forest][token] += 1

            etat_raw = item.get("observation_arbre/etat_sanitaire") or ""
            if _reb_is_vivant(etat_raw):
                bucket_key = "vivants"
            elif _reb_is_mort(etat_raw):
                bucket_key = "morts"
            elif _reb_is_degrade(etat_raw) or etat_raw:
                bucket_key = "degrades"
            else:
                bucket_key = None

            if bucket_key:
                health_by_forest[forest][bucket_key] += 1
                if nom_sci:
                    health_by_species[nom_sci][bucket_key] += 1
                if parcelle:
                    health_by_parcel[parcelle][bucket_key] += 1

            if item.get("observation_arbre/photo_arbre"):
                arbres_photo += 1
            commentaire = item.get("observation_arbre/commentaire_arbre") or item.get(
                "observation_arbre/commentaire"
            )
            if isinstance(commentaire, str) and commentaire.strip():
                arbres_commentaire += 1

    def _to_list(counter: Counter[str], limit: int | None = None) -> list[dict]:
        items = counter.most_common(limit) if limit else counter.most_common()
        return [{"name": name, "value": value} for name, value in items]

    # Top santé par espèce / parcelle (tri par effectif total décroissant)
    def _health_list(d: dict[str, dict[str, int]], key_name: str, limit: int = 15) -> list[dict]:
        items = sorted(
            d.items(),
            key=lambda kv: kv[1]["vivants"] + kv[1]["morts"] + kv[1]["degrades"],
            reverse=True,
        )[:limit]
        return [
            {
                key_name: name,
                "vivants": data["vivants"],
                "morts": data["morts"],
                "degrades": data["degrades"],
            }
            for name, data in items
        ]

    # Richesse spécifique par forêt
    richesse_by_forest = [
        {"name": forest, "value": len(species)}
        for forest, species in sorted(
            species_by_forest.items(), key=lambda kv: len(kv[1]), reverse=True
        )
    ]

    # Facteurs par forêt (format long pour BarChart empilé)
    factors_by_forest: list[dict] = []
    for forest, ctr in factors_by_forest_counts.items():
        for factor, value in ctr.most_common(8):
            factors_by_forest.append(
                {"forest": forest, "factor": factor, "value": value}
            )

    # Facteur dominant global
    if factor_counts:
        top_factor, top_count = factor_counts.most_common(1)[0]
        total_factors = sum(factor_counts.values())
        factor_dominant = {
            "name": top_factor,
            "value": top_count,
            "pct": round(top_count / total_factors * 100, 1) if total_factors > 0 else 0.0,
        }
    else:
        factor_dominant = None

    # Indice de Jaccard entre toutes les paires de forêts (alignement sur faune)
    jaccard_pairs: list[dict] = []
    forests_sorted = sorted(species_by_forest.keys())
    for i, fa in enumerate(forests_sorted):
        for fb in forests_sorted[i + 1 :]:
            a, b = species_by_forest[fa], species_by_forest[fb]
            inter = len(a & b)
            union = len(a | b)
            jaccard_pairs.append(
                {
                    "forest_a": fa,
                    "forest_b": fb,
                    "species_a": len(a),
                    "species_b": len(b),
                    "common": inter,
                    "jaccard": round(inter / union, 3) if union > 0 else 0.0,
                }
            )

    quality_metrics = {
        "taux_photo_arbre_pct": _pct(arbres_photo, arbres),
        "taux_commentaire_arbre_pct": _pct(arbres_commentaire, arbres),
        "taux_photo_equipe_pct": _pct(missions_photo_equipe, n_missions),
        "taux_signature_pct": _pct(missions_signature, n_missions),
        "arbres_total": arbres,
        "missions_total": n_missions,
    }

    return {
        "top_species": _to_list(species_counts, 10),
        "top_local_names": _to_list(local_names_counts, 10),
        "factors": _to_list(factor_counts),
        "by_parcelle": _to_list(parcelle_counts, 10),
        "by_responsable": _to_list(by_responsable),
        "health_by_forest": [
            {
                "forest": forest,
                "vivants": data["vivants"],
                "morts": data["morts"],
                "degrades": data["degrades"],
            }
            for forest, data in health_by_forest.items()
        ],
        "health_by_species": _health_list(health_by_species, "espece", limit=15),
        "health_by_parcel": _health_list(health_by_parcel, "parcelle", limit=15),
        "richesse_by_forest": richesse_by_forest,
        "factors_by_forest": factors_by_forest,
        "factor_dominant": factor_dominant,
        "jaccard_pairs": jaccard_pairs,
        "quality_metrics": quality_metrics,
    }


def compute_planting_breakdowns(submissions: list[dict]) -> dict:
    """
    Distributions détaillées pour le formulaire `planting_arbre` :
    plants par espèce / parcelle / forêt, surfaces, typologies, qualité,
    timeline et cohérence déclaré vs compté.
    """
    from collections import Counter, defaultdict

    plants_par_espece: Counter[str] = Counter()  # par code
    parcelles_par_espece: dict[str, set[str]] = defaultdict(set)
    plants_par_parcelle: Counter[str] = Counter()
    surface_par_parcelle: dict[str, float] = {}
    forest_par_parcelle: dict[str, str] = {}
    plants_par_forest: Counter[str] = Counter()
    surface_par_forest: dict[str, float] = defaultdict(float)
    plants_par_responsable: Counter[str] = Counter()
    types_reboisement: Counter[str] = Counter()
    origines_plants: Counter[str] = Counter()
    organismes_don: Counter[str] = Counter()
    especes_par_forest: dict[str, Counter[str]] = defaultdict(Counter)
    par_date: Counter[str] = Counter()
    coherence_rows: list[dict] = []
    parcelles_detail: list[dict] = []

    n_missions = len(submissions)
    photos_parcelle = 0
    delimitations = 0
    signatures = 0
    photos_equipe = 0
    commentaires = 0
    centres_gps = 0
    parcelles_coherentes = 0

    for s in submissions:
        forest = _resolve_forest("planting_arbre", s)
        num_raw = s.get("identification_parcelle/numero_parcelle")
        parcelle = str(num_raw).strip() if num_raw not in (None, "") else ""
        if parcelle:
            forest_par_parcelle.setdefault(parcelle, forest)

        date_enq = s.get("metadonnees_collecte/date_enquete")
        if isinstance(date_enq, str) and date_enq.strip():
            par_date[date_enq.strip()[:10]] += 1

        resp = s.get("metadonnees_collecte/equipe_collecte/responsable_mission")
        resp_label = resp.strip() if isinstance(resp, str) and resp.strip() else ""

        if s.get("identification_parcelle/photo_parcelle_reboisee"):
            photos_parcelle += 1
        if s.get("identification_parcelle/delimitation_parcelle"):
            delimitations += 1
        if s.get("identification_parcelle/gps_centre_parcelle"):
            centres_gps += 1
        if s.get("metadonnees_collecte/equipe_collecte/photo_equipe"):
            photos_equipe += 1
        if s.get("signature_responsable"):
            signatures += 1
        if isinstance(s.get("commentaires_responsable"), str) and s["commentaires_responsable"].strip():
            commentaires += 1

        surf = _planting_float(
            s.get("identification_parcelle/surface_calculee_ha")
            or s.get("identification_parcelle/superficie_ha")
        )
        if surf > 0:
            if parcelle:
                surface_par_parcelle[parcelle] = surf
            surface_par_forest[forest] += surf

        # Typologies
        type_reb_raw = s.get("identification_parcelle/type_reboisement")
        if isinstance(type_reb_raw, str) and type_reb_raw.strip():
            types_reboisement[type_reb_raw.strip().lower()] += 1
        origine_raw = s.get("identification_parcelle/origine_plants")
        origine_code = ""
        if isinstance(origine_raw, str) and origine_raw.strip():
            origine_code = origine_raw.strip().lower()
            origines_plants[origine_code] += 1
        if origine_code == "don":
            org = s.get("identification_parcelle/organisme_don")
            if isinstance(org, str) and org.strip():
                organismes_don[org.strip().lower()] += 1

        declared = _planting_int(s.get("arbres_plante"))
        counted_local = 0
        species_local: list[tuple[str, int]] = []
        for code, item in _planting_iter_especes(s):
            plants = _planting_int(item.get("espece_plantee/nombre_plants"))
            counted_local += plants
            if code:
                plants_par_espece[code] += plants
                if parcelle:
                    parcelles_par_espece[code].add(parcelle)
                especes_par_forest[forest][code] += plants
            species_local.append((code, plants))

        if parcelle:
            plants_par_parcelle[parcelle] += counted_local
        plants_par_forest[forest] += counted_local
        if resp_label:
            plants_par_responsable[resp_label] += counted_local

        if declared > 0 or counted_local > 0:
            diff = abs(declared - counted_local)
            seuil = max(2, int(round(max(declared, counted_local) * 0.05)))
            if diff <= seuil:
                parcelles_coherentes += 1

        if parcelle and (declared > 0 or counted_local > 0):
            coherence_rows.append({
                "parcelle": parcelle,
                "declares": declared,
                "comptes": counted_local,
                "ecart": declared - counted_local,
            })

        # Détail parcelle
        type_reb_label = _planting_label(type_reb_raw, _PLANTING_TYPE_REBOISEMENT_LABELS)
        origine_label = _planting_label(origine_raw, _PLANTING_ORIGINE_LABELS)
        parcelles_detail.append({
            "parcelle": parcelle or "—",
            "forest": forest,
            "surface_ha": round(surf, 3) if surf > 0 else 0.0,
            "nb_especes": len([c for c, _ in species_local if c]),
            "plants_declares": declared,
            "plants_comptes": counted_local,
            "type_reboisement": type_reb_label or "—",
            "origine_plants": origine_label or "—",
            "responsable": resp_label or "—",
            "date": date_enq[:10] if isinstance(date_enq, str) and date_enq.strip() else "—",
        })

    def _as_counted(counter: Counter[str], mapping: dict[str, str] | None = None, limit: int | None = None) -> list[dict]:
        items = counter.most_common(limit) if limit else counter.most_common()
        return [
            {"name": _planting_label(name, mapping) if mapping else name, "value": value}
            for name, value in items
        ]

    top_especes = [
        {
            "name": _planting_label(code, _PLANTING_SPECIES_LABELS),
            "code": code,
            "plants": plants,
            "parcelles": len(parcelles_par_espece.get(code, set())),
        }
        for code, plants in plants_par_espece.most_common(15)
    ]

    plants_par_parcelle_list = [
        {
            "parcelle": p,
            "plants": v,
            "forest": forest_par_parcelle.get(p, "Non spécifiée"),
            "surface_ha": round(surface_par_parcelle.get(p, 0.0), 3),
        }
        for p, v in plants_par_parcelle.most_common(15)
    ]

    surface_par_forest_list = [
        {"forest": f, "surface_ha": round(v, 2)}
        for f, v in sorted(surface_par_forest.items(), key=lambda kv: kv[1], reverse=True)
    ]

    plants_par_forest_list = [
        {"name": f, "value": v}
        for f, v in plants_par_forest.most_common()
    ]

    especes_par_forest_long: list[dict] = []
    for forest, ctr in especes_par_forest.items():
        for code, value in ctr.most_common(6):
            especes_par_forest_long.append({
                "forest": forest,
                "espece": _planting_label(code, _PLANTING_SPECIES_LABELS),
                "value": value,
            })

    timeline = [
        {"date": d, "missions": c}
        for d, c in sorted(par_date.items())
    ]

    # Coherence : tri par écart absolu décroissant, top 15
    coherence_top = sorted(
        coherence_rows, key=lambda r: abs(r["ecart"]), reverse=True
    )[:15]

    plants_total = sum(plants_par_espece.values())
    declared_total = sum(r["declares"] for r in coherence_rows)

    quality_metrics = {
        "taux_photo_parcelle_pct": _pct(photos_parcelle, n_missions),
        "taux_delimitation_pct": _pct(delimitations, n_missions),
        "taux_gps_centre_pct": _pct(centres_gps, n_missions),
        "taux_photo_equipe_pct": _pct(photos_equipe, n_missions),
        "taux_signature_pct": _pct(signatures, n_missions),
        "taux_commentaire_pct": _pct(commentaires, n_missions),
        "taux_coherence_pct": _pct(parcelles_coherentes, n_missions),
        "plants_total": plants_total,
        "plants_declares_total": declared_total,
        "missions_total": n_missions,
    }

    return {
        "top_especes": top_especes,
        "plants_par_parcelle": plants_par_parcelle_list,
        "plants_par_forest": plants_par_forest_list,
        "surface_par_forest": surface_par_forest_list,
        "type_reboisement": _as_counted(types_reboisement, _PLANTING_TYPE_REBOISEMENT_LABELS),
        "origine_plants": _as_counted(origines_plants, _PLANTING_ORIGINE_LABELS),
        "organisme_don": _as_counted(organismes_don, _PLANTING_ORGANISME_LABELS),
        "plants_par_responsable": [
            {"name": n, "value": v}
            for n, v in plants_par_responsable.most_common(10)
        ],
        "especes_par_forest": especes_par_forest_long,
        "timeline": timeline,
        "coherence_top": coherence_top,
        "parcelles_detail": parcelles_detail,
        "quality_metrics": quality_metrics,
    }


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distance géodésique Haversine en mètres entre deux points WGS84."""
    import math

    r = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def compute_faune_breakdowns(submissions: list[dict]) -> dict:
    """
    Distributions détaillées pour le formulaire monitoring_faune.
    Alimente les graphiques avancés du tableau de bord faune :
    top espèces, fréquence des indices, richesse par forêt et groupe,
    composition faunique, points d'eau, distance aux points d'eau,
    indice de similarité Jaccard Zaranou/Apouéba.
    """
    from collections import Counter, defaultdict

    prefix = "nouvelle_observation/observation_faune/"
    pe_prefix = "nouvelle_observation/points_eau/"

    species_counts: Counter[str] = Counter()
    scientific_counts: Counter[str] = Counter()
    abundance_per_species: Counter[str] = Counter()  # sum(nombre_individus_indices)
    group_counts: Counter[str] = Counter()
    indice_counts: Counter[str] = Counter()
    indice_by_group: dict[str, Counter[str]] = defaultdict(Counter)
    certitude_counts: Counter[str] = Counter()
    type_obs_counts: Counter[str] = Counter()

    species_by_forest: dict[str, set[str]] = defaultdict(set)
    species_by_group: dict[str, set[str]] = defaultdict(set)
    obs_by_forest: Counter[str] = Counter()
    missions_by_forest: Counter[str] = Counter()
    points_eau_by_forest: Counter[str] = Counter()
    composition: dict[tuple[str, str], int] = defaultdict(int)  # (forest, group) -> count

    duree_par_foret: dict[str, float] = defaultdict(float)
    duree_totale_h = 0.0
    obs_total = 0

    # Pour distance aux points d'eau
    water_points_by_forest: dict[str, list[tuple[float, float]]] = defaultdict(list)
    obs_points_by_forest: dict[str, list[tuple[float, float, str]]] = defaultdict(list)
    # (lat, lon, group)

    for s in submissions:
        forest = _resolve_forest("monitoring_faune", s)
        missions_by_forest[forest] += 1

        debut = _parse_kobo_dt(s.get("heure_debut"))
        fin = _parse_kobo_dt(s.get("heure_fin"))
        if debut and fin and fin >= debut:
            h = (fin - debut).total_seconds() / 3600.0
            duree_par_foret[forest] += h
            duree_totale_h += h

        # Type d'observation au niveau du repeat principal
        for top in s.get("nouvelle_observation") or []:
            type_obs = (top.get("nouvelle_observation/type_observation") or "").strip().lower()
            if type_obs == "indice":
                type_obs_counts["indice"] += 1
            elif type_obs in ("observation", "observation_directe", "directe"):
                type_obs_counts["directe"] += 1
            elif type_obs:
                type_obs_counts[type_obs] += 1

        # Points d'eau
        for pe in _iter_points_eau(s):
            points_eau_by_forest[forest] += 1
            pt = _parse_geopoint(pe.get(pe_prefix + "gps_point_eau"))
            if pt:
                water_points_by_forest[forest].append((pt[0], pt[1]))

        # Observations
        for item in _iter_faune_observations(s):
            obs_total += 1
            obs_by_forest[forest] += 1

            espece = item.get(prefix + "espece_observee")
            if isinstance(espece, str) and espece.strip():
                key = espece.strip().lower()
                species_counts[key] += 1
                species_by_forest[forest].add(key)
                try:
                    nb = int(float(item.get(prefix + "nombre_individus_indices") or 0))
                    abundance_per_species[key] += max(nb, 0)
                except (ValueError, TypeError):
                    pass

            nom_sci = item.get(prefix + "nom_scientifique")
            if isinstance(nom_sci, str) and nom_sci.strip():
                scientific_counts[nom_sci.strip()] += 1

            groupe = (item.get(prefix + "groupe_faunique") or "").strip().lower()
            if groupe:
                group_counts[groupe] += 1
                composition[(forest, groupe)] += 1
                if espece:
                    species_by_group[groupe].add(espece.strip().lower())

            # indice_observe : select_multiple → tokens séparés par espace
            indices_raw = item.get(prefix + "indice_observe") or ""
            if isinstance(indices_raw, str):
                for token in indices_raw.split():
                    if token:
                        indice_counts[token] += 1
                        if groupe:
                            indice_by_group[groupe][token] += 1

            certitude = (item.get(prefix + "niveau_certitude") or "").strip().lower()
            if certitude:
                certitude_counts[certitude] += 1

            pt = _parse_geopoint(item.get(prefix + "gps_observation"))
            if pt:
                obs_points_by_forest[forest].append((pt[0], pt[1], groupe))

    def _to_list(counter: Counter[str], limit: int | None = None) -> list[dict]:
        items = counter.most_common(limit) if limit else counter.most_common()
        return [{"name": name, "value": value} for name, value in items]

    # Composition : pourcentages par forêt
    total_by_forest_for_pct: dict[str, int] = defaultdict(int)
    for (f, _g), c in composition.items():
        total_by_forest_for_pct[f] += c
    composition_list = [
        {
            "forest": f,
            "group": g,
            "value": c,
            "pct": round((c / total_by_forest_for_pct[f]) * 100, 1)
            if total_by_forest_for_pct[f] > 0
            else 0.0,
        }
        for (f, g), c in composition.items()
    ]

    # Richesse par forêt et par groupe
    richesse_by_forest = [
        {"name": f, "value": len(sps)} for f, sps in species_by_forest.items()
    ]
    richesse_by_group = [
        {"name": g, "value": len(sps)} for g, sps in species_by_group.items()
    ]

    # Indice dominant par groupe
    dominant_index_by_group = [
        {"group": g, "indice": c.most_common(1)[0][0], "value": c.most_common(1)[0][1]}
        for g, c in indice_by_group.items()
        if c
    ]

    # Ratio observations / points d'eau par forêt
    pe_totals = {f: len(pts) for f, pts in water_points_by_forest.items()}
    # Inclure les forêts sans point eau mais avec missions
    for f in missions_by_forest:
        pe_totals.setdefault(f, points_eau_by_forest.get(f, 0))
    ratio_obs_water = [
        {
            "forest": f,
            "observations": obs_by_forest.get(f, 0),
            "points_eau": pe_totals.get(f, 0),
            "ratio": round(obs_by_forest.get(f, 0) / pe_totals[f], 2)
            if pe_totals.get(f, 0) > 0
            else None,
        }
        for f in sorted(set(list(obs_by_forest.keys()) + list(pe_totals.keys())))
    ]

    # Distance moyenne des observations au point d'eau le plus proche, par forêt
    mean_distance_to_water = []
    for f, obs_pts in obs_points_by_forest.items():
        water_pts = water_points_by_forest.get(f) or []
        if not obs_pts or not water_pts:
            continue
        distances: list[float] = []
        for lat, lon, _g in obs_pts:
            nearest = min(_haversine_m(lat, lon, wlat, wlon) for wlat, wlon in water_pts)
            distances.append(nearest)
        if distances:
            mean_distance_to_water.append(
                {
                    "forest": f,
                    "mean_distance_m": round(sum(distances) / len(distances), 1),
                    "min_distance_m": round(min(distances), 1),
                    "max_distance_m": round(max(distances), 1),
                    "sample_size": len(distances),
                }
            )

    # Indice de Jaccard entre deux forêts (généralisé : pour chaque paire)
    forests = sorted(species_by_forest.keys())
    jaccard_pairs = []
    for i, fa in enumerate(forests):
        for fb in forests[i + 1 :]:
            a, b = species_by_forest[fa], species_by_forest[fb]
            inter = len(a & b)
            union = len(a | b)
            j = round(inter / union, 3) if union > 0 else 0.0
            jaccard_pairs.append(
                {
                    "forest_a": fa,
                    "forest_b": fb,
                    "species_a": len(a),
                    "species_b": len(b),
                    "common": inter,
                    "jaccard": j,
                }
            )

    # Indice d'abondance horaire (sum individus / heures totales)
    indice_abondance_horaire = (
        round(sum(abundance_per_species.values()) / duree_totale_h, 2)
        if duree_totale_h > 0
        else 0.0
    )

    return {
        "top_species": _to_list(species_counts, 15),
        "top_scientific_names": _to_list(scientific_counts, 15),
        "abundance_by_species": [
            {"name": sp, "value": int(v)}
            for sp, v in abundance_per_species.most_common(15)
            if v > 0
        ],
        "groups": _to_list(group_counts),
        "indices": _to_list(indice_counts, 15),
        "indice_dominant_par_groupe": dominant_index_by_group,
        "certitude_distribution": [
            {"name": k, "value": v} for k, v in certitude_counts.items()
        ],
        "type_observation_distribution": [
            {"name": k, "value": v} for k, v in type_obs_counts.items()
        ],
        "missions_by_forest": [
            {"forest": f, "value": v} for f, v in missions_by_forest.items()
        ],
        "observations_by_forest": [
            {"forest": f, "value": v} for f, v in obs_by_forest.items()
        ],
        "richesse_by_forest": richesse_by_forest,
        "richesse_by_group": richesse_by_group,
        "composition_by_forest_group": composition_list,
        "points_eau_by_forest": [
            {"forest": f, "value": v} for f, v in points_eau_by_forest.items()
        ],
        "ratio_observations_points_eau": ratio_obs_water,
        "mean_distance_to_water": mean_distance_to_water,
        "jaccard_pairs": jaccard_pairs,
        "duree_totale_heures": round(duree_totale_h, 2),
        "duree_par_foret": [
            {"forest": f, "value": round(h, 2)} for f, h in duree_par_foret.items()
        ],
        "indice_abondance_horaire": indice_abondance_horaire,
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

# Champs génériques par ordre de priorité :
#   1. metadonnees_collecte/membres_mission              → monitoring_faune, menaces
#   2. equipe_collecte/membres_mission                   → monitoring_reboisement
#   3. metadonnees_collecte/equipe_collecte/membres_mission → planting_arbre
#   4. membres_mission                                   → dernier recours (champ nu)
_MEMBRE_FIELDS_GENERIC = (
    "metadonnees_collecte/membres_mission",
    "equipe_collecte/membres_mission",
    "metadonnees_collecte/equipe_collecte/membres_mission",
    "membres_mission",
)
_CHEF_FIELDS_GENERIC = (
    "metadonnees_collecte/responsable_mission",
    "equipe_collecte/responsable_mission",
    "metadonnees_collecte/equipe_collecte/responsable_mission",
    "responsable_mission",
)

# Hints pour le scan récursif de secours (membres d'équipe)
_MEMBRE_SCAN_HINTS: tuple[str, ...] = (
    "membres_mission",
    "membres_equipe",
    "liste_membres",
    "noms_membres",
    "equipe_membres",
)


def _kobo_val_to_str(val) -> str | None:
    """Convertit une valeur Kobo (str, liste select_multiple…) en chaîne non vide ou None."""
    if val is None or val == "":
        return None
    if isinstance(val, (list, tuple)):
        joined = " ".join(str(v).strip() for v in val if str(v).strip())
        return joined or None
    if isinstance(val, str):
        return val.strip() or None
    return None


def _get_nested_field(sub: dict, *paths: str) -> str | None:
    """
    Lit un champ Kobo depuis une soumission brute, en supportant :
    - la clé plate  "groupe/champ"  (format API REST KoboToolbox)
    - la clé imbriquée sub["groupe"]["champ"]
    - les valeurs liste (select_multiple retourné en liste par l'API)
    Retourne la première valeur non vide trouvée parmi les paths.
    """
    for path in paths:
        # 1) Clé plate directe
        result = _kobo_val_to_str(sub.get(path))
        if result:
            return result
        # 2) Navigation imbriquée niveau par niveau
        parts = path.split("/")
        node: object = sub
        for part in parts:
            if isinstance(node, dict):
                node = node.get(part)
            else:
                node = None
                break
        result = _kobo_val_to_str(node)
        if result:
            return result
    return None


def _resolve_membres_mission(submission: dict) -> str | None:
    """Scan récursif de la soumission pour trouver un champ membres d'équipe.

    Fallback quand les chemins hardcodés ne correspondent pas (variante du
    formulaire, champ nu, etc.). Retourne la valeur brute (chaîne non vide)
    ou None.
    """
    def _scan(node):
        if isinstance(node, dict):
            for k, v in node.items():
                kl = k.lower().split("/")[-1]
                if any(h in kl for h in _MEMBRE_SCAN_HINTS):
                    result = _kobo_val_to_str(v)
                    if result:
                        return result
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

            # Sélection des champs membres/chef
            # Priorité : champ spécifique forêt → chemins génériques → scan hint
            membre_field = _MEMBRE_FIELDS_BY_FOREST.get(foret)
            chef_field = _CHEF_FIELDS_BY_FOREST.get(foret)

            extra_membre = (membre_field,) if membre_field else ()
            extra_chef   = (chef_field,)   if chef_field   else ()

            membres_raw = (
                _get_nested_field(sub, *extra_membre, *_MEMBRE_FIELDS_ALL, *_MEMBRE_FIELDS_GENERIC)
                or _resolve_membres_mission(sub)
            )
            chef_raw = (
                _get_nested_field(sub, *extra_chef, *_CHEF_FIELDS_ALL, *_CHEF_FIELDS_GENERIC)
                or _resolve_chef_mission(sub)
            )

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


def count_approved_submissions(submissions: list[dict]) -> int:
    """
    Compte le nombre de réponses avec le statut de validation 'approuvé'.
    Kobo utilise le champ '_validation_status' qui peut être :
    - None/empty : pas encore validé
    - 'approved' : approuvé
    - 'rejected' : rejeté
    """
    count = 0
    for sub in submissions:
        validation_status = sub.get("_validation_status")
        # Approuvé si le statut est 'approved' (case-insensitive)
        if validation_status and isinstance(validation_status, str):
            if validation_status.lower().strip() == "approved":
                count += 1
    return count
