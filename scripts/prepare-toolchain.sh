#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
root=/tmp/webroms-build-57aecf58
mkdir -p "$root"
for layer in .tools/oci/layer-*.tar.gz; do
  tar --extract --gzip --file "$layer" --directory "$root" --anchored --exclude='dev/*' --exclude='proc/*' --exclude='sys/*' --no-same-owner
done
mkdir -p "$root/work/sources"
mkdir -p "$root/dev"
if [ ! -e "$root/dev/null" ]; then mknod -m 666 "$root/dev/null" c 1 3; fi
cp /etc/resolv.conf "$root/etc/resolv.conf"
cp .tools/sources/*.tar.gz "$root/work/sources/"
cp -r scripts native "$root/work/"
tar -c --exclude=.git -f - roms | tar -x -f - -C "$root/work/"
chroot "$root" /bin/bash -lc 'source /opt/emsdk/emsdk_env.sh; /opt/flang/host/bin/flang --version; emcc --version; gfortran --version | head -1'
