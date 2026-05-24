import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query

from app.concurrency import run_sync

from app.models.user import User
from app.schemas.kpi import (
    EcogardeStats,
    EcogardesResponse,
    EcogardeInTeam,
    ForestsResponse,
    FormForests,
    FormIndicators,
    FormIndicatorsByForest,
    GlobalIndicators,
    IndicatorsByForestResponse,
    KoboDashboard,
    KoboForm,
    KoboSubmission,
    KPIDashboard,
    KPIValue,
    FauneBreakdowns,
    LocationsResponse,
    MenacesBreakdowns,
    PlantingBreakdowns,
    ReboisementBreakdowns,
    SubmissionLocation,
    TeamStats,
    TeamsResponse,
    TeamMissionEntry,
    TeamMissionsResponse,
)
from app.security import get_current_user
from app.services.kobo_service import (
    compute_ecogarde_stats,
    compute_form_indicators,
    compute_faune_breakdowns,
    compute_form_indicators_by_forest,
    compute_menaces_breakdowns,
    compute_planting_breakdowns,
    compute_reboisement_breakdowns,
    compute_team_stats,
    extract_team_missions,
    extract_locations,
    filter_submissions_by_forest,
    get_form_key,
    get_form_metadata,
    get_form_submissions,
    get_form_submissions_raw,
    list_configured_forms,
    list_forests_for_form,
    list_forms,
    resolve_form_uid,
)
from app.config import get_settings

router = APIRouter(prefix="/api/kpi", tags=["KPI & KoboToolbox"])


async def _run_sync(func, *args, **kwargs):
    """Exécute une fonction synchrone (pykobo) dans un thread pool."""
    return await run_sync(func, *args, **kwargs)


async def _resolve_form_uid(form_identifier: str) -> str:
    try:
        return await _run_sync(resolve_form_uid, form_identifier)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erreur KoboToolbox : {e}")


@router.get("/forms", response_model=list[KoboForm])
async def get_kobo_forms(current_user: User = Depends(get_current_user)):
    """Liste les formulaires KoboToolbox disponibles."""
    try:
        forms = await _run_sync(list_forms)
        return forms
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erreur KoboToolbox : {e}")


@router.get("/forms/configured", response_model=list[KoboForm])
async def get_configured_kobo_forms(current_user: User = Depends(get_current_user)):
    """Liste les formulaires KoboToolbox reliés à une clé métier configurée."""
    try:
        forms = await _run_sync(list_configured_forms)
        return forms
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erreur KoboToolbox : {e}")


@router.get("/dashboard", response_model=KoboDashboard)
async def get_global_dashboard(current_user: User = Depends(get_current_user)):
    """Tableau de bord global – résumé de tous les formulaires."""
    try:
        forms = await _run_sync(list_forms)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erreur KoboToolbox : {e}")

    total_submissions = sum(f.get("submission_count", 0) or 0 for f in forms)
    return KoboDashboard(
        total_forms=len(forms),
        total_submissions=total_submissions,
        forms=[
            {
                "key": f.get("key"),
                "uid": f["uid"],
                "name": f["name"],
                "submissions": f.get("submission_count", 0) or 0,
            }
            for f in forms
        ],
    )


@router.get("/public/summary")
async def get_public_summary():
    """
    Statistiques publiques pour la page d'accueil (aucune authentification requise).
    Retourne uniquement des totaux agrégés non sensibles.
    """
    settings = get_settings()
    planting_uid = settings.kobo_form_uids.get("planting_arbre", "")
    if not planting_uid:
        return {"trees_planted": 0}
    try:
        submissions = await _run_sync(get_form_submissions_raw, planting_uid)
        indicators = compute_form_indicators("planting_arbre", submissions)
        trees = next(
            (int(i["value"]) for i in indicators if i["indicator_name"] == "Arbres plantés"),
            0,
        )
        return {"trees_planted": trees}
    except Exception:
        return {"trees_planted": 0}


