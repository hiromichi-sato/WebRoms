# Browser ROMS Architecture

The UI sends validated configuration to a Web Worker. The worker creates actual classic NetCDF grid, initial, boundary and forcing files in the in-memory filesystem, then calls the bundled ROMS module through native/bridge.f90. There is no backend or substitute numerical solver. Cancellation terminates the worker; restart from a checkpoint is not implemented.

## Numerical configuration

native/webroms.h lists the selected ROMS options. Vtransform=2, Vstretching=1, theta_s=theta_b=0 give equal sigma layers. The Cartesian C-grid uses fixed wet/dry masks, constant Coriolis parameter, nonlinear equation of state, horizontal/vertical diffusion, prescribed wind and linear bottom drag. Tracer surface/bottom fluxes are zero. Rho dimensions include exterior boundary cells: Lm=nx-2, Mm=ny-2. Arrays are bottom-first; UI labels are surface-first.

ROMS supports zeta, ubar/vbar, u/v and tracer boundary conditions. This UI applies one mode to all variables per side. Periodic sides must be paired. Radiation does not impose specified-value profiles. Depth-averaged transport and layer velocities must be physically consistent.

The steady residual is the maximum wet-point change per second scaled by 1 m for zeta, 1 m/s for velocity, 10 degrees C for temperature and 35 for salinity. Consecutive samples below tolerance trigger convergence. This is a numerical stopping criterion, not a proof of an exact steady solution.

## Maintainer build

End users do not compile. The checked-in artifact was built in Ubuntu 22.04 WSL using the pinned r-wasm/flang-wasm OCI image recorded in runtime/manifest.json. Root-owned chroot scripts are intended for an isolated development environment.

1. Put official ROMS commit 57aecf589a408b1e5490d2db7f9bd0196062a44e at roms/.
2. Run the Node scripts fetch-toolchain.mjs, fetch-sources.mjs and fetch-intrinsics.mjs under scripts/.
3. In Linux run `sudo bash scripts/prepare-toolchain.sh`.
4. Run `sudo bash scripts/run-build.sh build-netcdf.sh`, then `sudo bash scripts/run-build.sh build-roms.sh`.
5. Copy roms.js and roms.wasm from /tmp/webroms-build-57aecf58/work/runtime/ to runtime/. Run `node scripts/prepare-metadata.mjs`.
6. Run `sudo bash scripts/run-build.sh build-native.sh`. For uniform, coast and diffusion run `node scripts/validate-runtime.mjs NAME 100`, `sudo bash scripts/run-reference.sh NAME 100`, then `node scripts/compare-reference.mjs NAME`.
7. Review validation records, refresh the manifest with `node scripts/record-release.mjs`, and run all release checks. Never refresh hashes merely to silence an integrity failure.

prepare-abi.py corrects wasm32 intrinsic sizes and generates NetCDF interop adapters. NetCDF uses its bundled legacy rank-aware Fortran wrappers. LLVM IR adapters correct Repeat/Spread/InquireLogical runtime signatures. These address compiler ABI issues, not ocean equations. ROMS's supported legacy varinfo.dat avoids the YAML parser path. Link signature warnings are fatal.

## Distribution

The build copies all browser dependencies and licenses to dist/. HTTPS or localhost HTTP is required; file:// is unsupported. Relative worker URLs support repository subpaths. No CDN or runtime remote-data service is required. Offline installation/service-worker caching is not implemented.
