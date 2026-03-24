#!/usr/bin/env python3
"""
数据导入脚本：将预处理数据导入数据库
用法：python import_data.py [--pickle <pickle文件>] [--json <merged_data.json>]
"""

import os
import sys
import pickle
import json
import argparse
from pathlib import Path
import numpy as np
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from tqdm import tqdm

# 添加父目录到路径，以便导入模型
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.config import settings
from app.db.database import Base
from app.models.user import ImageMetadata, ImageFeature

def load_pickle_data(pickle_path):
    """加载pickle数据"""
    print(f"加载pickle数据: {pickle_path}")
    with open(pickle_path, 'rb') as f:
        data = pickle.load(f)

    # 检查必要的键
    required_keys = ['Style_Matrix', 'image_paths', 'cluster_labels']
    for key in required_keys:
        if key not in data:
            raise KeyError(f"pickle文件中缺少必需的键: {key}")

    style_matrix = data['Style_Matrix']  # (N, 512)
    image_paths = data['image_paths']    # 原始路径列表
    cluster_labels = data['cluster_labels']  # (N,) 聚类标签

    # 可选键
    item_ids = data.get('item_ids', None)
    cluster_centers = data.get('cluster_centers', None)
    cluster_members = data.get('cluster_members', None)

    print(f"加载了 {len(image_paths)} 张图像, 特征维度: {style_matrix.shape[1]}")

    return {
        'style_matrix': style_matrix,
        'image_paths': image_paths,
        'cluster_labels': cluster_labels,
        'item_ids': item_ids,
        'cluster_centers': cluster_centers,
        'cluster_members': cluster_members
    }

def load_prompt_data(json_path):
    """加载merged_data.json中的prompt数据"""
    if not os.path.exists(json_path):
        print(f"警告: {json_path} 不存在，跳过加载prompt")
        return []

    print(f"加载prompt数据: {json_path}")
    with open(json_path, 'r', encoding='utf-8') as f:
        merged_data = json.load(f)

    print(f"加载了 {len(merged_data)} 条元数据记录")
    return merged_data

def extract_image_id_from_path(image_path):
    """从图像路径提取image_id（与原始逻辑一致）"""
    filename = os.path.basename(image_path)  # 0000029.jpg
    # 去除扩展名和前导零，与prompt_map提取逻辑一致
    image_id = filename.replace('.jpg', '').lstrip('0') or '0'
    return image_id

def extract_category_from_path(image_path):
    """从路径提取类别（如果可能）"""
    # 简单实现：根据目录名猜测
    # 实际数据集中可能有 categories/animal/xxx.jpg 等
    # 这里先返回 None，后续可以根据需要扩展
    return None

def extract_style_from_path(image_path):
    """从路径提取风格（如果可能）"""
    # 类似地，可以根据路径中的关键字判断
    return None


def normalize_image_path(image_path):
    """标准化为 static/images/<filename> 形式"""
    filename = os.path.basename(image_path)
    return f"static/images/{filename}"


def extract_metadata_records(json_items):
    """从 merged_data.json 提取可直接导入的元数据记录"""
    records = []
    for item in json_items:
        raw_path = item.get('image_path')
        if not raw_path:
            continue

        image_id = extract_image_id_from_path(raw_path)
        # 规范化 style 字段：可能是字符串或列表，这里统一成不超过50字符的字符串
        raw_style = item.get('style')
        style_value = None
        if isinstance(raw_style, list):
            style_str = ", ".join(str(s) for s in raw_style)
        elif isinstance(raw_style, str):
            style_str = raw_style
        else:
            style_str = None

        if style_str:
            # 防止超出 ImageMetadata.style 的长度限制 (VARCHAR(50))
            style_value = style_str[:50]

        # 优先使用中文精简描述，其次英文精简描述，最后原始英文prompt
        prompt_value = (
            item.get('prompt_simple_cn')
            or item.get('prompt_simple')
            or item.get('prompt')
            or None
        )

        records.append({
            'image_id': image_id,
            'image_path': normalize_image_path(raw_path),
            'prompt': prompt_value,
            'category': item.get('category') or extract_category_from_path(raw_path),
            'style': style_value or extract_style_from_path(raw_path),
            'is_real': bool(item.get('is_real', False)),
            'cluster_id': item.get('cluster_id')
        })

    deduped_records = list({record['image_id']: record for record in records}.values())
    print(f"提取了 {len(deduped_records)} 条可导入图像元数据")
    return deduped_records

