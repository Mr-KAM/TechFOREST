from datetime import date, datetime

from pydantic import BaseModel, field_validator


class EcogardeCreate(BaseModel):
    nom: str
    prenom: str
    code_kobo: str
    foret: str | None = None
    telephone: str | None = None
    date_recrutement: date | None = None
    notes: str | None = None
    is_active: bool = True

    @field_validator("nom", "prenom", "code_kobo")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Ce champ ne peut pas être vide")
        return v.strip()


class EcogardeUpdate(BaseModel):
    nom: str | None = None
    prenom: str | None = None
    code_kobo: str | None = None
    foret: str | None = None
    telephone: str | None = None
    date_recrutement: date | None = None
    notes: str | None = None
    is_active: bool | None = None


class EcogardeProfile(BaseModel):
    """Profil complet : données DB + statistiques calculées depuis Kobo."""

    id: int
    nom: str
    prenom: str
    code_kobo: str
    foret: str | None
    telephone: str | None
    date_recrutement: date | None
    notes: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime | None = None

    # Statistiques Kobo (calculées à la volée, 0 si aucune soumission trouvée)
    total_submissions: int = 0
    total_missions: int = 0
    forms_covered: int = 0
    by_form: dict[str, int] = {}
    derniere_mission: str | None = None

    model_config = {"from_attributes": True}


class EcogardesListResponse(BaseModel):
    total: int
    ecogardes: list[EcogardeProfile]
