"""
推荐系统核心模块
移植自原有server_logic_gram.py中的推荐算法
"""
import os
import json
import pickle
import random
import time
from collections import defaultdict, deque
from typing import Any, Dict, List, Tuple, Optional, Set

import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
import redis
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.core.config import settings
from app.models.user import ImageMetadata, ImageFeature


class _NumpyCompatUnpickler(pickle.Unpickler):
    """兼容 numpy>=2 生成的 pickle，在 numpy 1.24 环境下加载。

    numpy 2.0 将内部模块从 ``numpy.core`` 迁移到了 ``numpy._core``，
    因此在 numpy 2.x 下生成的 pickle 会引用 ``numpy._core.*`` 模块。
    在当前后端镜像中我们仍使用 numpy 1.24.4，只提供 ``numpy.core.*``，
    直接 pickle.load 会触发 ``ModuleNotFoundError: numpy._core``。

    通过覆写 ``find_class``，将所有 ``numpy._core`` 前缀替换为
    ``numpy.core``，即可在不升级 numpy / scikit-learn 的前提下
    正常反序列化这些数组对象。
    """

    def find_class(self, module: str, name: str):  # type: ignore[override]
        if module.startswith("numpy._core"):
            module = module.replace("numpy._core", "numpy.core", 1)
        return super().find_class(module, name)


def _load_preprocessed_pickle(path: str) -> dict:
    """在 numpy 1.24 环境下安全加载由 numpy>=2 生成的预处理 pickle。"""
    with open(path, "rb") as f:
        return _NumpyCompatUnpickler(f).load()


# 全局缓存，避免每次请求都从数据库加载全部特征和元数据
_GLOBAL_FEATURE_CACHE: Dict[str, np.ndarray] = {}
_GLOBAL_CLUSTER_CACHE: Dict[int, List[str]] = {}
_GLOBAL_IMAGE_IDS: Set[str] = set()
_GLOBAL_IMAGE_TO_CLUSTER: Dict[str, int] = {}
_GLOBAL_LOADED: bool = False

# 额外的全局缓存：完整特征矩阵 + 图像ID到行索引/索引到ID的映射 + 聚类中心/成员
_GLOBAL_FEATURE_MATRIX: Optional[np.ndarray] = None  # 形状 [N, 512]，每行已归一化
_GLOBAL_IMAGE_INDEX: Dict[str, int] = {}  # image_id -> 行索引
_GLOBAL_INDEX_TO_IMAGE: List[str] = []    # 行索引 -> image_id
_GLOBAL_CLUSTER_CENTERS: Optional[np.ndarray] = None  # 形状 [C, 512]
_GLOBAL_CLUSTER_MEMBERS: Dict[int, List[int]] = {}    # cluster_id -> [row_indices]
_GLOBAL_CLUSTER_LABELS: Optional[np.ndarray] = None   # 形状 [N,]，聚类标签


def _new_cluster_feedback_entry() -> Dict[str, Any]:
    """创建一个新的簇级反馈统计条目（对齐最新 server_logic_gram）"""
    return {
        "show_count": 0,
        "like_count": 0,
        "dislike_count": 0,
        "sum_pref": 0.0,
        "rating_count": 0,
        "last_shown_round": -1,
        "unique_images": set(),
    }


# 全局曝光与簇级反馈统计（进程内共享，跨请求累计）
_GLOBAL_IMAGE_SHOW_COUNT: Dict[int, int] = defaultdict(int)
_GLOBAL_CLUSTER_SHOW_COUNT: Dict[int, int] = defaultdict(int)
_GLOBAL_GLOBAL_EXPOSURE_COUNT: Dict[int, int] = defaultdict(int)
_GLOBAL_CLUSTER_EXPOSURE_COUNT: Dict[int, int] = defaultdict(int)
_GLOBAL_CLUSTER_FEEDBACK: Dict[int, Dict[str, Any]] = defaultdict(_new_cluster_feedback_entry)
_GLOBAL_EXPOSURE_HISTORY: List[Dict[str, Any]] = []
_GLOBAL_CLUSTER_RECENT_QUEUE: deque[int] = deque(maxlen=20)
_GLOBAL_ROUND_ID: int = 0


