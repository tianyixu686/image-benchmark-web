import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import {
  genderOptions,
  jobOptions,
  interestOptions,
  type OptionGroup,
  type OptionItem
} from '../data/options'
import { authAPI } from '../services/api'
import { useAuthStore } from '../store/authStore'
import { UserRegisterData } from '../types'

// 表单数据类型
interface RegisterFormData {
  age: string
  gender: string
  jobs: string[]
  interests: string[]
}

export default function RegisterPage() {
  const navigate = useNavigate()
  const { setToken, setUser } = useAuthStore()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterFormData>({
    defaultValues: {
      age: '',
      gender: '',
      jobs: [],
      interests: [],
    },
  })

  // 监听职业和兴趣选择
  const selectedJobs = watch('jobs')
  const selectedInterests = watch('interests')

  // 全选/取消全选某个类别的兴趣
  const toggleAllInterestsInCategory = (options: OptionItem[]) => {
    const allInterestIdsInCategory = options.map(opt => opt.id)
    const currentInterests = new Set(selectedInterests)

    const allSelected = allInterestIdsInCategory.every(id => currentInterests.has(id))

    if (allSelected) {
      // 取消全选
      allInterestIdsInCategory.forEach(id => currentInterests.delete(id))
    } else {
      // 全选
      allInterestIdsInCategory.forEach(id => currentInterests.add(id))
    }

    // 更新表单值
    return Array.from(currentInterests)
  }

  const mapGenderToApiValue = (gender: string) => {
    switch (gender) {
      case 'male':
        return 'Male'
      case 'female':
        return 'Female'
      default:
        return 'Other'
    }
  }

  // 获取某个类别中已选择的选项数量
  const getSelectedCountInCategory = (categoryOptions: OptionItem[], selectedItems: string[]) => {
    const categoryIds = categoryOptions.map(opt => opt.id)
    return selectedItems.filter(id => categoryIds.includes(id)).length
  }

  const onSubmit = async (data: RegisterFormData) => {
    // 验证表单
    if (data.jobs.length === 0) {
      toast.error('请至少选择一个职业')
      return
    }

    if (data.interests.length === 0) {
      toast.error('请至少选择一个兴趣')
      return
    }

    setIsSubmitting(true)

    try {
      // 准备提交数据
      const userData: UserRegisterData = {
        age: parseInt(data.age, 10),
        gender: mapGenderToApiValue(data.gender),
        jobs: data.jobs,
        interests: data.interests,
      }

      // 调用注册API
      const response = await authAPI.register(userData)

      // 保存认证信息
      setToken(response.access_token)

      // 获取用户信息
      const userResponse = await authAPI.getCurrentUser()
      setUser(userResponse)

      toast.success('注册成功！')

      // 跳转到评分页面
      navigate('/scoring')

    } catch (error: any) {
      console.error('注册失败:', error)
      toast.error(error.response?.data?.detail || '注册失败，请重试')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            个性化图像生成标注系统
          </h1>
          <p className="text-lg text-gray-600">
            欢迎参与个性化图像生成研究项目！请填写以下信息以开始标注任务。
          </p>
          <div className="mt-4 p-5 bg-blue-50 rounded-lg border border-blue-200 text-left">
            <h3 className="font-semibold text-blue-800 mb-2">📋 任务说明：</h3>
            <div className="space-y-4 text-sm text-blue-800">
              <p>
                请把自己代入到“正在使用文生图模型生成图片”的场景中，按照
                <span className="font-semibold">你自己的真实喜好</span>
                来打分，而不是猜测“别人会不会喜欢”。
              </p>
              <ul className="space-y-2 text-blue-700">
                <li>• 您需要对一系列 AI 生成和真实图像进行评分。</li>
                <li>• 每张图像都要从三个维度评分：<span className="font-semibold">图像质量</span>、<span className="font-semibold">任务匹配</span> 和 <span className="font-semibold">个人偏好</span>。</li>
                <li>• 完成至少 20 条评分，且偏好分 ≥4 的图像至少 5 张，即可完成任务。</li>
                <li>• 您的个人信息仅用于研究分析，我们会严格保密。</li>
              </ul>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-lg bg-white/80 p-4 border border-blue-100">
                  <h4 className="font-semibold text-blue-900 mb-2">偏好分重点看什么？</h4>
                  <ul className="space-y-1 text-blue-700">
                    <li>• 画面是否符合你的审美</li>
                    <li>• 风格是否是你喜欢的类型</li>
                    <li>• 光影、色彩、构图是否让你舒服</li>
                    <li>• 主题氛围是否让你愿意“选这张图”</li>
                  </ul>
                </div>
                <div className="rounded-lg bg-white/80 p-4 border border-blue-100">
                  <h4 className="font-semibold text-blue-900 mb-2">举个例子</h4>
                  <p className="text-blue-700 leading-6">
                    比如同样都是“猫”的图片，如果一张是你喜欢的赛博朋克风、色彩和构图都很吸引你，
                    那么偏好分可以打高；如果另一张虽然清晰，但风格普通、不是你会主动选择的类型，
                    偏好分就可以打低一些。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white shadow-xl rounded-2xl p-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
            {/* 基本信息部分 */}
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-3 border-b border-gray-200">
                基本信息
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* 年龄 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    年龄 <span className="text-red-500">*</span>
                  </label>
                  <select
                    {...register('age', {
                      required: '请选择年龄',
                      validate: value => {
                        const age = parseInt(value, 10)
                        return (age >= 18 && age <= 80) || '年龄必须在18-80岁之间'
                      }
                    })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  >
                    <option value="">请选择年龄</option>
                    {Array.from({ length: 63 }, (_, i) => i + 18).map(age => (
                      <option key={age} value={age}>
                        {age} 岁
                      </option>
                    ))}
                  </select>
                  {errors.age && (
                    <p className="mt-2 text-sm text-red-600">{errors.age.message}</p>
                  )}
                </div>

                {/* 性别 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    性别 <span className="text-red-500">*</span>
                  </label>
                  <select
                    {...register('gender', { required: '请选择性别' })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  >
                    <option value="">请选择性别</option>
                    {genderOptions.map(option => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {errors.gender && (
                    <p className="mt-2 text-sm text-red-600">{errors.gender.message}</p>
                  )}
                </div>
              </div>
            </div>

            {/* 职业选择部分 */}
            <div>
              <div className="flex justify-between items-center mb-6 pb-3 border-b border-gray-200">
                <h2 className="text-2xl font-bold text-gray-900">
                  职业/身份（单选） <span className="text-red-500">*</span>
                </h2>
                <div className="text-sm text-gray-500">
                  已选择 {selectedJobs.length} / 1 项
                </div>
              </div>
              <p className="text-sm text-gray-500 mb-4">
                请选择一个最符合您情况的职业/身份（仅选一个）。
              </p>

              <Controller
                name="jobs"
                control={control}
                rules={{ required: '请至少选择一个职业' }}
                render={({ field }) => (
                  <div className="space-y-6">
                    {jobOptions.map((category: OptionGroup) => (
                      <div key={category.category} className="border border-gray-200 rounded-lg p-5">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="text-lg font-semibold text-gray-800">
                            {category.category}
                          </h3>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          {category.options.map((option: OptionItem) => (
                            <label
                              key={option.id}
                              className={`flex items-center p-3 border rounded-lg cursor-pointer transition-all ${
                                field.value.includes(option.id)
                                  ? 'border-blue-500 bg-blue-50'
                                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              <input
                                type="radio"
                                className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                checked={field.value.includes(option.id)}
                                onChange={() => {
                                  field.onChange([option.id])
                                }}
                              />
                              <span className="ml-3 text-sm text-gray-700">
                                {option.label}
                                <span className="block text-xs text-gray-500 mt-1">
                                  {option.englishLabel}
                                </span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              />
              {errors.jobs && (
                <p className="mt-2 text-sm text-red-600">{errors.jobs.message}</p>
              )}
            </div>

            {/* 兴趣选择部分 */}
            <div>
              <div className="flex justify-between items-center mb-6 pb-3 border-b border-gray-200">
                <h2 className="text-2xl font-bold text-gray-900">
                  兴趣爱好 <span className="text-red-500">*</span>
                </h2>
                <div className="text-sm text-gray-500">
                  已选择 {selectedInterests.length} 项
                </div>
              </div>
              <p className="text-sm text-gray-500 mb-4">
                您可以选择一个或多个感兴趣的方向（可多选）。
              </p>

              <Controller
                name="interests"
                control={control}
                rules={{ required: '请至少选择一个兴趣' }}
                render={({ field }) => (
                  <div className="space-y-6">
                    {interestOptions.map((category: OptionGroup) => (
                      <div key={category.category} className="border border-gray-200 rounded-lg p-5">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="text-lg font-semibold text-gray-800">
                            {category.category}
                          </h3>
                          <button
                            type="button"
                            onClick={() => {
                              const newInterests = toggleAllInterestsInCategory(category.options)
                              field.onChange(newInterests)
                            }}
                            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                          >
                            {getSelectedCountInCategory(category.options, field.value) === category.options.length
                              ? '取消全选'
                              : '全选'}
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          {category.options.map((option: OptionItem) => (
                            <label
                              key={option.id}
                              className={`flex items-center p-3 border rounded-lg cursor-pointer transition-all ${
                                field.value.includes(option.id)
                                  ? 'border-blue-500 bg-blue-50'
                                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                checked={field.value.includes(option.id)}
                                onChange={(e) => {
                                  const newInterests = e.target.checked
                                    ? [...field.value, option.id]
                                    : field.value.filter((id: string) => id !== option.id)
                                  field.onChange(newInterests)
                                }}
                              />
                              <span className="ml-3 text-sm text-gray-700">
                                {option.label}
                                <span className="block text-xs text-gray-500 mt-1">
                                  {option.englishLabel}
                                </span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              />
              {errors.interests && (
                <p className="mt-2 text-sm text-red-600">{errors.interests.message}</p>
              )}
            </div>

            {/* 提交按钮 */}
            <div className="pt-6 border-t border-gray-200">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-sm text-gray-500">
                  <p>所有信息均为必填项，用于个性化推荐算法。</p>
                  <p className="mt-1">您的数据将受到严格保护，仅用于学术研究。</p>
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`px-8 py-3 text-lg font-medium text-white rounded-lg transition-colors ${
                    isSubmitting
                      ? 'bg-blue-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
                  }`}
                >
                  {isSubmitting ? '提交中...' : '开始标注任务'}
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* 底部信息 */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>如有任何问题或建议，请联系研究团队。</p>
          <p className="mt-1">感谢您为个性化图像生成研究做出的贡献！</p>
        </div>
      </div>
    </div>
  )
}