@router.get("/indicators", response_model=GlobalIndicators)
async def get_all_indicators(
    forest: str | None = Query(
        default=None,
        description="Filtrer les indicateurs par forêt (ex. Zaranou, Apouéba)",
    ),
    current_user: User = Depends(get_current_user),
):
    """
    Calcule les indicateurs métier pour les 4 formulaires configurés.
    Utilise l'API REST directe pour les formulaires avec groupes répétés imbriqués.
    Si `forest` est fourni, restreint le calcul aux soumissions de cette forêt.
    """
    settings = get_settings()
    form_items = [
        (key, uid)
        for key, uid in settings.kobo_form_uids.items()
        if uid
    ]

    async def _compute_one(form_key: str, form_uid: str) -> FormIndicators | None:
        try:
            metadata, submissions = await asyncio.gather(
                _run_sync(get_form_metadata, form_uid),
                _run_sync(get_form_submissions_raw, form_uid),
            )
            filtered = filter_submissions_by_forest(form_key, submissions, forest)
            indicators = compute_form_indicators(form_key, filtered)
            return FormIndicators(
                form_key=form_key,
                form_name=metadata.get("name", form_key),
                total_submissions=len(filtered),
                indicators=[KPIValue(**i) for i in indicators],
            )
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Erreur {form_key}: {exc}")

    results = await asyncio.gather(*[_compute_one(k, u) for k, u in form_items])
    valid = [r for r in results if r is not None]
    return GlobalIndicators(
        total_submissions=sum(r.total_submissions for r in valid),
        forms=valid,
    )


@router.get("/locations", response_model=LocationsResponse)
async def get_all_locations(
    form_key: str | None = Query(default=None, description="Filtrer par clé métier (ex. menaces)"),
    current_user: User = Depends(get_current_user),
):
    """
    Extrait tous les points GPS des soumissions des 4 formulaires configurés
    (y compris ceux enfouis dans les groupes répétés).
    """
    settings = get_settings()
    items = [
        (key, uid)
        for key, uid in settings.kobo_form_uids.items()
        if uid and (form_key is None or key == form_key)
    ]

    async def _one(key: str, uid: str) -> list[SubmissionLocation]:
        try:
            metadata, submissions = await asyncio.gather(
                _run_sync(get_form_metadata, uid),
                _run_sync(get_form_submissions_raw, uid),
            )
            form_name = metadata.get("name", key)
            pts = extract_locations(key, submissions)
            return [
                SubmissionLocation(form_key=key, form_name=form_name, **p)
                for p in pts
            ]
        except Exception:
            return []

    grouped = await asyncio.gather(*[_one(k, u) for k, u in items])
    locations = [loc for group in grouped for loc in group]
    return LocationsResponse(total=len(locations), locations=locations)


@router.get("/forests", response_model=ForestsResponse)
async def get_forests(current_user: User = Depends(get_current_user)):
    """
    Liste les forêts détectées dans les soumissions de chaque formulaire,
    ainsi que la liste agrégée de toutes les forêts confondues.
    """
    settings = get_settings()
    items = [(k, u) for k, u in settings.kobo_form_uids.items() if u]

    async def _one(key: str, uid: str) -> FormForests:
        try:
            metadata, submissions = await asyncio.gather(
                _run_sync(get_form_metadata, uid),
                _run_sync(get_form_submissions_raw, uid),
            )
            return FormForests(
                form_key=key,
                form_name=metadata.get("name", key),
                forests=list_forests_for_form(key, submissions),
            )
        except Exception:
            return FormForests(form_key=key, form_name=key, forests=[])

    forms = await asyncio.gather(*[_one(k, u) for k, u in items])
    all_forests = sorted({f for ff in forms for f in ff.forests})
    return ForestsResponse(forms=list(forms), all_forests=all_forests)


