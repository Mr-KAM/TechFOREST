"""Routes de gestion des profils Écogardes.

Chaque écogarde a un profil en base de données (nom, prénom, code_kobo, etc.)
Le champ code_kobo correspond à l'identifiant utilisé dans les soumissions KoboToolbox
(_submitted_by ou champ métier). L'endpoint GET enrichit chaque profil avec les
statistiques calculées à la volée depuis KoboToolbox.
"""

import asyncio

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.concurrency import run_sync
from app.config import get_settings
from app.database import get_db
from app.models.ecogarde import Ecogarde
from app.models.user import User
from app.schemas.ecogarde import (
    EcogardeCreate,
    EcogardeProfile,
    EcogardesListResponse,
    EcogardeUpdate,
)
from app.security import get_current_user, require_admin_or_above
from app.services.kobo_service import (
    compute_ecogarde_stats,
    get_form_metadata,
    get_form_submissions_raw,
)

router = APIRouter(prefix="/api/ecogardes", tags=["Écogardes"])


async def _fetch_kobo_stats() -> dict[str, dict]:
    """Agrège les stats Kobo par code_kobo (username) pour tous les formulaires configurés."""
    settings = get_settings()
    items = [(k, u) for k, u in settings.kobo_form_uids.items() if u]

    async def _one(key: str, uid: str) -> tuple[str, str, list[dict]]:
        try:
            meta, subs = await asyncio.gather(
                run_sync(get_form_metadata, uid),
                run_sync(get_form_submissions_raw, uid),
            )
            return key, meta.get("name", key), subs
        except Exception:
            return key, key, []

    forms = await asyncio.gather(*[_one(k, u) for k, u in items])
    raw = compute_ecogarde_stats(list(forms))
    return {e["username"]: e for e in raw}


def _merge(eco: Ecogarde, stats: dict) -> EcogardeProfile:
    return EcogardeProfile(
        id=eco.id,
        nom=eco.nom,
        prenom=eco.prenom,
        code_kobo=eco.code_kobo,
        foret=eco.foret,
        telephone=eco.telephone,
        date_recrutement=eco.date_recrutement,
        notes=eco.notes,
        is_active=eco.is_active,
        created_at=eco.created_at,
        updated_at=eco.updated_at,
        total_submissions=stats.get("total_submissions", 0),
        total_missions=stats.get("total_missions", 0),
        forms_covered=stats.get("forms_covered", 0),
        by_form=stats.get("by_form", {}),
        derniere_mission=stats.get("derniere_mission"),
    )


@router.get("", response_model=EcogardesListResponse)
async def list_ecogardes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Liste tous les écogardes enregistrés, enrichis de leurs statistiques Kobo."""
    ecogardes = db.query(Ecogarde).order_by(Ecogarde.nom, Ecogarde.prenom).all()
    kobo_stats = await _fetch_kobo_stats()
    profiles = [_merge(eco, kobo_stats.get(eco.code_kobo, {})) for eco in ecogardes]
    return EcogardesListResponse(total=len(profiles), ecogardes=profiles)


@router.post("", response_model=EcogardeProfile, status_code=201)
def create_ecogarde(
    data: EcogardeCreate,
    current_user: User = Depends(require_admin_or_above),
    db: Session = Depends(get_db),
):
    """Crée un nouveau profil écogarde (admin et superadmin uniquement)."""
    if db.query(Ecogarde).filter(Ecogarde.code_kobo == data.code_kobo).first():
        raise HTTPException(
            status_code=409,
            detail=f"Un écogarde avec le code Kobo '{data.code_kobo}' existe déjà.",
        )
    eco = Ecogarde(**data.model_dump())
    db.add(eco)
    db.commit()
    db.refresh(eco)
    return _merge(eco, {})


@router.patch("/{ecogarde_id}", response_model=EcogardeProfile)
def update_ecogarde(
    ecogarde_id: int,
    data: EcogardeUpdate,
    current_user: User = Depends(require_admin_or_above),
    db: Session = Depends(get_db),
):
    """Met à jour un profil écogarde (admin et superadmin uniquement)."""
    eco = db.query(Ecogarde).filter(Ecogarde.id == ecogarde_id).first()
    if not eco:
        raise HTTPException(status_code=404, detail="Écogarde non trouvé")
    updates = data.model_dump(exclude_unset=True)
    new_code = updates.get("code_kobo")
    if new_code and new_code != eco.code_kobo:
        if db.query(Ecogarde).filter(Ecogarde.code_kobo == new_code).first():
            raise HTTPException(
                status_code=409,
                detail=f"Le code Kobo '{new_code}' est déjà utilisé par un autre écogarde.",
            )
    for k, v in updates.items():
        setattr(eco, k, v)
    db.commit()
    db.refresh(eco)
    return _merge(eco, {})


@router.delete("/{ecogarde_id}", status_code=204)
def delete_ecogarde(
    ecogarde_id: int,
    current_user: User = Depends(require_admin_or_above),
    db: Session = Depends(get_db),
):
    """Supprime un profil écogarde (admin et superadmin uniquement)."""
    eco = db.query(Ecogarde).filter(Ecogarde.id == ecogarde_id).first()
    if not eco:
        raise HTTPException(status_code=404, detail="Écogarde non trouvé")
    db.delete(eco)
    db.commit()
