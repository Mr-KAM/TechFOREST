from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.limiter import limiter
from app.models.user import User
from app.schemas.auth import (
    ForgotPasswordRequest,
    PasswordChange,
    ProfileUpdate,
    ResetPasswordRequest,
    Token,
    UserCreate,
    UserRead,
    UserUpdate,
)
from app.security import (
    PRIVILEGED_ROLES,
    ROLE_ADMIN,
    ROLE_SUPERADMIN,
    create_access_token,
    create_password_reset_token,
    decode_password_reset_token,
    get_current_user,
    hash_password,
    require_admin_or_above,
    require_superadmin,
    verify_password,
)
from app.services.email_service import (
    EmailNotConfiguredError,
    EmailSendError,
    send_credentials_email,
    send_forgot_password_email,
    send_password_reset_email,
)

import logging
import secrets
import string

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["Authentification"])


@router.post("/register", response_model=UserRead, status_code=201)
@limiter.limit("10/minute")
def register(request: Request, payload: UserCreate, db: Session = Depends(get_db)):
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
@limiter.limit("5/minute")
def login(
    request: Request,
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
    payload: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Modifier son propre profil (nom complet et/ou email)."""
    if payload.full_name is not None:
        name = payload.full_name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Le nom complet ne peut pas être vide.")
        current_user.full_name = name

    if payload.email is not None and payload.email != current_user.email:
        existing = (
            db.query(User)
            .filter(User.email == payload.email, User.id != current_user.id)
            .first()
        )
        if existing is not None:
            raise HTTPException(status_code=400, detail="Email déjà utilisé.")
        current_user.email = payload.email

    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/me/password", status_code=204)
def change_my_password(
    payload: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Changer son propre mot de passe (l'ancien mot de passe est requis)."""
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Mot de passe actuel incorrect.")
    if payload.new_password == payload.current_password:
        raise HTTPException(
            status_code=400,
            detail="Le nouveau mot de passe doit être différent de l'ancien.",
        )
    current_user.hashed_password = hash_password(payload.new_password)
    db.commit()
    return None


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
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_above),
):
    """Crée un utilisateur. Un admin ne peut créer que des viewer ou admin.

    Si ``payload.send_email`` vaut ``True`` et que le service SMTP est
    configuré (variable ``SMTP_HOST``), un email contenant les identifiants
    de connexion est envoyé en tâche de fond au nouvel utilisateur.
    """
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

    if payload.send_email:
        settings = get_settings()
        if not settings.smtp_enabled:
            # On ne fait pas échouer la création : le compte existe déjà.
            # On informe simplement via les logs ; le frontend affichera le
            # statut de l'utilisateur créé.
            logger.warning(
                "send_email=true ignoré pour %s : SMTP non configuré.",
                payload.email,
            )
        else:
            login_url = (
                settings.APP_PUBLIC_URL.strip()
                or request.headers.get("origin", "").strip()
                or "/"
            )
            # Capture les valeurs avant la sortie de la requête : le
            # mot de passe en clair n'est disponible que dans ``payload``.
            email = payload.email
            full_name = payload.full_name
            password = payload.password

            def _send() -> None:
                try:
                    send_credentials_email(email, full_name, password, login_url)
                    logger.info("Email d'identifiants envoyé à %s", email)
                except (EmailNotConfiguredError, EmailSendError) as exc:
                    logger.warning(
                        "Echec envoi identifiants à %s : %s", email, exc
                    )

            background_tasks.add_task(_send)

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


_RESET_RESPONSE = {"message": "Si cet email est enregistré, un lien de réinitialisation a été envoyé."}


