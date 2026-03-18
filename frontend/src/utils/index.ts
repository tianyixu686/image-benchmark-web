// 格式化日期
export const formatDate = (dateString: string): string => {
  const date = new Date(dateString)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// 生成随机ID
export const generateId = (): string => {
  return Math.random().toString(36).substr(2, 9)
}

// 验证邮箱格式
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

// 验证年龄
export const isValidAge = (age: number): boolean => {
  return age >= 1 && age <= 120
}

// 防抖函数
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void => {
  let timeout: ReturnType<typeof setTimeout> | null = null

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

// 节流函数
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void => {
  let inThrottle: boolean = false

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }
}

// 深拷贝（简单实现）
export const deepClone = <T>(obj: T): T => {
  return JSON.parse(JSON.stringify(obj))
}

// 获取图像URL
export const getImageUrl = (imageId: string, basePath: string = '/static/images'): string => {
  return `${basePath}/${imageId}.jpg`
}

// 计算进度百分比
export const calculateProgress = (current: number, total: number): number => {
  if (total === 0) return 0
  return Math.min(100, Math.round((current / total) * 100))
}

// 数组分组
export const chunkArray = <T>(array: T[], size: number): T[][] => {
  const result: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size))
  }
  return result
}

// 获取评分颜色
export const getScoreColor = (score: number): string => {
  const colors = [
    'bg-red-500',    // 1分
    'bg-orange-500', // 2分
    'bg-yellow-500', // 3分
    'bg-blue-500',   // 4分
    'bg-green-500',  // 5分
  ]
  return colors[score - 1] || 'bg-gray-500'
}