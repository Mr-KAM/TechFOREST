"""Routes pour servir les médias (vidéos, images)."""

import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.config import get_settings

settings = get_settings()
router = APIRouter(prefix="/api/media", tags=["Médias"])

MEDIA_DIR = os.path.join(settings.DATA_DIR, "media")

ALLOWED_VIDEOS = {
    "drone": "drone_video.mp4",
    "presentation": "presentation.mp4",
}


@router.get("/videos")
def list_videos():
    """Liste les vidéos disponibles."""
    results = []
    for key, filename in ALLOWED_VIDEOS.items():
        filepath = os.path.join(MEDIA_DIR, filename)
        exists = os.path.isfile(filepath)
        results.append({
            "key": key,
            "filename": filename,
            "url": f"/api/media/videos/{key}",
            "available": exists,
        })
    return results


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

    return FileResponse(
        filepath,
        media_type="video/mp4",
        filename=filename,
    )
