import { Outlet, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { ratingAPI } from '../services/api'
import { UserProgress } from '../types'
import { toast } from 'react-hot-toast'

export default function Layout() {
  const navigate = useNavigate()
  const { user, isAuthenticated, logout, setUser } = useAuthStore()
  const [progress, setProgress] = useState<UserProgress | null>(null)

  // 获取用户进度
  useEffect(() => {
    if (isAuthenticated && user) {
      fetchUserProgress()
    }
  }, [isAuthenticated, user])

  const fetchUserProgress = async () => {
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
    } catch (error) {
      console.error('获取用户进度失败:', error)
      toast.error('获取进度信息失败')
    }
  }

  const handleLogout = () => {
    logout()
    toast.success('已退出登录')
    navigate('/')
  }

  // 计算进度百分比
  const calculateProgress = () => {
    if (!progress) return { total: 0, highPref: 0 }

    const totalPercent = Math.min(100, (progress.total_ratings / progress.required_total) * 100)
    const highPrefPercent = Math.min(100, (progress.high_preference_ratings / progress.required_high_preference) * 100)

    return { total: totalPercent, highPref: highPrefPercent }
  }

  const progressInfo = calculateProgress()
  const genderLabel = user?.gender?.toLowerCase() === 'male'
    ? '男性'
    : user?.gender?.toLowerCase() === 'female'
    ? '女性'
    : '其他'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 导航栏 */}
      <nav className="bg-white shadow-lg border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            {/* 左侧：logo和品牌 */}
            <div className="flex items-center">
              <div className="flex-shrink-0 flex items-center">
                <div className="h-8 w-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg"></div>
                <span className="ml-3 text-xl font-bold text-gray-900">
                  图像标注系统
                </span>
              </div>
            </div>

            {/* 右侧：用户信息和进度 */}
            {isAuthenticated && user && (
              <div className="flex items-center space-x-6">
                {/* 进度显示 */}
                <div className="hidden md:block">
                  <div className="text-sm text-gray-600 mb-1">
                    标注进度
                  </div>
                  <div className="flex items-center space-x-4">
                    {/* 总评分进度 */}
                    <div className="w-32">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>总评分</span>
                        <span>{progress?.total_ratings || 0}/{progress?.required_total || 20}</span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 transition-all duration-300"
                          style={{ width: `${progressInfo.total}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* 高偏好评分进度 */}
                    <div className="w-32">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>偏好≥4</span>
                        <span>{progress?.high_preference_ratings || 0}/{progress?.required_high_preference || 5}</span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 transition-all duration-300"
                          style={{ width: `${progressInfo.highPref}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 用户信息 */}
                <div className="flex items-center space-x-3">
                  <div className="text-right hidden sm:block">
                    <div className="text-sm font-medium text-gray-900">
                      {user.age}岁 · {genderLabel}
                    </div>
                    <div className="text-xs text-gray-500">
                      {user.jobs.slice(0, 2).map(job => job).join(' · ')}
                      {user.jobs.length > 2 && '...'}
                    </div>
                  </div>

                  {/* 用户头像 */}
                  <div className="h-8 w-8 bg-gradient-to-r from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-white font-semibold">
                    {user.age.toString().slice(-1)}
                  </div>

                  {/* 退出按钮 */}
                  <button
                    onClick={handleLogout}
                    className="px-4 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    退出
                  </button>
                </div>
              </div>
            )}

            {/* 未登录状态 */}
            {!isAuthenticated && (
              <div className="flex items-center">
                <div className="text-sm text-gray-500">
                  请先注册以开始标注
                </div>
              </div>
            )}
          </div>

          {/* 移动端进度条 */}
          {isAuthenticated && user && (
            <div className="md:hidden py-3 border-t border-gray-100">
              <div className="space-y-3">
                {/* 总评分进度 */}
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>总评分进度</span>
                    <span>{progress?.total_ratings || 0}/{progress?.required_total || 20}</span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all duration-300"
                      style={{ width: `${progressInfo.total}%` }}
                    ></div>
                  </div>
                </div>

                {/* 高偏好评分进度 */}
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>偏好≥4进度</span>
                    <span>{progress?.high_preference_ratings || 0}/{progress?.required_high_preference || 5}</span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 transition-all duration-300"
                      style={{ width: `${progressInfo.highPref}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* 主内容区域 */}
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <Outlet />
      </main>

      {/* 页脚 */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <div className="text-center text-sm text-gray-500">
            <p>个性化图像生成研究项目 © {new Date().getFullYear()}</p>
            <p className="mt-1">所有用户数据将严格保密，仅用于学术研究</p>
            <div className="mt-3 flex justify-center space-x-6">
              <a href="#" className="text-gray-400 hover:text-gray-500">
                隐私政策
              </a>
              <a href="#" className="text-gray-400 hover:text-gray-500">
                使用条款
              </a>
              <a href="#" className="text-gray-400 hover:text-gray-500">
                联系我们
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}