"""Utilitaires pour exécuter du code synchrone bloquant depuis un contexte async.

Toutes les fonctions qui appellent des APIs externes (GEE, pykobo, requests)
doivent passer par run_sync afin de ne pas bloquer l'event loop uvicorn.

Usage :
    from app.concurrency import run_sync

    # Sans timeout
    result = await run_sync(some_blocking_fn, arg1, arg2)

    # Avec timeout (lève asyncio.TimeoutError si dépassé)
    result = await run_sync(some_blocking_fn, arg1, timeout=60.0)
"""

import asyncio
from functools import partial


async def run_sync(func, *args, timeout: float | None = None, **kwargs):
    """Exécute func(*args, **kwargs) dans le thread pool de l'event loop.

    Args:
        func:    Fonction synchrone bloquante (GEE, pykobo, requests, ...).
        *args:   Arguments positionnels de func.
        timeout: Durée max en secondes. Lève asyncio.TimeoutError si dépassé.
        **kwargs: Arguments nommés de func.
    """
    loop = asyncio.get_running_loop()
    coro = loop.run_in_executor(None, partial(func, *args, **kwargs))
    if timeout is not None:
        return await asyncio.wait_for(coro, timeout=timeout)
    return await coro
