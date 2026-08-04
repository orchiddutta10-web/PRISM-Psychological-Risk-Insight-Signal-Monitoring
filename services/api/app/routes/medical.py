"""
Medical AI Healthcare Assistant routes.

Guardian-facing RAG chat (guardian JWT) plus guardian-admin-only KB
management (ingest/upload). All endpoints audit their access via
audit.log_audit_event and require JWT auth (AGENTS.md).
"""
import os
import shutil
import uuid
import logging

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

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/medical", tags=["medical"])


class MedicalChatRequest(BaseModel):
    prompt: str
    # Module 5 context fusion: optional device + previous turns so the answer
    # can weave in typing-behavior screening signals and conversation history.
    device_id: str | None = None
    history: list[dict] | None = None


class MedicalChatResponse(BaseModel):
    answer: str
    evidence: list[dict]
    sources: list[str]
    confidence: float
    disclaimer: str
    crisis: bool
    # Module 5: the fused context sources that informed the answer
    # (profile, behavioral screening scores, typing drivers).
    context: dict = {}


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
        "formats": stats.get("formats", {}),
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

    # Module 5: if a device is supplied, verify the guardian owns it before
    # fusing that device's behavioral screening context into the answer.
    if req.device_id:
        auth.verify_guardian_device_access(current_guardian, req.device_id, db)

    audit.log_audit_event(
        db,
        action="READ_MEDICAL_CHAT",
        guardian_id=str(current_guardian.id),
    )

    # Ensure the KB is loaded so kb_stats/vector readiness is meaningful.
    load_medical_documents()

    result = medical_query(
        req.prompt.strip(),
        history=req.history,
        db=db,
        device_id=req.device_id,
    )

    # Module 9: store the session turn (user prompt + assistant answer) so the
    # dashboard's "conversation history" panel and future trend analysis can
    # reference it. Persisted under the guardian's account, never teen content.
    try:
        user_msg = models.ChatMessage(
            guardian_id=str(current_guardian.id),
            sender="guardian",
            aria_utterance=req.prompt.strip()[:2000],
        )
        db.add(user_msg)
        if result.get("answer"):
            assistant_msg = models.ChatMessage(
                guardian_id=str(current_guardian.id),
                sender="aria",
                aria_utterance=str(result["answer"])[:4000],
            )
            db.add(assistant_msg)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Failed to persist medical chat session")

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
    """
    Uploads a knowledge-base document (PDF, DOCX, TXT, Markdown) into the KB
    folder and rebuilds the vectorstore. Admin only.
    """
    from app.utils.medical_rag import SUPPORTED_EXTENSIONS

    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required.")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported format '{ext}'. Supported: "
                + ", ".join(SUPPORTED_EXTENSIONS)
            ),
        )

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
