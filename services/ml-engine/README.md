# PRISM ML Inference Engine

This folder contains Python-based workers tasked with analyzing behavioral signals and outputting deviations with explaining factors.

## Core Mandates
- **No Black-Box Output:** Every inference must compile a structured list of contributing factors alongside raw wellness indices.
- **Privacy Enforcement:** Under no circumstances are messages, audio transcriptions, video frame markers, or screen captures processed or stored. Only physical motion, typing timing cadence, and app category time durations are analyzed.

## Tech Stack
- Scikit-Learn
- Pandas / NumPy
- PyTorch (optional, for sequence/RNN baseline modeling)
- Redis Queue client
