-- 启用UUID扩展（如果需要）
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 创建数据库表
-- 注意：实际的表结构将由Alembic迁移创建
-- 这里只创建一些基础表或执行初始化操作

-- 创建职业选项表（如果需要预先填充数据）
CREATE TABLE IF NOT EXISTS job_options (
    id SERIAL PRIMARY KEY,
    job_name VARCHAR(100) NOT NULL UNIQUE,
    category VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建兴趣选项表（如果需要预先填充数据）
CREATE TABLE IF NOT EXISTS interest_options (
    id SERIAL PRIMARY KEY,
    interest_name VARCHAR(100) NOT NULL UNIQUE,
    category VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建风格选项表（如果需要预先填充数据）
CREATE TABLE IF NOT EXISTS style_options (
    id SERIAL PRIMARY KEY,
    style_name VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 插入一些示例数据（可选）
INSERT INTO job_options (job_name, category) VALUES
('Student', '教育'),
('Software Engineer', '科技'),
('Designer', '创意'),
('Researcher', '学术'),
('Artist', '创意')
ON CONFLICT (job_name) DO NOTHING;

INSERT INTO interest_options (interest_name, category) VALUES
('Art & Design', '艺术'),
('Technology', '科技'),
('Photography', '摄影'),
('Music', '音乐'),
('Sports', '运动')
ON CONFLICT (interest_name) DO NOTHING;

INSERT INTO style_options (style_name) VALUES
('Photorealistic'),
('Anime Style'),
('Oil Painting'),
('Watercolor'),
('Cyberpunk')
ON CONFLICT (style_name) DO NOTHING;