class UserSession:
    """用户会话类 - 使用列表存储喜欢的图片向量（Max-Pooling策略）"""
    def __init__(self, user_id: int, feature_dim: int = 512, max_profile_size: int = 20):
        """
        初始化用户会话

        Args:
            user_id: 用户ID
            feature_dim: 特征维度（512维）
            max_profile_size: 用户画像最大容量（最近喜欢的图片数量）
        """
        self.user_id = user_id
        # 兼容旧逻辑的正向画像（仅喜欢）
        self.user_profile: List[Tuple[np.ndarray, int]] = []
        # 新版画像：区分喜欢 / 不喜欢，并保留最近评分序列
        self.liked_vectors: List[Tuple[np.ndarray, int, Optional[str]]] = []
        self.disliked_vectors: List[Tuple[np.ndarray, int, Optional[str]]] = []
        self.ratings: List[Dict[str, Any]] = []
        # 已看图片（存储 image_id）
        self.seen_images: Set[str] = set()
        self.max_profile_size = max_profile_size
        self.feature_dim = feature_dim

    def update_preference(self, img_vec: np.ndarray, preference_score: int, image_id: Optional[str] = None):
        """更新用户偏好（对齐最新 server_logic_gram，区分喜欢/不喜欢，并记录评分序列）"""
        # 归一化向量，避免尺度干扰相似度
        norm = np.linalg.norm(img_vec)
        if norm > 0:
            img_vec_normalized = img_vec / norm
        else:
            img_vec_normalized = img_vec

        # 喜欢：偏好分 >=4
        if preference_score >= 4:
            self.liked_vectors.append((img_vec_normalized.copy(), preference_score, image_id))
            # 容量控制：按偏好分从高到低保留最近样本
            if len(self.liked_vectors) > self.max_profile_size:
                self.liked_vectors.sort(key=lambda x: x[1], reverse=True)
                self.liked_vectors = self.liked_vectors[: self.max_profile_size]

            # 兼容旧逻辑的 user_profile（只保留喜欢样本）
            self.user_profile.append((img_vec_normalized.copy(), preference_score))
            if len(self.user_profile) > self.max_profile_size:
                self.user_profile.sort(key=lambda x: x[1], reverse=True)
                self.user_profile = self.user_profile[: self.max_profile_size]

        # 不喜欢：偏好分 <=2
        elif preference_score <= 2:
            self.disliked_vectors.append((img_vec_normalized.copy(), preference_score, image_id))
            if len(self.disliked_vectors) > self.max_profile_size:
                # 对不喜欢的，按分数从低到高（越低越“强烈不喜欢”）
                self.disliked_vectors.sort(key=lambda x: x[1])
                self.disliked_vectors = self.disliked_vectors[: self.max_profile_size]

        # 记录评分序列（用于会话级冗余评估等）
        if image_id is not None:
            self.ratings.append({
                "image_id": image_id,
                "preference_score": preference_score,
            })

    def add_seen_image(self, image_id: str):
        """添加已看过的图像"""
        self.seen_images.add(image_id)

    def get_profile_vectors(self) -> np.ndarray:
        """获取用户画像中的所有特征向量（优先使用 liked_vectors）"""
        if self.liked_vectors:
            return np.array([vec for vec, _, _ in self.liked_vectors])
        if self.user_profile:
            return np.array([vec for vec, _ in self.user_profile])
        return np.zeros((0, self.feature_dim))

    def to_dict(self) -> dict:
        """转换为字典格式，用于Redis存储"""
        return {
            "user_id": self.user_id,
            "user_profile": [(vec.tolist(), score) for vec, score in self.user_profile],
            "seen_images": list(self.seen_images),
            "max_profile_size": self.max_profile_size,
            "feature_dim": self.feature_dim,
            "liked_vectors": [
                (vec.tolist(), score, img_id) for vec, score, img_id in self.liked_vectors
            ],
            "disliked_vectors": [
                (vec.tolist(), score, img_id) for vec, score, img_id in self.disliked_vectors
            ],
            "ratings": self.ratings,
        }

    @classmethod
    def from_dict(cls, data: dict) -> 'UserSession':
        """从字典创建UserSession实例"""
        session = cls(
            user_id=data["user_id"],
            feature_dim=data.get("feature_dim", 512),
            max_profile_size=data.get("max_profile_size", 20)
        )

        # 恢复喜欢/不喜欢向量；若不存在则兼容旧结构
        liked_raw = data.get("liked_vectors")
        if liked_raw:
            for vec_list, score, img_id in liked_raw:
                vec = np.array(vec_list)
                session.liked_vectors.append((vec, score, img_id))
        else:
            # 旧结构：user_profile 即 liked_vectors（没有 image_id）
            for vec_list, score in data.get("user_profile", []):
                vec = np.array(vec_list)
                session.liked_vectors.append((vec, score, None))

        disliked_raw = data.get("disliked_vectors")
        if disliked_raw:
            for vec_list, score, img_id in disliked_raw:
                vec = np.array(vec_list)
                session.disliked_vectors.append((vec, score, img_id))

        # 同步 user_profile 以兼容旧逻辑
        session.user_profile = [(vec.copy(), score) for vec, score, _ in session.liked_vectors]

        # 恢复评分序列
        session.ratings = data.get("ratings", [])

        # 恢复已看图像
        session.seen_images = set(data.get("seen_images", []))

        return session


