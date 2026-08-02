"""
Medical AI Healthcare Assistant routes.

Guardian-facing RAG chat (guardian JWT) plus guardian-admin-only KB
management (ingest/upload). All endpoints audit their access via
audit.log_audit_event and require JWT auth (AGENTS.md).
"""
import os
import shutil
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.database import get_db
from app.utils import audit, auth
from app.utils.medical_rag import (
    kb_stats,
    medical_query,
    rebuild_kb,
    load_medical_documents,
)
from app.utils.llm_provider import MEDICAL_DISCLAIMER

router = APIRouter(prefix="/api/v1/medical", tags=["medical"])


class MedicalChatRequest(BaseModel):
    prompt: str


class MedicalChatResponse(BaseModel):
    answer: str
    evidence: list[dict]
    sources: list[str]
    confidence: float
    disclaimer: str
    crisis: bool


@router.get("/status")
def get_status(
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(auth.get_current_user),
):
    """Returns RAG pipeline status (enabled, provider, KB size, vector ready)."""
    audit.log_audit_event(
        db,
        action="READ_MEDICAL_STATUS",
        guardian_id=str(current_guardian.id),
    )
    stats = kb_stats()
    return {
        "enabled": settings.MEDICAL_RAG_ENABLED,
        "provider": settings.MEDICAL_LLM_PROVIDER,
        "model": settings.OPENAI_MODEL
        if settings.MEDICAL_LLM_PROVIDER == "openai"
        else settings.OLLAMA_MODEL,
        "docs": stats["docs"],
        "chunks": stats["chunks"],
        "vector_ready": stats["vector_ready"],
    }


@router.post("/chat", response_model=MedicalChatResponse)
def chat(
    req: MedicalChatRequest,
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(auth.get_current_user),
):
    """Answers a guardian's medical question via RAG with citations."""
    if not req.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt cannot be empty.")

    audit.log_audit_event(
        db,
        action="READ_MEDICAL_CHAT",
        guardian_id=str(current_guardian.id),
    )

    if not settings.MEDICAL_RAG_ENABLED:
        return MedicalChatResponse(
            answer=(
                "The medical assistant is not currently enabled. A guardian "
                "administrator needs to enable the medical RAG feature "
                "(MEDICAL_RAG_ENABLED=true) before health questions can be "
                "answered. "
            ) + MEDICAL_DISCLAIMER,
            evidence=[],
            sources=[],
            confidence=0.0,
            disclaimer=MEDICAL_DISCLAIMER,
            crisis=False,
        )

    # Ensure the KB is loaded so kb_stats/vector readiness is meaningful.
    load_medical_documents()

    result = medical_query(req.prompt.strip())
    return MedicalChatResponse(**result)


@router.post("/ingest")
def ingest_kb(
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(
        auth.RoleChecker(["guardian-admin", "ops"])
    ),
):
    """Rebuilds the vector store from MEDICAL_KB_DIR. Guardian-admin only."""
    stats = rebuild_kb()
    audit.log_audit_event(
        db,
        action="WRITE_MEDICAL_KB_INGEST",
        guardian_id=str(current_guardian.id),
    )
    return {"status": "ingested", **stats}


@router.post("/kb/upload")
async def upload_pdf(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(
        auth.RoleChecker(["guardian-admin", "ops"])
    ),
):
    """Uploads a medical PDF into the KB folder and rebuilds. Admin only."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed.")

    os.makedirs(settings.MEDICAL_KB_DIR, exist_ok=True)
    safe_name = f"{uuid.uuid4().hex[:8]}_{os.path.basename(file.filename)}"
    dest = os.path.join(settings.MEDICAL_KB_DIR, safe_name)
    try:
        with open(dest, "wb") as fh:
            shutil.copyfileobj(file.file, fh)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

    stats = rebuild_kb()
    audit.log_audit_event(
        db,
        action="WRITE_MEDICAL_KB_UPLOAD",
        guardian_id=str(current_guardian.id),
    )
    return {"status": "uploaded", "file": safe_name, **stats}