@router.post("/forgot-password", status_code=200)
@limiter.limit("5/minute")
async def forgot_password(
    request: Request,
    background_tasks: BackgroundTasks,
    payload: ForgotPasswordRequest,
    db: Session = Depends(get_db),
):
    """Envoie un lien de réinitialisation par email.

    Retourne toujours 200 pour éviter l'énumération des adresses email.
    """
    settings = get_settings()
    user = db.query(User).filter(User.email == payload.email).first()

    if not user or not user.is_active:
        return _RESET_RESPONSE

    if not settings.smtp_enabled:
        logger.warning("forgot_password : SMTP non configuré, email non envoyé à %s", payload.email)
        return _RESET_RESPONSE

    token = create_password_reset_token(user.id, user.hashed_password)
    base_url = (
        settings.APP_PUBLIC_URL.strip()
        or request.headers.get("origin", "").strip()
        or ""
    )
    reset_url = f"{base_url}/reset-password?token={token}"
    email = user.email
    full_name = user.full_name

    def _send() -> None:
        try:
            send_forgot_password_email(email, full_name, reset_url)
            logger.info("Email de réinitialisation envoyé à %s", email)
        except (EmailNotConfiguredError, EmailSendError) as exc:
            logger.warning("Echec envoi reset à %s : %s", email, exc)

    background_tasks.add_task(_send)
    return _RESET_RESPONSE


@router.post("/reset-password", status_code=200)
def reset_password(
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
):
    """Valide le token de réinitialisation et met à jour le mot de passe."""
    result = decode_password_reset_token(payload.token)
    if result is None:
        raise HTTPException(status_code=400, detail="Lien invalide ou expiré.")

    user_id, ph = result
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active or user.hashed_password[:8] != ph:
        raise HTTPException(status_code=400, detail="Lien invalide ou expiré.")

    user.hashed_password = hash_password(payload.new_password)
    db.commit()
    return {"message": "Mot de passe mis à jour avec succès."}


def _generate_random_password(length: int = 14) -> str:
    """Génère un mot de passe aléatoire fort (lettres + chiffres + symboles simples)."""
    alphabet = string.ascii_letters + string.digits + "!@#$%&*?"
    return "".join(secrets.choice(alphabet) for _ in range(length))


@router.post("/users/{user_id}/reset-password", status_code=200)
def reset_user_password(
    user_id: int,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_above),
):
    """Réinitialise le mot de passe d'un utilisateur et lui envoie par email.

    Génère un nouveau mot de passe aléatoire, met à jour le hash en base et
    envoie un email contenant ce mot de passe provisoire à l'utilisateur.

    Restrictions :
    - Un admin ne peut pas réinitialiser le mot de passe d'un superadmin.
    - Un utilisateur ne peut pas utiliser cette route pour son propre compte
      (il doit passer par /auth/me/password).
    - Le service SMTP doit être configuré (sinon erreur 503).
    """
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    if user.id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="Utilisez la page \"Mon profil\" pour changer votre propre mot de passe.",
        )
    if current_user.role == ROLE_ADMIN and user.role == ROLE_SUPERADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Un administrateur ne peut pas réinitialiser le mot de passe d'un superadmin.",
        )

    settings = get_settings()
    if not settings.smtp_enabled:
        raise HTTPException(
            status_code=503,
            detail=(
                "Service email non configuré (SMTP_HOST manquant). "
                "Impossible d'envoyer le nouveau mot de passe."
            ),
        )

    new_password = _generate_random_password()
    user.hashed_password = hash_password(new_password)
    db.commit()
    db.refresh(user)

    login_url = (
        settings.APP_PUBLIC_URL.strip()
        or request.headers.get("origin", "").strip()
        or "/"
    )
    email = user.email
    full_name = user.full_name

    def _send() -> None:
        try:
            send_password_reset_email(email, full_name, new_password, login_url)
            logger.info("Email de réinitialisation envoyé à %s", email)
        except (EmailNotConfiguredError, EmailSendError) as exc:
            logger.warning(
                "Echec envoi reset password à %s : %s", email, exc
            )

    background_tasks.add_task(_send)

    return {"email": email, "email_sent": True}
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
