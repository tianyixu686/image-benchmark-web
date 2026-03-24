import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'
import { useRatingStore } from '../store/ratingStore'
import { recommendationAPI, ratingAPI } from '../services/api'
import { ImageInfo, RatingCreate, RecommendationResponse, UserProgress } from '../types'

// 单张图像的评分状态
interface ImageRatingState {
  image: ImageInfo
  qualityScore: number | null
  preferenceScore: number | null
   taskMatchScore: number | null
  isSubmitted: boolean
}

interface RatedImageRecord {
  image: ImageInfo
  qualityScore: number
  preferenceScore: number
   taskMatchScore?: number
  batchNumber: number
  createdAt: string | undefined
}

export default function ScoringPage() {
  const navigate = useNavigate()
  const { user, isAuthenticated, setUser } = useAuthStore()
  const { addRating, setCurrentBatch } = useRatingStore()

  const [images, setImages] = useState<ImageRatingState[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [progress, setProgress] = useState<UserProgress | null>(null)
  const [batchNumber, setBatchNumber] = useState(0)
  const [isColdStart, setIsColdStart] = useState(true)
  const [ratedHistory, setRatedHistory] = useState<RatedImageRecord[]>([])

  // 检查认证状态
  useEffect(() => {
    if (!isAuthenticated || !user) {
      navigate('/register')
    }
  }, [isAuthenticated, user, navigate])

  // 加载推荐图像
  useEffect(() => {
    if (user) {
      loadRecommendations()
      loadProgress()
      loadRatedHistory()
    }
  }, [user])

  // 加载用户进度
  const loadProgress = async () => {
    if (!user) return

    try {
      const response = await ratingAPI.getUserProgress(user.user_id)
      setProgress(response)

      if (user.completed !== response.completed) {
        setUser({
          ...user,
          completed: response.completed,
        })
      }

      // 如果用户已完成，跳转到完成页面
      if (response.completed) {
        navigate('/completion')
      }
    } catch (error) {
      console.error('获取用户进度失败:', error)
      toast.error('获取进度信息失败')
    }
  }

  // 加载推荐图像
  const loadRecommendations = async () => {
    if (!user) return

    setIsLoading(true)
    try {
      let response: RecommendationResponse

      if (isColdStart) {
        // 冷启动：获取3张图像
        response = await recommendationAPI.getColdStart(3)
        setIsColdStart(false)
      } else {
        // 批次推荐：获取9张图像
        response = await recommendationAPI.getNextBatch(9)
      }

      // 初始化评分状态
      const imageStates: ImageRatingState[] = response.images.map(image => ({
        image,
        qualityScore: null,
        preferenceScore: null,
        taskMatchScore: null,
        isSubmitted: false
      }))

      setImages(imageStates)
      setBatchNumber(response.batch_number)
      setCurrentBatch(response.images)

      toast.success(`已加载 ${response.images.length} 张图像`)

    } catch (error: any) {
      console.error('加载推荐图像失败:', error)
      toast.error(error.response?.data?.detail || '加载图像失败，请重试')
    } finally {
      setIsLoading(false)
    }
  }

  const loadRatedHistory = async () => {
    if (!user) return

    try {
      const ratings = await ratingAPI.getUserRatings(user.user_id)
      if (!ratings.length) {
        setRatedHistory([])
        return
      }

      const imageDetails: (RatedImageRecord | null)[] = await Promise.all(
        ratings.map(async (rating) => {
          try {
            const image = await recommendationAPI.getImageInfo(rating.image_id)
            const record: RatedImageRecord = {
              image,
              qualityScore: rating.quality_score,
              preferenceScore: rating.preference_score,
              taskMatchScore: rating.task_match_score,
              batchNumber: rating.batch_number,
              createdAt: rating.created_at,
            }
            return record
          } catch {
            return null
          }
        })
      )

      const validDetails = imageDetails.filter(
        (item): item is RatedImageRecord => item !== null
      )

      setRatedHistory(validDetails.reverse())
    } catch (error) {
      console.error('加载已评分图像失败:', error)
    }
  }

  const appendRatedHistory = (records: RatedImageRecord[]) => {
    setRatedHistory(prev => {
      const existingIds = new Set(prev.map(record => `${record.image.image_id}-${record.batchNumber}`))
      const nextRecords = records.filter(record => !existingIds.has(`${record.image.image_id}-${record.batchNumber}`))
      return [...nextRecords.reverse(), ...prev]
    })
  }

  // 更新图像评分
  const updateImageScore = (index: number, type: 'quality' | 'preference', score: number) => {
    setImages(prev => {
      const newImages = [...prev]
      if (type === 'quality') {
        newImages[index].qualityScore = score
      } else if (type === 'preference') {
        newImages[index].preferenceScore = score
      } else {
        newImages[index].taskMatchScore = score
      }
      return newImages
    })
  }

  // 提交单张图像评分
  const submitImageRating = async (index: number) => {
    if (!user) return

    const imageState = images[index]
    if (imageState.qualityScore === null || imageState.taskMatchScore === null || imageState.preferenceScore === null) {
      toast.error('请完成三个维度的评分')
      return
    }

    setIsSubmitting(true)
    try {
      const ratingData: RatingCreate = {
        image_id: imageState.image.image_id,
        quality_score: imageState.qualityScore,
        task_match_score: imageState.taskMatchScore,
        preference_score: imageState.preferenceScore,
        batch_number: batchNumber
      }

      await ratingAPI.createRating(ratingData)

      // 更新本地状态
      setImages(prev => {
        const newImages = [...prev]
        newImages[index].isSubmitted = true
        return newImages
      })

      // 添加到store
      addRating({
        user_id: user.user_id,
        image_id: imageState.image.image_id,
        quality_score: imageState.qualityScore,
          preference_score: imageState.preferenceScore,
          task_match_score: imageState.taskMatchScore!,
        batch_number: batchNumber
      })

      appendRatedHistory([
        {
          image: imageState.image,
          qualityScore: imageState.qualityScore,
          preferenceScore: imageState.preferenceScore,
          taskMatchScore: imageState.taskMatchScore!,
          batchNumber,
          createdAt: undefined,
        },
      ])

      // 更新进度
      await loadProgress()

      toast.success('评分提交成功')

    } catch (error: any) {
      console.error('提交评分失败:', error)
      toast.error(error.response?.data?.detail || '提交评分失败，请重试')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 批量提交所有已完成评分的图像
  const submitAllRatings = async () => {
    if (!user) return

    const unsubmittedImages = images.filter(img =>
      img.qualityScore !== null &&
      img.taskMatchScore !== null &&
      img.preferenceScore !== null &&
      !img.isSubmitted
    )

    if (unsubmittedImages.length === 0) {
      toast.error('没有需要提交的评分')
      return
    }

    setIsSubmitting(true)
    try {
      const ratings = unsubmittedImages.map(imageState => ({
        image_id: imageState.image.image_id,
        quality_score: imageState.qualityScore!,
        task_match_score: imageState.taskMatchScore!,
        preference_score: imageState.preferenceScore!,
        batch_number: batchNumber
      }))

      await ratingAPI.createRatingBatch({ ratings })

      // 更新本地状态
      setImages(prev => prev.map(img =>
        unsubmittedImages.some(ui => ui.image.image_id === img.image.image_id)
          ? { ...img, isSubmitted: true }
          : img
      ))

      // 添加到store
      ratings.forEach(rating => {
        addRating({
          user_id: user.user_id,
          ...rating
        })
      })

      appendRatedHistory(
        unsubmittedImages.map(imageState => ({
          image: imageState.image,
          qualityScore: imageState.qualityScore!,
          preferenceScore: imageState.preferenceScore!,
          batchNumber,
          createdAt: undefined,
        }))
      )

      // 更新进度
      await loadProgress()

      toast.success(`成功提交 ${ratings.length} 条评分`)

    } catch (error: any) {
      console.error('批量提交评分失败:', error)
      toast.error(error.response?.data?.detail || '提交评分失败，请重试')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 获取下一批图像
  const loadNextBatch = async () => {
    // 检查是否有未提交的评分
    const hasUnsubmitted = images.some(img =>
      img.qualityScore !== null &&
      img.preferenceScore !== null &&
      !img.isSubmitted
    )

    if (hasUnsubmitted) {
      const confirm = window.confirm('您还有未提交的评分，确定要加载下一批图像吗？未提交的评分将不会保存。')
      if (!confirm) return
    }

    await loadRecommendations()
  }

  // 计算已完成评分的图像数量
  const getCompletedCount = () => {
    return images.filter(img => img.isSubmitted).length
  }

  // 计算总评分进度
  const getTotalProgress = () => {
    if (!progress) return { current: 0, required: 20 }
    return {
      current: progress.total_ratings,
      required: progress.required_total
    }
  }

  // 计算高偏好评分进度
  const getHighPreferenceProgress = () => {
    if (!progress) return { current: 0, required: 5 }
    return {
      current: progress.high_preference_ratings,
      required: progress.required_high_preference
    }
  }

  // 检查是否可以提交所有评分
  const canSubmitAll = () => {
    return images.some(img =>
      img.qualityScore !== null &&
      img.taskMatchScore !== null &&
      img.preferenceScore !== null &&
      !img.isSubmitted
    )
  }

  // 检查是否可以加载下一批
  const canLoadNextBatch = () => {
    return !isLoading && !isSubmitting
  }

  const likedImages = ratedHistory.filter(record => record.preferenceScore >= 4)
  const neutralImages = ratedHistory.filter(record => record.preferenceScore < 4)

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
        <p className="text-lg text-gray-600">正在恢复用户信息...</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
        <p className="text-lg text-gray-600">正在加载图像...</p>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
      <div className="min-w-0">
      {/* 页面标题和进度 */}
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              图像评分任务
            </h1>
            <p className="mt-2 text-gray-600">
              请对以下图像进行评分。每张图像需要从三个维度评分：图像质量（技术层面）、任务匹配（图像与提示/任务的相关度）和个人偏好（主观喜好）。
            </p>
          </div>

          <div className="flex items-center space-x-4">
            <div className="text-right">
              <div className="text-sm text-gray-500">当前批次</div>
              <div className="text-2xl font-bold text-blue-600">#{batchNumber}</div>
            </div>
            <div className="h-10 w-px bg-gray-300"></div>
            <div className="text-right">
              <div className="text-sm text-gray-500">已完成</div>
              <div className="text-2xl font-bold text-green-600">{getCompletedCount()}/{images.length}</div>
            </div>
          </div>
        </div>

        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <h2 className="font-semibold text-base mb-2">评分提醒</h2>
          <div className="space-y-2 leading-6">
            <p>
              本任务包含三个评分维度：
              <span className="font-semibold"> 图像质量</span>、
              <span className="font-semibold"> 任务匹配</span>
              和
              <span className="font-semibold"> 个人偏好</span>。
            </p>
            <p>
              任务匹配分主要关注图像内容与给定提示/任务是否一致，例如主体、属性、场景和整体语义是否贴合描述。
            </p>
            <p>
              请把自己代入“你正在使用文生图模型生成图片”的场景，按
              <span className="font-semibold">自己的真实喜好</span>
              来评分。
            </p>
            <p>
              偏好分更关注你会不会喜欢这张图，比如它的风格、光影、色彩、构图、氛围和整体审美是否打动你。
            </p>
            <p>
              例如：同样都是“猫”的图片，如果一张更符合你的审美和风格偏好，即使另一张也很清晰，你仍然可以给前者更高的偏好分。
            </p>
          </div>
        </div>

        {/* 进度卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">总评分进度</h3>
              <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full">
                {getTotalProgress().current}/{getTotalProgress().required}
              </span>
            </div>
            <div className="relative pt-1">
              <div className="flex mb-2 items-center justify-between">
                <div>
                  <span className="text-xs font-semibold inline-block text-blue-600">
                    {Math.round((getTotalProgress().current / getTotalProgress().required) * 100)}%
                  </span>
                </div>
              </div>
              <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-blue-100">
                <div
                  style={{ width: `${Math.min(100, (getTotalProgress().current / getTotalProgress().required) * 100)}%` }}
                  className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-blue-500 transition-all duration-300"
                ></div>
              </div>
              <p className="text-sm text-gray-600">
                完成至少 {getTotalProgress().required} 条评分即可完成任务
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">高偏好评分进度</h3>
              <span className="px-3 py-1 bg-green-100 text-green-800 text-sm font-medium rounded-full">
                {getHighPreferenceProgress().current}/{getHighPreferenceProgress().required}
              </span>
            </div>
            <div className="relative pt-1">
              <div className="flex mb-2 items-center justify-between">
                <div>
                  <span className="text-xs font-semibold inline-block text-green-600">
                    {Math.round((getHighPreferenceProgress().current / getHighPreferenceProgress().required) * 100)}%
                  </span>
                </div>
              </div>
              <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-green-100">
                <div
                  style={{ width: `${Math.min(100, (getHighPreferenceProgress().current / getHighPreferenceProgress().required) * 100)}%` }}
                  className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-green-500 transition-all duration-300"
                ></div>
              </div>
              <p className="text-sm text-gray-600">
                需要至少 {getHighPreferenceProgress().required} 条偏好分≥4的评分
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 图像网格 */}
      <div className="mb-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {images.map((imageState, index) => (
            <div
              key={imageState.image.image_id}
              className={`bg-white rounded-xl shadow-lg overflow-hidden border-2 transition-all duration-300 ${
                imageState.isSubmitted
                  ? 'border-green-500'
                  : imageState.qualityScore !== null && imageState.taskMatchScore !== null && imageState.preferenceScore !== null
                  ? 'border-blue-500'
                  : 'border-gray-200'
              }`}
            >
              {/* 图像区域 */}
              <div className="relative">
                <img
                  src={imageState.image.image_url}
                  alt={imageState.image.prompt}
                  className="w-full max-h-96 object-contain bg-black"
                  loading="lazy"
                  decoding="async"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement
                    target.src = `https://via.placeholder.com/400x300?text=Image+${imageState.image.image_id}`
                  }}
                />
                <div className="absolute top-3 right-3">
                  <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                    imageState.image.is_real
                      ? 'bg-green-100 text-green-800'
                      : 'bg-purple-100 text-purple-800'
                  }`}>
                    {imageState.image.is_real ? '真实图像' : 'AI生成'}
                  </span>
                </div>
                {imageState.image.category && (
                  <div className="absolute top-3 left-3">
                    <span className="px-2 py-1 text-xs font-semibold bg-blue-100 text-blue-800 rounded-full">
                      {imageState.image.category}
                    </span>
                  </div>
                )}
              </div>

              {/* 图像信息 */}
              <div className="p-4 border-b border-gray-100">
                <p
                  className="text-sm text-gray-600 line-clamp-2"
                  title={imageState.image.prompt}
                >
                  {imageState.image.prompt}
                </p>
                {imageState.image.style && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    <span className="text-xs text-gray-500">风格: </span>
                    <span className="text-xs text-gray-700">{imageState.image.style}</span>
                  </div>
                )}
              </div>

              {/* 评分区域 */}
              <div className="p-4">
                {/* 图像质量评分 */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    图像质量评分 <span className="text-red-500">*</span>
                    <span className="ml-2 text-xs text-gray-500">(技术层面评估)</span>
                  </label>
                  <div className="flex space-x-1">
                    {[1, 2, 3, 4, 5].map(score => (
                      <button
                        key={`quality-${score}`}
                        type="button"
                        onClick={() => updateImageScore(index, 'quality', score)}
                        disabled={imageState.isSubmitted}
                        className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                          imageState.qualityScore === score
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        } ${imageState.isSubmitted ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {score}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>很差</span>
                    <span>一般</span>
                    <span>很好</span>
                  </div>
                </div>

                {/* 任务匹配评分 */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    任务匹配评分 <span className="text-red-500">*</span>
                    <span className="ml-2 text-xs text-gray-500">(图像与任务/提示描述的匹配程度)</span>
                  </label>
                  <div className="flex space-x-1">
                    {[1, 2, 3, 4, 5].map(score => (
                      <button
                        key={`task-${score}`}
                        type="button"
                        onClick={() => updateImageScore(index, 'task' as any, score)}
                        disabled={imageState.isSubmitted}
                        className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                          imageState.taskMatchScore === score
                            ? 'bg-indigo-500 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        } ${imageState.isSubmitted ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {score}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>不匹配</span>
                    <span>一般</span>
                    <span>非常匹配</span>
                  </div>
                </div>

                {/* 个人偏好评分 */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    个人偏好评分 <span className="text-red-500">*</span>
                    <span className="ml-2 text-xs text-gray-500">(主观喜好评估)</span>
                  </label>
                  <div className="flex space-x-1">
                    {[1, 2, 3, 4, 5].map(score => (
                      <button
                        key={`preference-${score}`}
                        type="button"
                        onClick={() => updateImageScore(index, 'preference', score)}
                        disabled={imageState.isSubmitted}
                        className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                          imageState.preferenceScore === score
                            ? score >= 4
                              ? 'bg-green-500 text-white'
                              : 'bg-yellow-500 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        } ${imageState.isSubmitted ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {score}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>不喜欢</span>
                    <span>一般</span>
                    <span>很喜欢</span>
                  </div>
                </div>

                {/* 提交按钮 */}
                <button
                  type="button"
                  onClick={() => submitImageRating(index)}
                  disabled={
                    imageState.isSubmitted ||
                    imageState.qualityScore === null ||
                    imageState.taskMatchScore === null ||
                    imageState.preferenceScore === null ||
                    isSubmitting
                  }
                  className={`w-full py-2.5 px-4 text-sm font-medium rounded-lg transition-colors ${
                    imageState.isSubmitted
                      ? 'bg-green-100 text-green-800 cursor-default'
                      : imageState.qualityScore !== null && imageState.preferenceScore !== null
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {imageState.isSubmitted ? (
                    <span className="flex items-center justify-center">
                      <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      已提交
                    </span>
                  ) : (
                    '提交评分'
                  )}
                </button>

                {/* 评分状态 */}
                {imageState.isSubmitted && (
                  <div className="mt-3 text-center text-xs text-gray-500">
                    质量: {imageState.qualityScore}分 · 匹配: {imageState.taskMatchScore}分 · 偏好: {imageState.preferenceScore}分
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 当图像数量少于3时显示提示 */}
        {images.length < 3 && (
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 mb-4">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">正在加载更多图像...</h3>
            <p className="text-gray-600">系统正在为您准备个性化的图像推荐。</p>
          </div>
        )}
      </div>

      {/* 控制按钮 */}
      <div className="sticky bottom-6 bg-white rounded-xl shadow-xl border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-gray-600">
            <p>
              提示：完成当前批次的所有评分后，可以点击"获取下一批"继续标注。
            </p>
            <p className="mt-1">
              偏好分≥4的图像将被用于优化您的个性化推荐。
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <button
              type="button"
              onClick={submitAllRatings}
              disabled={!canSubmitAll() || isSubmitting}
              className={`px-6 py-3 text-sm font-medium rounded-lg transition-colors ${
                canSubmitAll()
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              提交所有评分
            </button>

            <button
              type="button"
              onClick={loadNextBatch}
              disabled={!canLoadNextBatch()}
              className={`px-6 py-3 text-sm font-medium rounded-lg transition-colors ${
                canLoadNextBatch()
                  ? 'bg-gradient-to-r from-green-500 to-green-600 text-white hover:from-green-600 hover:to-green-700'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              获取下一批图像
            </button>
          </div>
        </div>

        {/* 进度提示 */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="text-sm text-gray-600">
            <div className="flex items-center">
              <div className="w-3 h-3 rounded-full bg-green-500 mr-2"></div>
              <span className="mr-4">已完成评分: {getCompletedCount()} 张</span>
              <div className="w-3 h-3 rounded-full bg-blue-500 mr-2"></div>
              <span className="mr-4">待提交: {images.filter(img => img.qualityScore !== null && img.preferenceScore !== null && !img.isSubmitted).length} 张</span>
              <div className="w-3 h-3 rounded-full bg-gray-300 mr-2"></div>
              <span>未评分: {images.filter(img => img.qualityScore === null || img.taskMatchScore === null || img.preferenceScore === null).length} 张</span>
            </div>
          </div>
        </div>
      </div>

      {/* 评分说明 */}
      <div className="mt-8 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">📝 评分说明</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-gray-800 mb-2">图像质量评分（技术层面）</h4>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• <strong>1分</strong>: 图像模糊、扭曲、有明显缺陷</li>
              <li>• <strong>2分</strong>: 质量一般，存在一些技术问题</li>
              <li>• <strong>3分</strong>: 质量合格，无明显技术问题</li>
              <li>• <strong>4分</strong>: 质量良好，细节清晰</li>
              <li>• <strong>5分</strong>: 质量优秀，达到专业水准</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-gray-800 mb-2">个人偏好评分（主观喜好）</h4>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• <strong>1-2分</strong>: 不喜欢或不太喜欢</li>
              <li>• <strong>3分</strong>: 一般，无特别感觉</li>
              <li>• <strong>4-5分</strong>: 喜欢或非常喜欢</li>
              <li>• <strong>特别说明</strong>: 偏好分≥4的图像会被用于个性化推荐</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-gray-800 mb-2">任务匹配评分（与当前任务的相关度）</h4>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• <strong>1-2分</strong>: 与当前提示/任务基本不相关</li>
              <li>• <strong>3分</strong>: 大致相关，但不够贴切</li>
              <li>• <strong>4-5分</strong>: 与当前提示/任务高度匹配</li>
              <li>• <strong>提示</strong>: 请根据你对任务要求的理解来判断“是否匹配”</li>
            </ul>
          </div>
        </div>
      </div>
      </div>

      <aside className="mt-8 lg:mt-0">
        <div className="lg:sticky lg:top-6 rounded-2xl border border-gray-200 bg-white shadow-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
            <h3 className="text-lg font-semibold text-gray-900">你的兴趣回顾</h3>
            <p className="mt-1 text-sm text-gray-600">
              已评分图像会按偏好高低分组展示，方便你回看自己的兴趣倾向。
            </p>
          </div>

          <div className="max-h-[75vh] overflow-y-auto p-4 space-y-5">
            <section>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-green-700">偏好 ≥ 4，感兴趣</h4>
                <span className="text-xs text-green-700 bg-green-50 px-2 py-1 rounded-full">{likedImages.length} 张</span>
              </div>
              <div className="space-y-3">
                {likedImages.length > 0 ? likedImages.map(record => (
                  <div key={`${record.image.image_id}-${record.batchNumber}-liked`} className="rounded-xl border border-green-100 bg-green-50/60 p-3">
                    <div className="flex gap-3">
                      <img
                        src={record.image.image_url}
                        alt={record.image.prompt}
                        className="h-20 w-20 rounded-lg object-cover flex-shrink-0"
                        loading="lazy"
                        decoding="async"
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className="text-sm font-medium text-gray-900 line-clamp-2"
                          title={record.image.prompt || `图像 ${record.image.image_id}`}
                        >
                          {record.image.prompt || `图像 ${record.image.image_id}`}
                        </p>
                        <p className="mt-2 text-xs text-gray-600">质量 {record.qualityScore} / 偏好 {record.preferenceScore}</p>
                        <p className="mt-1 text-xs text-gray-500">批次 #{record.batchNumber}</p>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="rounded-xl border border-dashed border-green-200 p-4 text-sm text-gray-500 bg-white">
                    你给偏好分 ≥ 4 的图像会显示在这里。
                  </div>
                )}
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-gray-700">偏好 &lt; 4，一般或不感兴趣</h4>
                <span className="text-xs text-gray-700 bg-gray-100 px-2 py-1 rounded-full">{neutralImages.length} 张</span>
              </div>
              <div className="space-y-3">
                {neutralImages.length > 0 ? neutralImages.map(record => (
                  <div key={`${record.image.image_id}-${record.batchNumber}-neutral`} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <div className="flex gap-3">
                      <img
                        src={record.image.image_url}
                        alt={record.image.prompt}
                        className="h-20 w-20 rounded-lg object-cover flex-shrink-0"
                        loading="lazy"
                        decoding="async"
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className="text-sm font-medium text-gray-900 line-clamp-2"
                          title={record.image.prompt || `图像 ${record.image.image_id}`}
                        >
                          {record.image.prompt || `图像 ${record.image.image_id}`}
                        </p>
                        <p className="mt-2 text-xs text-gray-600">质量 {record.qualityScore} / 偏好 {record.preferenceScore}</p>
                        <p className="mt-1 text-xs text-gray-500">批次 #{record.batchNumber}</p>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="rounded-xl border border-dashed border-gray-200 p-4 text-sm text-gray-500 bg-white">
                    偏好较低的图像会显示在这里，帮助你回顾自己的选择。
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </aside>
    </div>
  )
}