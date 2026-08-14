import sys
import os

# Ensure app can be imported
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import ChildDevice
from app.ml_pipeline.feature_store import FeatureStore
from app.ml_pipeline.training import ModelTrainingPipeline
from app.ml_pipeline.explainability import ExplainabilityEngine
import pandas as pd


def main():
    print("Starting ML Pipeline Execution...")
    db = SessionLocal()

    try:
        devices = db.query(ChildDevice).all()
        device_ids = [d.id for d in devices]

        if not device_ids:
            print("No devices found in DB. Run the demo server once to seed data.")
            return

        print(f"Found {len(device_ids)} devices. Generating features...")
        fs = FeatureStore(db)
        df = fs.generate_training_dataset(device_ids)

        print(f"Generated dataset with {len(df)} rows.")
        if df.empty:
            print("Dataset is empty. Exiting.")
            return

        print("Starting MLflow training pipeline...")
        pipeline = ModelTrainingPipeline()

        # Train Anomaly Detector
        features = [
            "avg_active_mins_14d",
            "avg_sleep_hours_14d",
            "sleep_variance_14d",
            "active_variance_14d",
            "unlock_frequency_3d",
            "avg_hr_24h",
            "hr_variance_24h",
        ]

        if_model = pipeline.train_anomaly_detector(df, features)

        # Train Risk Classifier
        if df["is_anomalous"].nunique() > 1:
            xgb_model = pipeline.train_risk_classifier(df, features, "is_anomalous")

            print("Generating explanations for a sample anomaly...")
            # Pick one anomaly
            anomalies = df[df["is_anomalous"] == 1]
            if not anomalies.empty:
                sample = anomalies[features].iloc[[0]]
                explainer = ExplainabilityEngine(xgb_model, df[features])
                exp = explainer.generate_explanations(sample)
                print("\n--- SHAP Explainability Output ---")
                for text in exp["top_factors_english"]:
                    print("- " + text)
                print("----------------------------------\n")

                print("Running Phase 9: AI Companion RAG Simulation...")
                from app.ml_pipeline.rag_companion import RAGCompanionEngine

                companion = RAGCompanionEngine()

                context = {
                    "name": "Sarah",
                    "teen_name": "Sophia",
                    "teen_age": 14,
                    "preferences": "Prefers gentle, non-clinical explanations.",
                }
                # Simulate a question from a guardian based on the anomaly
                q = "I noticed Sophia has been in her room a lot this weekend and slept really late. Is this normal?"
                response = companion.generate_response(
                    q, sample.to_dict(orient="records")[0], context
                )

                print("--- Guardian Prompt ---")
                print(f'"{q}"\n')
                print("--- AI Companion Output ---")
                print(response)
                print("---------------------------\n")

        else:
            print(
                "Not enough variance in target label to train XGBoost classifier. All data points belong to one class."
            )

    finally:
        db.close()


if __name__ == "__main__":
    main()
