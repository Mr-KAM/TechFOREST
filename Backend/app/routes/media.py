"""Routes pour servir les médias (vidéos, images)."""

import os
import shutil
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.config import get_settings
from app.security import require_superadmin

settings = get_settings()
router = APIRouter(prefix="/api/media", tags=["Médias"])

MEDIA_DIR = os.path.join(settings.DATA_DIR, "media")

# Mapping clé logique -> nom de fichier sur disque.
# Les clés sont stables (utilisées par le frontend) ; le fichier physique
# est remplaçable via l'endpoint d'upload (superadmin uniquement).
ALLOWED_VIDEOS = {
    "drone": "drone_video.mp4",
    "presentation": "presentation.mp4",
}

# Taille maximale d'upload (200 Mo). Ajuster si nécessaire.
MAX_UPLOAD_BYTES = 200 * 1024 * 1024

# Types MIME acceptés pour l'upload (le navigateur n'envoie pas toujours
# le bon mime, d'où la présence d'application/octet-stream).
ALLOWED_MIME_TYPES = {
    "video/mp4",
    "video/mpeg",
    "video/quicktime",
    "video/webm",
    "video/x-matroska",
    "application/octet-stream",
}


def _video_meta(key: str, filename: str) -> dict:
    filepath = os.path.join(MEDIA_DIR, filename)
    exists = os.path.isfile(filepath)
    size = os.path.getsize(filepath) if exists else 0
    mtime = (
        datetime.fromtimestamp(os.path.getmtime(filepath), tz=timezone.utc).isoformat()
        if exists
        else None
    )
    return {
        "key": key,
        "filename": filename,
        "url": f"/api/media/videos/{key}",
        "available": exists,
        "size_bytes": size,
        "updated_at": mtime,
    }


@router.get("/videos")
def list_videos():
    """Liste les vidéos disponibles (endpoint public)."""
    return [_video_meta(key, fname) for key, fname in ALLOWED_VIDEOS.items()]


@router.get("/videos/{video_key}")
def get_video(video_key: str):
    """
    Sert un fichier vidéo.
    video_key : drone | presentation
    """
    filename = ALLOWED_VIDEOS.get(video_key)
    if not filename:
        raise HTTPException(
            status_code=404,
            detail=f"Vidéo inconnue : {video_key}. Clés disponibles : {list(ALLOWED_VIDEOS.keys())}",
        )

    filepath = os.path.join(MEDIA_DIR, filename)
    if not os.path.isfile(filepath):
        raise HTTPException(
            status_code=404,
            detail=f"Fichier vidéo non trouvé : {filename}. "
            f"Placez-le dans {MEDIA_DIR}/",
        )

    # `no-cache` force le navigateur à revalider à chaque chargement
    # (ETag/Last-Modified gérés par Starlette) -> les nouvelles vidéos
    # téléversées par le superadmin sont prises en compte immédiatement.
    return FileResponse(
        filepath,
        media_type="video/mp4",
        filename=filename,
        headers={"Cache-Control": "no-cache, must-revalidate"},
    )


@router.post(
    "/videos/{video_key}/upload",
    dependencies=[Depends(require_superadmin)],
)
async def upload_video(video_key: str, file: UploadFile = File(...)):
    """
    Remplace une vidéo de la page d'accueil (réservé au superadmin).

    Le fichier est sauvegardé sous le nom logique défini dans ALLOWED_VIDEOS
    (ex: `drone_video.mp4`). Le contenu est servi tel quel ensuite par
    `GET /videos/{video_key}`. Streaming par chunks pour éviter de charger
    tout le fichier en mémoire.
    """
    filename = ALLOWED_VIDEOS.get(video_key)
    if not filename:
        raise HTTPException(status_code=404, detail=f"Vidéo inconnue : {video_key}")

    if file.content_type and file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Type non supporté : {file.content_type}. "
            f"Attendu : {sorted(ALLOWED_MIME_TYPES)}",
        )

    os.makedirs(MEDIA_DIR, exist_ok=True)
    target_path = os.path.join(MEDIA_DIR, filename)
    tmp_path = target_path + ".upload"

    total = 0
    chunk_size = 1024 * 1024  # 1 Mo
    try:
        with open(tmp_path, "wb") as out:
            while True:
                chunk = await file.read(chunk_size)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail=f"Fichier trop volumineux (> {MAX_UPLOAD_BYTES // (1024 * 1024)} Mo).",
                    )
                out.write(chunk)
        # Remplacement atomique
        shutil.move(tmp_path, target_path)
    except HTTPException:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise
    except Exception as exc:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de l'enregistrement : {exc}",
        ) from exc
    finally:
        await file.close()

    return _video_meta(video_key, filename)


@router.delete(
    "/videos/{video_key}",
    dependencies=[Depends(require_superadmin)],
)
def delete_video(video_key: str):
    """Supprime le fichier vidéo associé à une clé (réservé au superadmin)."""
    filename = ALLOWED_VIDEOS.get(video_key)
    if not filename:
        raise HTTPException(status_code=404, detail=f"Vidéo inconnue : {video_key}")
    filepath = os.path.join(MEDIA_DIR, filename)
    if os.path.isfile(filepath):
        os.remove(filepath)
    return _video_meta(video_key, filename)

