"""
推荐API端点
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.db.database import get_db
from app.core.redis_client import get_redis
from app.core.security import get_current_user_id
from app.schemas.rating import RecommendationResponse, ImageInfo
from app.models.user import ImageMetadata, User
from app.recommender.core import RecommendationSystem
import redis

router = APIRouter()


def get_user_profile(db: Session, user_id: int) -> tuple[list[str], list[str]]:
    db_user = db.query(User).filter(User.user_id == user_id).first()
    if not db_user:
        return [], []

    return db_user.jobs or [], db_user.interests or []


@router.get("/recommendations/cold-start", response_model=RecommendationResponse)
async def get_cold_start_recommendations(
    user_id: int = Depends(get_current_user_id),
    count: int = 3,
    db: Session = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis)
):
    """
    获取冷启动推荐图像
    """
    try:
        jobs, interests = get_user_profile(db, user_id)

        recommender = RecommendationSystem(db, redis_client)
        image_ids = recommender.get_cold_start_images(user_id, jobs, interests, count)

        # 获取图像详细信息
        images_info = []
        for img_id in image_ids:
            db_image = db.query(ImageMetadata).filter(ImageMetadata.image_id == img_id).first()
            if db_image:
                image_url = f"/static/images/{db_image.image_path.split('/')[-1]}" if db_image.image_path else f"/static/images/{img_id}.jpg"
                images_info.append(
                    ImageInfo(
                        image_id=img_id,
                        image_url=image_url,
                        prompt=db_image.prompt or "",
                        category=db_image.category,
                        style=db_image.style,
                        is_real=db_image.is_real or False
                    )
                )

        return RecommendationResponse(
            images=images_info,
            batch_number=0,  # 冷启动批次号为0
            is_cold_start=True
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取冷启动推荐失败: {str(e)}"
        )


@router.get("/recommendations/next-batch", response_model=RecommendationResponse)
async def get_next_batch_recommendations(
    user_id: int = Depends(get_current_user_id),
    count: int = 10,
    db: Session = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis)
):
    """
    获取下一批推荐图像
    """
    try:
        # 获取用户已评分的批次号，确定下一批次号
        # 这里简化实现：从Redis获取当前批次号
        batch_key = f"user_batch:{user_id}"
        current_batch = redis_client.get(batch_key)
        if current_batch:
            next_batch = int(current_batch) + 1
        else:
            next_batch = 1

        recommender = RecommendationSystem(db, redis_client)
        recommender.load_data()
        image_ids = recommender.get_recommendations(user_id, count)

        # 获取图像详细信息
        images_info = []
        for img_id in image_ids:
            db_image = db.query(ImageMetadata).filter(ImageMetadata.image_id == img_id).first()
            if db_image:
                image_url = f"/static/images/{db_image.image_path.split('/')[-1]}" if db_image.image_path else f"/static/images/{img_id}.jpg"
                images_info.append(
                    ImageInfo(
                        image_id=img_id,
                        image_url=image_url,
                        prompt=db_image.prompt or "",
                        category=db_image.category,
                        style=db_image.style,
                        is_real=db_image.is_real or False
                    )
                )
            else:
                # 如果数据库中没有元数据，创建基本图像信息
                images_info.append(
                    ImageInfo(
                        image_id=img_id,
                        image_url=f"/static/images/{img_id}.jpg",
                        prompt="",
                        category=None,
                        style=None,
                        is_real=False
                    )
                )

        # 更新批次号
        redis_client.setex(batch_key, 60 * 60 * 24 * 7, next_batch)  # 7天过期

        return RecommendationResponse(
            images=images_info,
            batch_number=next_batch,
            is_cold_start=False
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取推荐失败: {str(e)}"
        )


@router.get("/recommendations/images/{image_id}")
async def get_image_info(
    image_id: str,
    db: Session = Depends(get_db)
):
    """
    获取指定图像的详细信息
    """
    db_image = db.query(ImageMetadata).filter(ImageMetadata.image_id == image_id).first()
    if not db_image:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="图像不存在"
        )

    image_url = f"/static/images/{db_image.image_path.split('/')[-1]}" if db_image.image_path else f"/static/images/{image_id}.jpg"

    return ImageInfo(
        image_id=image_id,
        image_url=image_url,
        prompt=db_image.prompt or "",
        category=db_image.category,
        style=db_image.style,
        is_real=db_image.is_real or False
    )