class RecommendationSystem:
    """推荐系统核心"""

    def __init__(self, db: Session, redis_client: redis.Redis):
        """
        初始化推荐系统

        Args:
            db: 数据库会话
            redis_client: Redis客户端
        """
        self.db = db
        self.redis = redis_client

        # 配置参数
        self.exploit_ratio = settings.EXPLOIT_RATIO
        self.explore_ratio = settings.EXPLORE_RATIO
        self.max_profile_size = settings.MAX_PROFILE_SIZE
        self.similarity_threshold = settings.SIMILARITY_THRESHOLD

        # 使用模块级全局缓存，所有实例共享，避免重复从数据库加载
        self._feature_cache = _GLOBAL_FEATURE_CACHE  # 图像ID -> 特征向量
        self._cluster_cache = _GLOBAL_CLUSTER_CACHE  # 聚类ID -> 图像ID列表
        self._image_ids = _GLOBAL_IMAGE_IDS  # 所有可用图像ID
        self._image_to_cluster = _GLOBAL_IMAGE_TO_CLUSTER  # 图像ID -> 聚类ID

    def load_data(self):
        """加载推荐系统所需数据

        优先从预处理的pickle文件加载以提升速度，
        如果pickle不可用或加载失败，则回退到数据库加载。
        """
        global _GLOBAL_LOADED, _GLOBAL_FEATURE_MATRIX, _GLOBAL_IMAGE_INDEX, _GLOBAL_INDEX_TO_IMAGE, _GLOBAL_CLUSTER_CENTERS, _GLOBAL_CLUSTER_MEMBERS, _GLOBAL_CLUSTER_LABELS
        if _GLOBAL_LOADED:
            return

        # 优先尝试从pickle加载（与原脚本相同的数据来源）
        pkl_path = getattr(settings, "PREPROCESSED_DATA_PATH", None)
        if pkl_path:
            try:
                # 相对路径基于当前工作目录
                if not os.path.isabs(pkl_path):
                    pkl_path_resolved = os.path.join(os.getcwd(), pkl_path)
                else:
                    pkl_path_resolved = pkl_path

                if os.path.exists(pkl_path_resolved):
                    # 使用兼容 numpy2→numpy1 的自定义 Unpickler 加载预处理数据
                    data = _load_preprocessed_pickle(pkl_path_resolved)

                    # Style_Matrix: (N, 512) 原始风格特征矩阵
                    style_matrix = data.get("Style_Matrix")
                    cluster_labels = data.get("cluster_labels")
                    item_ids = data.get("item_ids")
                    image_paths = data.get("image_paths")
                    cluster_centers = data.get("cluster_centers")
                    cluster_members = data.get("cluster_members")

                    if style_matrix is None or cluster_labels is None or image_paths is None:
                        raise ValueError("pickle 中缺少必要的字段(Style_Matrix/cluster_labels/image_paths)")
                    # 转为 float32 并在加载阶段一次性做 L2 归一化（与原脚本中每次归一化候选向量等价）
                    style_matrix = np.asarray(style_matrix, dtype=np.float32)
                    norms = np.linalg.norm(style_matrix, axis=1, keepdims=True)
                    norms[norms == 0] = 1.0
                    style_matrix = style_matrix / norms

                    n_images = style_matrix.shape[0]

                    # 如果没有显式的item_ids，则从文件名推导，与原脚本保持一致
                    if item_ids is None:
                        derived_ids = []
                        for path in image_paths:
                            filename = os.path.basename(path)
                            raw_id = filename.replace(".jpg", "")
                            image_id = raw_id.lstrip("0") or "0"
                            derived_ids.append(image_id)
                        item_ids = derived_ids

                    if len(item_ids) != n_images or len(cluster_labels) != n_images:
                        raise ValueError("pickle 中 item_ids/cluster_labels 与 Style_Matrix 数量不一致")

                    # 填充缓存：图像ID -> 特征向量、聚类
                    _GLOBAL_INDEX_TO_IMAGE = []
                    for idx in range(n_images):
                        image_id = str(item_ids[idx])
                        self._image_ids.add(image_id)

                        # 直接引用Style_Matrix中的行（已归一化），不做拷贝，节省内存
                        self._feature_cache[image_id] = style_matrix[idx]
                        _GLOBAL_IMAGE_INDEX[image_id] = idx

                        _GLOBAL_INDEX_TO_IMAGE.append(image_id)

                        cluster_id = int(cluster_labels[idx])
                        if cluster_id not in self._cluster_cache:
                            self._cluster_cache[cluster_id] = []
                        self._cluster_cache[cluster_id].append(image_id)
                        self._image_to_cluster[image_id] = cluster_id

                    # 保存全局特征矩阵（已归一化）及聚类标签供向量化计算使用
                    _GLOBAL_FEATURE_MATRIX = style_matrix
                    _GLOBAL_CLUSTER_LABELS = np.asarray(cluster_labels, dtype=np.int32)

                    # 同步聚类中心和成员（如果存在），用于新版冷启动逻辑
                    if cluster_centers is not None:
                        _GLOBAL_CLUSTER_CENTERS = np.asarray(cluster_centers, dtype=np.float32)
                    if cluster_members is not None:
                        # 确保键为 int，值为行索引列表
                        _GLOBAL_CLUSTER_MEMBERS = {}
                        for cid, members in cluster_members.items():
                            try:
                                cid_int = int(cid)
                            except (TypeError, ValueError):
                                continue
                            _GLOBAL_CLUSTER_MEMBERS[cid_int] = [int(m) for m in members]

                    _GLOBAL_LOADED = True
                    print(
                        f"推荐系统数据从pickle加载完成: {len(self._feature_cache)} 张图像, {len(self._cluster_cache)} 个聚类"
                    )
                    return
            except Exception as e:
                # pickle加载失败时打印警告，回退到数据库加载
                print(f"从pickle加载推荐系统数据失败，回退到数据库加载: {str(e)}")

        # 回退方案：从数据库加载（兼容旧环境）
        try:
            features = self.db.query(ImageFeature).all()
            for feature in features:
                self._feature_cache[feature.image_id] = np.array(json.loads(feature.feature_vector))
                self._image_ids.add(feature.image_id)

            images = self.db.query(ImageMetadata).all()
            for image in images:
                self._image_ids.add(image.image_id)
                if image.cluster_id is not None:
                    if image.cluster_id not in self._cluster_cache:
                        self._cluster_cache[image.cluster_id] = []
                    self._cluster_cache[image.cluster_id].append(image.image_id)
                    self._image_to_cluster[image.image_id] = image.cluster_id

            _GLOBAL_LOADED = True
            print(
                f"推荐系统数据从数据库加载完成: {len(self._feature_cache)} 张图像, {len(self._cluster_cache)} 个聚类"
            )
        except Exception as e:
            print(f"加载推荐系统数据失败: {str(e)}")
            raise

    def _image_id_to_index(self, image_id: str) -> Optional[int]:
        """将外部 image_id 安全映射到内部特征矩阵行索引"""
        if not _GLOBAL_IMAGE_INDEX:
            return None

        image_id_str = str(image_id)
        idx = _GLOBAL_IMAGE_INDEX.get(image_id_str)
        if idx is not None:
            return idx

        # 兜底：纯数字 ID 去掉前导 0 再试一次
        if image_id_str.isdigit():
            idx = _GLOBAL_IMAGE_INDEX.get(str(int(image_id_str)))
        return idx

    def get_user_session(self, user_id: int) -> UserSession:
        """
        获取或创建用户会话

        Args:
            user_id: 用户ID

        Returns:
            UserSession实例
        """
        session_key = f"user_session:{user_id}"

        # 尝试从Redis获取会话
        session_data = self.redis.get(session_key)
        if session_data:
            try:
                return UserSession.from_dict(json.loads(session_data))
            except (json.JSONDecodeError, KeyError):
                pass

        # 创建新会话
        return UserSession(
            user_id=user_id,
            feature_dim=512,
            max_profile_size=self.max_profile_size
        )

    def save_user_session(self, session: UserSession):
        """
        保存用户会话到Redis

        Args:
            session: UserSession实例
        """
        session_key = f"user_session:{session.user_id}"
        session_data = json.dumps(session.to_dict())
        # 保存7天
        self.redis.setex(session_key, 60 * 60 * 24 * 7, session_data)

    def get_cold_start_images(self, user_id: int, jobs: List[str], interests: List[str], count: int = 3) -> List[str]:
        """
        获取冷启动图像（对齐 benchmark(1)：基于簇中心的多样性采样）

        Args:
            user_id: 用户ID
            jobs: 用户职业列表（此处不再影响冷启动，仅用于后续分析）
            interests: 用户兴趣列表（同上）
            count: 需要的图像数量

        Returns:
            图像ID列表
        """
        start_time = time.perf_counter()
        self.load_data()
        session = self.get_user_session(user_id)

        selected_ids: List[str] = []
        seen_this_round: Set[str] = set()

        # 如果没有聚类中心信息，则退化为随机+聚类多样性逻辑
        if _GLOBAL_CLUSTER_CENTERS is None or not _GLOBAL_CLUSTER_MEMBERS or not _GLOBAL_INDEX_TO_IMAGE:
            # 候选集：所有未看过的图片
            excluded: Set[str] = set(session.seen_images)
            candidate_images = [img_id for img_id in self._image_ids if img_id not in excluded]

            if candidate_images:
                explore_ids = self._get_explore_recommendations(session, candidate_images, count)
                selected_ids.extend(explore_ids)

            for img_id in selected_ids:
                session.add_seen_image(img_id)
            self.save_user_session(session)
            elapsed = (time.perf_counter() - start_time) * 1000.0
            print(f"冷启动使用fallback逻辑(无簇中心)，候选数={len(candidate_images)}, 耗时={elapsed:.1f} ms")
            return selected_ids

        # 使用簇中心在风格空间中做 Farthest Point Sampling，结合簇级曝光惩罚（对齐最新脚本）
        centers = _GLOBAL_CLUSTER_CENTERS
        n_clusters = centers.shape[0]
        if n_clusters <= 0:
            return []

        n_pick = min(count, n_clusters)

        # 预先归一化簇中心
        norms = np.linalg.norm(centers, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        norm_centers = centers / norms

        # 初始化：随机选择一个簇作为起点
        first = np.random.randint(0, n_clusters)
        picked: List[int] = [first]

        # 每个簇与当前已选集合的最小距离
        dists = np.linalg.norm(norm_centers - norm_centers[first], axis=1)

        while len(picked) < n_pick:
            for cid in range(n_clusters):
                if cid in picked:
                    continue
                dist_to_last = np.linalg.norm(norm_centers[cid] - norm_centers[picked[-1]])
                if dist_to_last < dists[cid]:
                    dists[cid] = dist_to_last

            candidate_ids = [cid for cid in range(n_clusters) if cid not in picked]
            if not candidate_ids:
                break

            # 引入簇级曝光惩罚 + 随机扰动
            def get_fps_score(cid: int) -> float:
                exp_count = _GLOBAL_CLUSTER_EXPOSURE_COUNT.get(cid, 0)
                exp_penalty = 1.0 / np.sqrt(1.0 + exp_count)
                noise = random.uniform(0.8, 1.2)
                return float(dists[cid]) * float(exp_penalty) * float(noise)

            farthest = max(candidate_ids, key=get_fps_score)
            picked.append(farthest)

        chosen_indices: List[int] = []

        # 在每个选中的簇内部随机选 1 张（优先未看过的 + 全局曝光更少的）
        for cluster_id in picked:
            members = _GLOBAL_CLUSTER_MEMBERS.get(cluster_id, [])
            if not members:
                continue

            # 过滤掉已看过/本轮已选的成员（按 image_id 判断），并按全局曝光次数排序
            valid_members: List[int] = []
            for idx in members:
                if 0 <= idx < len(_GLOBAL_INDEX_TO_IMAGE):
                    img_id = _GLOBAL_INDEX_TO_IMAGE[idx]
                    if img_id in session.seen_images or img_id in seen_this_round:
                        continue
                    valid_members.append(idx)

            if valid_members:
                valid_members.sort(key=lambda i: _GLOBAL_GLOBAL_EXPOSURE_COUNT.get(i, 0))
                # 从曝光最少的前若干个中随机挑选一张
                top_k = min(3, len(valid_members))
                img_idx = random.choice(valid_members[:top_k])
            else:
                # 兜底：整个簇里随机选一张
                img_idx = random.choice(members)

            if not (0 <= img_idx < len(_GLOBAL_INDEX_TO_IMAGE)):
                continue

            img_id = _GLOBAL_INDEX_TO_IMAGE[img_idx]
            selected_ids.append(img_id)
            seen_this_round.add(img_id)
            session.add_seen_image(img_id)
            chosen_indices.append(img_idx)

            if len(selected_ids) >= count:
                break

        # 记录冷启动曝光（来源标记为 cold_start）
        if chosen_indices:
            sources = {idx: "cold_start" for idx in chosen_indices}
            self._record_exposure_batch(chosen_indices, sources)

        self.save_user_session(session)
        elapsed = (time.perf_counter() - start_time) * 1000.0
        print(f"冷启动使用簇中心FPS推荐，选出{len(selected_ids)}张，簇数={n_clusters}，耗时={elapsed:.1f} ms")
        return selected_ids

    def get_recommendations(self, user_id: int, count: int = 10) -> List[str]:
        """获取推荐图像（两阶段：簇级探索 + 簇内精排，对齐最新 server_logic_gram）"""
        start_time = time.perf_counter()
        self.load_data()
        session = self.get_user_session(user_id)

        # 若缺少必要的预处理数据，则退化为旧的 exploit + explore 逻辑
        if _GLOBAL_FEATURE_MATRIX is None or not _GLOBAL_INDEX_TO_IMAGE or _GLOBAL_CLUSTER_LABELS is None:
            all_image_ids = list(self._feature_cache.keys()) or list(self._image_ids)
            unseen_images = [img_id for img_id in all_image_ids if img_id not in session.seen_images]
            if not unseen_images:
                return []

            exploit_count = int(count * self.exploit_ratio)
            exploit_images = self._get_exploit_recommendations(session, unseen_images, exploit_count)
            explore_count = count - len(exploit_images)
            explore_images = self._get_explore_recommendations(session, unseen_images, explore_count)

            recommendations = exploit_images + explore_images
            for img_id in recommendations:
                session.add_seen_image(img_id)
            self.save_user_session(session)
            elapsed = (time.perf_counter() - start_time) * 1000.0
            print(f"推荐使用fallback逻辑(exploit+explore, 无预处理矩阵)，候选数={len(unseen_images)}, 耗时={elapsed:.1f} ms")
            return recommendations

        n_images = len(_GLOBAL_INDEX_TO_IMAGE)
        if n_images == 0:
            elapsed = (time.perf_counter() - start_time) * 1000.0
            print(f"推荐使用预处理矩阵，两阶段逻辑，但无未看候选，耗时={elapsed:.1f} ms")
            return []

        # 如果用户还没有有效的喜欢/不喜欢反馈，走冷启动逻辑
        if not session.liked_vectors and not session.disliked_vectors:
            # jobs / interests 对冷启动已不再参与采样策略，这里传空列表
            return self.get_cold_start_images(user_id, jobs=[], interests=[], count=count)

        # 将已看过的 image_id 映射为内部索引
        seen_idx: Set[int] = set()
        for img_id in session.seen_images:
            idx = self._image_id_to_index(img_id)
            if idx is not None:
                seen_idx.add(idx)

        # 获取未看过的图像索引，并按簇聚合
        unseen_indices = [i for i in range(n_images) if i not in seen_idx]
        if not unseen_indices:
            elapsed = (time.perf_counter() - start_time) * 1000.0
            print(f"推荐使用预处理矩阵，两阶段逻辑，但无可用簇，耗时={elapsed:.1f} ms")
            return []

        cluster_to_unseen: Dict[int, List[int]] = defaultdict(list)
        for idx in unseen_indices:
            if _GLOBAL_CLUSTER_LABELS is None or idx >= len(_GLOBAL_CLUSTER_LABELS):
                continue
            cid = int(_GLOBAL_CLUSTER_LABELS[idx])
            cluster_to_unseen[cid].append(idx)

        available_clusters = [cid for cid, members in cluster_to_unseen.items() if members]
        if not available_clusters:
            return []

        # 阶段 A：基于簇级统计做“偏好 / 不确定 / 新颖”三类簇选择
        cluster_metrics = self._compute_cluster_level_metrics(available_clusters)

        n_total = max(1, count)
        n_exploit = max(1, n_total // 3 + (n_total % 3 > 0))
        n_uncertain = max(1, n_total // 3)
        n_novel = n_total - n_exploit - n_uncertain
        if n_novel < 0:
            n_novel = 0

        selected_clusters: List[int] = []
        selected_set: Set[int] = set()

        # 1) exploitation：高偏好簇
        exploit_clusters = self._select_clusters_by_metric(
            available_clusters, cluster_metrics, key="preference", n_select=n_exploit, excluded=selected_set
        )
        selected_clusters.extend(exploit_clusters)
        selected_set.update(exploit_clusters)

        # 2) uncertainty exploration：高不确定簇
        uncertain_clusters = self._select_clusters_by_metric(
            available_clusters, cluster_metrics, key="uncertainty", n_select=n_uncertain, excluded=selected_set
        )
        selected_clusters.extend(uncertain_clusters)
        selected_set.update(uncertain_clusters)

        # 3) novelty exploration：新颖 / 低曝光簇
        novel_clusters = self._select_clusters_by_metric(
            available_clusters, cluster_metrics, key="novelty", n_select=n_novel, excluded=selected_set
        )
        selected_clusters.extend(novel_clusters)
        selected_set.update(novel_clusters)

        # 若簇数量不足支撑 n_images，则从剩余簇中按偏好补齐
        if len(selected_clusters) < n_total:
            remaining_needed = n_total - len(selected_clusters)
            extra_clusters = self._select_clusters_by_metric(
                available_clusters, cluster_metrics, key="preference", n_select=remaining_needed, excluded=selected_set
            )
            selected_clusters.extend(extra_clusters)
            selected_set.update(extra_clusters)

        if len(selected_clusters) > n_total:
            selected_clusters = selected_clusters[:n_total]

        if not selected_clusters:
            return []

        # 阶段 B：在每个选中簇内部做图像级精排，每簇选 1 张，并对最终集合施加风格差异约束
        final_selected_indices: List[int] = []
        image_sources: Dict[int, str] = {}

        cluster_source: Dict[int, str] = {}
        for cid in exploit_clusters:
            cluster_source[cid] = "exploit"
        for cid in uncertain_clusters:
            cluster_source.setdefault(cid, "explore_uncertain")
        for cid in novel_clusters:
            cluster_source.setdefault(cid, "explore_novel")

        def _get_norm_style(idx: int) -> np.ndarray:
            vec = _GLOBAL_FEATURE_MATRIX[idx]
            norm = np.linalg.norm(vec)
            if norm > 0:
                return vec / norm
            return vec

        cached_style_vecs: Dict[int, np.ndarray] = {}

        def _style_similarity(i: int, j: int) -> float:
            if i not in cached_style_vecs:
                cached_style_vecs[i] = _get_norm_style(i)
            if j not in cached_style_vecs:
                cached_style_vecs[j] = _get_norm_style(j)
            return float(np.dot(cached_style_vecs[i], cached_style_vecs[j]))

        max_style_sim = 0.3

        for cid in selected_clusters:
            members = cluster_to_unseen.get(cid, [])
            if not members:
                continue

            candidate_scores: Dict[int, float] = {}
            for idx in members:
                total_score, _ = self._score_candidate(idx, session)
                candidate_scores[idx] = total_score

            if not candidate_scores:
                continue

            sorted_members = sorted(candidate_scores.items(), key=lambda x: x[1], reverse=True)
            chosen_idx: Optional[int] = None
            for idx, _score in sorted_members:
                if not final_selected_indices:
                    chosen_idx = idx
                    break
                sims = [_style_similarity(idx, s_idx) for s_idx in final_selected_indices]
                if sims and max(sims) < max_style_sim:
                    chosen_idx = idx
                    break

            if chosen_idx is None:
                chosen_idx = sorted_members[0][0]

            final_selected_indices.append(chosen_idx)
            image_sources[chosen_idx] = cluster_source.get(cid, "exploit")

            if len(final_selected_indices) >= n_total:
                break

        # 将索引转换为 image_id，更新 seen_images，并记录曝光历史
        recommendations: List[str] = []
        for idx in final_selected_indices:
            if not (0 <= idx < len(_GLOBAL_INDEX_TO_IMAGE)):
                continue
            img_id = _GLOBAL_INDEX_TO_IMAGE[idx]
            recommendations.append(img_id)
            session.add_seen_image(img_id)

        if final_selected_indices:
            self._record_exposure_batch(final_selected_indices, image_sources)

        self.save_user_session(session)
        elapsed = (time.perf_counter() - start_time) * 1000.0
        print(f"推荐使用预处理矩阵，两阶段簇级+簇内精排，最终返回{len(recommendations)}张，未看候选={len(unseen_indices)}，耗时={elapsed:.1f} ms")
        return recommendations

    def _get_exploit_recommendations(self, session: UserSession, candidate_images: List[str], count: int) -> List[str]:
        """
        利用阶段推荐：基于用户画像的相似度

        Args:
            session: 用户会话
            candidate_images: 候选图像ID列表
            count: 需要的图像数量

        Returns:
            图像ID列表
        """
        if count <= 0 or not candidate_images:
            return []

        # 获取用户画像向量
        profile_vectors = session.get_profile_vectors()

        if len(profile_vectors) == 0:
            # 没有用户画像，返回随机图像
            selected = np.random.choice(candidate_images, min(count, len(candidate_images)), replace=False)
            return selected.tolist()

        similarities: List[Tuple[str, float]] = []

        # 优先使用与原脚本一致的向量化点积方式
        feature_matrix = _GLOBAL_FEATURE_MATRIX
        image_index_map = _GLOBAL_IMAGE_INDEX
        if feature_matrix is not None and image_index_map:
            valid_ids: List[str] = []
            row_indices: List[int] = []
            for img_id in candidate_images:
                idx = image_index_map.get(img_id)
                if idx is not None:
                    valid_ids.append(img_id)
                    row_indices.append(idx)

            if valid_ids:
                # 取出候选子矩阵 (M, 512)，与用户画像矩阵 (K, 512) 进行点积
                # 所有向量在加载阶段已经做了 L2 归一化，因此点积等价于余弦相似度
                candidate_matrix = feature_matrix[row_indices]  # (M, 512)
                sim_matrix = candidate_matrix @ profile_vectors.T  # (M, K)
                max_sims = np.max(sim_matrix, axis=1)  # (M,)
                similarities = list(zip(valid_ids, max_sims.astype(float).tolist()))

        # 如果因为某些原因无法使用矩阵形式（例如回退到数据库加载），退化为逐个计算
        if not similarities:
            for img_id in candidate_images:
                if img_id in self._feature_cache:
                    img_vec = self._feature_cache[img_id]
                    if len(profile_vectors) > 0:
                        sim = float(np.max(img_vec @ profile_vectors.T))
                        similarities.append((img_id, sim))

        if not similarities:
            selected = np.random.choice(candidate_images, min(count, len(candidate_images)), replace=False)
            return selected.tolist()

        # 按相似度排序
        similarities.sort(key=lambda x: x[1], reverse=True)

        # 只在 Top-K 候选上做 MMR，与原脚本保持一致（Top-100）
        top_k = min(100, len(similarities))
        top_similarities = similarities[:top_k]

        selected = self._mmr_diversity_selection(top_similarities, count)

        return selected

    def _get_explore_recommendations(self, session: UserSession, candidate_images: List[str], count: int) -> List[str]:
        """
        探索阶段推荐：探索新聚类

        Args:
            session: 用户会话
            candidate_images: 候选图像ID列表
            count: 需要的图像数量

        Returns:
            图像ID列表
        """
        if count <= 0 or not candidate_images:
            return []

        # 获取用户已接触的聚类（基于已看过图片的 cluster_id）
        user_clusters: Set[int] = set()
        for img_id in session.seen_images:
            cluster_id = self._image_to_cluster.get(img_id)
            if cluster_id is not None:
                user_clusters.add(cluster_id)

        # 获取所有聚类
        all_clusters = list(self._cluster_cache.keys())

        if not all_clusters:
            # 没有聚类信息时，退化为随机推荐
            selected = np.random.choice(candidate_images, min(count, len(candidate_images)), replace=False)
            return selected.tolist()

        # 找出用户未接触的聚类
        unexplored_clusters = [c for c in all_clusters if c not in user_clusters]

        if not unexplored_clusters:
            # 如果所有聚类都接触过，仍然从所有聚类中做多样性抽样
            unexplored_clusters = all_clusters

        selected_images: List[str] = []

        # 优先在未接触的聚类中抽样，每个聚类尽量只抽1张，增加多样性
        num_clusters_to_sample = min(count, len(unexplored_clusters))
        sampled_clusters = np.random.choice(unexplored_clusters, num_clusters_to_sample, replace=False)

        for cluster_id in sampled_clusters:
            cluster_images = self._cluster_cache.get(cluster_id, [])
            if not cluster_images:
                continue

            # 该聚类中同时在候选集、且未被选中的图片
            available_images = [
                img for img in cluster_images
                if img in candidate_images and img not in selected_images
            ]
            if available_images:
                selected = np.random.choice(available_images, 1)[0]
                selected_images.append(selected)

            if len(selected_images) >= count:
                break

        # 如果仍不足 count，使用候选集中剩余图片随机补足
        if len(selected_images) < count:
            remaining = count - len(selected_images)
            remaining_candidates = [
                img for img in candidate_images
                if img not in selected_images
            ]
            if remaining_candidates:
                extra = np.random.choice(remaining_candidates, min(remaining, len(remaining_candidates)), replace=False)
                selected_images.extend(extra.tolist())

        return selected_images

    def _mmr_diversity_selection(self, similarities: List[Tuple[str, float]], count: int, lambda_param: float = 0.5) -> List[str]:
        """
        MMR（Maximal Marginal Relevance）多样性选择算法

        Args:
            similarities: [(image_id, similarity), ...]
            count: 需要选择的图像数量
            lambda_param: 多样性参数（0-1），0表示只关注相关性，1表示只关注多样性

        Returns:
            选择的图像ID列表
        """
        if not similarities:
            return []

        # similarities: [(image_id, relevance_score)]，relevance_score 通常是与用户画像的相似度

        # 将相似度列表转为字典，便于快速查找
        relevance_map: Dict[str, float] = {img_id: score for img_id, score in similarities}

        # 仅考虑在特征缓存中的图片，以便计算图片之间的相似度
        candidate_ids = [img_id for img_id, _ in similarities if img_id in self._feature_cache]
        if not candidate_ids:
            # 如果没有特征数据，退化为按相关性排序的前 count 个
            return [img_id for img_id, _ in similarities[:count]]

        selected: List[str] = []
        remaining: Set[str] = set(candidate_ids)

        # 第一个：选择相关性最高的
        first_id = max(remaining, key=lambda x: relevance_map.get(x, 0.0))
        selected.append(first_id)
        remaining.remove(first_id)

        # 后续：平衡相关性和多样性
        while len(selected) < count and remaining:
            best_score = -1.0
            best_item: Optional[str] = None

            for item in list(remaining):
                # 相关性得分
                relevance = relevance_map.get(item, 0.0)

                # 多样性：与已选图片中最相似的一张的相似度
                item_vec = self._feature_cache.get(item)
                if item_vec is None:
                    max_similarity = 0.0
                else:
                    sims = []
                    for selected_item in selected:
                        selected_vec = self._feature_cache.get(selected_item)
                        if selected_vec is None:
                            continue
                        sim = cosine_similarity(
                            item_vec.reshape(1, -1),
                            selected_vec.reshape(1, -1)
                        )[0, 0]
                        sims.append(sim)
                    max_similarity = max(sims) if sims else 0.0

                mmr_score = lambda_param * relevance - (1 - lambda_param) * max_similarity

                if mmr_score > best_score:
                    best_score = mmr_score
                    best_item = item

            if best_item is None:
                break

            selected.append(best_item)
            remaining.remove(best_item)

        return selected

    def update_user_preference(self, user_id: int, image_id: str, preference_score: int):
        """
        更新用户偏好

        Args:
            user_id: 用户ID
            image_id: 图像ID
            preference_score: 偏好评分
        """
        self.load_data()
        session = self.get_user_session(user_id)

        if image_id in self._feature_cache:
            img_vec = self._feature_cache[image_id]
            session.update_preference(img_vec, preference_score, image_id=image_id)

        # 同步更新全局曝光与簇级反馈统计（对齐最新脚本的 submit_ratings 部分）
        idx = self._image_id_to_index(image_id)
        if idx is not None:
            _GLOBAL_GLOBAL_EXPOSURE_COUNT[idx] += 1
            if _GLOBAL_CLUSTER_LABELS is not None and 0 <= idx < len(_GLOBAL_CLUSTER_LABELS):
                cluster_id = int(_GLOBAL_CLUSTER_LABELS[idx])
                _GLOBAL_CLUSTER_EXPOSURE_COUNT[cluster_id] += 1
                stats = _GLOBAL_CLUSTER_FEEDBACK[cluster_id]
                stats["rating_count"] += 1
                stats["sum_pref"] += float(preference_score)
                if preference_score >= 4:
                    stats["like_count"] += 1
                elif preference_score <= 2:
                    stats["dislike_count"] += 1

        # 保存更新后的会话
        self.save_user_session(session)

    # ======== 以下为对齐最新 server_logic_gram 的辅助打分与簇级指标逻辑 ========

    def _compute_preference_components(self, session: UserSession, candidate_vec: np.ndarray, top_k: int = 3) -> Tuple[float, float]:
        """计算候选向量与当前用户喜欢/不喜欢集合的 top-k 平均相似度"""
        liked = session.liked_vectors
        disliked = session.disliked_vectors

        if not liked and not disliked:
            return 0.0, 0.0

        norm = np.linalg.norm(candidate_vec)
        if norm > 0:
            cand = candidate_vec / norm
        else:
            cand = candidate_vec

        def _topk_mean_sims(pool: List[Tuple[np.ndarray, int, Optional[str]]]) -> float:
            if not pool:
                return 0.0
            sims = [float(np.dot(cand, vec)) for vec, _, _ in pool]
            sims.sort(reverse=True)
            k = min(top_k, len(sims))
            return float(np.mean(sims[:k]))

        avg_sim_liked = _topk_mean_sims(liked)
        avg_sim_disliked = _topk_mean_sims(disliked)
        return avg_sim_liked, avg_sim_disliked

    def _compute_preference_score(
        self, session: UserSession, candidate_vec: np.ndarray, alpha: float = 0.7, top_k: int = 3
    ) -> Tuple[float, float, float]:
        """统一偏好得分：正向靠近 liked，反向远离 disliked（使用 top-k 平均相似度）"""
        avg_sim_liked, avg_sim_disliked = self._compute_preference_components(session, candidate_vec, top_k=top_k)

        if not session.liked_vectors and not session.disliked_vectors:
            return 0.0, avg_sim_liked, avg_sim_disliked

        pref_score = avg_sim_liked - alpha * avg_sim_disliked
        return pref_score, avg_sim_liked, avg_sim_disliked

    def _compute_session_redundancy(
        self, session: UserSession, candidate_idx: int, history_window: int = 10, top_k: int = 3
    ) -> float:
        """计算候选与当前用户最近若干张已看图像的相似度（top-k 平均），用于会话级冗余惩罚"""
        if not session.ratings or _GLOBAL_FEATURE_MATRIX is None:
            return 0.0

        recent_ratings = session.ratings[-history_window:]
        if not recent_ratings:
            return 0.0

        cand_vec = _GLOBAL_FEATURE_MATRIX[candidate_idx]
        norm = np.linalg.norm(cand_vec)
        if norm > 0:
            cand = cand_vec / norm
        else:
            cand = cand_vec

        sims: List[float] = []
        for record in recent_ratings:
            img_id = record.get("image_id")
            idx = self._image_id_to_index(str(img_id))
            if idx is None or idx == candidate_idx:
                continue
            if not (0 <= idx < len(_GLOBAL_FEATURE_MATRIX)):
                continue
            ref_vec = _GLOBAL_FEATURE_MATRIX[idx]
            ref_norm = np.linalg.norm(ref_vec)
            if ref_norm > 0:
                ref_vec = ref_vec / ref_norm
            sims.append(float(np.dot(cand, ref_vec)))

        if not sims:
            return 0.0

        sims.sort(reverse=True)
        k = min(top_k, len(sims))
        return float(np.mean(sims[:k]))

    def _score_candidate(self, candidate_idx: int, session: UserSession) -> Tuple[float, Dict[str, float]]:
        """统一候选打分函数（偏好 + 不确定性 + 新颖度 + 会话冗余，对齐最新脚本）"""
        if _GLOBAL_FEATURE_MATRIX is None:
            return 0.0, {}

        candidate_vec = _GLOBAL_FEATURE_MATRIX[candidate_idx]

        # 偏好 & 不确定性
        pref_score, avg_sim_liked, avg_sim_disliked = self._compute_preference_score(session, candidate_vec)
        uncertainty = 1.0 - abs(avg_sim_liked - avg_sim_disliked)
        uncertainty = float(max(0.0, min(1.0, uncertainty)))

        # 图像新颖度：基于展示计数
        exp_count = _GLOBAL_IMAGE_SHOW_COUNT.get(candidate_idx, 0)
        image_novelty = float(1.0 / (1.0 + exp_count * 2.0))

        # 簇新颖度：同样基于展示计数
        if _GLOBAL_CLUSTER_LABELS is not None and 0 <= candidate_idx < len(_GLOBAL_CLUSTER_LABELS):
            cluster_id = int(_GLOBAL_CLUSTER_LABELS[candidate_idx])
            cluster_exp = _GLOBAL_CLUSTER_SHOW_COUNT.get(cluster_id, 0)
            cluster_novelty = float(1.0 / (1.0 + cluster_exp))
        else:
            cluster_novelty = 0.0

        # 会话级冗余惩罚
        session_redundancy = self._compute_session_redundancy(session, candidate_idx)

        total_score = (
            0.40 * pref_score
            + 0.25 * uncertainty
            + 0.25 * image_novelty
            - 0.10 * session_redundancy
        )
        total_score += random.uniform(0.0, 0.001)

        components = {
            "preference_score": float(pref_score),
            "uncertainty": float(uncertainty),
            "image_novelty": float(image_novelty),
            "cluster_novelty": float(cluster_novelty),
            "session_redundancy": float(session_redundancy),
            "avg_sim_liked": float(avg_sim_liked),
            "avg_sim_disliked": float(avg_sim_disliked),
        }
        return float(total_score), components

    def _compute_cluster_level_metrics(self, available_clusters: List[int]) -> Dict[int, Dict[str, float]]:
        """基于簇级统计计算 cluster_preference / cluster_uncertainty / cluster_novelty / cluster_underexplored"""
        cluster_metrics: Dict[int, Dict[str, float]] = {}
        alpha, beta = 1.0, 1.0

        for cid in available_clusters:
            stats = _GLOBAL_CLUSTER_FEEDBACK[cid]
            like_cnt = stats["like_count"]
            dislike_cnt = stats["dislike_count"]
            rating_cnt = stats["rating_count"]
            show_cnt = stats["show_count"]

            if like_cnt + dislike_cnt > 0:
                p_hat = (alpha + like_cnt) / (alpha + beta + like_cnt + dislike_cnt)
            else:
                p_hat = 0.5

            cluster_size = max(1, len(_GLOBAL_CLUSTER_MEMBERS.get(cid, [1])))
            avg_exposure = float(show_cnt) / float(cluster_size)
            exhaustion_penalty = 1.0 / np.sqrt(1.0 + avg_exposure)
            p_hat = float(p_hat) * float(exhaustion_penalty)

            uncertainty = 4.0 * p_hat * (1.0 - p_hat)
            uncertainty *= 1.0 / np.sqrt(1.0 + rating_cnt)

            novelty = 1.0 / np.sqrt(1.0 + show_cnt)
            last_round = stats["last_shown_round"]
            if last_round >= 0 and _GLOBAL_ROUND_ID > 0:
                rounds_since = max(0, _GLOBAL_ROUND_ID - last_round)
                time_bonus = 1.0 + rounds_since / (rounds_since + 5.0)
                novelty *= time_bonus

            underexplored = 1.0 / np.sqrt(1.0 + rating_cnt)

            def noise() -> float:
                return random.uniform(0.0, 0.001)

            cluster_metrics[cid] = {
                "preference": float(p_hat) + noise(),
                "uncertainty": float(uncertainty) + noise(),
                "novelty": float(novelty) + noise(),
                "underexplored": float(underexplored) + noise(),
            }

        return cluster_metrics

    def _select_clusters_by_metric(
        self,
        all_clusters: List[int],
        cluster_metrics: Dict[int, Dict[str, float]],
        key: str,
        n_select: int,
        excluded: Set[int],
    ) -> List[int]:
        """按照某个簇级指标排序选出若干个簇，避免与 excluded 重叠"""
        if n_select <= 0:
            return []
        candidates = [c for c in all_clusters if c not in excluded]
        if not candidates:
            return []
        candidates.sort(key=lambda c: cluster_metrics.get(c, {}).get(key, 0.0), reverse=True)
        return candidates[:n_select]

    def _record_exposure_batch(self, image_indices: List[int], sources: Dict[int, str]):
        """记录一轮展示的曝光信息（不依赖用户是否给出评分）"""
        global _GLOBAL_ROUND_ID
        if not image_indices:
            return

        _GLOBAL_ROUND_ID += 1
        round_id = _GLOBAL_ROUND_ID

        cluster_ids: List[int] = []
        source_list: List[str] = []

        for idx in image_indices:
            if _GLOBAL_CLUSTER_LABELS is not None and 0 <= idx < len(_GLOBAL_CLUSTER_LABELS):
                cluster_id = int(_GLOBAL_CLUSTER_LABELS[idx])
            else:
                cluster_id = -1
            cluster_ids.append(cluster_id)

            src = sources.get(idx, "unknown") if sources else "unknown"
            source_list.append(src)

            _GLOBAL_IMAGE_SHOW_COUNT[idx] += 1
            if cluster_id >= 0:
                _GLOBAL_CLUSTER_SHOW_COUNT[cluster_id] += 1
                stats = _GLOBAL_CLUSTER_FEEDBACK[cluster_id]
                stats["show_count"] += 1
                stats["unique_images"].add(idx)
                stats["last_shown_round"] = round_id
                _GLOBAL_CLUSTER_RECENT_QUEUE.append(cluster_id)

        _GLOBAL_EXPOSURE_HISTORY.append({
            "round_id": round_id,
            "image_indices": list(image_indices),
            "cluster_ids": cluster_ids,
            "sources": source_list,
        })