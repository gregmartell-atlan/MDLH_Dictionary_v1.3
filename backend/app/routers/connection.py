"""Connection management endpoints with session support."""

from fastapi import APIRouter, Header, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, Dict
import snowflake.connector
from snowflake.connector.errors import DatabaseError, OperationalError, ProgrammingError
from app.services.session import session_manager
from app.utils.logger import logger
import time
from collections import defaultdict
import threading

router = APIRouter(prefix="/api", tags=["connection"])

# =============================================================================
# Rate Limiting (Simple in-memory implementation)
# =============================================================================

class RateLimiter:
    """
    Simple in-memory rate limiter with sliding window.
    Limits: 5 connection attempts per minute per IP.
    """
    
    def __init__(self, max_attempts: int = 5, window_seconds: int = 60):
        self._attempts: Dict[str, list] = defaultdict(list)
        self._lock = threading.Lock()
        self._max_attempts = max_attempts
        self._window_seconds = window_seconds
    
    def is_allowed(self, client_ip: str) -> tuple[bool, int]:
        """
        Check if a request is allowed.
        Returns (allowed, seconds_until_reset).
        """
        now = time.time()
        
        with self._lock:
            # Clean old entries
            self._attempts[client_ip] = [
                t for t in self._attempts[client_ip] 
                if now - t < self._window_seconds
            ]
            
            if len(self._attempts[client_ip]) >= self._max_attempts:
                oldest = self._attempts[client_ip][0]
                seconds_until_reset = int(self._window_seconds - (now - oldest)) + 1
                return False, seconds_until_reset
            
            # Record this attempt
            self._attempts[client_ip].append(now)
            return True, 0
    
    def get_remaining(self, client_ip: str) -> int:
        """Get remaining attempts for this IP."""
        now = time.time()
        with self._lock:
            recent = [t for t in self._attempts.get(client_ip, []) if now - t < self._window_seconds]
            return max(0, self._max_attempts - len(recent))


# Global rate limiter instance
connect_rate_limiter = RateLimiter(max_attempts=5, window_seconds=60)


class ConnectionRequest(BaseModel):
    """Connection request with credentials."""
    account: str
    user: str
    token: Optional[str] = None
    auth_type: str = "token"
    warehouse: str = "COMPUTE_WH"
    database: str = "ATLAN_MDLH"
    schema_name: str = "PUBLIC"
    role: Optional[str] = None


class ConnectionResponse(BaseModel):
    """Connection response with session ID."""
    connected: bool
    session_id: Optional[str] = None
    user: Optional[str] = None
    warehouse: Optional[str] = None
    database: Optional[str] = None
    role: Optional[str] = None
    error: Optional[str] = None


class SessionStatusResponse(BaseModel):
    """Session status response."""
    valid: bool
    user: Optional[str] = None
    warehouse: Optional[str] = None
    database: Optional[str] = None
    schema_name: Optional[str] = None
    role: Optional[str] = None
    query_count: Optional[int] = None
    idle_seconds: Optional[float] = None
    message: Optional[str] = None


class DisconnectResponse(BaseModel):
    """Disconnect response."""
    disconnected: bool
    message: str


def _get_client_ip(request: Request) -> str:
    """Extract client IP from request, handling proxies."""
    # Check for forwarded header (behind proxy/load balancer)
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip
    
    # Fallback to direct client IP
    return request.client.host if request.client else "unknown"


@router.post("/connect", response_model=ConnectionResponse)
async def connect(request: ConnectionRequest, http_request: Request):
    """
    Establish Snowflake connection and return session ID.
    
    Rate limited to 5 attempts per minute per IP address.
    """
    # Rate limiting check
    client_ip = _get_client_ip(http_request)
    allowed, retry_after = connect_rate_limiter.is_allowed(client_ip)
    
    if not allowed:
        logger.warning(f"[Connect] Rate limit exceeded for {client_ip}")
        return JSONResponse(
            status_code=429,
            content={
                "connected": False,
                "error": f"Too many connection attempts. Try again in {retry_after} seconds.",
                "reason": "RATE_LIMITED",
                "retry_after": retry_after
            },
            headers={"Retry-After": str(retry_after)}
        )
    
    try:
        connect_params = {
            "account": request.account,
            "user": request.user,
            "warehouse": request.warehouse,
            "database": request.database,
            "schema": request.schema_name,
            # Keep session alive to prevent silent disconnects
            "client_session_keep_alive": True,
            # Network timeout for connection operations
            "network_timeout": 10,
        }
        
        if request.role:
            connect_params["role"] = request.role
        
        if request.auth_type == "sso":
            connect_params["authenticator"] = "externalbrowser"
        elif request.auth_type == "token":
            if not request.token:
                return ConnectionResponse(
                    connected=False,
                    error="Personal Access Token required"
                )
            connect_params["token"] = request.token
            connect_params["authenticator"] = "oauth"
        else:
            return ConnectionResponse(
                connected=False,
                error=f"Unknown auth_type: {request.auth_type}"
            )
        
        logger.info(f"[Connect] {request.auth_type} auth for {request.user}@{request.account}")
        conn = snowflake.connector.connect(**connect_params)
        
        cursor = conn.cursor()
        cursor.execute("SELECT CURRENT_USER(), CURRENT_ROLE(), CURRENT_WAREHOUSE()")
        row = cursor.fetchone()
        cursor.close()
        
        session_id = session_manager.create_session(
            conn=conn,
            user=row[0],
            account=request.account,
            warehouse=row[2],
            database=request.database,
            schema=request.schema_name,
            role=row[1]
        )
        
        logger.info(f"[Connect] Session {session_id[:8]}... created for {row[0]}")
        
        return ConnectionResponse(
            connected=True,
            session_id=session_id,
            user=row[0],
            warehouse=row[2],
            database=request.database,
            role=row[1]
        )
        
    except DatabaseError as e:
        # Authentication errors -> 401
        error_msg = str(e)
        if "authentication" in error_msg.lower() or "password" in error_msg.lower() or "token" in error_msg.lower():
            logger.warning(f"[Connect] Auth failed: {e}")
            return JSONResponse(
                status_code=401,
                content={"connected": False, "error": "Authentication failed"}
            )
        # Other database errors -> return as is
        logger.error(f"[Connect] Database error: {e}")
        return ConnectionResponse(connected=False, error=str(e))
    except (OperationalError, TimeoutError) as e:
        # Network/timeout errors -> 503
        logger.error(f"[Connect] Network/timeout error: {e}")
        return JSONResponse(
            status_code=503,
            content={"connected": False, "error": "Snowflake connection timed out or unreachable"}
        )
    except Exception as e:
        logger.exception(f"[Connect] Unexpected error: {e}")
        return JSONResponse(
            status_code=500,
            content={"connected": False, "error": "Internal error while connecting"}
        )


