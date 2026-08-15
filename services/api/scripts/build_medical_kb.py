"""
Build the PRISM Medical KB demo corpus.

Writes a small set of public-health-style fact sheets (general health
education content, non-diagnostic) as plain-text files into MEDICAL_KB_DIR,
then triggers the RAG ingest pipeline so the vector store is ready for
first use.

Usage (from services/api):
    python scripts/build_medical_kb.py

The content is educational general-health information written in the style
of public health agencies — NOT official WHO/NIH/CDC documents. It is
bundled so the RAG assistant works out of the box; guardians may replace
these with real guideline PDFs anytime via the /medical/kb/upload endpoint.
"""
import os
import sys

# Ensure the app package is importable when run from services/api
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import settings  # noqa: E402

DEMO_DOCS = {
    "prism_fever_and_flu.txt": {
        "title": "Fever, Flu & Common Colds — Home Care Basics",
        "body": [
            "A fever is a temporary rise in body temperature, usually a sign the "
            "immune system is fighting an infection. Most fevers in otherwise "
            "healthy people are not dangerous and resolve within a few days.",
            "Home care for a mild fever: rest, drink plenty of fluids, and wear "
            "light clothing. Over-the-counter fever reducers (acetaminophen or "
            "ibuprofen) can help comfort, but always follow dosing instructions "
            "and consult a pharmacist or doctor for children under a certain age.",
            "When to seek medical care: fever lasting more than three days, fever "
            "above 39.4°C (103°F) that does not respond to medication, fever with "
            "a severe headache, stiff neck, rash, difficulty breathing, confusion, "
            "or persistent vomiting, or fever in an infant under 3 months of age.",
            "Flu (influenza) symptoms include fever, chills, cough, sore throat, "
            "runny nose, muscle aches, headache, and fatigue. Rest, fluids, and "
            "over-the-counter symptom relief are the mainstay. Annual flu "
            "vaccination is recommended for most people aged 6 months and older.",
            "Antibiotics treat bacterial infections, not viruses like the flu or "
            "common cold. Using antibiotics for viral illness contributes to "
            "antimicrobial resistance and does not help recovery.",
        ],
    },
    "prism_first_aid_basics.txt": {
        "title": "First Aid Basics for Common Injuries",
        "body": [
            "First aid is the immediate care given to an injured or ill person "
            "before professional medical help arrives. The priority is always "
            "personal safety: check the scene, then the person.",
            "Bleeding: apply firm, direct pressure with a clean cloth or dressing. "
            "Do not remove an embedded object. Elevate the injured area if "
            "possible. Seek emergency care for severe bleeding that soaks through "
            "dressings, or bleeding from the neck, chest, abdomen, or a major "
            "artery.",
            "Burns: cool the burn with running water for 10–20 minutes. Do not "
            "apply ice, butter, or toothpaste. Cover with a clean, non-stick "
            "dressing. Seek medical care for burns larger than the person's palm, "
            "burns on the face, hands, feet, joints, or genitals, or chemical and "
            "electrical burns.",
            "Choking: encourage the person to cough. For a conscious adult or "
            "child over one year, perform abdominal thrusts (Heimlich maneuver) "
            "until the object is expelled. Call emergency services if the person "
            "cannot breathe, speak, or becomes unconscious.",
            "Unconsciousness: call emergency services immediately. Check "
            "breathing; if absent or abnormal, begin CPR (30 chest compressions "
            "followed by 2 rescue breaths) if trained, and continue until help "
            "arrives or an AED is available.",
        ],
    },
    "prism_stress_and_sleep.txt": {
        "title": "Stress, Anxiety & Sleep — Everyday Coping",
        "body": [
            "Stress is a normal response to demands or threats. Short-term stress "
            "can improve focus, but chronic stress is associated with sleep "
            "disturbance, irritability, difficulty concentrating, and physical "
            "symptoms like tension headaches.",
            "Everyday coping: regular physical activity, consistent sleep and wake "
            "times, limiting caffeine and screen time in the evening, deep-breathing "
            "exercises, and talking with trusted people all help regulate stress.",
            "Sleep hygiene: aim for 7–9 hours for adults and 8–10 hours for "
            "teenagers. A cool, dark, quiet bedroom, a regular wind-down routine, "
            "and avoiding large meals and screens close to bedtime improve sleep "
            "quality.",
            "Anxiety involves persistent worry that is out of proportion to the "
            "situation and interferes with daily life. Common signs include "
            "restlessness, fatigue, racing thoughts, muscle tension, and sleep "
            "problems. When anxiety significantly affects school, work, or "
            "relationships, speaking with a healthcare provider or counselor is "
            "recommended.",
            "If you or someone you know is in crisis or having thoughts of "
            "self-harm, contact emergency services or a crisis line immediately. "
            "You do not have to cope alone.",
        ],
    },
    "prism_healthy_lifestyle.txt": {
        "title": "Healthy Eating, Activity & Hydration",
        "body": [
            "A balanced diet includes a variety of vegetables, fruits, whole "
            "grains, lean proteins, and healthy fats, with limited added sugars, "
            "salt, and highly processed foods. There is no single 'superfood'; "
            "overall dietary pattern matters most.",
            "Physical activity: adults should aim for at least 150 minutes of "
            "moderate-intensity aerobic activity per week, plus muscle-strengthening "
            "activities twice weekly. Children and teens should be active for at "
            "least 60 minutes daily.",
            "Hydration: water is the best choice for most people. Daily fluid needs "
            "vary with age, climate, and activity. Signs of dehydration include "
            "dark urine, dry mouth, fatigue, dizziness, and headache.",
            "Weight management is about sustainable habits rather than fad diets. "
            "Gradual changes — smaller portions, more vegetables, regular movement, "
            "and adequate sleep — are more likely to be maintained over time.",
            "Consult a healthcare provider before starting a significantly new "
            "exercise program, especially with existing medical conditions, and "
            "seek guidance from a dietitian for personalized nutrition advice.",
        ],
    },
}

DISCLAIMER = (
    "PRISM Medical Knowledge Base — Demo Corpus.\n"
    "This document contains general health education content written in the "
    "style of public health agencies. It is for informational purposes only "
    "and is not a substitute for professional medical advice, diagnosis, or "
    "treatment. Always consult a qualified healthcare provider for medical "
    "questions, and call emergency services in an emergency."
)


def build_demo_corpus(kb_dir: str) -> int:
    """Writes the demo fact sheets as .txt files. Returns count written."""
    os.makedirs(kb_dir, exist_ok=True)
    written = 0
    for filename, doc in DEMO_DOCS.items():
        path = os.path.join(kb_dir, filename)
        if os.path.exists(path):
            continue
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(doc["title"] + "\n\n")
            fh.write("\n\n".join(doc["body"]))
            fh.write("\n\n" + DISCLAIMER + "\n")
        written += 1
        print(f"  wrote {filename}")
    return written


def main():
    kb_dir = settings.MEDICAL_KB_DIR
    print(f"Building demo medical KB in {os.path.abspath(kb_dir)} ...")
    written = build_demo_corpus(kb_dir)
    print(f"{written} fact sheets written.")

    print("Ingesting into vector store ...")
    from app.utils.medical_rag import rebuild_kb

    stats = rebuild_kb()
    print(f"Done. KB stats: {stats}")


if __name__ == "__main__":
    main()
