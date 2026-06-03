"""Service d'envoi d'emails via SMTP (stdlib).

Utilisé notamment lors de la création d'un compte utilisateur par le
superadmin : on envoie au nouvel utilisateur ses identifiants et le lien
vers l'application.

Le service est volontairement bloquant (smtplib n'est pas async) ; les
appelants asynchrones doivent l'invoquer via ``app.concurrency.run_sync``.
"""
from __future__ import annotations

import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr

from app.config import get_settings

logger = logging.getLogger(__name__)


class EmailNotConfiguredError(RuntimeError):
    """Levée quand on tente d'envoyer un email sans SMTP_HOST configuré."""


class EmailSendError(RuntimeError):
    """Levée pour toute autre erreur d'envoi SMTP."""


def _build_from_header(settings) -> str:
    name = (settings.SMTP_FROM_NAME or "").strip() or "TechFOREST"
    addr = (settings.SMTP_FROM or settings.SMTP_USER or "").strip()
    if not addr:
        raise EmailSendError(
            "Aucune adresse expéditeur SMTP_FROM/SMTP_USER configurée."
        )
    return formataddr((name, addr))


def send_email(
    to_email: str,
    subject: str,
    html_body: str,
    text_body: str | None = None,
) -> None:
    """Envoie un email via le SMTP configuré.

    Lève ``EmailNotConfiguredError`` si SMTP_HOST est vide.
    Lève ``EmailSendError`` (ou propage l'exception smtplib) en cas d'échec.
    """
    settings = get_settings()
    if not settings.smtp_enabled:
        raise EmailNotConfiguredError(
            "SMTP non configuré (variable SMTP_HOST vide)."
        )

    msg = EmailMessage()
    msg["From"] = _build_from_header(settings)
    msg["To"] = to_email
    msg["Subject"] = subject
    # set_content (texte) puis add_alternative (html) => multipart/alternative
    msg.set_content(text_body or _strip_html(html_body))
    msg.add_alternative(html_body, subtype="html")

    host = settings.SMTP_HOST.strip()
    port = int(settings.SMTP_PORT) or (465 if settings.SMTP_USE_SSL else 587)
    user = settings.SMTP_USER.strip()
    password = settings.SMTP_PASSWORD  # pas de strip : un espace peut être valide

    try:
        if settings.SMTP_USE_SSL:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(host, port, context=context, timeout=20) as smtp:
                if user and password:
                    smtp.login(user, password)
                smtp.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=20) as smtp:
                smtp.ehlo()
                # STARTTLS si le serveur l'annonce
                if smtp.has_extn("starttls"):
                    context = ssl.create_default_context()
                    smtp.starttls(context=context)
                    smtp.ehlo()
                if user and password:
                    smtp.login(user, password)
                smtp.send_message(msg)
    except smtplib.SMTPException as exc:
        logger.warning("Echec envoi email à %s : %s", to_email, exc)
        raise EmailSendError(str(exc)) from exc


