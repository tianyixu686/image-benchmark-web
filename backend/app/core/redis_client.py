"""
Redis客户端连接
"""
import redis
from app.core.config import settings

# 创建Redis连接池
redis_pool = redis.ConnectionPool.from_url(
    settings.redis_url,
    max_connections=20,
    decode_responses=True
)

# 创建Redis客户端
redis_client = redis.Redis(connection_pool=redis_pool)


def get_redis():
    """
    获取Redis客户端依赖项
    """
    return redis_client