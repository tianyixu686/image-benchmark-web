"""
管理员API端点
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Dict, Any
import json

from app.db.database import get_db
from app.models.user import User, Rating
from app.schemas.auth import UserResponse
from app.schemas.rating import RatingResponse

router = APIRouter()


@router.get("/users", response_model=List[UserResponse])
async def get_all_users(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """
    获取所有用户信息（管理员功能）
    """
    users = db.query(User).offset(skip).limit(limit).all()
    user_responses = []

    for user in users:
        user_responses.append({
            "user_id": user.user_id,
            "age": user.age,
            "gender": user.gender,
            "jobs": user.jobs or [],
            "interests": user.interests or [],
            "created_at": user.created_at.isoformat() if user.created_at else "",
            "completed": user.completed,
        })

    return user_responses


@router.get("/ratings", response_model=List[RatingResponse])
async def get_all_ratings(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """
    获取所有评分记录（管理员功能）
    """
    ratings = db.query(Rating).offset(skip).limit(limit).all()
    return ratings


@router.get("/stats")
async def get_system_stats(
    db: Session = Depends(get_db)
):
    """
    获取系统统计信息
    """
    try:
        # 用户统计
        total_users = db.query(User).count()
        completed_users = db.query(User).filter(User.completed == True).count()

        # 评分统计
        total_ratings = db.query(Rating).count()

        # 评分分布
        quality_distribution = {
            "1": db.query(Rating).filter(Rating.quality_score == 1).count(),
            "2": db.query(Rating).filter(Rating.quality_score == 2).count(),
            "3": db.query(Rating).filter(Rating.quality_score == 3).count(),
            "4": db.query(Rating).filter(Rating.quality_score == 4).count(),
            "5": db.query(Rating).filter(Rating.quality_score == 5).count(),
        }

        preference_distribution = {
            "1": db.query(Rating).filter(Rating.preference_score == 1).count(),
            "2": db.query(Rating).filter(Rating.preference_score == 2).count(),
            "3": db.query(Rating).filter(Rating.preference_score == 3).count(),
            "4": db.query(Rating).filter(Rating.preference_score == 4).count(),
            "5": db.query(Rating).filter(Rating.preference_score == 5).count(),
        }

        return {
            "users": {
                "total": total_users,
                "completed": completed_users,
                "completion_rate": completed_users / total_users if total_users > 0 else 0
            },
            "ratings": {
                "total": total_ratings,
                "quality_distribution": quality_distribution,
                "preference_distribution": preference_distribution
            },
            "system": {
                "timestamp": "2026-03-10T00:00:00Z"  # 实际应该使用当前时间
            }
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取统计信息失败: {str(e)}"
        )


@router.get("/export")
async def export_ratings(
    db: Session = Depends(get_db)
):
    """
    导出评分数据为rating_1.json格式
    """
    try:
        # 获取所有用户及其评分
        users = db.query(User).all()
        export_data = []

        for user in users:
            # 获取用户评分
            ratings = db.query(Rating).filter(Rating.user_id == user.user_id).all()

            # 构建与原有rating.json兼容的格式
            user_data = {
                "user_id": user.user_id,
                "age": user.age,
                "gender": user.gender,
                "job": ",".join(user.jobs or []),
                "interest": ",".join(user.interests or []),
                "jobs": user.jobs or [],
                "interests": user.interests or [],
                "completed": user.completed,
                "image_ids": [rating.image_id for rating in ratings],
                "quality_scores": [rating.quality_score for rating in ratings],
                "preference_scores": [rating.preference_score for rating in ratings]
            }

            export_data.append(user_data)

        # 转换为JSON格式
        export_json = json.dumps(export_data, indent=2, ensure_ascii=False)

        return {
            "filename": "rating_1.json",
            "data": export_json,
            "count": len(export_data),
            "total_ratings": sum(len(user["image_ids"]) for user in export_data)
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"导出数据失败: {str(e)}"
        )