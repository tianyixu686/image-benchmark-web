// 职业和兴趣选项数据
// 从原始txt文件解析生成

export interface OptionGroup {
  category: string
  options: OptionItem[]
}

export interface OptionItem {
  id: string
  label: string
  englishLabel: string
}

// 解析职业数据
export const jobOptions: OptionGroup[] = [
  {
    category: "🎓 Student & Majors (学生与专业方向)",
    options: [
      { id: "computer_science", label: "计算机专业", englishLabel: "Computer Science Student" },
      { id: "art_design", label: "艺术设计专业", englishLabel: "Art & Design Student" },
      { id: "business_finance", label: "商科金融专业", englishLabel: "Business & Finance Student" },
      { id: "medical", label: "医科学生", englishLabel: "Medical Student" },
      { id: "engineering", label: "工科学生", englishLabel: "Engineering Student" },
      { id: "liberal_arts", label: "文科专业", englishLabel: "Liberal Arts Student" },
      { id: "science", label: "理科专业", englishLabel: "Science Student" },
      { id: "law", label: "法学学生", englishLabel: "Law Student" },
      { id: "education", label: "教育专业", englishLabel: "Education Major" },
    ]
  },
  {
    category: "🛠️ General Careers (大众职业/行业)",
    options: [
      { id: "engineer", label: "工程师", englishLabel: "Engineer" },
      { id: "teacher", label: "教师", englishLabel: "Teacher" },
      { id: "doctor_nurse", label: "医护人员", englishLabel: "Doctor / Nurse" },
      { id: "programmer_tech", label: "程序员/互联网从业者", englishLabel: "Programmer / Tech" },
      { id: "designer", label: "设计师", englishLabel: "Designer" },
      { id: "artist", label: "艺术家", englishLabel: "Artist" },
      { id: "chef", label: "厨师", englishLabel: "Chef" },
      { id: "sales_marketing", label: "销售与市场", englishLabel: "Sales / Marketing" },
      { id: "accountant", label: "会计", englishLabel: "Accountant" },
      { id: "lawyer", label: "律师", englishLabel: "Lawyer" },
      { id: "office_worker", label: "办公室职员/白领", englishLabel: "Office Worker" },
      { id: "entrepreneur", label: "创业者", englishLabel: "Entrepreneur" },
      { id: "driver", label: "司机", englishLabel: "Driver" },
      { id: "barista_waiter", label: "咖啡师/服务行业", englishLabel: "Barista / Waiter" },
      { id: "athlete", label: "运动员", englishLabel: "Athlete" },
      { id: "writer_content_creator", label: "作家/博主", englishLabel: "Writer / Content Creator" },
      { id: "handicraft_technician", label: "手工艺人/技术工", englishLabel: "Handicraft / Technician" },
    ]
  },
  {
    category: "🏢 Special Status (其他身份)",
    options: [
      { id: "unemployed", label: "无业/待业", englishLabel: "Unemployed / Between Jobs" },
      { id: "self_employed", label: "个体经营/自雇", englishLabel: "Self-Employed" },
      { id: "homemaker", label: "全职家长", englishLabel: "Homemaker" },
      { id: "retired", label: "已退休", englishLabel: "Retired" },
    ]
  }
]

