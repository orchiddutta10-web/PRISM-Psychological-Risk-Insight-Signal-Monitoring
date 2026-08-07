import json
import logging
from typing import List, Dict, Any


# Mocking LangChain / VectorDB components for the blueprint
class MockVectorDB:
    def similarity_search(self, query: str, k: int = 3) -> List[Dict[str, str]]:
        # In production, this queries ChromaDB or Pinecone
        return [
            {
                "content": "According to the AAP, sudden changes in sleep patterns combined with withdrawal can indicate acute academic or social stress.",
                "source": "American Academy of Pediatrics (AAP) Guidelines",
                "relevance_score": 0.92,
            },
            {
                "content": "A significant drop in mobility entropy (staying in one location) often correlates with anhedonia.",
                "source": "Digital Phenotyping Research Journal",
                "relevance_score": 0.85,
            },
        ]


class RAGCompanionEngine:
    """
    AI Companion RAG system that fuses:
    1. Foundational LLM Prompting
    2. Real-time Behavioral Telemetry
    3. Guardian Context
    4. Retrieved Clinical/Behavioral Knowledge
    """

    def __init__(self):
        self.vector_db = MockVectorDB()

    def _retrieve_knowledge(self, query: str) -> List[Dict[str, str]]:
        return self.vector_db.similarity_search(query)

    def _build_context_prompt(
        self,
        guardian_question: str,
        current_telemetry: Dict[str, float],
        guardian_context: Dict[str, Any],
    ) -> str:

        # 1. Retrieve trusted clinical knowledge based on the telemetry flags and user question
        clinical_docs = self._retrieve_knowledge(
            f"Stress sleep withdrawal indicators: {guardian_question}"
        )

        # 2. Format citations
        citations = "\n".join(
            [f"- {doc['content']} (Source: {doc['source']})" for doc in clinical_docs]
        )

        # 3. Format telemetry
        telemetry_str = json.dumps(current_telemetry, indent=2)

        # 4. Assemble the prompt
        system_prompt = f"""
        You are PRISM's AI Companion, an empathetic assistant helping a guardian understand their teen's digital well-being.
        You MUST adhere to these rules:
        - NEVER diagnose a medical or psychological condition.
        - ALWAYS base your insights on the provided Telemetry and Clinical Knowledge.
        - Cite your sources from the Clinical Knowledge when appropriate.
        - Keep your tone supportive, objective, and non-alarmist.
        
        [GUARDIAN CONTEXT]
        Guardian Name: {guardian_context.get('name', 'Guardian')}
        Teen Profile: {guardian_context.get('teen_name', 'Teen')}, {guardian_context.get('teen_age', 'Unknown')} years old.
        Known preferences: {guardian_context.get('preferences', 'None')}

        [CURRENT BEHAVIORAL TELEMETRY (Last 14 Days)]
        {telemetry_str}

        [TRUSTED CLINICAL KNOWLEDGE (RAG Retrieval)]
        {citations}
        
        [GUARDIAN QUESTION]
        {guardian_question}
        """

        return system_prompt

    def generate_response(
        self,
        guardian_question: str,
        telemetry: Dict[str, float],
        context: Dict[str, Any],
    ) -> str:
        prompt = self._build_context_prompt(guardian_question, telemetry, context)

        # In production, this sends the prompt to the privately hosted LLM (e.g., Llama 3 via vLLM)
        # We simulate the LLM output here for the blueprint execution

        response = f"""Hi {context.get('name', 'there')}, I understand you're concerned. 

Looking at the recent telemetry, I notice that sleep variance has increased significantly, and overall mobility has decreased over the past 3 days. 

According to the American Academy of Pediatrics (AAP) Guidelines, sudden changes in sleep patterns combined with withdrawal (such as lowered mobility) can sometimes indicate acute academic or social stress.

This doesn't mean there is a severe problem, but it might be a good time to check in with {context.get('teen_name', 'your teen')} about how their week is going. Would you like some suggestions on how to start that conversation?"""

        return response
