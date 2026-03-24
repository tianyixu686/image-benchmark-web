"""
评分相关的Pydantic模型
"""
from pydantic import BaseModel, validator
from typing import List, Optional
from datetime import datetime


class RatingBase(BaseModel):
    """评分基础模型"""
    image_id: str
    quality_score: int
    preference_score: int
    task_match_score: Optional[int] = None


class RatingCreate(RatingBase):
    """评分创建请求模型"""
    batch_number: int


class RatingBatchCreate(BaseModel):
    """批量评分创建请求模型"""
    ratings: List[RatingCreate]


class RatingResponse(RatingBase):
    """评分响应模型"""
    rating_id: int
    user_id: int
    batch_number: int
    created_at: datetime

    class Config:
        from_attributes = True


class ImageInfo(BaseModel):
    """图像信息模型"""
    image_id: str
    image_url: str  # 图像URL路径
    prompt: str
    category: Optional[str]
    style: Optional[str]
    is_real: bool


class RecommendationResponse(BaseModel):
    """推荐响应模型"""
    images: List[ImageInfo]
    batch_number: int
    is_cold_start: bool  # 是否是冷启动批次


class UserProgress(BaseModel):
    """用户进度模型"""
    total_ratings: int
    high_preference_ratings: int  # 偏好分≥4的数量
    completed: bool
    required_total: int = 20
    required_high_preference: int = 5