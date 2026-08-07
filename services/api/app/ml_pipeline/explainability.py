import shap
import pandas as pd
import numpy as np

class ExplainabilityEngine:
    """
    SHAP-based Explainable AI (XAI) engine for generating clinical and guardian-friendly insights.
    """
    def __init__(self, model, background_data: pd.DataFrame):
        self.model = model
        # Use TreeExplainer for XGBoost/RandomForest
        self.explainer = shap.TreeExplainer(self.model, background_data)
        
    def generate_explanations(self, instance: pd.DataFrame, top_k: int = 3) -> dict:
        """
        Computes SHAP values for a single prediction and translates them into natural language.
        """
        shap_values = self.explainer.shap_values(instance)
        
        # For binary classification XGBoost, shap_values is a single array per instance
        if isinstance(shap_values, list):
            shap_values = shap_values[1] # Take positive class
            
        instance_shap = shap_values[0]
        feature_names = instance.columns.tolist()
        
        # Sort features by absolute impact
        feature_impacts = [(name, val) for name, val in zip(feature_names, instance_shap)]
        feature_impacts.sort(key=lambda x: abs(x[1]), reverse=True)
        
        top_factors = feature_impacts[:top_k]
        
        # Translate to plain English
        plain_language = []
        for name, impact in top_factors:
            direction = "increased" if impact > 0 else "decreased"
            val = instance[name].iloc[0]
            
            # Map technical feature names to readable strings
            readable_name = name.replace("_", " ").title()
            
            if "Sleep" in readable_name:
                plain_language.append(f"Significant {direction} risk due to recent sleep patterns (Value: {val:.1f}).")
            elif "Variance" in readable_name:
                plain_language.append(f"High volatility in {readable_name.lower().replace('variance', 'routine')} detected.")
            else:
                plain_language.append(f"Unusual {readable_name.lower()} contributed to this score.")
                
        return {
            "raw_shap_values": {k: float(v) for k, v in feature_impacts},
            "top_factors_english": plain_language
        }