def main():
    parser = argparse.ArgumentParser(description='导入预处理数据到数据库')
    parser.add_argument('--pickle', default='../data/preprocessed_data_gram.pkl',
                       help='pickle文件路径（默认: ../data/preprocessed_data_gram.pkl）')
    parser.add_argument('--json', default='../data/merged_data_with_simple.json',
                       help='merged_data_with_simple.json路径（默认: ../data/merged_data_with_simple.json）')
    parser.add_argument('--drop-existing', action='store_true',
                       help='删除已存在的表数据（危险！）')
    parser.add_argument('--skip-images', action='store_true',
                       help='跳过图像数据导入（仅导入元数据）')
    parser.add_argument('--metadata-only', action='store_true',
                       help='仅从 merged_data.json 导入 ImageMetadata，不导入特征')
    parser.add_argument('--features-only', action='store_true',
                       help='仅从 pickle 导入 ImageFeature，不导入 ImageMetadata')
    args = parser.parse_args()

    if args.metadata_only:
        args.skip_images = True

    json_items = load_prompt_data(args.json)
    metadata_records = extract_metadata_records(json_items)
    metadata_by_id = {record['image_id']: record for record in metadata_records}

    data = None
    # 需要从pickle加载数据的情况：导入完整图像数据或仅导入特征
    if not args.skip_images or args.features_only:
        if not os.path.exists(args.pickle):
            print(f"错误: pickle文件不存在: {args.pickle}")
            sys.exit(1)

        data = load_pickle_data(args.pickle)

    # 创建数据库引擎和会话
    database_url = settings.sync_database_url
    print(f"连接数据库: {database_url}")
    engine = create_engine(database_url)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    # 如果需要，创建表（确保表已存在）
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()

    try:
        # 如果指定了删除现有数据
        if args.drop_existing:
            print("删除现有数据...")
            db.query(ImageFeature).delete()
            db.query(ImageMetadata).delete()
            db.commit()
            print("现有数据已删除")

        if args.skip_images:
            print(f"开始导入 {len(metadata_records)} 条图像元数据...")

            batch_size = 1000
            for start_idx in tqdm(range(0, len(metadata_records), batch_size), desc="元数据导入进度"):
                end_idx = min(start_idx + batch_size, len(metadata_records))
                batch_metadata = []

                for record in metadata_records[start_idx:end_idx]:
                    batch_metadata.append(
                        ImageMetadata(
                            image_id=record['image_id'],
                            image_path=record['image_path'],
                            prompt=record['prompt'],
                            category=record['category'],
                            style=record['style'],
                            is_real=record['is_real'],
                            cluster_id=record['cluster_id']
                        )
                    )

                db.bulk_save_objects(batch_metadata)
                db.commit()

            metadata_count = db.query(ImageMetadata).count()
            feature_count = db.query(ImageFeature).count()
            print(f"导入统计: ImageMetadata {metadata_count} 条, ImageFeature {feature_count} 条")
            print("元数据导入完成！")
            return

        # 导入图像数据（元数据 + 特征，或仅特征）
        style_matrix = data['style_matrix']
        image_paths = data['image_paths']
        cluster_labels = data['cluster_labels']
        item_ids = data['item_ids']

        n_images = len(image_paths)
        print(f"开始导入 {n_images} 张图像数据...")

        # 批量插入
        batch_size = 1000
        for start_idx in tqdm(range(0, n_images, batch_size), desc="导入进度"):
            end_idx = min(start_idx + batch_size, n_images)
            batch_metadata = []
            batch_features = []

            for idx in range(start_idx, end_idx):
                # 获取image_id
                if item_ids is not None and idx < len(item_ids):
                    # 使用item_ids中的ID（字符串）
                    image_id = str(item_ids[idx])
                else:
                    # 从路径提取
                    image_id = extract_image_id_from_path(image_paths[idx])

                # 图像路径：存储相对路径，用于前端访问
                # 假设图像将存储在 static/images/ 目录下
                image_path = normalize_image_path(image_paths[idx])

                # 获取prompt
                prompt = None
                category = extract_category_from_path(image_paths[idx])
                style = extract_style_from_path(image_paths[idx])
                is_real = False

                metadata_record = metadata_by_id.get(image_id.lstrip('0') or '0') or metadata_by_id.get(image_id)
                if metadata_record:
                    prompt = metadata_record['prompt']
                    category = metadata_record['category']
                    style = metadata_record['style']
                    is_real = metadata_record['is_real']

                # 聚类ID
                cluster_id = int(cluster_labels[idx]) if cluster_labels is not None else None

                # 创建ImageMetadata对象（如果不是 features-only 模式）
                if not args.features_only:
                    metadata = ImageMetadata(
                        image_id=image_id,
                        image_path=image_path,
                        prompt=prompt,
                        category=category,
                        style=style,
                        is_real=is_real,
                        cluster_id=cluster_id
                    )
                    batch_metadata.append(metadata)

                # 创建ImageFeature对象
                feature_vector = style_matrix[idx].tolist()  # 转为Python列表
                feature = ImageFeature(
                    image_id=image_id,
                    feature_vector=json.dumps(feature_vector)  # 存储为JSON字符串
                )
                batch_features.append(feature)

            # 批量插入
            db.bulk_save_objects(batch_metadata)
            db.bulk_save_objects(batch_features)
            db.commit()

        print("数据导入完成！")

        # 验证导入的数据量
        metadata_count = db.query(ImageMetadata).count()
        feature_count = db.query(ImageFeature).count()
        print(f"导入统计: ImageMetadata {metadata_count} 条, ImageFeature {feature_count} 条")

    except Exception as e:
        db.rollback()
        print(f"导入过程中出错: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()

if __name__ == '__main__':
    main()