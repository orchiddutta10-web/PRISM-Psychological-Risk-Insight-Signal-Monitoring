import logging
<<<<<<< HEAD

from cryptography.fernet import Fernet

=======
from cryptography.fernet import Fernet, InvalidToken
>>>>>>> feature/dashboard-ui
from app.config import settings

logger = logging.getLogger(__name__)

<<<<<<< HEAD
# Validate configured encryption key. Generating a random fallback silently
# would cause irreversible data loss — all previously encrypted fields would
# become permanently unreadable after a restart.
try:
    key_bytes = settings.ENCRYPTION_KEY.encode()
    fernet_client = Fernet(key_bytes)
except Exception:
    raise ValueError(
        "FATAL: Invalid ENCRYPTION_KEY in configuration. "
        "Cannot silently fall back to a random key — this would permanently "
        "corrupt all previously encrypted data. Provide a valid 32-byte "
        "base64-encoded Fernet key."
    )
=======

def _build_fernet(key: str) -> Fernet:
    """Builds a Fernet client from the configured key, failing fast if invalid.

    A Fernet key must be URL-safe base64 of exactly 32 bytes. If the configured
    key is invalid we MUST NOT silently fall back to a random key — that would
    make every previously encrypted row undecryptable after a restart. Fail
    loudly instead so the misconfiguration is caught at startup.
    """
    try:
        return Fernet(key.encode())
    except Exception as exc:
        raise ValueError(
            "ENCRYPTION_KEY is invalid: must be a URL-safe base64-encoded 32-byte "
            "Fernet key. Generate one with `python -c "
            "\"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\"` "
            "and set it in the environment."
        ) from exc


fernet_client = _build_fernet(settings.ENCRYPTION_KEY)
>>>>>>> feature/dashboard-ui


def encrypt_field(plain_text: str) -> str:
    """Encrypts a string field and returns a base64 encoded cipher string."""
    if not plain_text:
        return ""
    return fernet_client.encrypt(plain_text.encode()).decode()


def decrypt_field(cipher_text: str) -> str:
    """Decrypts a base64 encoded cipher string back into its original text.

    Raises on invalid/corrupt ciphertext instead of returning a sentinel, so
    data corruption is surfaced rather than silently propagated.
    """
    if not cipher_text:
        return ""
    try:
        return fernet_client.decrypt(cipher_text.encode()).decode()
    except InvalidToken as exc:
        logger.error(
            "Decryption failed: ciphertext was not created with the current ENCRYPTION_KEY "
            "(key rotation or data corruption)."
        )
        raise
