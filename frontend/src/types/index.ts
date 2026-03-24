// 用户相关类型
export interface User {
  user_id: number
  age: number
  gender: string
  jobs: string[]
  interests: string[]
  created_at: string
  completed: boolean
}

export interface UserRegisterData {
  age: number
  gender: string
  jobs: string[]
  interests: string[]
}

// 认证相关类型
export interface Token {
  access_token: string
  token_type: string
}

// 图像相关类型
export interface ImageInfo {
  image_id: string
  image_url: string
  prompt: string
  category?: string
  style?: string
  is_real: boolean
}

// 评分相关类型
export interface Rating {
  rating_id?: number
  user_id: number
  image_id: string
  quality_score: number
  preference_score: number
   task_match_score?: number
  batch_number: number
  created_at?: string
}

export interface RatingCreate {
  image_id: string
  quality_score: number
  preference_score: number
   task_match_score?: number
  batch_number: number
}

export interface RatingBatchCreate {
  ratings: RatingCreate[]
}

// 推荐相关类型
export interface RecommendationResponse {
  images: ImageInfo[]
  batch_number: number
  is_cold_start: boolean
}

// 进度相关类型
export interface UserProgress {
  total_ratings: number
  high_preference_ratings: number
  completed: boolean
  required_total: number
  required_high_preference: number
}

// API响应类型
export interface ApiResponse<T> {
  data?: T
  error?: string
  message?: string
}

// 职业和兴趣选项类型
export interface Option {
  id: string
  label: string
  category?: string
}