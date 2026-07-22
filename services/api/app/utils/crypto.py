import base64
from cryptography.fernet import Fernet
from app.config import settings

# Ensure key is valid base64 and 32 bytes. If not, generate a fallback key or pad/truncate it
try:
    key_bytes = settings.ENCRYPTION_KEY.encode()
    # Try creating Fernet instance to validate
    fernet_client = Fernet(key_bytes)
except Exception:
    # Generate a secure fallback key if the configured key is invalid or default
    fallback_key = Fernet.generate_key()
    fernet_client = Fernet(fallback_key)

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
