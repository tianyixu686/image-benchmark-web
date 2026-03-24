"""
用户相关数据库模型
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Index, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.database import Base


class User(Base):
    """用户模型"""
    __tablename__ = "users"

    user_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    age = Column(Integer, nullable=False)
    gender = Column(String(10), nullable=False)
    jobs = Column(JSON, nullable=False, default=list)
    interests = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed = Column(Boolean, default=False)  # 是否完成标注

    # 关系
    ratings = relationship("Rating", back_populates="user")


class Rating(Base):
    """评分模型"""
    __tablename__ = "ratings"

    rating_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    image_id = Column(String(50), nullable=False, index=True)  # 图像ID字符串
    quality_score = Column(Integer, nullable=False)  # 质量评分 1-5
    preference_score = Column(Integer, nullable=False)  # 偏好评分 1-5
    task_match_score = Column(Integer, nullable=True)  # 任务匹配评分 1-5，可选
    batch_number = Column(Integer, nullable=False, default=0)  # 批次号
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # 关系
    user = relationship("User", back_populates="ratings")

    # 索引
    __table_args__ = (
        Index('idx_user_image', 'user_id', 'image_id', unique=True),
        Index('idx_user_batch', 'user_id', 'batch_number'),
    )


class ImageMetadata(Base):
    """图像元数据模型"""
    __tablename__ = "image_metadata"

    image_id = Column(String(50), primary_key=True, index=True)
    image_path = Column(String(255), nullable=False)
    prompt = Column(Text)
    category = Column(String(50))
    style = Column(String(50))
    is_real = Column(Boolean, default=False)  # 是否是真实图像
    cluster_id = Column(Integer, index=True)  # 聚类ID
    interaction_count = Column(Integer, nullable=False, default=0)  # 图像被展示/交互次数

    # 索引
    __table_args__ = (
        Index('idx_cluster', 'cluster_id'),
        Index('idx_style', 'style'),
    )


class ImageFeature(Base):
    """图像特征向量模型"""
    __tablename__ = "image_features"

    image_id = Column(String(50), primary_key=True, index=True)
    feature_vector = Column(Text)  # JSON格式的特征向量（512维）