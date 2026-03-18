import { create } from 'zustand'
import { Rating, ImageInfo, UserProgress } from '../types'

interface RatingState {
  // 当前批次图像
  currentImages: ImageInfo[]
  currentBatchNumber: number
  isColdStart: boolean

  // 用户评分
  ratings: Rating[]
  pendingRatings: Rating[]  // 待提交的评分

  // 用户进度
  progress: UserProgress | null

  // Actions
  setCurrentImages: (images: ImageInfo[], batchNumber: number, isColdStart: boolean) => void
  setCurrentBatch: (images: ImageInfo[]) => void  // 别名方法，只更新图像
  addRating: (rating: Rating) => void
  addPendingRating: (rating: Rating) => void
  clearPendingRatings: () => void
  setRatings: (ratings: Rating[]) => void
  setProgress: (progress: UserProgress) => void
  clearAll: () => void
}

export const useRatingStore = create<RatingState>((set) => ({
  currentImages: [],
  currentBatchNumber: 0,
  isColdStart: true,

  ratings: [],
  pendingRatings: [],

  progress: null,

  setCurrentImages: (images, batchNumber, isColdStart) => {
    set({ currentImages: images, currentBatchNumber: batchNumber, isColdStart })
  },

  setCurrentBatch: (images) => {
    set({ currentImages: images })
  },

  addRating: (rating) => {
    set((state) => ({
      ratings: [...state.ratings, rating],
    }))
  },

  addPendingRating: (rating) => {
    set((state) => ({
      pendingRatings: [...state.pendingRatings, rating],
    }))
  },

  clearPendingRatings: () => {
    set({ pendingRatings: [] })
  },

  setRatings: (ratings) => {
    set({ ratings })
  },

  setProgress: (progress) => {
    set({ progress })
  },

  clearAll: () => {
    set({
      currentImages: [],
      currentBatchNumber: 0,
      isColdStart: true,
      ratings: [],
      pendingRatings: [],
      progress: null,
    })
  },
}))