@router.get("/indicators/by-forest", response_model=IndicatorsByForestResponse)
async def get_indicators_by_forest(current_user: User = Depends(get_current_user)):
    """
    Calcule les indicateurs métier ventilés par forêt pour chaque formulaire.
    Utile pour produire des graphiques de synthèse comparatifs.
    """
    settings = get_settings()
    items = [(k, u) for k, u in settings.kobo_form_uids.items() if u]

    async def _one(key: str, uid: str) -> FormIndicatorsByForest:
        try:
            metadata, submissions = await asyncio.gather(
                _run_sync(get_form_metadata, uid),
                _run_sync(get_form_submissions_raw, uid),
            )
            buckets: dict[str, list[dict]] = {}
            for s in submissions:
                from app.services.kobo_service import _resolve_forest
                forest = _resolve_forest(key, s)
                buckets.setdefault(forest, []).append(s)
            by_forest_raw = {
                forest: compute_form_indicators(key, subs)
                for forest, subs in buckets.items()
            }
            return FormIndicatorsByForest(
                form_key=key,
                form_name=metadata.get("name", key),
                total_submissions=len(submissions),
                by_forest={
                    forest: [KPIValue(**i) for i in inds]
                    for forest, inds in by_forest_raw.items()
                },
                submissions_by_forest={
                    forest: len(subs) for forest, subs in buckets.items()
                },
            )
        except Exception:
            return FormIndicatorsByForest(
                form_key=key,
                form_name=key,
                total_submissions=0,
                by_forest={},
                submissions_by_forest={},
            )

    forms = await asyncio.gather(*[_one(k, u) for k, u in items])
    return IndicatorsByForestResponse(forms=list(forms))


@router.get("/reboisement/breakdowns", response_model=ReboisementBreakdowns)
async def get_reboisement_breakdowns(current_user: User = Depends(get_current_user)):
    """
    Distributions détaillées du formulaire Monitoring Reboisement :
    top espèces, facteurs de dégradation, missions par responsable, etc.
    Alimente les graphiques de la vue détaillée reboisement.
    """
    settings = get_settings()
    uid = settings.kobo_form_uids.get("monitoring_reboisement")
    if not uid:
        raise HTTPException(status_code=404, detail="Formulaire monitoring_reboisement non configuré")
    submissions = await _run_sync(get_form_submissions_raw, uid)
    data = compute_reboisement_breakdowns(submissions)
    return ReboisementBreakdowns(**data)


@router.get("/planting/breakdowns", response_model=PlantingBreakdowns)
async def get_planting_breakdowns(current_user: User = Depends(get_current_user)):
    """
    Distributions détaillées du formulaire Suivi des plantations
    (`planting_arbre`) : top espèces, plants/parcelle, plants/forêt,
    surfaces, types de reboisement, origine des plants, qualité
    de collecte et cohérence déclaré vs compté.
    """
    settings = get_settings()
    uid = settings.kobo_form_uids.get("planting_arbre")
    if not uid:
        raise HTTPException(status_code=404, detail="Formulaire planting_arbre non configuré")
    submissions = await _run_sync(get_form_submissions_raw, uid)
    data = compute_planting_breakdowns(submissions)
    return PlantingBreakdowns(**data)


@router.get("/faune/breakdowns", response_model=FauneBreakdowns)
async def get_faune_breakdowns(current_user: User = Depends(get_current_user)):
    """
    Distributions détaillées du formulaire Monitoring Faune :
    - top espèces (espece_observee) et noms scientifiques
    - abondance brute par espèce (somme nombre_individus_indices)
    - fréquence des indices (select_multiple explosé) et indice dominant par groupe
    - composition faunique par forêt et groupe (avec pourcentages)
    - richesse spécifique par forêt et par groupe
    - répartition certitude / type d'observation
    - points d'eau par forêt, ratio observations/points d'eau
    - distance moyenne des observations au point d'eau le plus proche (Haversine)
    - indice de similarité Jaccard entre forêts
    - durée de collecte (totale et par forêt), indice d'abondance horaire
    """
    settings = get_settings()
    uid = settings.kobo_form_uids.get("monitoring_faune")
    if not uid:
        raise HTTPException(status_code=404, detail="Formulaire monitoring_faune non configuré")
    submissions = await _run_sync(get_form_submissions_raw, uid)
    data = compute_faune_breakdowns(submissions)
    return FauneBreakdowns(**data)


