"""FastAPI application entry point."""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
import uvicorn
import time
import uuid
from datetime import datetime

from app.config import settings

# =============================================================================
# SERVER INSTANCE ID
# =============================================================================
# This ID changes every time the backend process restarts.
# Frontend uses this to detect backend restarts and clear stale sessions.
SERVER_INSTANCE_ID = str(uuid.uuid4())
SERVER_START_TIME = datetime.utcnow().isoformat() + "Z"
from app.routers import connection_router, metadata_router, query_router
from app.routers.system import router as system_router
from app.utils.logger import logger, generate_request_id, set_request_id


class TimingMiddleware(BaseHTTPMiddleware):
    """Middleware to log request timing with detailed information and request ID correlation."""
    
    async def dispatch(self, request: Request, call_next):
        # Skip OPTIONS (preflight) requests for cleaner logs
        if request.method == "OPTIONS":
            return await call_next(request)
        
        # Generate unique request ID for correlation
        request_id = generate_request_id()
        set_request_id(request_id)
        
        start_time = time.perf_counter()
        
        # Get session ID if present
        session_id = request.headers.get("X-Session-ID", "no-session")
        if session_id != "no-session":
            session_id = session_id[:8] + "..."
        
        # Log request start
        logger.info(f"[{request_id}] → {request.method} {request.url.path} [session: {session_id}]")
        
        # Process request
        response = await call_next(request)
        
        # Calculate timing
        end_time = time.perf_counter()
        duration_ms = (end_time - start_time) * 1000
        
        # Log response with timing
        status_emoji = "✓" if response.status_code < 400 else "✗"
        logger.info(
            f"[{request_id}] ← {status_emoji} {request.method} {request.url.path} "
            f"[{response.status_code}] {duration_ms:.2f}ms"
        )
        
        # Add headers to response for correlation
        response.headers["X-Response-Time"] = f"{duration_ms:.2f}ms"
        response.headers["X-Request-ID"] = request_id
        
        return response


# Create FastAPI app
app = FastAPI(
    title="Snowflake Query API",
    description="Backend API for MDLH Dictionary Snowflake query execution",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Add timing middleware FIRST (outermost)
app.add_middleware(TimingMiddleware)

# Configure CORS for frontend
# Uses environment variable CORS_ORIGINS for production deployments
# Default: "*" for development (allows any origin)
# Note: When using "*", allow_credentials must be False
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=not settings.cors_allow_all,  # Can't use credentials with wildcard
    allow_methods=["*"],  # Allow all methods for flexibility
    allow_headers=["*"],  # Allow all headers for flexibility
    expose_headers=["X-Response-Time", "X-Request-ID"],  # Headers frontend can read
    max_age=600,  # Preflight cache: 10 minutes
)

# Include routers
app.include_router(connection_router)
app.include_router(metadata_router)
app.include_router(query_router)
app.include_router(system_router)


@app.get("/")
async def root():
    """Root endpoint with API info."""
    return {
        "name": "Snowflake Query API",
        "version": "1.0.0",
        "docs": "/docs",
        "endpoints": {
            "connection": "/api/connect",
            "metadata": "/api/metadata/*",
            "query": "/api/query/*"
        }
    }


@app.get("/health")
async def health_check():
    """
    Health check endpoint.
    
    Returns the server instance ID which changes on every backend restart.
    Frontend uses this to detect restarts and clear stale sessions.
    """
    return {
        "status": "healthy",
        "serverInstanceId": SERVER_INSTANCE_ID,
        "startedAt": SERVER_START_TIME,
    }


def start():
    """Start the server programmatically."""
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug
    )


if __name__ == "__main__":
    start()

