#!/usr/bin/env bash
set -euo pipefail
repo=$(cd "$(dirname "$0")/.." && pwd)
root=/tmp/webroms-build-57aecf58
if [ ! -c "$root/dev/null" ]; then
  mkdir -p "$root/dev"
  if [ -e "$root/dev/null" ]; then unlink "$root/dev/null"; fi
  mknod -m 666 "$root/dev/null" c 1 3
fi
cp -r "$repo/scripts" "$repo/native" "$root/work/"
cp "$repo/.tools/sources/"*.f90 "$repo/.tools/sources/magic-numbers.h" "$root/work/sources/"
script=${1:?build script required}
shift
chroot "$root" /bin/bash "/work/scripts/$script" "$@"
