"""Tests des routes /api/auth/*."""

import pytest


class TestRegister:
    """POST /api/auth/register"""

    def test_register_success(self, client):
        resp = client.post("/api/auth/register", json={
            "email": "new@example.com",
            "full_name": "Nouveau User",
            "password": "securepass",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["email"] == "new@example.com"
        assert data["full_name"] == "Nouveau User"
        assert data["role"] == "viewer"
        assert data["is_active"] is True
        assert "id" in data

    def test_register_duplicate_email(self, client, test_user):
        resp = client.post("/api/auth/register", json={
            "email": "test@example.com",
            "full_name": "Doublon",
            "password": "password123",
        })
        assert resp.status_code == 400
        assert "Email déjà utilisé" in resp.json()["detail"]

    def test_register_invalid_email(self, client):
        resp = client.post("/api/auth/register", json={
            "email": "not-an-email",
            "full_name": "Bad Email",
            "password": "pass",
        })
        assert resp.status_code == 422

    def test_register_missing_fields(self, client):
        resp = client.post("/api/auth/register", json={"email": "a@b.com"})
        assert resp.status_code == 422

    def test_register_with_custom_role(self, client):
        resp = client.post("/api/auth/register", json={
            "email": "editor@example.com",
            "full_name": "Editor",
            "password": "pass123",
            "role": "editor",
        })
        assert resp.status_code == 201
        assert resp.json()["role"] == "editor"


class TestLogin:
    """POST /api/auth/login"""

    def test_login_success(self, client, test_user):
        resp = client.post("/api/auth/login", data={
            "username": "test@example.com",
            "password": "password123",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_login_wrong_password(self, client, test_user):
        resp = client.post("/api/auth/login", data={
            "username": "test@example.com",
            "password": "wrongpassword",
        })
        assert resp.status_code == 401

    def test_login_unknown_email(self, client):
        resp = client.post("/api/auth/login", data={
            "username": "nobody@example.com",
            "password": "pass",
        })
        assert resp.status_code == 401

    def test_login_inactive_user(self, client, inactive_user):
        resp = client.post("/api/auth/login", data={
            "username": "inactive@example.com",
            "password": "password123",
        })
        assert resp.status_code == 400
        assert "désactivé" in resp.json()["detail"]


class TestMe:
    """GET /api/auth/me"""

    def test_me_authenticated(self, client, test_user, auth_headers):
        resp = client.get("/api/auth/me", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "test@example.com"
        assert data["full_name"] == "Test User"

    def test_me_no_token(self, client):
        resp = client.get("/api/auth/me")
        assert resp.status_code == 401

    def test_me_invalid_token(self, client):
        resp = client.get("/api/auth/me", headers={"Authorization": "Bearer invalid-token"})
        assert resp.status_code == 401


class TestUpdateMe:
    """PUT /api/auth/me"""

    def test_update_full_name(self, client, test_user, auth_headers):
        resp = client.put("/api/auth/me", json={"full_name": "Updated Name"}, headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["full_name"] == "Updated Name"

    def test_update_empty_body(self, client, test_user, auth_headers):
        resp = client.put("/api/auth/me", json={}, headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["full_name"] == "Test User"  # inchangé

    def test_update_no_token(self, client):
        resp = client.put("/api/auth/me", json={"full_name": "Hack"})
        assert resp.status_code == 401
