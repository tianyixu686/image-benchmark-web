import json
import os
import sys
from pathlib import Path
from typing import List

# Ensure project root ("/app") is on sys.path so that "app" package can be imported
CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = CURRENT_DIR.parent
if str(PROJECT_ROOT) not in sys.path:
  sys.path.insert(0, str(PROJECT_ROOT))

from app.db.database import SessionLocal
from app.models.user import User, Rating


def build_export_data(users: List[User], db_session) -> list:
  """Build export data compatible with original rating.json, plus task_match_scores."""
  export_data = []

  for user in users:
    ratings = (
      db_session
      .query(Rating)
      .filter(Rating.user_id == user.user_id)
      .order_by(Rating.rating_id)
      .all()
    )

    user_data = {
      "user_id": user.user_id,
      "age": user.age,
      "gender": user.gender,
      # For backward compatibility: keep string fields
      "job": ",".join(user.jobs or []),
      "interest": ",".join(user.interests or []),
      # New fields: array form of jobs / interests
      "jobs": user.jobs or [],
      "interests": user.interests or [],
      "completed": user.completed,
      # Rating sequences
      "image_ids": [r.image_id for r in ratings],
      "quality_scores": [r.quality_score for r in ratings],
      "preference_scores": [r.preference_score for r in ratings],
      # New: task match score sequence (may contain None)
      "task_match_scores": [r.task_match_score for r in ratings],
    }

    export_data.append(user_data)

  return export_data


def export_ratings(output_path: str = "rating_1.json") -> None:
  """Export all user ratings from the database to a JSON file."""
  db = SessionLocal()
  try:
    users = db.query(User).all()
    export_data = build_export_data(users, db)

    output = Path(output_path)
    output.write_text(
      json.dumps(export_data, indent=2, ensure_ascii=False),
      encoding="utf-8",
    )

    total_ratings = sum(len(u["image_ids"]) for u in export_data)
    print(f"Export finished: {len(export_data)} users, {total_ratings} ratings -> {output}")
  finally:
    db.close()


if __name__ == "__main__":
  import argparse

  parser = argparse.ArgumentParser(description="Export ratings to rating_1.json")
  parser.add_argument(
    "-o",
    "--output",
    type=str,
    default="rating_1.json",
    help="Output file path (default: rating_1.json)",
  )

  args = parser.parse_args()
  export_ratings(args.output)
