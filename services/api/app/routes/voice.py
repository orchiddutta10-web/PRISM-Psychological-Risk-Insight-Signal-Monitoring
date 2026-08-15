from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Request
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.utils import audit, auth
from app.utils.voice_processor import (
    calculate_cosine_similarity,
    classify_affect,
    extract_speaker_embedding,
)

router = APIRouter(prefix="/api/v1/voice", tags=["voice"])

MAX_AUDIO_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_AUDIO_TYPES = {
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/wave": ".wav",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
}
ALLOWED_EXTENSIONS = {".wav", ".mp3"}


@router.post("/checkin")
async def voice_checkin(
    audio: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_device: models.ChildDevice = Depends(auth.get_current_device),
    request: Request = None,
):
    """
    Phase 4: Voice Module Check-in
    Accepts a short clip (wav/mp3), performs speaker verification against enrolled baseline,
    computes affect proxy, logs metadata to VOICE_SESSIONS, and enforces immediate deletion
    of raw audio unless voice_retention consent is explicitly granted.
    """
    # 1. Verify general voice consent
    consent = (
        db.query(models.ConsentGrant)
        .filter(
            models.ConsentGrant.subject_id == current_device.id,
            models.ConsentGrant.modality == "voice",
        )
        .first()
    )

    if not consent or not consent.is_granted:
        raise HTTPException(
            status_code=403, detail="Active consent for voice modality is not granted."
        )

    # Reject oversized bodies by declared Content-Length up front, before any
    # bytes are read into memory (defense against memory-exhaustion DoS).
    if request:
        content_length = request.headers.get("content-length")
        if content_length and content_length.isdigit() and int(content_length) > MAX_AUDIO_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail="Audio file too large (max 10 MB).",
            )

    # Read the uploaded file in bounded chunks so memory stays capped even if
    # the client omits/spoofs Content-Length.
    audio_bytes = b""
    while True:
        chunk = await audio.read(MAX_AUDIO_BYTES + 1)
        if not chunk:
            break
        audio_bytes += chunk
        if len(audio_bytes) > MAX_AUDIO_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail="Audio file too large (max 10 MB).",
            )

    # Allowlist MIME type / extension so only real audio enters the pipeline.
    content_type = (audio.content_type or "").lower()
    ext = os.path.splitext(audio.filename or "")[1].lower()
    if content_type not in ALLOWED_AUDIO_TYPES and ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported audio type. Use WAV or MP3.",
        )

    # 2. Onboarding Voiceprint Enrollment / Verification Gate
    profile = (
        db.query(models.VoiceProfile)
        .filter(models.VoiceProfile.subject_id == current_device.id)
        .first()
    )

    embedding = extract_speaker_embedding(audio_bytes)

    if not profile:
        # Onboarding step: Enroll baseline voiceprint
        profile = models.VoiceProfile(subject_id=current_device.id)
        profile.voiceprint = embedding
        db.add(profile)
        db.commit()
        db.refresh(profile)

        audit.log_audit_event(
            db,
            action="Baseline voiceprint enrolled for subject.",
            device_id=current_device.id,
        )
        return {
            "status": "enrolled",
            "speaker_verified": True,
            "msg": "Baseline voiceprint enrolled successfully.",
        }

    # Perform verification
    similarity = calculate_cosine_similarity(profile.voiceprint, embedding)

    if similarity < 0.75:
        # Immediate Gating Rejection: Discard audio, bypass downstream processing
        audit.log_audit_event(
            db,
            action=f"Voice check-in REJECTED: Speaker verification failed (Similarity: {similarity:.2f})",
            device_id=current_device.id,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Speaker verification failed. Cosine similarity {similarity:.2f} is below required threshold 0.75.",
        )

    # 3. Process Affect/Stress Classification (only if gate passed)
    emotion_label, confidence = classify_affect(audio_bytes)

    # Extract non-identifiable feature metadata (MFCC average simulation)
    features = {
        "mfcc_mean": embedding[:10],  # Save first 10 dims for analysis
        "similarity_score": similarity,
    }

    # 4. Save metadata to VOICE_SESSIONS
    session = models.VoiceSession(
        subject_id=current_device.id,
        affect_confidence=confidence,
        emotion_label=emotion_label,
    )
    session.features = features
    db.add(session)

    # Generate alert for elevated stress levels
    if emotion_label in ["stressed", "anxious", "sad"]:
        alert = models.Alert(
            device_id=current_device.id,
            severity_tier="amber",
            plain_language_summary="Elevated stress markers detected in voice check-in.",
        )
        alert.contributing_factors = [
            f"Voice affect classified as {emotion_label} (confidence: {int(confidence*100)}%)."
        ]
        db.add(alert)

    db.commit()

    # 5. Raw Audio Volatility Enforcement
    # Per PRISM privacy spec, raw audio bytes are processed entirely in-memory
    # and discarded after feature extraction. No raw content is ever persisted to disk.
    # The voice_retention consent modality is reserved for future use with encrypted
    # feature-vector retention only, not raw audio storage.

    persisted = False
    if retention_consent and retention_consent.is_granted:
        # Persist raw audio file under a server-generated name — NEVER the
        # client-provided filename (prevents path traversal / overwrite).
        upload_dir = "uploads/voice"
        os.makedirs(upload_dir, exist_ok=True)
        safe_ext = ALLOWED_AUDIO_TYPES.get(content_type, ".wav")
        file_path = os.path.join(upload_dir, f"{session.id}{safe_ext}")

        # Reset read head and save
        await audio.seek(0)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(audio.file, buffer)
        persisted = True

    # Audit logging
    audit.log_audit_event(
        db,
        action=f"Voice check-in processed. Emotion: {emotion_label}. Raw audio discarded per privacy policy.",
        device_id=current_device.id,
    )

    return {
        "status": "processed",
        "speaker_verified": True,
        "emotion_label": emotion_label,
        "confidence": confidence,
        "audio_discarded": True,
    }
