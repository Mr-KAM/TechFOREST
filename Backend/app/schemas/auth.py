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