@router.get("/session/status")
async def get_session_status(
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID")
):
    """
    Check if a session is still valid.
    
    Response codes:
    - 200 { valid: true, ... } -> session good
    - 401 { valid: false, reason: "SESSION_NOT_FOUND" } -> session unknown (e.g., backend restarted)
    - 401 { valid: false, reason: "auth-error" } -> session truly dead (Snowflake rejected)
    - 503 { valid: true, reason: "snowflake-unreachable" } -> backend/Snowflake unreachable
    
    Frontend should treat 401 as "please reconnect" and 503 as "try again later".
    """
    if not x_session_id:
        logger.debug("[SessionStatus] No session ID provided")
        return JSONResponse(
            status_code=401,
            content={"valid": False, "reason": "NO_SESSION_ID", "message": "No session ID provided"}
        )
    
    session = session_manager.get_session(x_session_id)
    if session is None:
        # This is the key case: frontend has a stale session ID (e.g., backend restarted)
        # Return 401 with a clear reason so frontend knows to prompt for reconnect
        logger.info(f"[SessionStatus] Session {x_session_id[:8]}... not found (backend may have restarted)")
        return JSONResponse(
            status_code=401,
            content={"valid": False, "reason": "SESSION_NOT_FOUND", "message": "Session not found - please reconnect"}
        )
    
    # Perform a quick health check to verify Snowflake is reachable
    try:
        cursor = session.conn.cursor()
        cursor.execute("SELECT 1")
        cursor.fetchone()
        cursor.close()
    except (DatabaseError, ProgrammingError) as e:
        error_msg = str(e).lower()
        # Check if it's an auth error (session actually invalid)
        if "authentication" in error_msg or "session" in error_msg or "token" in error_msg:
            logger.warning(f"[SessionStatus] Session {x_session_id[:8]}... auth invalid: {e}")
            session_manager.remove_session(x_session_id)
            return JSONResponse(
                status_code=401,
                content={"valid": False, "reason": "auth-error", "message": str(e)}
            )
        # Otherwise it's a network/Snowflake issue -> 503
        logger.warning(f"[SessionStatus] Snowflake unreachable for session {x_session_id[:8]}...: {e}")
        return JSONResponse(
            status_code=503,
            content={"valid": True, "reason": "snowflake-unreachable", "message": "Snowflake health check failed"}
        )
    except (OperationalError, TimeoutError) as e:
        # Network errors -> 503, session may still be valid
        logger.warning(f"[SessionStatus] Network error for session {x_session_id[:8]}...: {e}")
        return JSONResponse(
            status_code=503,
            content={"valid": True, "reason": "snowflake-unreachable", "message": "Network timeout"}
        )
    except Exception as e:
        logger.error(f"[SessionStatus] Unexpected error for session {x_session_id[:8]}...: {e}")
        return JSONResponse(
            status_code=503,
            content={"valid": True, "reason": "status-check-error", "message": str(e)}
        )
    
    from datetime import datetime
    idle = (datetime.utcnow() - session.last_used).total_seconds()
    
    return SessionStatusResponse(
        valid=True,
        user=session.user,
        warehouse=session.warehouse,
        database=session.database,
        schema_name=session.schema,
        role=session.role,
        query_count=session.query_count,
        idle_seconds=idle
    )


@router.post("/disconnect", response_model=DisconnectResponse)
async def disconnect(
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID")
):
    """Close session and release Snowflake connection."""
    if not x_session_id:
        return DisconnectResponse(disconnected=False, message="No session ID provided")
    
    removed = session_manager.remove_session(x_session_id)
    if removed:
        return DisconnectResponse(disconnected=True, message="Session closed")
    return DisconnectResponse(disconnected=False, message="Session not found")


@router.get("/sessions")
async def list_sessions():
    """Debug: list active sessions. Secure in production!"""
    return session_manager.get_stats()


@router.get("/health")
async def health():
    """Health check."""
    stats = session_manager.get_stats()
    return {"status": "healthy", "active_sessions": stats["active_sessions"]}
