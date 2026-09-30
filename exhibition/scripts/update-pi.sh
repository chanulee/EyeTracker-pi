#!/bin/bash
set -euo pipefail
repo_dir="$(cd "$(dirname "$0")/../.." && pwd)"
# The common installer checks the repository, fast-forwards main, preserves
# ignored settings, installs any new dependencies, and restarts eye-pi.
exec bash "$repo_dir/install.sh" "$repo_dir"
