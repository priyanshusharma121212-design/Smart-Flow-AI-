from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


API_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=API_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "SmartFlow AI API"
    app_env: str = "development"
    app_version: str = "1.0.0"
    frontend_url: str = (
        "http://localhost:5174,http://127.0.0.1:5174,"
        "http://localhost:5176,http://127.0.0.1:5176"
    )

    here_api_key: str = Field(default="", repr=False)
    here_traffic_base_url: str = "https://data.traffic.hereapi.com/v7"
    here_city: str = "Jaipur"
    here_latitude: float = 26.9124
    here_longitude: float = 75.7873
    here_radius_meters: int = 5000
    database_url: str = Field(default="", repr=False)
    sumo_home: str = Field(default="", repr=False)
    sumo_binary: str = Field(default="", repr=False)
    sumo_config: str = Field(default="", repr=False)

    @property
    def cors_origins(self) -> list[str]:
        configured = [
            origin.strip().rstrip("/")
            for origin in self.frontend_url.split(",")
            if origin.strip()
        ]
        development = ["http://localhost:5176", "http://127.0.0.1:5176"]
        production = ["https://smart-flow-ai-beta.vercel.app"]
        return list(dict.fromkeys([*configured, *development, *production]))


settings = Settings()
