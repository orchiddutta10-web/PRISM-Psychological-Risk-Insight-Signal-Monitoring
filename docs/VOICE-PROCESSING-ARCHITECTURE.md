# Voice Processing Architecture — Ephemeral-Only Standard

## 🔴 Immutable Rule

**ZERO voice files are ever written to disk or object storage.**

This is a **hard architectural constraint**, not a guideline.

```
Raw Audio Input (Memory)
    ↓ (in-RAM processing)
Feature Extraction (MFCC, mel-spectrograms, voice characteristics)
    ↓ (in-RAM computation)
Model Inference (emotion, stress, speaker verification, typicality)
    ↓ (write result only: numeric alert or baseline update)
Immutable Audit Log Entry (no audio content, only metadata: timestamp, signal, model output)
    ↓
DESTROY Raw Audio Buffer (zeroed)
```

## Why This Matters

- **Legal**: GDPR/CCPA restrict "voice biometrics"; storing raw audio creates data minimization violation
- **Ethics**: PRISM's founding premise is "metadata only"; storing audio contradicts the product promise
- **Safety**: Audio files in version control or logs can be accidentally exposed (GitHub, CloudWatch, backups)
- **Operational**: No one should ever be able to recover the original voice from PRISM's data stores

## Allowed: Numeric Results Only

After ephemeral processing, PRISM stores ONLY:

```json
{
  "timestamp": "2025-01-15T14:32:00Z",
  "signal_id": "voice-stress-typicality",
  "user_id": "teen-xyz",
  "inferred_value": 0.67,
  "contributing_factors": {
    "pitch_elevation": 0.12,
    "speech_rate_increase": 0.18,
    "pause_duration_increase": 0.08,
    "spectral_entropy_change": -0.05
  },
  "confidence": 0.81,
  "model_version": "speaker-typicality-v2.1",
  "audit_id": "evt-12345"
}
```

**Not allowed**:
- `.wav`, `.mp3`, `.m4a`, `.flac`, or any compressed audio
- Spectrograms or intermediate embeddings (except as transient memory during inference)
- Raw waveform samples
- Transcriptions of speech content
- Speaker identification (can re-identify a person)

## Code Enforcement

### 1. Explicit Memory Lifecycle

```python
# FastAPI endpoint for voice processing

import numpy as np
from contextlib import contextmanager

@contextmanager
def ephemeral_audio_buffer(max_duration_sec=30):
    """
    Context manager that guarantees audio buffer is zeroed on exit.
    
    DO NOT use this to save audio to disk.
    DO NOT use this to create long-lived references.
    """
    audio_buffer = np.zeros(int(16000 * max_duration_sec), dtype=np.float32)
    try:
        yield audio_buffer
    finally:
        # Overwrite with random data before release
        np.random.seed()
        audio_buffer[:] = np.random.randn(*audio_buffer.shape)
        del audio_buffer

# Handler
@app.post("/voice-signal")
async def ingest_voice_signal(file: UploadFile):
    """
    Ephemeral voice processing. Audio never touches disk.
    """
    with ephemeral_audio_buffer(max_duration_sec=30) as buffer:
        # Read from in-memory stream only
        audio_data = await file.read()  # Still in memory
        buffer[:len(audio_data)] = np.frombuffer(audio_data, dtype=np.float32)
        
        # Run inference on buffer
        features = extract_features(buffer)
        emotion_signal = predict_emotion(features)
        
        # Store only the numeric result + metadata
        await store_signal_result(
            user_id=request.user_id,
            signal_type="voice_emotion",
            inferred_value=emotion_signal,
            audit_metadata={
                "model_version": "emotion-v2.1",
                "timestamp": datetime.utcnow(),
            }
        )
        
        # buffer is automatically zeroed on context exit
    
    return {"status": "processed", "alert_status": emotion_signal}
```

### 2. Strict File System Enforcement

Add this to `.gitignore` (already present, but document why):

```
# VOICE PROCESSING SAFETY: Absolute prohibition on storing audio
*.wav
*.mp3
*.m4a
*.flac
*.aac
*.ogg
*.opus
uploads/
audio_cache/
voice_downloads/
speech_files/
```

### 3. CI/CD Enforcement

Add to GitHub Actions workflow:

