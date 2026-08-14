import os
import joblib

def test_production_model_feature_count():
    """
    Regression test to ensure we never accidentally deploy the
    synthetic 79-feature models again. The authoritative Colab
    models MUST have exactly 57 features.
    """
    resources_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "resources"
    )

    clf_path = os.path.join(resources_dir, "prism_behavioural_classifier.joblib")
    reg_path = os.path.join(resources_dir, "prism_behavioural_regressor.joblib")
    scaler_path = os.path.join(resources_dir, "prism_behavioural_scaler.joblib")

    # Verify files exist
    assert os.path.exists(clf_path), "Classifier missing"
    assert os.path.exists(reg_path), "Regressor missing"
    assert os.path.exists(scaler_path), "Scaler missing"

    clf = joblib.load(clf_path)
    reg = joblib.load(reg_path)
    scaler = joblib.load(scaler_path)

    # Regression guard: must be exactly 57 features
    assert clf.n_features_in_ == 57, f"FATAL: Classifier expects {clf.n_features_in_} features instead of 57. A 79-feature synthetic model may have been loaded!"
    assert reg.n_features_in_ == 57, f"FATAL: Regressor expects {reg.n_features_in_} features instead of 57."
    assert scaler.n_features_in_ == 57, f"FATAL: Scaler expects {scaler.n_features_in_} features instead of 57."
