import asyncio
from functools import partial

from fastapi import APIRouter, Depends, HTTPException, Query

from app.models.user import User
from app.schemas.kpi import KoboDashboard, KoboForm, KoboSubmission, KPIDashboard, KPIValue
from app.security import get_current_user
from app.services.kobo_service import (
    compute_indicators,
    get_form_metadata,
    get_form_submissions,
    list_forms,
)

router = APIRouter(prefix="/api/kpi", tags=["KPI & KoboToolbox"])


async def _run_sync(func, *args, **kwargs):
    """Exécute une fonction synchrone (pykobo) dans un thread pool."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, partial(func, *args, **kwargs))


@router.get("/forms", response_model=list[KoboForm])
async def get_kobo_forms(current_user: User = Depends(get_current_user)):
    """Liste les formulaires KoboToolbox disponibles."""
    try:
        forms = await _run_sync(list_forms)
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
            {"uid": f["uid"], "name": f["name"], "submissions": f.get("submission_count", 0) or 0}
            for f in forms
        ],
    )


@router.get("/forms/{form_uid}/submissions", response_model=list[KoboSubmission])
async def get_submissions(
    form_uid: str,
    current_user: User = Depends(get_current_user),
):
    """Récupère les soumissions d'un formulaire KoboToolbox."""
    try:
        submissions = await _run_sync(get_form_submissions, form_uid)
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
        metadata = await _run_sync(get_form_metadata, form_uid)
        submissions = await _run_sync(get_form_submissions, form_uid)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erreur KoboToolbox : {e}")

    numeric_fields = None
    if fields:
        numeric_fields = [f.strip() for f in fields.split(",")]

    indicators_raw = compute_indicators(submissions, numeric_fields=numeric_fields)
    indicators = [KPIValue(**ind) for ind in indicators_raw]

    return KPIDashboard(
        form_uid=form_uid,
        form_name=metadata.get("name", ""),
        total_submissions=len(submissions),
        indicators=indicators,
    )
