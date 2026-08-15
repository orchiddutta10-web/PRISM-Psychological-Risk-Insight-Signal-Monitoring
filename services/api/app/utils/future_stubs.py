from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from datetime import datetime
from sqlalchemy.orm import Session
from app import models


# --- 1. Wearable Ingestion Contract ---
class WearableIngestionContract(ABC):
    """
    Interface defining the ingestion of physiological signals from wearable devices
    (e.g., Apple Watch, Fitbit, WHOOP) for heart-rate variability (HRV), galvanic
    skin response (GSR), and sleep metrics.
    """

    @abstractmethod
    def ingest_physiological_telemetry(
        self,
        device_id: str,
        hrv_ms: float,
        gsr_microsiemens: float,
        sleep_duration_seconds: float,
        sleep_efficiency_percentage: float,
        db: Session,
    ) -> bool:
        """
        Validates telemetry signals, checks consent, and writes updates to
        the PhysiologicalBaseline database table.
        """
        pass

    @abstractmethod
    def get_physiological_baseline(
        self, device_id: str, metric_type: str, db: Session
    ) -> Optional[models.PhysiologicalBaseline]:
        """
        Retrieves the rolling mean and variance parameters for a physiological signal.
        """
        pass


# --- 2. Multimodal Fusion Service Stub ---
class MultimodalFusionService(ABC):
    """
    Interface stub for future sequence models (e.g., LSTMs, Transformers) to merge
    multi-source streams (wearable physiological data + mobile behavioral metadata)
    into a unified temporal state representation.
    """

    @abstractmethod
    def construct_temporal_fusion_matrix(
        self, device_id: str, window_size_hours: int, db: Session
    ) -> List[Dict[str, Any]]:
        """
        Queries and aligns historical RawSignalEvent and PhysiologicalBaseline rows
        into a synchronized feature vector sequence ready for neural network inference.
        """
        pass

    @abstractmethod
    def predict_multimodal_wellbeing_anomaly(
        self, feature_sequence: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Executes a sequence classifier to predict likelihood of wellness deviations.
        Returns:
            {
                "anomaly_probability": float (0.0 to 1.0),
                "contributing_features": List[str],
                "attention_weights": List[float]
            }
        """
        pass


# --- 3. Dynamic Risk Registry Interface ---
class RiskRegistryProvider(ABC):
    """
    Interface for querying crowdsourced and dynamic app risk registries.
    Ensures that registry lookup mechanisms can be hot-swapped without schema changes.
    """

    @abstractmethod
    def check_package_risk_category(self, package_name: str) -> Dict[str, Any]:
        """
        Checks a package name against a dynamic registry provider (e.g., CleanPlay, SafeApp API).
        Returns:
            {
                "is_risky": bool,
                "category": str (e.g., "anonymous-chat", "gambling", "clean"),
                "risk_rating": float (0.0 to 5.0),
                "registry_source": str
            }
        """
        pass

    @abstractmethod
    def update_local_cache(self, risk_database_feed: List[Dict[str, Any]]) -> bool:
        """
        Synchronizes local cache with the latest crowdsourced feed.
        """
        pass


# --- 4. Module 10: Multimodal Wellbeing Fusion Contract (future AI) ---
class MultimodalWellbeingFusion(ABC):
    """
    Module 10: Future AI should combine typing + vitals + speech emotion +
    face emotion + questionnaire into a single explainable wellness signal.

    This is the forward contract for the "fusion engine" that combines RAG
    context, symptom descriptions, typing metadata, and (later) wearable
    sensor data into a wellness risk indicator with confidence — never a
    diagnosis (per the paper's conclusions).
    """

    @abstractmethod
    def fuse_signals(
        self,
        typing_features: Dict[str, float],
        vitals: Dict[str, float],
        speech_emotion: Optional[Dict[str, float]],
        face_emotion: Optional[Dict[str, float]],
        questionnaire: Optional[Dict[str, float]],
    ) -> Dict[str, Any]:
        """
        Fuses all available signal modalities into a single screening output.
        Returns:
            {
                "wellness_risk": float (0.0 to 1.0),
                "confidence": float (0.0 to 1.0),
                "contributing_modalities": List[str],
                "factors": List[str],       # human-readable, non-diagnostic
                "recommendation": str       # e.g. "consider a validated questionnaire"
            }
        """
        pass
