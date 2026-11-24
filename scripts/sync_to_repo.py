"""Sync the Night Hunt Dossier project into a locally cloned GitHub repository.

Usage:
    python scripts/sync_to_repo.py "C:\\path\\to\\Terrifying-hunt-"

The script copies project source, assets and the Pages workflow into the clone.
It never deletes files in the destination and never commits or pushes.
"""
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXCLUDED_DIRS = {"node_modules", "dist", ".git", ".dbd-cache", "__pycache__", "site-dist"}
EXCLUDED_FILES = {"night-hunt-dossier.zip"}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("repo", help="Local clone directory of the GitHub repository")
    args = parser.parse_args()

    dest = Path(args.repo).expanduser().resolve()
    if not dest.is_dir():
        print(f"ERROR: destination folder does not exist: {dest}")
        return 1
    if not (dest / ".git").exists():
        print(f"ERROR: destination is not a Git clone (no .git found): {dest}")
        return 1

    copied = 0
    for src in sorted(ROOT.rglob("*")):
        rel = src.relative_to(ROOT)
        if any(part in EXCLUDED_DIRS for part in rel.parts):
            continue
        if src.is_file() and src.name in EXCLUDED_FILES and rel.parent == Path("."):
            continue
        target = dest / rel
        if src.is_dir():
            target.mkdir(parents=True, exist_ok=True)
        elif src.is_file():
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, target)
            copied += 1

    print(f"Synced {copied} files into {dest}")
    print("Next: review changes in GitHub Desktop, then Commit to main and Push origin.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
