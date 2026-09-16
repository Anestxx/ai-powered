import logging
from time import perf_counter
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException
from app.api.router import router
from app.api.workspace import router as workspace_router
from app.api.traffic import router as traffic_router
from app.core.config import get_settings
from app.services.live import manager

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger(__name__)
app = FastAPI(title="Urban Intelligence API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=get_settings().allowed_origins,
                   allow_methods=["GET", "POST", "PATCH"],
                   allow_headers=["Content-Type", "Authorization", "X-Edge-Key"])
app.include_router(router)
app.include_router(workspace_router)
app.include_router(traffic_router)


@app.exception_handler(HTTPException)
async def http_error(request, exc):
    return JSONResponse(status_code=exc.status_code, headers=exc.headers,
                        content={"error": {"code": f"HTTP_{exc.status_code}", "message": str(exc.detail)}})


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    # Do not echo passwords, evidence, or complete input bodies in errors.
    return JSONResponse(status_code=422, content={"error": {"code": "VALIDATION_ERROR",
        "message": "Invalid request", "fields": [{"location": list(e["loc"]), "message": e["msg"]} for e in exc.errors()]}})


@app.exception_handler(Exception)
async def internal_error(request, exc):
    logger.error("Unhandled request error: %s", type(exc).__name__)
    return JSONResponse(status_code=500, content={"error": {"code": "INTERNAL_ERROR", "message": "Internal server error"}})


@app.middleware("http")
async def request_log(request: Request, call_next):
    start = perf_counter()
    response = await call_next(request)
    logger.info("%s %s %s %.3fs", request.method, request.url.path, response.status_code, perf_counter() - start)
    return response


@app.websocket("/ws/events")
async def live_events(socket: WebSocket):
    origin = socket.headers.get("origin")
    if origin and origin not in get_settings().allowed_origins:
        await socket.close(code=1008)
        return
    await socket.accept()
    manager.connections.add(socket)
    try:
        while True:
            await socket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        manager.connections.discard(socket)
