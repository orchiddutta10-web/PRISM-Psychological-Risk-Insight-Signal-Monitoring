import os
import numpy as np
import librosa
import soundfile as sf

# RAVDESS Dataset Label Mappings
RAVDESS_EMOTIONS = {
    "01": "neutral",
    "02": "calm",
    "03": "happy",
    "04": "sad",
    "05": "angry",
    "06": "fearful",
    "07": "disgust",
    "08": "surprised"
}

RAVDESS_INTENSITIES = {
    "01": "normal",
    "02": "strong"
}

RAVDESS_VOCAL_CHANNELS = {
    "01": "speech",
    "02": "song"
}

def parse_ravdess_filename(filename: str) -> dict:
    """
    Parses RAVDESS audio file names according to the 7-part identifier code structure.
    Filename example: 03-01-06-01-02-01-02.wav
    """
    basename = os.path.basename(filename)
    name_without_ext, _ = os.path.splitext(basename)
    parts = name_without_ext.split('-')
    
    if len(parts) != 7:
        raise ValueError(
            f"Filename '{basename}' does not match standard RAVDESS format (7 hyphen-separated tokens)."
        )
        
    modality = "audio-only" if parts[0] == "03" else "video-only" if parts[0] == "02" else "full-AV"
    vocal_channel = RAVDESS_VOCAL_CHANNELS.get(parts[1], "unknown")
    emotion = RAVDESS_EMOTIONS.get(parts[2], "unknown")
    intensity = RAVDESS_INTENSITIES.get(parts[3], "unknown")
    statement = "Kids are talking by the door" if parts[4] == "01" else "Dogs are sitting by the door" if parts[4] == "02" else "unknown"
    repetition = "1st repetition" if parts[5] == "01" else "2nd repetition"
    
    # Actor IDs: odd = male, even = female
    actor_id = int(parts[6])
    gender = "male" if actor_id % 2 != 0 else "female"
    
    return {
        "modality": modality,
        "vocal_channel": vocal_channel,
        "emotion": emotion,
        "intensity": intensity,
        "statement": statement,
        "repetition": repetition,
        "actor_id": actor_id,
        "gender": gender
    }

def load_and_preprocess_audio(file_path: str, target_sr: int = 22050) -> tuple:
    """
    Loads an audio file, converts it to mono, resamples it, and trims leading/trailing silence.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Audio file not found at {file_path}")
        
    # Load audio (y = audio time series array, sr = sample rate)
    y, sr = librosa.load(file_path, sr=target_sr, mono=True)
    
    # Trim leading/trailing silence (returns trimmed signal and index range)
    # top_db=30 means anything under 30dB below reference is considered silence
    y_trimmed, index = librosa.effects.trim(y, top_db=30)
    
    return y_trimmed, sr

def extract_mfcc(y: np.ndarray, sr: int, n_mfcc: int = 40) -> np.ndarray:
    """
    Extracts Mel-Frequency Cepstral Coefficients (MFCC) from audio array.
    Returns matrix of shape (n_mfcc, n_frames).
    """
    # Compute MFCCs
    mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=n_mfcc)
    return mfccs

def extract_audio_features(y: np.ndarray, sr: int, n_mfcc: int = 40) -> dict:
    """
    Extracts comprehensive audio features commonly used in Speech Emotion Recognition:
    - MFCCs (Mel-Frequency Cepstral Coefficients)
    - Chroma STFT (Harmonic pitch distribution)
    - Mel Spectrogram (Energy distribution across Mel scale bands)
    - Spectral Contrast (Spectral valley-to-peak difference, texture)
    """
    # 1. MFCC
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=n_mfcc)
    
    # 2. Chroma STFT
    chroma = librosa.feature.chroma_stft(y=y, sr=sr)
    
    # 3. Mel Spectrogram
    mel = librosa.feature.melspectrogram(y=y, sr=sr)
    
    # 4. Spectral Contrast
    contrast = librosa.feature.spectral_contrast(y=y, sr=sr)
    
    return {
        "mfcc": mfcc,         # shape: (n_mfcc, n_frames)
        "chroma": chroma,     # shape: (12, n_frames)
        "mel": mel,           # shape: (128, n_frames)
        "contrast": contrast  # shape: (7, n_frames)
    }

def prepare_1d_feature_vector(features_dict: dict) -> np.ndarray:
    """
    Flattens raw time-series matrices (n_features, n_frames) into a single 1D feature vector
    by calculating the Mean and Standard Deviation of each coefficient across all time frames.
    
    This results in a fixed-dimension vector regardless of audio length, ready for standard ML models:
    - SVM, Random Forest, Multi-layer Perceptron (MLP)
    """
    vector_parts = []
    
    for feat_name, feat_matrix in features_dict.items():
        # Calculate mean along frames axis (axis=1)
        mean_val = np.mean(feat_matrix, axis=1)
        # Calculate std along frames axis
        std_val = np.std(feat_matrix, axis=1)
        
        # Concatenate mean and std vectors
        vector_parts.append(mean_val)
        vector_parts.append(std_val)
        
    return np.concatenate(vector_parts)

def prepare_2d_feature_matrix(mfcc_matrix: np.ndarray, target_frames: int = 128) -> np.ndarray:
    """
    Pads or truncates the time (frames) dimension of an MFCC matrix to a fixed length.
    Useful for 2D Deep Learning architectures (CNNs, LSTMs).
    
    - If frames < target_frames: pads with zeros.
    - If frames > target_frames: truncates.
    """
    n_mfcc, n_frames = mfcc_matrix.shape
    
    if n_frames < target_frames:
        # Zero pad on the right
        pad_width = target_frames - n_frames
        padded_matrix = np.pad(mfcc_matrix, pad_width=((0, 0), (0, pad_width)), mode='constant')
        return padded_matrix
    else:
        # Truncate
        return mfcc_matrix[:, :target_frames]

def pipeline_extract_ravdess(file_path: str, n_mfcc: int = 40, method: str = "1d_vector") -> tuple:
    """
    Full pipeline to load a file, parse metadata if it matches RAVDESS format,
    extract audio features, and format them for ML models.
    """
    # 1. Parse Metadata (optional, based on filename)
    try:
        metadata = parse_ravdess_filename(file_path)
    except ValueError:
        metadata = {"message": "Non-RAVDESS file format or custom record"}
        
    # 2. Load and Preprocess Audio
    y, sr = load_and_preprocess_audio(file_path)
    
    # 3. Extract Features and Squeeze
    if method == "1d_vector":
        features = extract_audio_features(y, sr, n_mfcc=n_mfcc)
        processed_features = prepare_1d_feature_vector(features)
    elif method == "2d_matrix":
        mfcc = extract_mfcc(y, sr, n_mfcc=n_mfcc)
        processed_features = prepare_2d_feature_matrix(mfcc, target_frames=128)
    else:
        raise ValueError("Invalid method. Use '1d_vector' or '2d_matrix'.")
        
    return processed_features, metadata
