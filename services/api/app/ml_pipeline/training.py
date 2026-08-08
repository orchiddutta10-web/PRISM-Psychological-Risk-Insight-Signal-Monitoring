import os

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.metrics import classification_report, roc_auc_score
from sklearn.model_selection import GridSearchCV, train_test_split


def _require_mlflow():
    try:
        import mlflow
        import mlflow.sklearn  # noqa: F401
    except ImportError as exc:
        raise ImportError(
            "mlflow is required for ModelTrainingPipeline. "
            "Install with: pip install mlflow"
        ) from exc
    return mlflow


def _require_xgboost():
    try:
        import xgboost as xgb
    except ImportError as exc:
        raise ImportError(
            "xgboost is required for supervised risk training. "
            "Install with: pip install xgboost"
        ) from exc
    return xgb


MLFLOW_TRACKING_URI = os.getenv("MLFLOW_TRACKING_URI", "sqlite:///mlflow.db")


class ModelTrainingPipeline:
    def __init__(self, experiment_name: str = "PRISM_Behavioral_Risk"):
        self.experiment_name = experiment_name
        mlflow = _require_mlflow()
        mlflow.set_tracking_uri(MLFLOW_TRACKING_URI)
        mlflow.set_experiment(self.experiment_name)

    def train_anomaly_detector(self, df: pd.DataFrame, features: list):
        """
        Trains an unsupervised Isolation Forest for personal baseline deviation.
        """
        mlflow = _require_mlflow()
        X = df[features].values

        with mlflow.start_run(run_name="IsolationForest_Anomaly"):
            model = IsolationForest(
                n_estimators=100, contamination=0.05, random_state=42
            )
            model.fit(X)

            scores = model.decision_function(X)
            avg_score = float(np.mean(scores))

            mlflow.log_param("n_estimators", 100)
            mlflow.log_param("contamination", 0.05)
            mlflow.log_metric("avg_decision_score", avg_score)

            mlflow.sklearn.log_model(
                model,
                "isolation_forest_model",
                registered_model_name="PRISM_IF_Anomaly",
            )
            print(f"Logged Isolation Forest model. Avg decision score: {avg_score:.3f}")

        return model

    def train_risk_classifier(self, df: pd.DataFrame, features: list, target: str):
        """
        Trains a supervised XGBoost classifier for specific risk categories.
        """
        mlflow = _require_mlflow()
        xgb = _require_xgboost()

        X = df[features]
        y = df[target]

        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42
        )

        with mlflow.start_run(run_name="XGBoost_Risk_Classifier"):
            param_grid = {
                "max_depth": [3, 5],
                "learning_rate": [0.01, 0.1],
                "n_estimators": [50, 100],
            }

            base_model = xgb.XGBClassifier(
                use_label_encoder=False, eval_metric="logloss"
            )
            grid_search = GridSearchCV(
                estimator=base_model, param_grid=param_grid, cv=3, scoring="roc_auc"
            )

            print("Running hyperparameter tuning...")
            grid_search.fit(X_train, y_train)

            best_model = grid_search.best_estimator_

            preds = best_model.predict(X_test)
            preds_proba = best_model.predict_proba(X_test)[:, 1]
            auc = roc_auc_score(y_test, preds_proba)

            mlflow.log_params(grid_search.best_params_)
            mlflow.log_metric("roc_auc", auc)

            report = classification_report(y_test, preds, output_dict=True)
            mlflow.log_metric("accuracy", report["accuracy"])

            mlflow.xgboost.log_model(
                best_model,
                "xgboost_risk_model",
                registered_model_name="PRISM_XGB_Risk",
            )
            print(
                f"Logged XGBoost Classifier. Best params: {grid_search.best_params_}. AUC: {auc:.3f}"
            )

        return best_model
