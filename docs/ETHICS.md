# PRISM & PRISM Node — Ethics & Privacy Manifesto

## 1. Metadata-Only Boundary
PRISM enforces a strict "metadata-only" data collection architecture. 
- We do **not** capture, transit, or store keystroke content, chat messages (other than interactions with the disclosed AI companion), microphone audio, screen recordings, or photos.
- Behavioral signals (like typing dynamics) extract timing intervals and correction rates, and then immediately discard the buffer.
- Voice check-ins use on-device or ephemeral feature extraction (e.g. MFCC vectors) to identify speaker emotion and verify identity; the raw audio byte stream is dropped immediately after inference.

## 2. Granular, Revocable Consent
Consent is not a one-time blanket agreement.
- PRISM implements a `ConsentGrant` ledger tracking individual opt-ins for specific modalities (e.g., location, GSR, voice, companion_chat).
- Toggles can be revoked at any time by the teen or guardian, instantly severing the ingestion pipeline for that specific signal.

## 3. Crisis Escalation Guarantee
The AI Companion is subject to a hardcoded crisis-detection routing layer.
- Messages are scanned against a severity keyword/intent list *before* reaching the persona LLM.
- If a crisis (e.g., self-harm, abuse) is detected, the LLM persona is bypassed. A static, vetted crisis response is served, and a high-priority alert is dispatched to the guardian/clinician dashboard per the consent agreement.
- The AI will never "roleplay" through a mental health crisis.

## 4. Explicit AI Disclosure Policy
Transparency is prioritized over immersion.
- The Multi-Persona AI Companion explicitly discloses its nature as an AI in every persona’s core prompt and UI banner: *"I am an AI companion, not a licensed therapist or doctor."*
- We prohibit undisclosed impersonation of real individuals. Archetypes are generic (e.g., "The Coach", "The Listener").

## 5. Explainable AI, Not Diagnoses
Alerts surfaced to guardians describe *behavioral shifts* relative to an established baseline, not medical or psychological diagnoses.
- For example, an alert reads: *"Irregular sleep schedule detected: Circadian regularity index dropped to 45%."*
- It does **not** read: *"Your child has insomnia."*
- All ML outputs include human-readable "contributing factors" to prevent black-box anxiety.
