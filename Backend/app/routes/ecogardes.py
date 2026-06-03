"""Routes de gestion des profils Écogardes.

Chaque écogarde a un profil en base de données (nom, prénom, code_kobo, etc.)
Le GET /api/ecogardes fusionne les profils DB avec les utilisateurs Kobo
non encore enregistrés : tout soumettant Kobo apparaît automatiquement sous
forme de carte. Les admins peuvent ensuite enrichir chaque profil avec une
photo, un numéro de téléphone et un email.
"""

import asyncio
import logging
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.concurrency import run_sync
from app.config import get_settings
from app.database import get_db
from app.models.ecogarde import Ecogarde
from app.models.user import User
from app.schemas.ecogarde import (
    EcogardeCreate,
    EcogardeEnrich,
    EcogardeProfile,
    EcogardesListResponse,
    EcogardeSuggestion,
)
from app.security import get_current_user, require_admin_or_above
from app.services.kobo_service import (
    compute_ecogarde_stats,
    get_form_metadata,
    get_form_submissions_raw,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ecogardes", tags=["Écogardes"])

_UPLOADS_DIR = Path(__file__).resolve().parent.parent.parent / "uploads" / "ecogardes"
_ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}


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


def _photo_url(filename: str | None) -> str | None:
    if not filename:
        return None
    return f"/uploads/ecogardes/{filename}"


def _merge(eco: Ecogarde, stats: dict) -> EcogardeProfile:
    return EcogardeProfile(
        id=eco.id,
        nom=eco.nom,
        prenom=eco.prenom,
        code_kobo=eco.code_kobo,
        foret=eco.foret,
        telephone=eco.telephone,
        email=eco.email,
        genre=eco.genre,
        photo_url=_photo_url(eco.photo_filename),
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


def _parse_kobo_username(username: str) -> tuple[str, str]:
    """Déduit un prénom et un nom depuis un username Kobo (best-effort).

    "kouame_konan"   → ("Kouame", "Konan")
    "jean.dupont"    → ("Jean", "Dupont")
    """
    import re

    parts = [p.capitalize() for p in re.split(r"[_.\-\s]+", username.strip()) if p]
    if len(parts) >= 2:
        return parts[0], " ".join(parts[1:])
    if len(parts) == 1:
        return "", parts[0]
    return "", username


@router.get("/suggestions", response_model=list[EcogardeSuggestion])
async def get_suggestions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retourne les usernames Kobo actifs non encore enregistrés en DB."""
    kobo_stats = await _fetch_kobo_stats()
    registered = {eco.code_kobo for eco in db.query(Ecogarde.code_kobo).all()}

    suggestions: list[EcogardeSuggestion] = []
    for username, stats in kobo_stats.items():
        if username in registered or username == "anonyme":
            continue
        prenom, nom = _parse_kobo_username(username)
        suggestions.append(
            EcogardeSuggestion(
                code_kobo=username,
                total_submissions=stats["total_submissions"],
                total_missions=stats["total_missions"],
                forms_covered=stats["forms_covered"],
                by_form=stats["by_form"],
                derniere_mission=stats.get("derniere_mission"),
                prenom_suggere=prenom,
                nom_suggere=nom,
            )
        )

    suggestions.sort(key=lambda s: s.total_submissions, reverse=True)
    return suggestions


@router.get("", response_model=EcogardesListResponse)
async def list_ecogardes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Liste tous les écogardes.

    Fusionne les profils DB avec les utilisateurs Kobo non encore enregistrés :
    tout soumettant Kobo obtient automatiquement une carte.
    """
    kobo_stats = await _fetch_kobo_stats()

    # Auto-créer les entrées DB pour les membres de mission absents.
    # Les codes déjà en base (y compris is_excluded=True) ne sont jamais recréés.
    registered_codes = {eco.code_kobo for eco in db.query(Ecogarde.code_kobo).all()}
    new_count = 0
    for username, stats in kobo_stats.items():
        if username in registered_codes or username == "anonyme":
            continue
        prenom, nom = _parse_kobo_username(username)
        foret = stats.get("foret")
        db.add(Ecogarde(nom=nom, prenom=prenom, code_kobo=username, foret=foret))
        new_count += 1
    if new_count:
        db.commit()
        logger.info("Auto-création de %d écogarde(s) depuis Kobo", new_count)

    # Retourne uniquement les écogardes non exclus
    ecogardes = (
        db.query(Ecogarde)
        .filter(Ecogarde.is_excluded.is_(False))
        .order_by(Ecogarde.nom, Ecogarde.prenom)
        .all()
    )
    profiles = [_merge(eco, kobo_stats.get(eco.code_kobo, {})) for eco in ecogardes]
    return EcogardesListResponse(total=len(profiles), ecogardes=profiles)


@router.post("", response_model=EcogardeProfile, status_code=201)
def create_ecogarde(
    data: EcogardeCreate,
    current_user: User = Depends(require_admin_or_above),
    db: Session = Depends(get_db),
):
    """Crée manuellement un profil écogarde (admin et superadmin uniquement)."""
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
def enrich_ecogarde(
    ecogarde_id: int,
    data: EcogardeEnrich,
    current_user: User = Depends(require_admin_or_above),
    db: Session = Depends(get_db),
):
    """Met à jour les informations complémentaires d'un écogarde
    (téléphone, email, statut actif). Photo via POST /{id}/photo.
    """
    eco = db.query(Ecogarde).filter(Ecogarde.id == ecogarde_id).first()
    if not eco:
        raise HTTPException(status_code=404, detail="Écogarde non trouvé")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(eco, k, v)
    db.commit()
    db.refresh(eco)
    return _merge(eco, {})


@router.post("/{ecogarde_id}/photo", response_model=EcogardeProfile)
async def upload_photo(
    ecogarde_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(require_admin_or_above),
    db: Session = Depends(get_db),
):
    """Téléverse une photo de profil pour un écogarde (jpeg / png / webp, max 5 Mo)."""
    eco = db.query(Ecogarde).filter(Ecogarde.id == ecogarde_id).first()
    if not eco:
        raise HTTPException(status_code=404, detail="Écogarde non trouvé")

    if file.content_type not in _ALLOWED_MIME:
        raise HTTPException(
            status_code=400,
            detail="Format non supporté. Utilisez jpeg, png ou webp.",
        )

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (max 5 Mo).")

    ext = (file.filename or "photo").rsplit(".", 1)[-1].lower()
    if ext not in ("jpg", "jpeg", "png", "webp"):
        ext = "jpg"

    _UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{ecogarde_id}.{ext}"
    (_UPLOADS_DIR / filename).write_bytes(content)

    eco.photo_filename = filename
    db.commit()
    db.refresh(eco)
    return _merge(eco, {})


@router.delete("/{ecogarde_id}", status_code=204)
def delete_ecogarde(
    ecogarde_id: int,
    current_user: User = Depends(require_admin_or_above),
    db: Session = Depends(get_db),
):
    """Exclut définitivement un écogarde (admin et superadmin uniquement).

    La ligne est marquée is_excluded=True plutôt que supprimée afin d'empêcher
    l'auto-sync Kobo de la recréer automatiquement.
    """
    eco = db.query(Ecogarde).filter(Ecogarde.id == ecogarde_id).first()
    if not eco:
        raise HTTPException(status_code=404, detail="Écogarde non trouvé")
    # Supprimer la photo si elle existe
    if eco.photo_filename:
        photo_path = _UPLOADS_DIR / eco.photo_filename
        photo_path.unlink(missing_ok=True)
        eco.photo_filename = None
    eco.is_excluded = True
    db.commit()
