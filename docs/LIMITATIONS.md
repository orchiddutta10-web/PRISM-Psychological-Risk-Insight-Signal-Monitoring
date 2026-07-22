# PRISM & PRISM Node — MVP Limitations & Honest Model Status

This document outlines the known limitations of the Week 1 MVP and clearly distinguishes between mocked/rule-based heuristics and actual trained machine learning models.

## 1. Machine Learning Models

### Behavioral Risk Engine (Typing, Usage, Location)
- **Status**: **Rule-Based / Statistical (Real implementation)**.
- **Limitation**: Currently uses standard deviation thresholds from rolling baselines and Isolation Forest for anomaly detection. It does not employ deep learning or temporal fusion Transformers yet.

### Sleep Schedule Inference
- **Status**: **Rule-Based / Statistical (Real implementation)**.
- **Limitation**: The system estimates sleep windows by searching for continuous periods (>3 hours) of screen-off time, accelerometer stillness, and typing gaps. It calculates a rolling circadian regularity index (variance of sleep start time). It is **not** a polysomnography-trained LSTM sleep-stage classifier.

### Voice Speaker Verification & Emotion Detection
- **Status**: **Pre-Trained Checkpoints (Mocked for Demo)**.
- **Limitation**: The API accepts an audio payload and extracts metadata, immediately discarding the audio. However, the inference itself is mocked via random selection (weighted logic). In production, this will use pre-trained `speechbrain` or `resemblyzer` checkpoints for speaker ID, and a pre-trained SVM/Random Forest on MFCC vectors for emotion. No custom audio models were trained from scratch this week.

### Multi-Persona AI Companion
- **Status**: **LLM / Rule-Based Wrapper (Mocked responses for Demo)**.
- **Limitation**: The endpoints exist to manage sessions, enforce crisis-keyword bypass logic, and maintain context. For the 7-day MVP demo, the persona responses are mocked rather than calling an active OpenAI/Anthropic API to ensure zero latency during presentation.

## 2. Physiological Signal Ingestion (PRISM Node)
- **Status**: **Synthetic Generator (Functional pipeline)**.
- **Limitation**: A synthetic python generator script currently streams realistic Galvanic Skin Response (GSR) and Photoplethysmography (PPG) waveforms to the edge ingestion API. Real ESP32/wearable firmware integration over MQTT/BLE is slated for the post-Week-1 roadmap.

## 3. Risky App / Content Registry
- **Status**: **Static Seed (Real implementation)**.
- **Limitation**: The risk registry is fully functional but currently populated by a small static seed array of known anonymous chat apps and challenge keywords. Integration with a live, third-party threat-intelligence feed is future scope.

## 4. Third-Party Messaging Channels (WhatsApp/Instagram)
- **Status**: **Webhook Stubbed (Partially Functional)**.
- **Limitation**: The Meta webhook endpoint exists and properly routes inbound payloads through the crisis-detection and persona engine. However, it requires active Meta Graph API keys and business platform approval to send messages back out.
