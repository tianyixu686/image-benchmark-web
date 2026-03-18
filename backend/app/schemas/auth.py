"""
认证相关的Pydantic模型
"""
from pydantic import BaseModel, EmailStr, validator
from typing import List, Optional


class Token(BaseModel):
    """令牌响应模型"""
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    """令牌数据模型"""
    user_id: Optional[int] = None


class UserRegister(BaseModel):
    """用户注册请求模型"""
    age: int
    gender: str
    jobs: List[str]  # 职业列表
    interests: List[str]  # 兴趣列表

    @validator('age')
    def validate_age(cls, v):
        if v < 1 or v > 120:
            raise ValueError('年龄必须在1-120之间')
        return v

    @validator('gender')
    def validate_gender(cls, v):
        if v not in ['Male', 'Female', 'Other']:
            raise ValueError('性别必须是Male、Female或Other')
        return v

    @validator('jobs')
    def validate_jobs(cls, v):
        if not v:
            raise ValueError('至少选择一个职业')
        if len(v) > 5:
            raise ValueError('最多选择5个职业')
        return v

    @validator('interests')
    def validate_interests(cls, v):
        if not v:
            raise ValueError('至少选择一个兴趣')
        if len(v) > 10:
            raise ValueError('最多选择10个兴趣')
        return v


class UserLogin(BaseModel):
    """用户登录请求模型（基于用户ID）"""
    user_id: int


class UserResponse(BaseModel):
    """用户响应模型"""
    user_id: int
    age: int
    gender: str
    jobs: List[str]
    interests: List[str]
    created_at: str
    completed: bool

    class Config:
        from_attributes = True