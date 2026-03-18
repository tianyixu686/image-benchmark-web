import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { ratingAPI } from '../services/api'
import { UserProgress, Rating } from '../types'
import { toast } from 'react-hot-toast'

export default function CompletionPage() {
  const navigate = useNavigate()
  const { user, isAuthenticated, setUser } = useAuthStore()
  const [progress, setProgress] = useState<UserProgress | null>(null)
  const [recentRatings, setRecentRatings] = useState<Rating[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // 检查认证状态
  useEffect(() => {
    if (!isAuthenticated || !user) {
      navigate('/register')
      return
    }

    // 检查用户是否真的完成了任务
    loadUserProgress()
  }, [isAuthenticated, user, navigate])

  const loadUserProgress = async () => {
    if (!user) return

    setIsLoading(true)
    try {
      const response = await ratingAPI.getUserProgress(user.user_id)
      setProgress(response)

      if (user.completed !== response.completed) {
        setUser({
          ...user,
          completed: response.completed,
        })
      }

      // 如果用户未完成，跳转回评分页面
      if (!response.completed) {
        toast('您尚未完成标注任务')
        navigate('/scoring')
        return
      }

      // 加载最近的评分记录
      await loadRecentRatings()

    } catch (error) {
      console.error('获取用户进度失败:', error)
      toast.error('获取进度信息失败')
    } finally {
      setIsLoading(false)
    }
  }

  const loadRecentRatings = async () => {
    if (!user) return

    try {
      const response = await ratingAPI.getUserRatings(user.user_id)
      // 取最近的10条评分
      setRecentRatings(response.slice(-10).reverse())
    } catch (error) {
      console.error('加载评分记录失败:', error)
    }
  }

  const handleRestart = () => {
    // 可以添加确认对话框
    navigate('/scoring')
  }

  const handleShare = () => {
    const shareText = `我刚完成了个性化图像生成标注任务，共标注了${progress?.total_ratings || 0}张图像！快来参与这个有趣的研究项目吧！`
    const shareUrl = window.location.origin

    if (navigator.share) {
      navigator.share({
        title: '个性化图像生成标注任务',
        text: shareText,
        url: shareUrl,
      })
    } else {
      // 复制到剪贴板
      navigator.clipboard.writeText(`${shareText} ${shareUrl}`)
        .then(() => toast.success('分享链接已复制到剪贴板'))
        .catch(() => toast.error('复制失败'))
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-500 mb-4"></div>
        <p className="text-lg text-gray-600">正在加载完成信息...</p>
      </div>
    )
  }

  if (!progress?.completed) {
    return null
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* 庆祝头部 */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-r from-green-400 to-blue-500 mb-6">
          <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          恭喜！您已完成标注任务！🎉
        </h1>
        <p className="text-xl text-gray-600">
          感谢您为个性化图像生成研究做出的宝贵贡献！
        </p>
      </div>

      {/* 成就卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl p-6 border border-blue-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-blue-800">总评分数量</h3>
            <div className="p-2 bg-blue-200 rounded-lg">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
          </div>
          <div className="text-5xl font-bold text-blue-600 mb-2">{progress.total_ratings}</div>
          <p className="text-sm text-blue-700">您完成了全部标注任务</p>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-2xl p-6 border border-green-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-green-800">高偏好评分</h3>
            <div className="p-2 bg-green-200 rounded-lg">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905a3.61 3.61 0 01-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
              </svg>
            </div>
          </div>
          <div className="text-5xl font-bold text-green-600 mb-2">{progress.high_preference_ratings}</div>
          <p className="text-sm text-green-700">偏好分≥4的高质量标注</p>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl p-6 border border-purple-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-purple-800">贡献度评级</h3>
            <div className="p-2 bg-purple-200 rounded-lg">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            </div>
          </div>
          <div className="text-5xl font-bold text-purple-600 mb-2">
            {progress.total_ratings >= 50 ? '金牌' :
             progress.total_ratings >= 30 ? '银牌' : '铜牌'}
          </div>
          <p className="text-sm text-purple-700">基于标注数量的评级</p>
        </div>
      </div>

      {/* 详细统计 */}
      <div className="bg-white rounded-2xl shadow-lg p-8 mb-10">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">详细统计数据</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* 评分分布 */}
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">评分分布</h3>
            <div className="space-y-4">
              {[5, 4, 3, 2, 1].map(score => {
                // 这里应该从API获取实际的分布数据
                // 暂时使用模拟数据
                const percentage = score === 5 ? 35 : score === 4 ? 25 : score === 3 ? 20 : score === 2 ? 15 : 5
                return (
                  <div key={score} className="flex items-center">
                    <div className="w-16 text-sm font-medium text-gray-700">
                      {score}分
                    </div>
                    <div className="flex-1 ml-4">
                      <div className="flex justify-between mb-1">
                        <span className="text-xs text-gray-500">偏好评分</span>
                        <span className="text-xs font-medium text-gray-700">{percentage}%</span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${score >= 4 ? 'bg-green-500' : score === 3 ? 'bg-yellow-500' : 'bg-red-500'}`}
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 用户画像 */}
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">您的兴趣画像</h3>
            <div className="space-y-3">
              {user?.interests?.slice(0, 6).map((interest, index) => (
                <div key={index} className="flex items-center">
                  <div className="w-3 h-3 rounded-full bg-blue-500 mr-3"></div>
                  <span className="text-gray-700">{interest}</span>
                </div>
              ))}
              {user?.interests && user.interests.length > 6 && (
                <div className="text-sm text-gray-500">
                  等 {user.interests.length - 6} 个其他兴趣
                </div>
              )}
            </div>

            <div className="mt-6 pt-6 border-t border-gray-200">
              <h4 className="text-sm font-medium text-gray-700 mb-3">标注时间线</h4>
              <div className="space-y-2">
                {recentRatings.slice(0, 5).map((rating, index) => (
                  <div key={index} className="flex items-center text-sm">
                    <div className="w-2 h-2 rounded-full bg-blue-500 mr-3"></div>
                    <span className="text-gray-600 flex-1">
                      批次 #{rating.batch_number}
                    </span>
                    <span className="text-gray-500">
                      质量: {rating.quality_score} | 偏好: {rating.preference_score}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 后续行动 */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-8 border border-blue-200 mb-10">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">下一步行动</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-green-100 text-green-600 mb-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">了解研究进展</h3>
            <p className="text-sm text-gray-600 mb-4">
              关注研究团队的最新成果，了解您的贡献如何推动个性化图像生成技术的发展。
            </p>
            <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              查看研究成果 →
            </button>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-purple-100 text-purple-600 mb-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">邀请朋友参与</h3>
            <p className="text-sm text-gray-600 mb-4">
              分享这个项目给朋友，帮助研究团队收集更多样化的数据。
            </p>
            <button
              onClick={handleShare}
              className="text-sm text-purple-600 hover:text-purple-800 font-medium"
            >
              分享项目 →
            </button>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-orange-100 text-orange-600 mb-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">继续标注</h3>
            <p className="text-sm text-gray-600 mb-4">
              如果您愿意贡献更多数据，可以继续参与标注任务。
            </p>
            <button
              onClick={handleRestart}
              className="text-sm text-orange-600 hover:text-orange-800 font-medium"
            >
              继续标注 →
            </button>
          </div>
        </div>
      </div>

      {/* 感谢信息和联系 */}
      <div className="text-center">
        <div className="inline-block p-6 bg-gradient-to-r from-blue-100 to-blue-200 rounded-2xl mb-6">
          <svg className="w-12 h-12 text-blue-600 mx-auto mb-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 100-2 1 1 0 000 2zm7-1a1 1 0 11-2 0 1 1 0 012 0zm-.464 5.535a1 1 0 10-1.415-1.414 3 3 0 01-4.242 0 1 1 0 00-1.415 1.414 5 5 0 007.072 0z" clipRule="evenodd" />
          </svg>
          <h3 className="text-xl font-bold text-blue-800 mb-2">衷心感谢！</h3>
          <p className="text-blue-700">
            您的每一份标注都为个性化图像生成研究提供了宝贵的数据支持。
          </p>
        </div>

        <div className="text-sm text-gray-600">
          <p>研究团队将基于您和其他参与者的数据，开发更智能的个性化图像生成算法。</p>
          <p className="mt-2">如果您对研究结果感兴趣或有任何疑问，欢迎通过以下方式联系我们：</p>
          <div className="mt-4 flex justify-center space-x-6">
            <a href="mailto:research@example.com" className="text-blue-600 hover:text-blue-800">
              research@example.com
            </a>
            <a href="#" className="text-blue-600 hover:text-blue-800">
              研究项目主页
            </a>
            <a href="#" className="text-blue-600 hover:text-blue-800">
              隐私政策
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}