#!/usr/bin/env bash
set -euo pipefail
root=/tmp/webroms-build-57aecf58
repo=$(cd "$(dirname "$0")/.." && pwd)
name=${1:-uniform}
steps=${2:-10}
case "$name" in uniform|coast|diffusion) ;; *) exit 2 ;; esac
mkdir -p "$root/work/case-$name"
cp "$repo/.tools/case-$name/"* "$root/work/case-$name/"
chroot "$root" /bin/bash -c "cd /work/case-$name && /work/build/native-driver/reference $steps 8 8 3"
cp "$root/work/case-$name/reference.bin" "$repo/.tools/case-$name/"