def _strip_html(html: str) -> str:
    """Fallback texte très simple si aucun corps texte n'est fourni."""
    import re

    text = re.sub(r"<\s*br\s*/?\s*>", "\n", html, flags=re.IGNORECASE)
    text = re.sub(r"</\s*p\s*>", "\n\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    return text.strip()


def send_credentials_email(
    to_email: str,
    full_name: str,
    password: str,
    login_url: str,
) -> None:
    """Envoie au nouvel utilisateur ses identifiants de connexion."""
    safe_name = (full_name or "").strip() or to_email
    url = (login_url or "").strip() or "/"

    subject = "Vos identifiants TechFOREST"
    text_body = (
        f"Bonjour {safe_name},\n\n"
        "Un compte vient d'être créé pour vous sur la plateforme TechFOREST.\n\n"
        "Voici vos identifiants de connexion :\n"
        f"  • Email      : {to_email}\n"
        f"  • Mot de passe : {password}\n\n"
        f"Connectez-vous ici : {url}\n\n"
        "Pour des raisons de sécurité, nous vous recommandons de changer "
        "votre mot de passe dès votre première connexion.\n\n"
        "— L'équipe TechFOREST"
    )
    html_body = f"""\
<!doctype html>
<html lang="fr">
  <body style="font-family: Arial, sans-serif; color:#111; line-height:1.5;">
    <p>Bonjour <strong>{_escape(safe_name)}</strong>,</p>
    <p>Un compte vient d'être créé pour vous sur la plateforme
       <strong>TechFOREST</strong>.</p>
    <p>Voici vos identifiants de connexion :</p>
    <ul>
      <li><strong>Email</strong> : {_escape(to_email)}</li>
      <li><strong>Mot de passe</strong> : <code>{_escape(password)}</code></li>
    </ul>
    <p>
      <a href="{_escape(url)}"
         style="display:inline-block;padding:10px 18px;background:#16a34a;
                color:#fff;text-decoration:none;border-radius:6px;">
        Se connecter à TechFOREST
      </a>
    </p>
    <p style="color:#555;font-size:0.9em;">
      Pour des raisons de sécurité, nous vous recommandons de changer votre
      mot de passe dès votre première connexion.
    </p>
    <p style="color:#555;font-size:0.9em;">— L'équipe TechFOREST</p>
  </body>
</html>
"""
    send_email(to_email, subject, html_body, text_body)


def send_password_reset_email(
    to_email: str,
    full_name: str,
    new_password: str,
    login_url: str,
) -> None:
    """Notifie un utilisateur que son mot de passe a été réinitialisé par un admin."""
    safe_name = (full_name or "").strip() or to_email
    url = (login_url or "").strip() or "/"

    subject = "Votre mot de passe TechFOREST a été réinitialisé"
    text_body = (
        f"Bonjour {safe_name},\n\n"
        "Un administrateur vient de réinitialiser le mot de passe de votre "
        "compte TechFOREST.\n\n"
        "Voici votre nouveau mot de passe provisoire :\n"
        f"  • Email      : {to_email}\n"
        f"  • Mot de passe : {new_password}\n\n"
        f"Connectez-vous ici : {url}\n\n"
        "Pour des raisons de sécurité, changez ce mot de passe dès votre "
        "prochaine connexion depuis la page \"Mon profil\".\n\n"
        "Si vous n'êtes pas à l'origine de cette demande, contactez "
        "immédiatement l'administrateur de la plateforme.\n\n"
        "— L'équipe TechFOREST"
    )
    html_body = f"""\
<!doctype html>
<html lang="fr">
  <body style="font-family: Arial, sans-serif; color:#111; line-height:1.5;">
    <p>Bonjour <strong>{_escape(safe_name)}</strong>,</p>
    <p>Un administrateur vient de <strong>réinitialiser le mot de passe</strong>
       de votre compte TechFOREST.</p>
    <p>Voici votre nouveau mot de passe provisoire :</p>
    <ul>
      <li><strong>Email</strong> : {_escape(to_email)}</li>
      <li><strong>Mot de passe</strong> : <code>{_escape(new_password)}</code></li>
    </ul>
    <p>
      <a href="{_escape(url)}"
         style="display:inline-block;padding:10px 18px;background:#16a34a;
                color:#fff;text-decoration:none;border-radius:6px;">
        Se connecter à TechFOREST
      </a>
    </p>
    <p style="color:#555;font-size:0.9em;">
      Pour des raisons de sécurité, changez ce mot de passe dès votre
      prochaine connexion depuis la page <em>« Mon profil »</em>.
    </p>
    <p style="color:#b91c1c;font-size:0.9em;">
      Si vous n'êtes pas à l'origine de cette demande, contactez immédiatement
      l'administrateur de la plateforme.
    </p>
    <p style="color:#555;font-size:0.9em;">— L'équipe TechFOREST</p>
  </body>
</html>
"""
    send_email(to_email, subject, html_body, text_body)


def send_forgot_password_email(to_email: str, full_name: str, reset_url: str) -> None:
    """Envoie un lien de réinitialisation de mot de passe à l'utilisateur."""
    safe_name = (full_name or "").strip() or to_email
    url = (reset_url or "").strip()

    subject = "Réinitialisation de votre mot de passe TechFOREST"
    text_body = (
        f"Bonjour {safe_name},\n\n"
        "Vous avez demandé à réinitialiser le mot de passe de votre compte TechFOREST.\n\n"
        "Cliquez sur le lien ci-dessous pour choisir un nouveau mot de passe :\n"
        f"  {url}\n\n"
        "Ce lien est valable 1 heure. Après ce délai, vous devrez renouveler votre demande.\n\n"
        "Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.\n\n"
        "— L'équipe TechFOREST"
    )
    html_body = f"""\
<!doctype html>
<html lang="fr">
  <body style="font-family: Arial, sans-serif; color:#111; line-height:1.5;">
    <p>Bonjour <strong>{_escape(safe_name)}</strong>,</p>
    <p>Vous avez demandé à réinitialiser le mot de passe de votre compte
       <strong>TechFOREST</strong>.</p>
    <p>Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe :</p>
    <p style="margin: 24px 0;">
      <a href="{_escape(url)}"
         style="display:inline-block;padding:12px 22px;background:#16a34a;
                color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">
        Réinitialiser mon mot de passe
      </a>
    </p>
    <p style="color:#555;font-size:0.9em;">
      Ce lien est valable <strong>1 heure</strong>. Après ce délai, vous devrez
      renouveler votre demande.
    </p>
    <p style="color:#555;font-size:0.9em;">
      Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email —
      votre mot de passe ne sera pas modifié.
    </p>
    <p style="color:#555;font-size:0.9em;">— L'équipe TechFOREST</p>
  </body>
</html>
"""
    send_email(to_email, subject, html_body, text_body)


def _escape(value: str) -> str:
    """Échappement HTML minimal pour les valeurs insérées dans le template."""
    return (
        str(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )
