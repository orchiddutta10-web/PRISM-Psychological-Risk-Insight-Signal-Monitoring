# PRISM Mobile App

This directory contains the cross-platform mobile application built using **React Native** and **Expo**. It serves two primary workflows:

1. **Teen App Workflow:**
   - Active disclosure screen displaying exactly what is being monitored.
   - On-device metadata aggregation pipeline (accelerometer, GPS, keystroke metrics, and app categories).
   - Local storage configuration (encrypted SQLite/SecureStore for cryptographic keys and queued payloads).
   
2. **Guardian Mobile View:**
   - Guardian login and onboarding.
   - Quick wellness baseline alerts and notification preferences.

## Tech Stack
- React Native (Expo SDK)
- Expo Sensor APIs (Accelerometer, Location metadata)
- Custom React Native Text Input wrapping for keystroke timing metrics
- SecureStore / Async Storage (Encrypted at rest)
