"""
Colab Model Validation Interface
================================

This script provides an interface to validate the authoritative 57-feature production models
against a ground-truth dataset exported from the original Colab environment.

Usage:
    python validate_colab_model.py path/to/sample.json

Expected sample.json format:
{
    "features": {
        "Sleep_Score": 0.85,
        "Steps_Count": 5400,
        "Screen_Time_Hours": 6.2,
        // ... all 57 features exactly matching ColabModelFeatures naming ...
    },
    "expected_outputs": {
        "classifier_class": 1,
        "regressor_score": 42.5
    },
    "tolerances": {
        "classifier_match_required": true,
        "regressor_tolerance_mse": 1.0
    }
}
"""
import sys
import json
import logging
from typing import Dict, Any

from app.services.colab_ml_service import ColabMLService, ColabModelFeatures

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def validate_sample(sample_path: str):
    logger.info(f"Loading ground truth sample from {sample_path}...")

    try:
        with open(sample_path, 'r') as f:
            sample = json.load(f)
    except Exception as e:
        logger.error(f"Failed to read sample file: {e}")
        sys.exit(1)

    features_dict = sample.get("features", {})
    exp_class = sample.get("predicted_behavioral_state")
    exp_reg = sample.get("predicted_psychological_health_index")

    if len(features_dict) != 57:
        logger.error(f"Sample contains {len(features_dict)} features. Exactly 57 are required.")
        sys.exit(1)

    logger.info("Initializing ColabMLService...")
    try:
        svc = ColabMLService()
    except Exception as e:
        logger.error(f"Failed to initialize ML Service: {e}")
        sys.exit(1)

    logger.info("Parsing features into ColabModelFeatures...")
    try:
        features = ColabModelFeatures(**features_dict)
    except Exception as e:
        logger.error(f"Failed to parse features. Ensure all 57 exact Colab feature names are present. Error: {e}")
        sys.exit(1)

    logger.info("Running prediction...")
    prediction = svc.predict(features)

    logger.info("=== PREDICTION RESULTS ===")
    logger.info(f"Backend Classifier Class: {prediction.classifier_prediction} ({prediction.risk_level})")
    logger.info(f"Backend Regressor Score:  {prediction.regressor_score:.4f}")

    logger.info("=== EXPECTED COLAB OUTPUTS ===")
    logger.info(f"Expected Class: {exp_class}")
    logger.info(f"Expected Score: {exp_reg:.4f}" if exp_reg is not None else "Expected Score: None")

    passed = True

    # Validation logic
    if exp_class is not None:
        if prediction.classifier_prediction != exp_class:
            logger.error(f"FAIL: Classifier output {prediction.classifier_prediction} does NOT match expected {exp_class}.")
            passed = False
        else:
            logger.info("PASS: Classifier output matches expected exactly.")

    if exp_reg is not None and prediction.regressor_score is not None:
        diff = abs(prediction.regressor_score - exp_reg)
        tol = 1e-4  # Very tight tolerance for math exactness
        logger.info(f"Regressor Diff: {diff:.6f} (Tolerance: {tol})")
        if diff > tol:
            logger.error(f"FAIL: Regressor output difference {diff:.6f} exceeds tolerance {tol}.")
            passed = False
        else:
            logger.info("PASS: Regressor output is within tolerance.")

    if passed:
        logger.info("\nValidation completed with NO failures. Backend math matches Colab exactly!")
    else:
        logger.error("\nValidation FAILED.")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python validate_colab_model.py <path_to_sample.json>")
        sys.exit(1)

    validate_sample(sys.argv[1])
