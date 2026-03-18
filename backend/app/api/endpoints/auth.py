"""
用户认证API端点
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.db.database import get_db
from app.schemas.auth import UserRegister, UserLogin, Token, UserResponse
from app.core.security import create_access_token, get_current_user_id
from app.models.user import User
router = APIRouter()


@router.post("/auth/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register_user(
    user_data: UserRegister,
    db: Session = Depends(get_db)
):
    """
    注册新用户

    收集用户人口统计信息（年龄、性别、职业、兴趣）并创建用户账户
    """
    try:
        # 创建新用户
        db_user = User(
            age=user_data.age,
            gender=user_data.gender,
            jobs=user_data.jobs,
            interests=user_data.interests,
            completed=False
        )

        db.add(db_user)
        db.commit()
        db.refresh(db_user)

        # 创建访问令牌
        access_token = create_access_token(data={"sub": str(db_user.user_id)})

        return {"access_token": access_token, "token_type": "bearer"}

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"注册失败: {str(e)}"
        )


@router.post("/auth/login", response_model=Token)
async def login_user(
    login_data: UserLogin,
    db: Session = Depends(get_db)
):
    """
    用户登录（基于用户ID）

    在实际应用中，这里可能有密码验证
    这里简化处理，直接通过用户ID登录
    """
    # 检查用户是否存在
    db_user = db.query(User).filter(User.user_id == login_data.user_id).first()
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )

    # 创建访问令牌
    access_token = create_access_token(data={"sub": str(db_user.user_id)})

    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/auth/me", response_model=UserResponse)
async def get_current_user(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    获取当前用户信息
    """
    db_user = db.query(User).filter(User.user_id == user_id).first()
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )

    return {
        "user_id": db_user.user_id,
        "age": db_user.age,
        "gender": db_user.gender,
        "jobs": db_user.jobs or [],
        "interests": db_user.interests or [],
        "created_at": db_user.created_at.isoformat() if db_user.created_at else "",
        "completed": db_user.completed
    }