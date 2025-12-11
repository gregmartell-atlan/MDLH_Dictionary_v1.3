"""Pydantic models for API request/response schemas."""

from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Any
from datetime import datetime
from enum import Enum


# ============ Connection Models ============

class ConnectionStatus(BaseModel):
    """Connection status response."""
    connected: bool
    account: Optional[str] = None
    user: Optional[str] = None
    warehouse: Optional[str] = None
    database: Optional[str] = None
    schema_name: Optional[str] = Field(None, alias="schema")
    role: Optional[str] = None
    error: Optional[str] = None


class ConnectionRequest(BaseModel):
    """Request to test/establish connection."""
    warehouse: Optional[str] = None
    database: Optional[str] = None
    schema_name: Optional[str] = Field(None, alias="schema")


# ============ Metadata Models ============

class DatabaseInfo(BaseModel):
    """Database metadata."""
    name: str
    created: Optional[str] = None
    owner: Optional[str] = None
    comment: Optional[str] = None
    
    @field_validator('comment', mode='before')
    @classmethod
    def coerce_comment(cls, v):
        if v is None:
            return None
        return str(v) if v else None

    class Config:
        extra = "ignore"


class SchemaInfo(BaseModel):
    """Schema metadata."""
    name: str
    database: Optional[str] = None
    owner: Optional[str] = None
    comment: Optional[str] = None
    
    @field_validator('comment', mode='before')
    @classmethod
    def coerce_comment(cls, v):
        if v is None:
            return None
        return str(v) if v else None

    class Config:
        extra = "ignore"


class TableInfo(BaseModel):
    """Table or view metadata with popularity metrics."""
    name: str
    database: Optional[str] = None
    schema_name: Optional[str] = Field(None, alias="schema")
    kind: str = "TABLE"  # TABLE, VIEW, MATERIALIZED VIEW
    row_count: Optional[int] = None
    bytes: Optional[int] = None
    owner: Optional[str] = None
    comment: Optional[str] = None
    # Popularity metrics from TABLE_ENTITY
    query_count: int = 0
    unique_users: int = 0
    popularity_score: float = 0.0

    # Handle Snowflake returning empty strings or wrong types
    @field_validator('row_count', 'bytes', 'query_count', 'unique_users', mode='before')
    @classmethod
    def coerce_int_fields(cls, v):
        if v is None or v == '' or v == 'NULL':
            return None
        try:
            return int(v)
        except (ValueError, TypeError):
            return None

    @field_validator('popularity_score', mode='before')
    @classmethod
    def coerce_popularity_score(cls, v):
        if v is None or v == '' or v == 'NULL':
            return 0.0
        try:
            return float(v)
        except (ValueError, TypeError):
            return 0.0

    @field_validator('comment', mode='before')
    @classmethod
    def coerce_comment(cls, v):
        if v is None:
            return None
        return str(v) if v else None

    class Config:
        extra = "ignore"


class ColumnInfo(BaseModel):
    """Column metadata."""
    name: str
    type: str
    kind: str = "COLUMN"
    nullable: bool = True
    default: Optional[str] = None
    primary_key: bool = False
    unique_key: bool = False
    comment: Optional[str] = None

    class Config:
        extra = "ignore"


# ============ Query Models ============

class QueryStatus(str, Enum):
    """Query execution status."""
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class QueryRequest(BaseModel):
    """Request to execute a SQL query."""
    sql: str
    database: Optional[str] = None
    schema_name: Optional[str] = Field(None, alias="schema")
    warehouse: Optional[str] = None
    timeout: int = 60  # seconds
    limit: Optional[int] = 10000  # max rows to return


class QuerySubmitResponse(BaseModel):
    """Response after submitting a query."""
    query_id: str
    status: QueryStatus
    message: str
    execution_time_ms: Optional[int] = None
    row_count: Optional[int] = None


