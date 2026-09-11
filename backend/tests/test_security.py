from app.core.security import (
    PasswordPolicyError,
    create_access_token,
    decode_access_token,
    hash_password,
    is_hashed,
    validate_password_policy,
    verify_password,
)


def test_hash_and_verify_roundtrip():
    hashed = hash_password("ClaveSegura9x")
    assert is_hashed(hashed)
    assert verify_password("ClaveSegura9x", hashed)
    assert not verify_password("otra", hashed)


def test_reject_plaintext_stored_password():
    assert not verify_password("admin123", "admin123")
    assert not verify_password("admin123", "")


def test_password_policy():
    try:
        validate_password_policy("admin123")
        assert False, "debió fallar"
    except PasswordPolicyError:
        pass
    validate_password_policy("PocheClave2026")


def test_jwt_roundtrip():
    token = create_access_token({"sub": "admin", "role": "super_admin"}, hours=1)
    payload = decode_access_token(token)
    assert payload.get("sub") == "admin"
    assert decode_access_token("token-basura") == {}
