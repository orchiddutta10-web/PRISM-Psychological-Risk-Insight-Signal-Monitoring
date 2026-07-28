from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
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


@router.post("/checkin")
async def voice_checkin(
    audio: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_device: models.ChildDevice = Depends(auth.get_current_device),
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

    # Read uploaded file content in-memory
    audio_bytes = await audio.read()

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
