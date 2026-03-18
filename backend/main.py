"""
FastAPI主应用入口
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
import os
from pathlib import Path

from app.core.config import settings
from app.api.endpoints import auth, users, ratings, recommendations, admin
from app.db.database import Base, engine, SessionLocal
from app.core.redis_client import redis_client
from app.models import user as user_models
from app.recommender.core import RecommendationSystem


def ensure_user_profile_columns():
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS jobs JSON NOT NULL DEFAULT '[]'::json"))
        connection.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS interests JSON NOT NULL DEFAULT '[]'::json"))


def migrate_user_profiles_from_redis():
    db = SessionLocal()
    try:
        users_without_profiles = db.query(user_models.User).all()

        for user in users_without_profiles:
            if user.jobs or user.interests:
                continue

            user_profile_key = f"user_profile:{user.user_id}"
            jobs_str = redis_client.hget(user_profile_key, "jobs") or ""
            interests_str = redis_client.hget(user_profile_key, "interests") or ""

            jobs = jobs_str.split(",") if jobs_str else []
            interests = interests_str.split(",") if interests_str else []

            if jobs or interests:
                user.jobs = jobs
                user.interests = interests

        db.commit()
    finally:
        db.close()

# 创建FastAPI应用
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/api/docs" if settings.DEBUG else None,
    redoc_url="/api/redoc" if settings.DEBUG else None,
)


@app.on_event("startup")
async def startup_event():
    """
    启动时确保基础表存在，便于开发环境直接运行
    """
    Base.metadata.create_all(bind=engine)
    ensure_user_profile_columns()
    migrate_user_profiles_from_redis()

    # 预热推荐系统缓存：在服务启动阶段完成特征和聚类加载，
    # 避免第一个用户请求时等待大规模数据初始化
    db = SessionLocal()
    try:
        recommender = RecommendationSystem(db, redis_client)
        recommender.load_data()
    finally:
        db.close()

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.DEBUG else [],  # 生产环境需要指定具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载静态文件目录（图像文件）
image_dir = Path(settings.IMAGE_BASE_PATH)
if not image_dir.exists():
    image_dir.mkdir(parents=True, exist_ok=True)

app.mount("/static/images", StaticFiles(directory=settings.IMAGE_BASE_PATH), name="images")

# 注册API路由
app.include_router(auth.router, prefix=settings.API_V1_STR, tags=["认证"])
app.include_router(users.router, prefix=settings.API_V1_STR, tags=["用户"])
app.include_router(ratings.router, prefix=settings.API_V1_STR, tags=["评分"])
app.include_router(recommendations.router, prefix=settings.API_V1_STR, tags=["推荐"])
app.include_router(admin.router, prefix=settings.API_V1_STR + "/admin", tags=["管理"])


@app.get("/")
async def root():
    """
    根端点，返回应用信息
    """
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/api/docs" if settings.DEBUG else None,
    }


@app.get("/health")
async def health_check():
    """
    健康检查端点
    """
    return {"status": "healthy", "timestamp": "2026-03-10T00:00:00Z"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="info" if settings.DEBUG else "warning",
    )