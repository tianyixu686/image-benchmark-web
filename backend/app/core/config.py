"""
应用配置设置
"""
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # 应用配置
    APP_NAME: str = "PMG Benchmark API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    # 服务器配置
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    API_V1_STR: str = "/api/v1"

    # 数据库配置
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    POSTGRES_DB: str = "pmg_benchmark"
    POSTGRES_PORT: int = 5432
    DATABASE_URL: Optional[str] = None

    # Redis配置
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_DB: int = 0
    REDIS_PASSWORD: Optional[str] = None

    # JWT配置
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24小时

    # 图像配置
    IMAGE_BASE_PATH: str = "static/images"
    MAX_IMAGES_PER_BATCH: int = 10
    COLD_START_IMAGES: int = 3

    # 预处理特征数据（pickle）路径，用于加速推荐系统初始化
    PREPROCESSED_DATA_PATH: str = "data/preprocessed_data_gram.pkl"

    # 推荐算法配置
    EXPLOIT_RATIO: float = 0.6  # 利用阶段比例
    EXPLORE_RATIO: float = 0.4  # 探索阶段比例
    MAX_PROFILE_SIZE: int = 20  # 用户画像最大向量数
    SIMILARITY_THRESHOLD: float = 0.7  # 相似度阈值

    class Config:
        env_file = ".env"
        case_sensitive = True

    @property
    def sync_database_url(self) -> str:
        if self.DATABASE_URL:
            return self.DATABASE_URL
        return f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    @property
    def redis_url(self) -> str:
        if self.REDIS_PASSWORD:
            return f"redis://:{self.REDIS_PASSWORD}@{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"


settings = Settings()