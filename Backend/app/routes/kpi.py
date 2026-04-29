import asyncio
from functools import partial

from fastapi import APIRouter, Depends, HTTPException, Query

from app.models.user import User
from app.schemas.kpi import (
    FormIndicators,
    GlobalIndicators,
    KoboDashboard,
    KoboForm,
    KoboSubmission,
    KPIDashboard,
    KPIValue,
)
from app.security import get_current_user
from app.services.kobo_service import (
    compute_form_indicators,
    get_form_key,
    get_form_metadata,
    get_form_submissions,
    get_form_submissions_raw,
    list_configured_forms,
    list_forms,
    resolve_form_uid,
)
from app.config import get_settings

router = APIRouter(prefix="/api/kpi", tags=["KPI & KoboToolbox"])


async def _run_sync(func, *args, **kwargs):
    """Exécute une fonction synchrone (pykobo) dans un thread pool."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, partial(func, *args, **kwargs))


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
async def get_all_indicators(current_user: User = Depends(get_current_user)):
    """
    Calcule les indicateurs métier pour les 4 formulaires configurés.
    Utilise l'API REST directe pour les formulaires avec groupes répétés imbriqués.
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
            indicators = compute_form_indicators(form_key, submissions)
            return FormIndicators(
                form_key=form_key,
                form_name=metadata.get("name", form_key),
                total_submissions=len(submissions),
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


@router.get("/forms/{form_uid}/submissions", response_model=list[KoboSubmission])
async def get_submissions(
    form_uid: str,
    current_user: User = Depends(get_current_user),
):
    """Récupère les soumissions d'un formulaire KoboToolbox."""
    try:
        resolved_form_uid = await _resolve_form_uid(form_uid)
        submissions = await _run_sync(get_form_submissions, resolved_form_uid)
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
