"""
Voice feature extraction for PRISM Edge Node.

Computes acoustic features from microphone input using librosa + sounddevice.
NO speech-to-text. NO speaker identification. NO emotion recognition.
Extracts: MFCC, energy, pitch, spectral features, voice activity.

Optimized for Raspberry Pi 4B: 16 kHz mono, 2-second windows, lightweight DSP.
"""

import logging
import threading
import time
from collections import deque
from typing import Dict, Any, Optional

import numpy as np

from prism_edge import config

logger = logging.getLogger(__name__)


class VoiceFeatureExtractor:
    """
    Continuous audio capture + feature extraction in a background thread.

    Usage:
        extractor = VoiceFeatureExtractor()
        extractor.start()
        features = extractor.read()      # returns latest feature dict
        extractor.stop()
    """

    def __init__(self):
        self._sample_rate: int = config.AUDIO_SAMPLE_RATE
        self._chunk_ms: int = config.AUDIO_CHUNK_MS
        self._device_index: int = config.AUDIO_DEVICE_INDEX
        self._n_mfcc: int = config.AUDIO_N_MFCC
        self._n_fft: int = config.AUDIO_N_FFT
        self._hop_length: int = config.AUDIO_HOP_LENGTH
        self._vad_threshold: float = config.AUDIO_VAD_THRESHOLD_DB
        self._vad_min_duration: float = config.AUDIO_VAD_MIN_DURATION_SEC

        self._ready: bool = False
        self._running: bool = False
        self._lock: threading.Lock = threading.Lock()
        self._capture_thread: Optional[threading.Thread] = None

        # Latest features snapshot
        self._latest: Dict[str, Any] = self._empty_features()

        # Audio accumulator
        self._chunk_samples: int = int(self._sample_rate * self._chunk_ms / 1000)

    def start(self) -> None:
        """Start audio capture and feature extraction thread."""
        self._running = True
        try:
            # Lazy import to allow startup even if audio devices are missing
            import sounddevice as sd
            self._sd = sd

            devices = sd.query_devices()
            input_devices = [i for i, d in enumerate(devices) if d.get("max_input_channels", 0) > 0]
            if not input_devices:
                logger.warning("No audio input devices found")
                self._ready = False
                return

            logger.info("Audio input devices: %s", [devices[i]["name"] for i in input_devices])
            self._ready = True
        except Exception as e:
            logger.error("Failed to initialize sounddevice: %s", e)
            self._ready = False
            return

        self._capture_thread = threading.Thread(target=self._capture_loop, name="voice-capture", daemon=True)
        self._capture_thread.start()
        logger.info("Voice feature extractor started (%d Hz, %d ms chunks)", self._sample_rate, self._chunk_ms)

    def stop(self) -> None:
        self._running = False
        if self._capture_thread and self._capture_thread.is_alive():
            self._capture_thread.join(timeout=3.0)
        self._ready = False
        logger.info("Voice feature extractor stopped")

    @property
    def ready(self) -> bool:
        return self._ready

    def read(self) -> Dict[str, Any]:
        """Thread-safe read of latest voice features."""
        with self._lock:
            return self._latest.copy()

    # ── Internal ────────────────────────────────────────────────────

    @staticmethod
    def _empty_features() -> Dict[str, Any]:
        return {
            "voice_active": False,
            "rms_energy": 0.0,
            "pitch_hz": 0.0,
            "zero_crossing_rate": 0.0,
            "mfcc_mean": [0.0] * config.AUDIO_N_MFCC,
            "spectral_centroid_hz": 0.0,
            "spectral_bandwidth_hz": 0.0,
            "spectral_rolloff_hz": 0.0,
            "chroma_mean": [0.0] * 12,
            "speaking_duration_sec": 0.0,
            "silence_duration_sec": 0.0,
            "avg_loudness_db": -100.0,
            "peak_loudness_db": -100.0,
        }

    def _capture_loop(self) -> None:
        """Background thread: capture audio chunks and extract features."""
        import sounddevice as sd

        chunk_size = self._chunk_samples

        try:
            stream = sd.InputStream(
                samplerate=self._sample_rate,
                channels=1,
                dtype="float32",
                device=self._device_index,
                blocksize=chunk_size,
                callback=None,
            )
            stream.start()
        except Exception as e:
            logger.error("Failed to open audio stream: %s", e)
            self._ready = False
            return

        logger.info("Audio stream opened: %d Hz mono", self._sample_rate)

        speaking_accum = 0.0
        silence_accum = 0.0
        window_start = time.time()

        while self._running:
            try:
                audio_chunk, overflowed = stream.read(chunk_size)
                if overflowed:
                    logger.debug("Audio buffer overflow — chunk dropped")

                audio = audio_chunk.flatten().astype(np.float64)
                features = self._extract_features(audio)

                # Track speaking vs silence
                if features["rms_energy"] > 0.01:   # rough energy gate
                    speaking_accum += self._chunk_ms / 1000.0
                else:
                    silence_accum += self._chunk_ms / 1000.0

                features["speaking_duration_sec"] = round(speaking_accum, 2)
                features["silence_duration_sec"] = round(silence_accum, 2)

                with self._lock:
                    self._latest = features

            except Exception as e:
                logger.error("Audio capture error: %s", e)
                time.sleep(0.1)

        stream.stop()
        stream.close()
        logger.info("Audio stream closed")

    def _extract_features(self, audio: np.ndarray) -> Dict[str, Any]:
        """Extract acoustic features from a single audio chunk."""
        try:
            import librosa
        except ImportError:
            return self._empty_features()

        features = {}

        # ── RMS Energy ────────────────────────────────────────────
        rms = float(np.sqrt(np.mean(audio ** 2)))
        features["rms_energy"] = round(rms, 4)

        # ── Loudness (dB relative to full scale) ──────────────────
        if rms > 1e-10:
            rms_db = 20.0 * np.log10(rms)
            peak_db = 20.0 * np.log10(max(abs(audio)) + 1e-10)
        else:
            rms_db = -100.0
            peak_db = -100.0
        features["avg_loudness_db"] = round(rms_db, 2)
        features["peak_loudness_db"] = round(peak_db, 2)

        # ── Voice Activity Detection ──────────────────────────────
        voice_active = rms_db > self._vad_threshold
        features["voice_active"] = voice_active

        if not voice_active:
            # Early exit — skip expensive DSP when no voice present
            features.update({
                "pitch_hz": 0.0,
                "zero_crossing_rate": 0.0,
                "mfcc_mean": [0.0] * self._n_mfcc,
                "spectral_centroid_hz": 0.0,
                "spectral_bandwidth_hz": 0.0,
                "spectral_rolloff_hz": 0.0,
                "chroma_mean": [0.0] * 12,
            })
            return features

        # ── Zero Crossing Rate & Voice Stability ──────────────────
        zcr_array = librosa.feature.zero_crossing_rate(audio, frame_length=self._n_fft, hop_length=self._hop_length)
        zcr = float(zcr_array.mean())
        features["zero_crossing_rate"] = round(zcr, 4)
        
        # Voice stability proxy (inverse of ZCR std dev)
        zcr_std = float(zcr_array.std())
        features["voice_stability"] = round(1.0 / (zcr_std + 1e-6), 2)

        # ── Pitch Estimation & Variation ──────────────────────────
        try:
            f0, voiced_flag, _ = librosa.pyin(
                audio,
                fmin=librosa.note_to_hz("C2"),
                fmax=librosa.note_to_hz("C7"),
                sr=self._sample_rate,
                frame_length=self._n_fft,
            )
            voiced_f0 = f0[voiced_flag] if voiced_flag is not None and f0 is not None else np.array([])
            pitch = float(np.median(voiced_f0)) if len(voiced_f0) > 0 else 0.0
            pitch_std = float(np.std(voiced_f0)) if len(voiced_f0) > 0 else 0.0
        except Exception:
            pitch = 0.0
            pitch_std = 0.0
            
        features["pitch_hz"] = round(pitch, 2)
        features["pitch_variation"] = round(pitch_std, 2)
        
        # ── Speech Rate Proxy (Envelope Peaks) ────────────────────
        try:
            # Envelope of the audio signal
            envelope = np.abs(librosa.onset.onset_strength(y=audio, sr=self._sample_rate))
            peaks = librosa.util.peak_pick(envelope, pre_max=3, post_max=3, pre_avg=3, post_avg=5, delta=0.5, wait=10)
            # peaks per second
            speech_rate = len(peaks) / (self._chunk_ms / 1000.0)
        except Exception:
            speech_rate = 0.0
            
        features["speech_rate_proxy"] = round(speech_rate, 2)

        # ── MFCC ──────────────────────────────────────────────────
        try:
            mfcc = librosa.feature.mfcc(
                y=audio, sr=self._sample_rate, n_mfcc=self._n_mfcc,
                n_fft=self._n_fft, hop_length=self._hop_length,
            )
            mfcc_mean = mfcc.mean(axis=1).tolist()
            features["mfcc_mean"] = [round(v, 3) for v in mfcc_mean]
        except Exception:
            features["mfcc_mean"] = [0.0] * self._n_mfcc

        # ── Spectral Features ─────────────────────────────────────
        try:
            stft = np.abs(librosa.stft(audio, n_fft=self._n_fft, hop_length=self._hop_length))
            freqs = librosa.fft_frequencies(sr=self._sample_rate, n_fft=self._n_fft)

            # Spectral Centroid
            centroid = librosa.feature.spectral_centroid(S=stft, sr=self._sample_rate, n_fft=self._n_fft, hop_length=self._hop_length)
            features["spectral_centroid_hz"] = round(float(centroid.mean()), 2)

            # Spectral Bandwidth
            bandwidth = librosa.feature.spectral_bandwidth(S=stft, sr=self._sample_rate, n_fft=self._n_fft, hop_length=self._hop_length)
            features["spectral_bandwidth_hz"] = round(float(bandwidth.mean()), 2)

            # Spectral Rolloff
            rolloff = librosa.feature.spectral_rolloff(S=stft, sr=self._sample_rate, n_fft=self._n_fft, hop_length=self._hop_length)
            features["spectral_rolloff_hz"] = round(float(rolloff.mean()), 2)
        except Exception:
            features["spectral_centroid_hz"] = 0.0
            features["spectral_bandwidth_hz"] = 0.0
            features["spectral_rolloff_hz"] = 0.0

        # ── Chroma ────────────────────────────────────────────────
        try:
            chroma = librosa.feature.chroma_stft(y=audio, sr=self._sample_rate, n_fft=self._n_fft, hop_length=self._hop_length)
            features["chroma_mean"] = [round(float(v), 3) for v in chroma.mean(axis=1)]
        except Exception:
            features["chroma_mean"] = [0.0] * 12

        return features
