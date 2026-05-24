"""Singleton slowapi Limiter partagé entre tous les routers."""
import os
import tempfile

from slowapi import Limiter
from slowapi.util import get_remote_address

# slowapi's Limiter constructor uses starlette.config.Config which reads ".env"
# from the current working directory with the OS default encoding (cp1252 on
# Windows). Our .env is UTF-8 and may contain characters outside cp1252, which
# causes a UnicodeDecodeError at import time.
#
# Fix: instantiate Limiter from a temporary empty directory so starlette's
# Config finds no .env to read. The limiter itself reads nothing from .env at
# runtime; limits are enforced via the @limiter.limit() decorator.
_orig_cwd = os.getcwd()
_tmp_dir = tempfile.mkdtemp(prefix="techforest_limiter_")
try:
    os.chdir(_tmp_dir)
    limiter = Limiter(key_func=get_remote_address, storage_uri="memory://")
finally:
    os.chdir(_orig_cwd)
    # Clean up — directory is empty so rmdir is safe
    try:
        os.rmdir(_tmp_dir)
    except OSError:
        pass
