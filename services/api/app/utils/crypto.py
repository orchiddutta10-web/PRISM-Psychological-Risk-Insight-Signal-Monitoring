import logging

from cryptography.fernet import Fernet

from app.config import settings

logger = logging.getLogger(__name__)

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


def encrypt_field(plain_text: str) -> str:
    """Encrypts a string field and returns a base64 encoded cipher string."""
    if not plain_text:
        return ""
    return fernet_client.encrypt(plain_text.encode()).decode()


def decrypt_field(cipher_text: str) -> str:
    """Decrypts a base64 encoded cipher string back into its original text."""
    if not cipher_text:
        return ""
    try:
        return fernet_client.decrypt(cipher_text.encode()).decode()
    except Exception:
        return "[DECRYPTION_FAILED]"
