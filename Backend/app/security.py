from datetime import datetime, timedelta, timezone  # noqa: F401 (timedelta re-exported)

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db

settings = get_settings()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# ─── Rôles applicatifs ────────────────────────────────────────
ROLE_SUPERADMIN = "superadmin"
ROLE_ADMIN = "admin"
ROLE_EDITOR = "editor"
ROLE_VIEWER = "viewer"

ALLOWED_ROLES: set[str] = {ROLE_SUPERADMIN, ROLE_ADMIN, ROLE_EDITOR, ROLE_VIEWER}
# Rôles "privilégiés" : non attribuables via /register public
PRIVILEGED_ROLES: set[str] = {ROLE_SUPERADMIN, ROLE_ADMIN}


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
):
    """Dependency: decode JWT and return current user."""
    from app.models.user import User

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Identifiants invalides",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str | None = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Utilisateur désactivé")
    return user


def require_roles(*roles: str):
    """
    Dépendance FastAPI : restreint l'accès aux utilisateurs ayant l'un des rôles donnés.
    Le rôle superadmin a toujours accès.
    """
    allowed = set(roles) | {ROLE_SUPERADMIN}

    def _checker(current_user=Depends(get_current_user)):
        if current_user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permissions insuffisantes",
            )
        return current_user

    return _checker


def require_superadmin(current_user=Depends(get_current_user)):
    """Dépendance FastAPI : restreint l'accès au rôle superadmin uniquement."""
    if current_user.role != ROLE_SUPERADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé au superadministrateur",
        )
    return current_user


def create_password_reset_token(user_id: int, password_hash: str) -> str:
    """JWT de réinitialisation de mot de passe (1 h). Invalidé si le mot de passe change."""
    data = {
        "sub": str(user_id),
        "purpose": "password_reset",
        "ph": password_hash[:8],
    }
    return create_access_token(data, expires_delta=timedelta(hours=1))


def decode_password_reset_token(token: str) -> tuple[int, str] | None:
    """Décode le JWT reset. Retourne (user_id, ph) ou None si invalide/expiré."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("purpose") != "password_reset":
            return None
        user_id = payload.get("sub")
        ph = payload.get("ph")
        if not user_id or not ph:
            return None
        return int(user_id), str(ph)
    except JWTError:
        return None


def require_admin_or_above(current_user=Depends(get_current_user)):
    """Dépendance FastAPI : restreint l'accès aux rôles admin et superadmin."""
    if current_user.role not in (ROLE_ADMIN, ROLE_SUPERADMIN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux administrateurs",
        )
    return current_user
