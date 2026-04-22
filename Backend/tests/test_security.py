"""Tests unitaires – security (JWT, hachage)."""

from datetime import timedelta

from jose import jwt

from app.security import hash_password, verify_password, create_access_token
from app.config import get_settings

settings = get_settings()


class TestPassword:
    def test_hash_and_verify(self):
        hashed = hash_password("mysecret")
        assert hashed != "mysecret"
        assert verify_password("mysecret", hashed)

    def test_wrong_password(self):
        hashed = hash_password("mysecret")
        assert not verify_password("wrong", hashed)

    def test_different_hashes(self):
        h1 = hash_password("same")
        h2 = hash_password("same")
        # bcrypt produit des salts différents
        assert h1 != h2
        assert verify_password("same", h1)
        assert verify_password("same", h2)


class TestJWT:
    def test_create_token(self):
        token = create_access_token(data={"sub": "42", "role": "admin"})
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        assert payload["sub"] == "42"
        assert payload["role"] == "admin"
        assert "exp" in payload

    def test_token_expiry(self):
        token = create_access_token(
            data={"sub": "1"},
            expires_delta=timedelta(minutes=5),
        )
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        assert "exp" in payload

    def test_token_default_expiry(self):
        token = create_access_token(data={"sub": "1"})
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        assert "exp" in payload
