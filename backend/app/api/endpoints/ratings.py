"""
评分管理API端点
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.db.database import get_db
from app.core.redis_client import get_redis
from app.core.security import get_current_user_id
from app.schemas.rating import RatingCreate, RatingBatchCreate, RatingResponse, UserProgress
from app.models.user import User, Rating
from app.recommender.core import RecommendationSystem
import redis

router = APIRouter()


def refresh_user_completion_status(db: Session, user_id: int) -> dict:
    total_ratings = db.query(Rating).filter(Rating.user_id == user_id).count()
    high_preference_ratings = db.query(Rating).filter(
        Rating.user_id == user_id,
        Rating.preference_score >= 4
    ).count()
    completed = total_ratings >= 20 and high_preference_ratings >= 5

    db_user = db.query(User).filter(User.user_id == user_id).first()
    if db_user and db_user.completed != completed:
        db_user.completed = completed
        db.commit()

    return {
        "total_ratings": total_ratings,
        "high_preference_ratings": high_preference_ratings,
        "completed": completed,
    }


@router.post("/ratings", response_model=List[RatingResponse], status_code=status.HTTP_201_CREATED)
async def create_rating(
    rating_data: RatingCreate,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis)
):
    """
    创建评分记录
    """
    try:
        # 检查用户是否存在
        db_user = db.query(User).filter(User.user_id == user_id).first()
        if not db_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="用户不存在"
            )

        # 创建评分记录
        db_rating = Rating(
            user_id=user_id,
            image_id=rating_data.image_id,
            quality_score=rating_data.quality_score,
            preference_score=rating_data.preference_score,
            batch_number=rating_data.batch_number
        )

        db.add(db_rating)
        db.commit()
        db.refresh(db_rating)

        # 更新推荐系统的用户偏好
        recommender = RecommendationSystem(db, redis_client)
        recommender.update_user_preference(user_id, rating_data.image_id, rating_data.preference_score)

        refresh_user_completion_status(db, user_id)

        # 返回创建的评分
        return [db_rating]

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"创建评分失败: {str(e)}"
        )


@router.post("/ratings/batch", response_model=List[RatingResponse], status_code=status.HTTP_201_CREATED)
async def create_ratings_batch(
    batch_data: RatingBatchCreate,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis)
):
    """
    批量创建评分记录
    """
    try:
        # 检查用户是否存在
        db_user = db.query(User).filter(User.user_id == user_id).first()
        if not db_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="用户不存在"
            )

        created_ratings = []
        recommender = RecommendationSystem(db, redis_client)

        for rating_data in batch_data.ratings:
            # 创建评分记录
            db_rating = Rating(
                user_id=user_id,
                image_id=rating_data.image_id,
                quality_score=rating_data.quality_score,
                preference_score=rating_data.preference_score,
                batch_number=rating_data.batch_number
            )

            db.add(db_rating)
            created_ratings.append(db_rating)

            # 更新推荐系统的用户偏好
            recommender.update_user_preference(user_id, rating_data.image_id, rating_data.preference_score)

        db.commit()

        # 刷新所有记录以获取ID
        for rating in created_ratings:
            db.refresh(rating)

        refresh_user_completion_status(db, user_id)

        return created_ratings

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"批量创建评分失败: {str(e)}"
        )


@router.get("/ratings/user/{user_id}", response_model=List[RatingResponse])
async def get_user_ratings(
    user_id: int,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """
    获取指定用户的所有评分
    """
    ratings = db.query(Rating).filter(Rating.user_id == user_id).offset(skip).limit(limit).all()
    return ratings


@router.get("/ratings/progress/{user_id}", response_model=UserProgress)
async def get_user_progress(
    user_id: int,
    db: Session = Depends(get_db)
):
    """
    获取用户标注进度
    """
    progress = refresh_user_completion_status(db, user_id)

    return {
        "total_ratings": progress["total_ratings"],
        "high_preference_ratings": progress["high_preference_ratings"],
        "completed": progress["completed"],
        "required_total": 20,
        "required_high_preference": 5
    }