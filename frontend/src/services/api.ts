import axios, { AxiosError } from 'axios'
import { toast } from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'
import type {
  ImageInfo,
  Rating,
  RecommendationResponse,
  Token,
  User,
  UserProgress,
} from '../types'

// 创建axios实例
const api = axios.create({
  baseURL: '/api/v1',
  // 推荐接口首次加载可能较慢，适当放宽超时时间
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截器：添加认证token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器：统一错误处理
api.interceptors.response.use(
  (response) => {
    return response.data
  },
  (error: AxiosError) => {
    const { response } = error

    // 根据状态码进行不同处理
    if (response) {
      switch (response.status) {
        case 401:
          // 未授权，清除认证信息并跳转到登录页
          useAuthStore.getState().logout()
          toast.error('登录已过期，请重新登录')
          break
        case 403:
          toast.error('没有访问权限')
          break
        case 404:
          toast.error('请求的资源不存在')
          break
        case 500:
          toast.error('服务器内部错误')
          break
        default:
          toast.error(`请求失败: ${response.status}`)
      }
    } else {
      toast.error('网络连接失败，请检查网络设置')
    }

    return Promise.reject(error)
  }
)

const get = async <T>(url: string): Promise<T> => api.get(url) as Promise<T>
const post = async <T>(url: string, data?: unknown): Promise<T> => api.post(url, data) as Promise<T>

// API方法封装
export const authAPI = {
  register: (userData: unknown) => post<Token>('/auth/register', userData),
  login: (userData: unknown) => post<Token>('/auth/login', userData),
  getCurrentUser: () => get<User>('/auth/me'),
}

export const ratingAPI = {
  createRating: (ratingData: unknown) => post<Rating[]>('/ratings', ratingData),
  createRatingBatch: (batchData: unknown) => post<Rating[]>('/ratings/batch', batchData),
  getUserRatings: (userId: number) => get<Rating[]>(`/ratings/user/${userId}`),
  getUserProgress: (userId: number) => get<UserProgress>(`/ratings/progress/${userId}`),
}

export const recommendationAPI = {
  getColdStart: (count: number = 3) => get<RecommendationResponse>(`/recommendations/cold-start?count=${count}`),
  getNextBatch: (count: number = 10) => get<RecommendationResponse>(`/recommendations/next-batch?count=${count}`),
  getImageInfo: (imageId: string) => get<ImageInfo>(`/recommendations/images/${imageId}`),
}

export const adminAPI = {
  getUsers: (skip: number = 0, limit: number = 100) => get(`/admin/users?skip=${skip}&limit=${limit}`),
  getRatings: (skip: number = 0, limit: number = 100) => get(`/admin/ratings?skip=${skip}&limit=${limit}`),
  getStats: () => get('/admin/stats'),
  exportData: () => get('/admin/export'),
}

export default api