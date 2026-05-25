from datetime import datetime

from pydantic import BaseModel, EmailStr, field_validator

from app.security import ALLOWED_ROLES, ROLE_VIEWER


# ---------- Auth ----------
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ---------- User ----------
class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    role: str = ROLE_VIEWER
    # Si True, le backend tente d'envoyer un email contenant les
    # identifiants de connexion au nouvel utilisateur (nécessite que les
    # variables SMTP_* soient configurées).
    send_email: bool = False

    @field_validator("role")
    @classmethod
    def _check_role(cls, v: str) -> str:
        if v not in ALLOWED_ROLES:
            raise ValueError(
                f"Rôle invalide. Valeurs autorisées : {sorted(ALLOWED_ROLES)}"
            )
        return v


class UserRead(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    role: str
    is_active: bool
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    full_name: str | None = None
    role: str | None = None
    is_active: bool | None = None

    @field_validator("role")
    @classmethod
    def _check_role(cls, v: str | None) -> str | None:
        if v is not None and v not in ALLOWED_ROLES:
            raise ValueError(
                f"Rôle invalide. Valeurs autorisées : {sorted(ALLOWED_ROLES)}"
            )
        return v


class ProfileUpdate(BaseModel):
    """Mise à jour du profil par l'utilisateur lui-même (PUT /auth/me)."""

    full_name: str | None = None
    email: EmailStr | None = None


class PasswordChange(BaseModel):
    """Changement de mot de passe par l'utilisateur lui-même."""

    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _check_length(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Le nouveau mot de passe doit contenir au moins 6 caractères.")
        return v