// 解析兴趣数据
export const interestOptions: OptionGroup[] = [
  {
    category: "🎬 Entertainment & Pop Culture (娱乐与流行文化)",
    options: [
      { id: "binge_worthy_series", label: "刷剧必备/热门剧集", englishLabel: "Binge-Worthy Series" },
      { id: "indie_gems", label: "小众宝藏/独立影视", englishLabel: "Indie Gems" },
      { id: "true_crime", label: "真实犯罪/罪案调查", englishLabel: "True Crime" },
      { id: "sci_fi_fantasy", label: "科幻与奇幻", englishLabel: "Sci-Fi & Fantasy" },
      { id: "anime_manga", label: "动漫/二次元", englishLabel: "Anime & Manga" },
      { id: "stand_up_comedy", label: "脱口秀/单口喜剧", englishLabel: "Stand-up Comedy" },
      { id: "documentary", label: "纪录片", englishLabel: "Documentary" },
      { id: "retro_cinema", label: "怀旧影院/经典老片", englishLabel: "Retro Cinema" },
      { id: "reality_tv", label: "真人秀", englishLabel: "Reality TV" },
      { id: "k_culture", label: "韩流文化", englishLabel: "K-Culture" },
    ]
  },
  {
    category: "🎨 Aesthetics & Vibes (审美与氛围)",
    options: [
      { id: "minimalism", label: "极简主义", englishLabel: "Minimalism" },
      { id: "cyberpunk", label: "赛博朋克", englishLabel: "Cyberpunk" },
      { id: "dark_academia", label: "暗黑学院风", englishLabel: "Dark Academia" },
      { id: "cottagecore", label: "田园牧歌/森系", englishLabel: "Cottagecore" },
      { id: "streetwear", label: "街头潮牌", englishLabel: "Streetwear" },
      { id: "vintage_retro", label: "复古风/怀旧审美", englishLabel: "Vintage & Retro" },
      { id: "avant_garde", label: "前卫艺术/先锋派", englishLabel: "Avant-Garde" },
      { id: "zen_calm", label: "禅意/静谧感", englishLabel: "Zen & Calm" },
      { id: "lo_fi", label: "低保真/氛围感", englishLabel: "Lo-Fi" },
    ]
  },
  {
    category: "✈️ Lifestyle & Hobbies (生活方式与爱好)",
    options: [
      { id: "digital_nomad", label: "数字游民", englishLabel: "Digital Nomad" },
      { id: "urban_exploration", label: "城市探险/Citywalk", englishLabel: "Urban Exploration" },
      { id: "outdoor_adventure", label: "户外探险", englishLabel: "Outdoor Adventure" },
      { id: "gastronomy", label: "美食学/顶级餐饮", englishLabel: "Gastronomy" },
      { id: "home_cooking", label: "居家烹饪", englishLabel: "Home Cooking" },
      { id: "coffee_culture", label: "咖啡文化", englishLabel: "Coffee Culture" },
      { id: "sustainable_living", label: "可持续生活/环保", englishLabel: "Sustainable Living" },
      { id: "pet_life", label: "萌宠生活", englishLabel: "Pet Life" },
      { id: "van_life", label: "旅居生活/房车旅行", englishLabel: "Van Life" },
      { id: "diy_crafting", label: "手工制作", englishLabel: "DIY & Crafting" },
    ]
  },
  {
    category: "💡 Intellectual & Tech (知识与科技)",
    options: [
      { id: "future_tech", label: "未来科技/硬核科技", englishLabel: "Future Tech" },
      { id: "personal_growth", label: "个人成长/自我提升", englishLabel: "Personal Growth" },
      { id: "philosophy", label: "哲学思考", englishLabel: "Philosophy" },
      { id: "space_exploration", label: "太空探索/宇宙", englishLabel: "Space Exploration" },
      { id: "psychology", label: "心理学", englishLabel: "Psychology" },
      { id: "entrepreneurship", label: "创业精神", englishLabel: "Entrepreneurship" },
      { id: "personal_finance", label: "理财/投资", englishLabel: "Personal Finance" },
      { id: "global_news", label: "国际新闻", englishLabel: "Global News" },
    ]
  },
  {
    category: "🧘 Wellness & Sports (健康与运动)",
    options: [
      { id: "mindfulness", label: "正念冥想", englishLabel: "Mindfulness" },
      { id: "high_intensity", label: "高强度训练/撸铁", englishLabel: "High Intensity" },
      { id: "extreme_sports", label: "极限运动", englishLabel: "Extreme Sports" },
      { id: "holistic_health", label: "身心全方位健康", englishLabel: "Holistic Health" },
      { id: "team_sports", label: "团队运动/球类", englishLabel: "Team Sports" },
      { id: "mental_wellbeing", label: "心理健康/情绪疗愈", englishLabel: "Mental Well-being" },
    ]
  }
]

// 风格选项（可能用于图像标签）
export const styleOptions: string[] = [
  "Photorealistic",
  "Hyperrealistic",
  "DSLR",
  "Cinematic Lighting",
  "Black and White Photography",
  "Polaroid",
  "Drone Photography",
  "Macro Photography",
  "Anime Style",
  "Studio Ghibli",
  "Makoto Shinkai",
  "Comic Book",
  "Vector Art",
  "Pixel Art",
  "Children's Book Illustration",
  "Oil Painting",
  "Watercolor",
  "Sketch",
  "Ukiyo-e",
  "Chinese Ink Painting",
  "Impressionism",
  "Graffiti",
  "3D Render",
  "Unreal Engine 5",
  "Low Poly",
  "Voxel Art",
  "CGSociety",
  "Matte Painting",
  "Cyberpunk",
  "Steampunk",
  "Synthwave",
  "Gothic",
  "Horror",
  "Minimalism",
  "Vintage",
  "Fantasy",
  "Sci-Fi"
]

// 性别选项
export const genderOptions = [
  { id: "male", label: "男性" },
  { id: "female", label: "女性" },
  { id: "other", label: "其他" },
  { id: "prefer_not_to_say", label: "不愿透露" }
]

// 年龄范围（18-80岁）
export const ageOptions = Array.from({ length: 63 }, (_, i) => i + 18)

// 获取所有职业选项（扁平化）
export const getAllJobOptions = (): OptionItem[] => {
  return jobOptions.flatMap(group => group.options)
}

// 获取所有兴趣选项（扁平化）
export const getAllInterestOptions = (): OptionItem[] => {
  return interestOptions.flatMap(group => group.options)
}

// 获取选项标签（用于显示）
export const getOptionLabel = (id: string, options: OptionItem[]): string => {
  const option = options.find(opt => opt.id === id)
  return option ? option.label : id
}