@router.get("/menaces/breakdowns", response_model=MenacesBreakdowns)
async def get_menaces_breakdowns(current_user: User = Depends(get_current_user)):
    """
    Distributions détaillées du formulaire Suivi des menaces :
    types de pressions, indices, gravité (score), ancienneté, indices synthétiques
    de pression (brut/actif), priorité d'intervention, profil radar par forêt,
    similarité Jaccard entre forêts, indicateurs qualité (photo, signature,
    commentaires, géolocalisation).
    """
    settings = get_settings()
    uid = settings.kobo_form_uids.get("menaces")
    if not uid:
        raise HTTPException(status_code=404, detail="Formulaire menaces non configuré")
    submissions = await _run_sync(get_form_submissions_raw, uid)
    data = compute_menaces_breakdowns(submissions)
    return MenacesBreakdowns(**data)


@router.get("/ecogardes", response_model=EcogardesResponse)
async def get_ecogardes_stats(current_user: User = Depends(get_current_user)):
    """
    Statistiques par écogarde (agent collecteur Kobo) sur tous les
    formulaires configurés :
    - total_submissions : nombre total de soumissions
    - total_missions : nombre de jours distincts d'intervention sur le terrain
    - forms_covered : nombre d'activités auxquelles il a participé
    - by_form : détail par formulaire
    """
    settings = get_settings()
    items = [(key, uid) for key, uid in settings.kobo_form_uids.items() if uid]

    async def _one(key: str, uid: str) -> tuple[str, str, list[dict]]:
        try:
            metadata, submissions = await asyncio.gather(
                _run_sync(get_form_metadata, uid),
                _run_sync(get_form_submissions_raw, uid),
            )
            return key, metadata.get("name", key), submissions
        except Exception:
            return key, key, []

    forms_with_submissions = await asyncio.gather(*[_one(k, u) for k, u in items])
    raw_stats = compute_ecogarde_stats(list(forms_with_submissions))

    return EcogardesResponse(
        total_ecogardes=len(raw_stats),
        total_submissions=sum(e["total_submissions"] for e in raw_stats),
        total_missions=sum(e["total_missions"] for e in raw_stats),
        ecogardes=[EcogardeStats(**e) for e in raw_stats],
    )


@router.get("/teams", response_model=TeamsResponse)
async def get_teams_stats(current_user: User = Depends(get_current_user)):
    """
    Statistiques par équipe de terrain sur tous les formulaires configurés.
    Détecte les équipes et chefs de mission à partir des champs Kobo.
    Retourne la composition de chaque équipe, les chefs identifiés et les stats par membre.
    """
    settings = get_settings()
    items = [(key, uid) for key, uid in settings.kobo_form_uids.items() if uid]

    async def _one(key: str, uid: str) -> tuple[str, str, list[dict]]:
        try:
            metadata, submissions = await asyncio.gather(
                _run_sync(get_form_metadata, uid),
                _run_sync(get_form_submissions_raw, uid),
            )
            return key, metadata.get("name", key), submissions
        except Exception:
            return key, key, []

    forms_with_submissions = await asyncio.gather(*[_one(k, u) for k, u in items])
    raw_stats = compute_team_stats(list(forms_with_submissions))

    return TeamsResponse(
        total_teams=len(raw_stats),
        total_members=sum(len(t["membres"]) for t in raw_stats),
        total_submissions=sum(t["total_submissions"] for t in raw_stats),
        teams=[
            TeamStats(
                **{**t, "membres": [EcogardeInTeam(**m) for m in t["membres"]]}
            )
            for t in raw_stats
        ],
    )


