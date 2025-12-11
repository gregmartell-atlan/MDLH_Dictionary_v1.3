"""Application configuration from environment variables."""

from pydantic_settings import BaseSettings
from typing import Optional, List
import os


class Settings(BaseSettings):
    """Snowflake and server configuration."""
    
    # Snowflake Connection
    snowflake_account: str = ""
    snowflake_user: str = ""
    snowflake_private_key_path: Optional[str] = None
    snowflake_password: Optional[str] = None
    snowflake_warehouse: str = "COMPUTE_WH"
    snowflake_database: str = "ATLAN_MDLH"
    snowflake_schema: str = "PUBLIC"
    snowflake_role: Optional[str] = None
    
    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False
    
    # CORS Configuration
    # Set CORS_ORIGINS environment variable to a comma-separated list of allowed origins
    # Example: CORS_ORIGINS=https://myapp.example.com,https://staging.example.com
    # Use "*" for development to allow any origin (not recommended for production)
    cors_origins: str = "*"
    
    # For production, use specific origins:
    # cors_origins: str = "https://myapp.example.com"
    
    # Cache TTLs (seconds) - matches frontend TIMEOUTS
    cache_ttl_databases: int = 600  # 10 minutes
    cache_ttl_schemas: int = 600    # 10 minutes
    cache_ttl_tables: int = 600     # 10 minutes
    cache_ttl_columns: int = 900    # 15 minutes
    
    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS origins from comma-separated string."""
        if not self.cors_origins:
            return []
        # Handle wildcard for development
        if self.cors_origins.strip() == "*":
            return ["*"]
        return [origin.strip() for origin in self.cors_origins.split(',') if origin.strip()]
    
    @property
    def cors_allow_all(self) -> bool:
        """Check if CORS allows all origins."""
        return self.cors_origins.strip() == "*"
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

