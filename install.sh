#!/bin/bash
set -euo pipefail
# Bootstrap for a fresh Pi; the existing installer owns packages and systemd.
if [ "$(id -u)" -eq 0 ]; then
  echo 'sudo 없이 일반 SSH 사용자로 실행하세요.' >&2
  exit 1
fi
repo_url='https://github.com/chanulee/EyeTracker-pi.git'
repo_dir="${1:-$HOME/EyeTracker-pi}"
if ! command -v git >/dev/null; then
  sudo apt-get update
  sudo apt-get install -y git
fi
if [ -e "$repo_dir" ] || [ -L "$repo_dir" ]; then
  if [ ! -d "$repo_dir/.git" ] || [ "$(git -C "$repo_dir" remote get-url origin)" != "$repo_url" ]; then
    echo "$repo_dir 경로에 기존 파일이 있습니다. 다른 설치 경로를 지정하세요." >&2
    exit 1
  fi
  if [ "$(git -C "$repo_dir" branch --show-current)" != main ] || [ -n "$(git -C "$repo_dir" status --porcelain)" ]; then
    echo '기존 저장소에 변경사항이 있거나 main 브랜치가 아닙니다. 먼저 확인하세요.' >&2
    exit 1
  fi
  git -C "$repo_dir" pull --ff-only origin main
else
  download_dir="$(mktemp -d)"
  trap 'rm -rf "$download_dir"' EXIT
  git clone --depth 1 --branch main "$repo_url" "$download_dir/repo"
  mkdir -p "$(dirname "$repo_dir")"
  mv "$download_dir/repo" "$repo_dir"
  rmdir "$download_dir"
  trap - EXIT
fi
exec bash "$repo_dir/scripts/install-pi.sh"