@router.get("/team-missions", response_model=TeamMissionsResponse)
async def get_team_missions(current_user: User = Depends(get_current_user)):
    """
    Tableau plat des missions par soumission avec les infos d'équipe.
    Pour chaque soumission : date, activité, forêt, membres et chef d'équipe.
    Les membres sont lus depuis equipe_collecte/membre_zaranou (ou _apoueba).
    Le chef est lu depuis equipe_collecte/responsable_zaranou (ou _apoueba).
    """
    settings = get_settings()
    items = [(key, uid) for key, uid in settings.kobo_form_uids.items() if uid]

    async def _one(key: str, uid: str) -> tuple[str, str, list[dict]]:
        try:
            metadata, submissions = await asyncio.gather(
                _run_sync(get_form_metadata, uid),
                _run_sync(get_form_submissions_raw, uid),
            )
            return key, metadata.get("name", key), submissions
        except Exception:
            return key, key, []

    forms_with_submissions = await asyncio.gather(*[_one(k, u) for k, u in items])
    raw = extract_team_missions(list(forms_with_submissions))

    return TeamMissionsResponse(
        total=len(raw),
        missions=[TeamMissionEntry(**m) for m in raw],
    )


@router.get("/timeline")
async def get_timeline(current_user: User = Depends(get_current_user)):
    """
    Retourne l'évolution mensuelle du nombre d'observations pour chaque
    formulaire configuré. Utilise le champ _submission_time de KoboToolbox.
    Réponse : liste de { month: "AAAA-MM", <form_key>: N, ... } triée par mois.
    """
    from collections import defaultdict

    settings = get_settings()
    items = [(k, u) for k, u in settings.kobo_form_uids.items() if u]

    async def _one(key: str, uid: str) -> tuple[str, list[dict]]:
        try:
            submissions = await _run_sync(get_form_submissions_raw, uid)
            return key, submissions
        except Exception:
            return key, []

    results = await asyncio.gather(*[_one(k, u) for k, u in items])

    # Agréger par mois
    monthly: dict[str, dict[str, int]] = defaultdict(lambda: {k: 0 for k, _ in items})
    for form_key, submissions in results:
        for s in submissions:
            raw_date = s.get("_submission_time", "") or s.get("end", "") or ""
            if len(raw_date) >= 7:
                month = raw_date[:7]  # "AAAA-MM"
                monthly[month][form_key] = monthly[month].get(form_key, 0) + 1

    sorted_months = sorted(monthly.keys())
    return [{"month": m, **monthly[m]} for m in sorted_months]


@router.get("/forms/{form_uid}/submissions", response_model=list[KoboSubmission])
async def get_submissions(
    form_uid: str,
    current_user: User = Depends(get_current_user),
):
    """Récupère les soumissions d'un formulaire KoboToolbox."""
    try:
        resolved_form_uid = await _resolve_form_uid(form_uid)
        # On utilise l'API REST brute (pas pykobo) pour supporter les
        # formulaires avec groupes répétés (faune : nouvelle_observation /
        # observation_faune / points_eau, reboisement, etc.).
        submissions = await _run_sync(get_form_submissions_raw, resolved_form_uid)
        return [
            KoboSubmission(id=s.get("_id", 0), data=s)
            for s in submissions
        ]
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erreur KoboToolbox : {e}")


@router.get("/forms/{form_uid}/dashboard", response_model=KPIDashboard)
async def get_kpi_dashboard(
    form_uid: str,
    fields: str = Query(default=None, description="Champs numériques (séparés par des virgules)"),
    current_user: User = Depends(get_current_user),
):
    """
    Génère un tableau de bord KPI à partir d'un formulaire KoboToolbox.
    Calcule automatiquement count, sum, mean pour les champs numériques.
    """
    try:
        resolved_form_uid = await _resolve_form_uid(form_uid)
        metadata = await _run_sync(get_form_metadata, resolved_form_uid)
        submissions = await _run_sync(get_form_submissions_raw, resolved_form_uid)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erreur KoboToolbox : {e}")

    numeric_fields = None
    if fields:
        numeric_fields = [f.strip() for f in fields.split(",")]

    form_key = get_form_key(resolved_form_uid)
    indicators_raw = compute_form_indicators(form_key, submissions, numeric_fields)
    indicators = [KPIValue(**ind) for ind in indicators_raw]

    return KPIDashboard(
        form_uid=resolved_form_uid,
        form_name=metadata.get("name", ""),
        total_submissions=len(submissions),
        indicators=indicators,
    )
