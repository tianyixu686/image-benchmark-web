import { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import { adminAPI } from '../services/api'

interface User {
  user_id: number
  age: number
  gender: string
  jobs: string[]
  interests: string[]
  created_at: string
  completed: boolean
  rating_count: number
}

interface Rating {
  rating_id: number
  user_id: number
  image_id: string
  quality_score: number
  preference_score: number
  batch_number: number
  created_at: string
}

interface SystemStats {
  total_users: number
  total_ratings: number
  completed_users: number
  avg_ratings_per_user: number
  rating_distribution: {
    quality: Record<string, number>
    preference: Record<string, number>
  }
}

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([])
  const [ratings, setRatings] = useState<Rating[]>([])
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [activeTab, setActiveTab] = useState<'users' | 'ratings' | 'stats'>('users')
  const [isLoading, setIsLoading] = useState(true)
  const [isExporting, setIsExporting] = useState(false)

  useEffect(() => {
    loadData()
  }, [activeTab])

  const loadData = async () => {
    setIsLoading(true)
    try {
      switch (activeTab) {
        case 'users':
          const usersResponse = await adminAPI.getUsers(0, 100)
          setUsers(usersResponse as User[])
          break
        case 'ratings':
          const ratingsResponse = await adminAPI.getRatings(0, 100)
          setRatings(ratingsResponse as Rating[])
          break
        case 'stats':
          const statsResponse = await adminAPI.getStats()
          setStats(statsResponse as SystemStats)
          break
      }
    } catch (error: any) {
      console.error('加载数据失败:', error)
      toast.error(error.response?.data?.detail || '加载数据失败')
    } finally {
      setIsLoading(false)
    }
  }

  const handleExportData = async () => {
    setIsExporting(true)
    try {
      const response = await adminAPI.exportData()

      // 创建下载链接
      const dataStr = JSON.stringify(response, null, 2)
      const dataBlob = new Blob([dataStr], { type: 'application/json' })
      const url = URL.createObjectURL(dataBlob)

      const link = document.createElement('a')
      link.href = url
      link.download = `rating_export_${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast.success('数据导出成功')
    } catch (error: any) {
      console.error('导出数据失败:', error)
      toast.error(error.response?.data?.detail || '导出数据失败')
    } finally {
      setIsExporting(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-CN')
  }

  const renderUsersTable = () => (
    <div className="bg-white shadow-lg rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">用户列表</h3>
        <span className="text-sm text-gray-500">共 {users.length} 位用户</span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">用户ID</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">年龄/性别</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">职业</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">兴趣</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">注册时间</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">评分数</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.map((user) => (
              <tr key={user.user_id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">#{user.user_id}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.age}岁 · {user.gender}</td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  <div className="max-w-xs truncate" title={user.jobs.join(', ')}>
                    {user.jobs.slice(0, 2).join(', ')}
                    {user.jobs.length > 2 && '...'}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  <div className="max-w-xs truncate" title={user.interests.join(', ')}>
                    {user.interests.slice(0, 2).join(', ')}
                    {user.interests.length > 2 && '...'}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(user.created_at)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.rating_count}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    user.completed ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {user.completed ? '已完成' : '进行中'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )

  const renderRatingsTable = () => (
    <div className="bg-white shadow-lg rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">评分记录</h3>
        <span className="text-sm text-gray-500">共 {ratings.length} 条评分</span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">评分ID</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">用户ID</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">图像ID</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">质量分</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">偏好分</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">批次</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">时间</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {ratings.map((rating) => (
              <tr key={rating.rating_id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">#{rating.rating_id}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">#{rating.user_id}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{rating.image_id}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    rating.quality_score >= 4 ? 'bg-green-100 text-green-800' :
                    rating.quality_score >= 3 ? 'bg-blue-100 text-blue-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {rating.quality_score}分
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    rating.preference_score >= 4 ? 'bg-green-100 text-green-800' :
                    rating.preference_score >= 3 ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {rating.preference_score}分
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">#{rating.batch_number}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(rating.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )

  const renderStats = () => {
    if (!stats) return null

    return (
      <div className="space-y-6">
        {/* 概览卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-xl shadow p-6">
            <div className="text-sm text-gray-500 mb-2">总用户数</div>
            <div className="text-3xl font-bold text-blue-600">{stats.total_users}</div>
          </div>
          <div className="bg-white rounded-xl shadow p-6">
            <div className="text-sm text-gray-500 mb-2">总评分数</div>
            <div className="text-3xl font-bold text-green-600">{stats.total_ratings}</div>
          </div>
          <div className="bg-white rounded-xl shadow p-6">
            <div className="text-sm text-gray-500 mb-2">完成用户数</div>
            <div className="text-3xl font-bold text-purple-600">{stats.completed_users}</div>
          </div>
          <div className="bg-white rounded-xl shadow p-6">
            <div className="text-sm text-gray-500 mb-2">人均评分</div>
            <div className="text-3xl font-bold text-orange-600">{stats.avg_ratings_per_user.toFixed(1)}</div>
          </div>
        </div>

        {/* 评分分布 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">质量评分分布</h3>
            <div className="space-y-3">
              {[5, 4, 3, 2, 1].map(score => {
                const count = stats.rating_distribution.quality[score] || 0
                const total = stats.total_ratings
                const percentage = total > 0 ? (count / total * 100).toFixed(1) : 0
                return (
                  <div key={score} className="flex items-center">
                    <div className="w-12 text-sm font-medium text-gray-700">{score}分</div>
                    <div className="flex-1 ml-4">
                      <div className="flex justify-between mb-1">
                        <span className="text-xs text-gray-500">{count} 条</span>
                        <span className="text-xs font-medium text-gray-700">{percentage}%</span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${
                            score >= 4 ? 'bg-green-500' : score === 3 ? 'bg-blue-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">偏好评分分布</h3>
            <div className="space-y-3">
              {[5, 4, 3, 2, 1].map(score => {
                const count = stats.rating_distribution.preference[score] || 0
                const total = stats.total_ratings
                const percentage = total > 0 ? (count / total * 100).toFixed(1) : 0
                return (
                  <div key={score} className="flex items-center">
                    <div className="w-12 text-sm font-medium text-gray-700">{score}分</div>
                    <div className="flex-1 ml-4">
                      <div className="flex justify-between mb-1">
                        <span className="text-xs text-gray-500">{count} 条</span>
                        <span className="text-xs font-medium text-gray-700">{percentage}%</span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${
                            score >= 4 ? 'bg-green-500' : score === 3 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* 页面标题和操作 */}
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">系统管理面板</h1>
            <p className="mt-2 text-gray-600">查看用户数据、评分记录和系统统计</p>
          </div>
          <button
            onClick={handleExportData}
            disabled={isExporting}
            className={`px-6 py-3 font-medium rounded-lg transition-colors flex items-center ${
              isExporting
                ? 'bg-gray-400 text-white cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isExporting ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                导出中...
              </>
            ) : (
              <>
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                导出数据 (rating_1.json)
              </>
            )}
          </button>
        </div>

        {/* 标签页 */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {[
              { id: 'users', label: '用户管理', count: users.length },
              { id: 'ratings', label: '评分记录', count: ratings.length },
              { id: 'stats', label: '系统统计', count: null },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`
                  py-4 px-1 border-b-2 font-medium text-sm
                  ${activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                {tab.label}
                {tab.count !== null && (
                  <span className={`ml-2 py-0.5 px-2.5 rounded-full text-xs ${
                    activeTab === tab.id
                      ? 'bg-blue-100 text-blue-600'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* 内容区域 */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
          <p className="text-lg text-gray-600">加载数据中...</p>
        </div>
      ) : (
        <div className="mt-6">
          {activeTab === 'users' && renderUsersTable()}
          {activeTab === 'ratings' && renderRatingsTable()}
          {activeTab === 'stats' && renderStats()}
        </div>
      )}

      {/* 系统信息 */}
      <div className="mt-8 p-6 bg-gray-50 rounded-xl border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">系统信息</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
          <div>
            <span className="font-medium">数据更新时间:</span> {new Date().toLocaleString('zh-CN')}
          </div>
          <div>
            <span className="font-medium">数据导出格式:</span> rating_1.json
          </div>
          <div>
            <span className="font-medium">数据总量:</span> {stats?.total_ratings || 0} 条评分
          </div>
        </div>
      </div>
    </div>
  )
}