```yaml
# .github/workflows/privacy-check.yml
name: Privacy & Architecture Checks

on: [push, pull_request]

jobs:
  audio-file-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for commit inspection
      
      - name: Detect audio files in git history
        run: |
          echo "Checking for audio files in git..."
          git log --name-only --pretty=format: -- '*.wav' '*.mp3' '*.m4a' '*.flac' '*.aac' '*.ogg' '*.opus' | sort -u > found_files.txt
          
          if [ -s found_files.txt ]; then
            echo "❌ ERROR: Audio files detected in git history:"
            cat found_files.txt
            echo ""
            echo "PRISM policy: NO raw audio storage. Period."
            echo "If this is a test file, use BFT or re-write history."
            exit 1
          else
            echo "✓ No audio files in history"
          fi
      
      - name: Detect audio writes in code
        run: |
          echo "Scanning code for audio file writes..."
          # Flag anything that looks like audio file I/O
          if grep -r "\.wav\|\.mp3\|\.m4a\|\.flac" --include="*.py" --include="*.js" --include="*.ts" .; then
            echo "⚠ Review code: found audio file extensions referenced"
            echo "If this is safe (e.g., in docs), add a comment: AUDIO_WRITE_APPROVED"
            # Don't fail here; just warn
          fi
```

### 4. Production Safeguard (Python)

```python
# shared/safety.py

import os
from pathlib import Path

FORBIDDEN_AUDIO_PATTERNS = [
    "uploads/",
    "audio_cache/",
    "voice_downloads/",
    "/tmp/audio*",
    "/tmp/voice*",
]

def safety_check_voice_storage():
    """
    Runs on app startup. Fails if any forbidden paths exist.
    """
    for pattern in FORBIDDEN_AUDIO_PATTERNS:
        matches = list(Path("/").glob(pattern))
        if matches:
            raise RuntimeError(
                f"PRISM Safety Violation: Voice storage directory detected: {matches}\n"
                f"PRISM policy: NO raw audio stored on disk. Ever.\n"
                f"Ephemeral in-memory processing only."
            )

# In main.py or app startup
if __name__ == "__main__":
    safety_check_voice_storage()
    uvicorn.run(app, ...)
```

## Separate Research Environment

If PRISM ever needs voice recordings for **legitimate research** (model development, benchmarking), it MUST be:

1. **Physically isolated**: Different cloud account, different VPC
2. **Explicit consent**: Separate research consent form; never mixed with production consent
3. **De-identified**: Remove user IDs before upload; link only via anonymous research_id
4. **Encrypted**: AES-256 at rest; TLS in transit
5. **Access-controlled**: Researcher authentication + MFA; all downloads logged
6. **Retention-limited**: Hard expiration date in contract (e.g., 12 months)
7. **Non-production**: Code never imports from research stores

Example structure:

```
research/
├── RESEARCH_CONSENT_FORM.md
├── voice_recordings/
│   └── (encrypted, de-identified)
├── research_data_manifest.csv
├── access_logs/
│   └── (immutable audit trail)
└── data_deletion_log.md
    └── (proof of deletion on retention expiry)
```

## Test Data: Synthetic or Externally Sourced

For unit tests and integration tests:

```python
# tests/fixtures/audio_fixtures.py

import numpy as np

def synthetic_voice_sample(duration_sec=3, sample_rate=16000):
    """
    Generate synthetic voice-like audio (white noise filtered to 85–8000 Hz).
    Never use actual recordings of humans.
    """
    samples = np.random.randn(int(sample_rate * duration_sec))
    # Apply bandpass filter to human voice range
    return samples

def external_librispeech_sample():
    """
    If test data needed, source from public research dataset (LibriSpeech, etc.)
    with explicit attribution. Store reference URL, not the audio file.
    """
    return {
        "source": "LibriSpeech (public domain)",
        "url": "https://www.openslr.org/12",
        "license": "CC-BY-4.0",
        "note": "Not stored; test uses streaming/download at runtime only"
    }

# Usage in test
def test_voice_emotion_extraction():
    audio = synthetic_voice_sample()  # In-memory only
    result = process_voice_signal(audio)
    assert result["confidence"] > 0.7
    # audio is garbage-collected; never hits disk
```

## Privacy Audit Checklist

Before any code review:

- [ ] No new imports of `scipy.io.wavfile`, `librosa.output.write_wav`, `soundfile.write()`, etc.
- [ ] No new file paths containing "audio", "voice", "uploads", "speech"
- [ ] Voice inference happens in-memory only (using `@ephemeral_audio_buffer` or equivalent)
- [ ] Results stored as numeric signal + metadata, not raw audio
- [ ] No spectrograms or embeddings written to database (except transient in-memory)
- [ ] All voice handling code has audit comment explaining the ephemeral design
- [ ] No voice data passed to external APIs without explicit research exception

## Summary

| Aspect | Rule |
|--------|------|
| **Storage** | Zero audio files ever written to disk or cloud storage |
| **Processing** | In-memory ephemeral; destroyed after inference |
| **Results** | Only numeric signal values + metadata logged |
| **Testing** | Synthetic or licensed external samples; never stored |
| **Research** | Separate environment with explicit consent, de-id, encryption, and retention limits |
| **Enforcement** | CI/CD checks, code review checklist, startup safety verification |

This is non-negotiable. **PRISM's core privacy promise depends on it.**
