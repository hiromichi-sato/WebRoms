#!/usr/bin/env bash
set -euo pipefail
repo=/mnt/c/work/WebRoms
root=/tmp/webroms-build-57aecf58
if [ ! -c "$root/dev/null" ]; then
  unlink "$root/dev/null"
  mknod -m 666 "$root/dev/null" c 1 3
fi
cp -r "$repo/scripts" "$repo/native" "$root/work/"
cp "$repo/.tools/sources/"*.f90 "$repo/.tools/sources/magic-numbers.h" "$root/work/sources/"
script=${1:?build script required}
shift
chroot "$root" /bin/bash "/work/scripts/$script" "$@"
