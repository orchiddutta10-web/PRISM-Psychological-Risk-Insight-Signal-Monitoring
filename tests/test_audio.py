import os
import pytest
import numpy as np
import soundfile as sf
from app.ml.audio_processor import (
    parse_ravdess_filename,
    load_and_preprocess_audio,
    extract_mfcc,
    extract_audio_features,
    prepare_1d_feature_vector,
    prepare_2d_feature_matrix,
    pipeline_extract_ravdess
)

@pytest.fixture
def dummy_wav_file(tmp_path):
    """
    Creates a temporary valid .wav file representing:
    Modality: 03 (audio-only)
    Vocal Channel: 01 (speech)
    Emotion: 03 (happy)
    Intensity: 01 (normal)
    Statement: 01 ("Kids are talking by the door")
    Repetition: 01 (1st repetition)
    Actor: 02 (Female)
    
    Filename: 03-01-03-01-01-01-02.wav
    """
    # 2 seconds of audio at 22050Hz sample rate
    sr = 22050
    duration = 2.0
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    
    # Generate simple sine wave (440Hz)
    audio_signal = 0.5 * np.sin(2 * np.pi * 440.0 * t)
    
    # Save file
    filename = "03-01-03-01-01-01-02.wav"
    file_path = tmp_path / filename
    sf.write(file_path, audio_signal, sr)
    
    return str(file_path)

def test_parse_ravdess_filename(dummy_wav_file):
    """Test metadata parsing from RAVDESS filename format."""
    metadata = parse_ravdess_filename(dummy_wav_file)
    
    assert metadata["modality"] == "audio-only"
    assert metadata["vocal_channel"] == "speech"
    assert metadata["emotion"] == "happy"
    assert metadata["intensity"] == "normal"
    assert metadata["actor_id"] == 2
    assert metadata["gender"] == "female"

def test_load_and_preprocess_audio(dummy_wav_file):
    """Test loading and trimming of the audio."""
    y, sr = load_and_preprocess_audio(dummy_wav_file, target_sr=22050)
    
    assert sr == 22050
    assert len(y) > 0
    assert isinstance(y, np.ndarray)

def test_extract_features_and_squeezing(dummy_wav_file):
    """Test MFCC and multi-feature extraction shapes."""
    y, sr = load_and_preprocess_audio(dummy_wav_file, target_sr=22050)
    
    # Test raw MFCC shape
    n_mfcc = 40
    mfccs = extract_mfcc(y, sr, n_mfcc=n_mfcc)
    assert mfccs.shape[0] == n_mfcc
    assert mfccs.shape[1] > 0
    
    # Test multi-feature extraction
    features = extract_audio_features(y, sr, n_mfcc=n_mfcc)
    assert "mfcc" in features
    assert "chroma" in features
    assert "mel" in features
    assert "contrast" in features
    
    # Chroma has 12 pitch classes, Mel has 128 bands, Contrast has 7 bands
    assert features["chroma"].shape[0] == 12
    assert features["mel"].shape[0] == 128
    assert features["contrast"].shape[0] == 7
    
    # Test 1D vector flattening (Mean + Std dev for each feature row)
    # Total features: 40 + 12 + 128 + 7 = 187 rows. 
    # For mean + std we get 187 * 2 = 374 elements.
    vector = prepare_1d_feature_vector(features)
    assert vector.shape == (374,)
    
    # Test 2D matrix padding
    target_frames = 128
    matrix = prepare_2d_feature_matrix(mfccs, target_frames=target_frames)
    assert matrix.shape == (n_mfcc, target_frames)

def test_full_pipeline(dummy_wav_file):
    """Test full pipeline run returning features and parsed metadata."""
    features, metadata = pipeline_extract_ravdess(dummy_wav_file, n_mfcc=40, method="1d_vector")
    
    assert features.shape == (374,)
    assert metadata["emotion"] == "happy"
    assert metadata["gender"] == "female"
