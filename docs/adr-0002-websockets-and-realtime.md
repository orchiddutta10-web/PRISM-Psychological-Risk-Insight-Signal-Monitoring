# ADR 0002 — WebSockets & Real-time Delivery

Status: Accepted
Date: 2026-07-19

Context
- Real-time alerts and chat require WebSocket support in the API and a pub/sub backing (Redis used locally).

Decision
- Use FastAPI WebSocket endpoints backed by Redis pub/sub for broadcast.
- In production, run `uvicorn` with `[standard]` extras or use an ASGI server that bundles `wsproto`/`websockets` to avoid runtime warnings.
- Add `websockets` to the core service requirements to ensure compatibility.

Consequences
- WebSocket capabilities are available for guardian real-time updates.
- Local dev must mirror this with either installing `uvicorn[standard]` or running in Docker with the proper extras.

Rationale
- Avoid runtime 404s and warnings when clients attempt an upgrade to WebSocket.

