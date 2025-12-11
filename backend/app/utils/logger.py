"""Centralized logging configuration for the backend."""

import logging
import uuid
from contextvars import ContextVar

# Context variable for request correlation
request_id_ctx: ContextVar[str] = ContextVar('request_id', default='no-request')

# Configure logging format
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s.%(msecs)03d [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

# Main logger
logger = logging.getLogger("MDLH")


def generate_request_id() -> str:
    """Generate a unique request ID for correlation."""
    return str(uuid.uuid4())[:8]


def get_request_id() -> str:
    """Get the current request ID from context."""
    return request_id_ctx.get()


def set_request_id(request_id: str) -> None:
    """Set the current request ID in context."""
    request_id_ctx.set(request_id)


class RequestLogger:
    """Logger with request ID correlation."""
    
    def __init__(self, base_logger: logging.Logger):
        self._logger = base_logger
    
    def _format(self, message: str) -> str:
        req_id = get_request_id()
        if req_id != 'no-request':
            return f"[{req_id}] {message}"
        return message
    
    def debug(self, message: str, *args, **kwargs):
        self._logger.debug(self._format(message), *args, **kwargs)
    
    def info(self, message: str, *args, **kwargs):
        self._logger.info(self._format(message), *args, **kwargs)
    
    def warning(self, message: str, *args, **kwargs):
        self._logger.warning(self._format(message), *args, **kwargs)
    
    def error(self, message: str, *args, **kwargs):
        self._logger.error(self._format(message), *args, **kwargs)
    
    def exception(self, message: str, *args, **kwargs):
        self._logger.exception(self._format(message), *args, **kwargs)


# Create request-aware loggers
request_logger = RequestLogger(logger)


def get_logger(name: str) -> RequestLogger:
    """Get a request-aware logger with the given name."""
    base = logging.getLogger(name)
    return RequestLogger(base)

