from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.schemas.auth import Token, UserCreate, UserRead, UserUpdate
from app.security import (
    PRIVILEGED_ROLES,
    ROLE_ADMIN,
    ROLE_SUPERADMIN,
    create_access_token,
    get_current_user,
    hash_password,
    require_admin_or_above,
    require_superadmin,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["Authentification"])


@router.post("/register", response_model=UserRead, status_code=201)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    """
    Créer un nouveau compte utilisateur.
    L'inscription publique ne permet pas de créer un compte privilégié
    (admin / superadmin) : ces rôles doivent être assignés par un superadmin
    via /api/auth/users/{user_id}.
    """
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email déjà utilisé")

    if payload.role in PRIVILEGED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Création d'un compte privilégié interdite via inscription publique",
        )

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """Authentification – retourne un JWT."""
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou mot de passe incorrect",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Compte désactivé")

    token = create_access_token(data={"sub": str(user.id), "role": user.role})
    return Token(access_token=token)


@router.get("/me", response_model=UserRead)
def me(current_user: User = Depends(get_current_user)):
    """Profil de l'utilisateur connecté."""
    return current_user


@router.put("/me", response_model=UserRead)
def update_me(
    payload: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Modifier le profil de l'utilisateur connecté."""
    if payload.full_name is not None:
        current_user.full_name = payload.full_name
    db.commit()
    db.refresh(current_user)
    return current_user


# ─── Administration utilisateurs (réservé superadmin) ────────


@router.get("/users", response_model=list[UserRead])
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_above),
):
    """Liste les utilisateurs. Les admins ne voient pas les comptes superadmin."""
    q = db.query(User).order_by(User.id.asc())
    if current_user.role == ROLE_ADMIN:
        q = q.filter(User.role != ROLE_SUPERADMIN)
    return q.all()


@router.post("/users", response_model=UserRead, status_code=201)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_above),
):
    """Crée un utilisateur. Un admin ne peut créer que des viewer ou admin."""
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email déjà utilisé")
    # Un simple admin ne peut pas créer de superadmin
    if current_user.role == ROLE_ADMIN and payload.role == ROLE_SUPERADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Un administrateur ne peut pas créer un compte superadmin",
        )
    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/users/{user_id}", response_model=UserRead)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_above),
):
    """Modifie un utilisateur. Un admin ne peut pas toucher aux comptes superadmin."""
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    # Un admin ne peut pas modifier un superadmin
    if current_user.role == ROLE_ADMIN and user.role == ROLE_SUPERADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Un administrateur ne peut pas modifier un compte superadmin",
        )
    # Un admin ne peut pas promouvoir quelqu'un au rang superadmin
    if current_user.role == ROLE_ADMIN and payload.role == ROLE_SUPERADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Un administrateur ne peut pas attribuer le rôle superadmin",
        )
    # Empêcher un superadmin de se rétrograder ou se désactiver lui-même
    if user.id == current_user.id:
        if payload.role is not None and payload.role != ROLE_SUPERADMIN:
            raise HTTPException(
                status_code=400,
                detail="Un superadmin ne peut pas se rétrograder lui-même",
            )
        if payload.is_active is False:
            raise HTTPException(
                status_code=400,
                detail="Un superadmin ne peut pas se désactiver lui-même",
            )

    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.role is not None:
        user.role = payload.role
    if payload.is_active is not None:
        user.is_active = payload.is_active

    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_above),
):
    """Supprime un utilisateur. Un admin ne peut pas supprimer un superadmin."""
    if user_id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="Vous ne pouvez pas supprimer votre propre compte",
        )
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if current_user.role == ROLE_ADMIN and user.role == ROLE_SUPERADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Un administrateur ne peut pas supprimer un compte superadmin",
        )
    db.delete(user)
    db.commit()
    return None
