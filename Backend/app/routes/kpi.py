from fastapi import APIRouter, Depends, HTTPException, Query

from app.models.user import User
from app.schemas.kpi import KoboForm, KoboSubmission, KPIDashboard, KPIValue
from app.security import get_current_user
from app.services.kobo_service import (
    compute_indicators,
    get_form_metadata,
    get_form_submissions,
    list_forms,
)

router = APIRouter(prefix="/api/kpi", tags=["KPI & KoboToolbox"])


@router.get("/forms", response_model=list[KoboForm])
async def get_kobo_forms(current_user: User = Depends(get_current_user)):
    """Liste les formulaires KoboToolbox disponibles."""
    try:
        forms = await list_forms()
        return forms
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erreur KoboToolbox : {e}")


@router.get("/forms/{form_uid}/submissions", response_model=list[KoboSubmission])
async def get_submissions(
    form_uid: str,
    limit: int = Query(default=500, le=5000),
    current_user: User = Depends(get_current_user),
):
    """Récupère les soumissions d'un formulaire KoboToolbox."""
    try:
        submissions = await get_form_submissions(form_uid, limit=limit)
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
        metadata = await get_form_metadata(form_uid)
        submissions = await get_form_submissions(form_uid)
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