class QueryStatusResponse(BaseModel):
    """Query status check response."""
    query_id: str
    status: QueryStatus
    row_count: Optional[int] = None
    execution_time_ms: Optional[int] = None
    error_message: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class QueryResultsResponse(BaseModel):
    """Paginated query results."""
    columns: List[str]
    rows: List[List[Any]]
    total_rows: int
    page: int
    page_size: int
    has_more: bool


class QueryHistoryItem(BaseModel):
    """Single query history entry."""
    query_id: str
    sql: str
    database: Optional[str] = None
    schema_name: Optional[str] = None
    warehouse: Optional[str] = None
    status: str
    row_count: Optional[int] = None
    error_message: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    duration_ms: Optional[int] = None


class QueryHistoryResponse(BaseModel):
    """Query history list response."""
    items: List[QueryHistoryItem]
    total: int
    limit: int
    offset: int


class CancelQueryResponse(BaseModel):
    """Response after cancelling a query."""
    message: str
    query_id: str


# ============ Preflight Check Models ============

class TableCheckResult(BaseModel):
    """Result of checking a single table."""
    table_name: str
    fully_qualified: str
    exists: bool
    row_count: Optional[int] = None
    columns: List[str] = []
    error: Optional[str] = None


class TableSuggestion(BaseModel):
    """Suggested alternative table."""
    table_name: str
    fully_qualified: str
    row_count: Optional[int] = None
    relevance_score: float = 0.0  # 0-1, how relevant to original
    reason: str = ""  # Why this is suggested


class PreflightRequest(BaseModel):
    """Request to check a query before execution."""
    sql: str
    database: Optional[str] = None
    schema_name: Optional[str] = Field(None, alias="schema")


class PreflightResponse(BaseModel):
    """Response from preflight check."""
    valid: bool
    tables_checked: List[TableCheckResult] = []
    issues: List[str] = []
    suggestions: List[TableSuggestion] = []
    suggested_query: Optional[str] = None
    message: str = ""


# ============ Batch Validation Models ============

class QueryValidationRequest(BaseModel):
    """Request to validate a single query."""
    query_id: str
    sql: str
    entity_type: Optional[str] = None
    description: Optional[str] = None


class QueryValidationResult(BaseModel):
    """Result of validating a single query."""
    query_id: str
    status: str  # "success", "empty", "error"
    row_count: Optional[int] = None
    sample_data: Optional[List[dict]] = None  # First few rows as preview
    columns: List[str] = []
    execution_time_ms: Optional[int] = None
    error_message: Optional[str] = None
    suggested_query: Optional[str] = None
    suggested_query_result: Optional[dict] = None  # Preview of suggested query


class BatchValidationRequest(BaseModel):
    """Request to validate multiple queries."""
    queries: List[QueryValidationRequest]
    database: Optional[str] = None
    schema_name: Optional[str] = Field(None, alias="schema")
    include_samples: bool = True  # Include sample data in results
    sample_limit: int = 3  # Number of sample rows to return


class BatchValidationResponse(BaseModel):
    """Response from batch validation."""
    results: List[QueryValidationResult]
    summary: dict  # {"success": 5, "empty": 3, "error": 2}
    validated_at: str


# ============ Query Explanation Models ============

class QueryExplanationStep(BaseModel):
    """Single step in a query explanation."""
    step_number: int
    clause: str  # SELECT, FROM, WHERE, etc.
    sql_snippet: str
    explanation: str  # Plain English explanation
    tip: Optional[str] = None  # SQL tip for beginners


class QueryExplanationRequest(BaseModel):
    """Request to explain a query."""
    sql: str
    include_execution: bool = True  # Also run the query and show results


class QueryExplanationResponse(BaseModel):
    """Response with query explanation."""
    original_sql: str
    formatted_sql: str
    steps: List[QueryExplanationStep]
    summary: str  # One-line summary of what the query does
    tables_used: List[str]
    columns_selected: List[str]
    # Execution results (if include_execution=True)
    executed: bool = False
    row_count: Optional[int] = None
    sample_data: Optional[List[dict]] = None
    execution_time_ms: Optional[int] = None
    error_message: Optional[str] = None
