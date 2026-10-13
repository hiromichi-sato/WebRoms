# Browser ROMS Architecture

For a grouped Japanese overview of the current engine, numerical choices, data and validation, see [技術概要](docs/TECHNICAL_OVERVIEW.md). This document focuses on the low-level implementation and maintainer toolchain.

The UI sends validated configuration to a Web Worker. The worker creates actual classic NetCDF grid, initial, boundary and forcing files in the in-memory filesystem, then calls the bundled ROMS module through native/bridge.f90. There is no backend or substitute numerical solver. Main-run cancellation terminates the worker; restart from a checkpoint is not implemented. On normal completion the worker and native integrator remain initialized for on-demand export runs.

## Numerical configuration

native/webroms_physical.h lists the shared ROMS options; model headers and webroms_gls.h extend it for biology and GLS. Vtransform=2, Vstretching=1, theta_s=theta_b=0 give equal sigma layers. The Cartesian C-grid uses fixed wet/dry masks, an f-plane or beta-plane Coriolis field, nonlinear equation of state, horizontal/vertical diffusion, prescribed wind and linear bottom drag. Surface temperature flux follows the selected heat mode; external salinity and biological surface/bottom fluxes are zero. Rho dimensions include exterior boundary cells: Lm=nx-2, Mm=ny-2. Arrays are bottom-first; UI labels are surface-first.

ROMS supports zeta, ubar/vbar, u/v and tracer boundary conditions. The UI selects closed, specified, open or paired periodic sides; radiation is not exposed as a user option. Automatic velocity mode leaves flow open while specifying tracer values. Tide and non-tidal sea-level forcing are separately enabled. Depth-averaged transport and layer velocities must be physically consistent. See OCEAN_INPUTS.md for forcing and boundary details.

The worker runs the specified number of time steps without a residual-based convergence criterion or automatic file saving. It retains a bounded recent history in memory for 48-model-hour pin plots, independently of result exports. Display updates are acknowledged to bound queued snapshots. Completion indicates the requested duration was integrated, not that a steady state was reached. Cancellation and numerical errors can still stop a run.

The browser worker reserves NTIMES=10000000 and the same static forcing/boundary/river time coverage, while JavaScript controls the requested step count. Export requests continue the same native state (including time levels) and collect only the additional interval, including both endpoints. The writer uses the retained runtime for NetCDF, avoiding a second WASM instance. Zero-duration exports capture the current state only. Subsequent exports continue from the latest time. Export requests exceeding preflight memory/record/step limits do not advance the integrator; cancelling an export run discards its records and preserves the new current state. Native reference tests retain their original finite NTIMES by using the default writeInputs argument.

## Additional experiments: standard ROMS FLOATS

All six kernels include FLOATS. Initial input allocates a 512-particle pool with Lfloats=F and NFLT=0, so standard runs do not integrate or automatically write trajectories. native/floats-bridge.f90 validates releases, seeds native Tinfo/track, resets the float time-level indices, and enables Lfloats for an additional RUN. Native step_floats/interp_floats perform the integration, without a JS advection solver. Particle tracking is passive and must not change physical or biological fields.

08 supports Lagrangian 3D (Ftype=1) and fixed geopotential depth (Ftype=3); there is no FLOAT_VWALK or FLOAT_BIOLOGY. The worker records positions and activity flags at explicit sample times, then disables Lfloats while retaining the ocean state. Repeated releases advance from that latest state, not a restored checkpoint. Output is a time-by-trajectory NetCDF matrix with model elapsed seconds and optional geographic coordinates. JSON stores release settings, not a restart. Tests cover all six kernels, first-step release, advection, fixed depth, reseeding, pause, output and identical ocean fields with/without passive tracking.

## Biology

The fixed-mixing physics, NPZD and NEMURO modules below also have GLS counterparts under `runtime/gls/physical/`, `runtime/gls/npzd/` and `runtime/gls/nemuro/`. The worker chooses one of these six kernels from the biology and mixing settings. Heat-enabled builds and current tests are summarized in [技術概要](docs/TECHNICAL_OVERVIEW.md#4-検証開発配布).

The worker selects `runtime/roms.js` for physics, `runtime/npzd/roms.js` for NPZD_FRANKS (4 tracers), or `runtime/nemuro/roms.js` for NEMURO (11 tracers, IVLEV_EXPLICIT grazing). Each has a separate compiled ROMS kernel and WASM. Fennel remains configuration-only. The bridge exports the compiled model ID, and input generation rejects mismatched kernels.

`biology.in` supplies reaction coefficients, HSIMT advection, diffusivities and tracer boundary types. NetCDF initial/boundary variable names are generated from ROMS varinfo.dat; duplicate IDs use the last entry, matching ROMS's sequential reader. NEMURO sample concentrations are converted from mol/L to mmol/m3; reaction coefficients come from ROMS nemuro.in, not the independent sample's equations. The sample is not a replacement solver.

ANA_SPFLUX and ANA_BPFLUX supply zero external tracer flux. Model settling remains active. Uniform, constant shortwave radiation is supplied in W/m2 for NEMURO; atmospheric heat/freshwater flux remains zero.

After building the base toolchain and NetCDF, run `sudo bash scripts/run-build.sh build-biology.sh npzd` and the equivalent for `nemuro`. Copy both runtime subdirectories from the chroot to `runtime/`. Header changes require reprocessing ROMS; the build script invalidates its build directory on model-header changes. Native comparisons use `build-native-biology.sh` with the same model headers. Review comparison records before running `node scripts/record-release.mjs --biology`; this preserves historical physical reference cases.

For each biology model, generate inputs with `node scripts/validate-runtime.mjs MODEL 60`, run `sudo bash scripts/run-reference.sh MODEL 60`, and compare with `node scripts/compare-reference.mjs MODEL`. Set `WEBROMS_BUILD_ROOT` consistently for preparation/build/reference scripts to place the toolchain outside an automatically cleaned `/tmp`, for example `/var/tmp/webroms-build-57aecf58`.

## Maintainer build

End users do not compile. The checked-in artifact was built in Ubuntu 22.04 WSL using the pinned r-wasm/flang-wasm OCI image recorded in runtime/manifest.json. Root-owned chroot scripts are intended for an isolated development environment.

1. Put official ROMS commit 57aecf589a408b1e5490d2db7f9bd0196062a44e at roms/.
2. Run the Node scripts fetch-toolchain.mjs, fetch-sources.mjs and fetch-intrinsics.mjs under scripts/.
3. In Linux run `sudo bash scripts/prepare-toolchain.sh`.
4. Run `sudo bash scripts/run-build.sh build-netcdf.sh`, then `sudo bash scripts/run-build.sh build-heat.sh` to build all six physical/NPZD/NEMURO and fixed/GLS kernels, including standard FLOATS.
5. Copy roms.js and roms.wasm from /tmp/webroms-build-57aecf58/work/runtime/ to runtime/. Run `node scripts/prepare-metadata.mjs`.
6. Run `sudo bash scripts/run-build.sh build-native.sh`. For uniform, coast and diffusion run `node scripts/validate-runtime.mjs NAME 100`, `sudo bash scripts/run-reference.sh NAME 100`, then `node scripts/compare-reference.mjs NAME`.
7. Review validation records, refresh the manifest with `node scripts/record-release.mjs`, and run all release checks. Never refresh hashes merely to silence an integrity failure.

prepare-abi.py corrects wasm32 intrinsic sizes and generates NetCDF interop adapters. NetCDF uses its bundled legacy rank-aware Fortran wrappers. LLVM IR adapters correct Repeat/Spread/InquireLogical runtime signatures. These address compiler ABI issues, not ocean equations. ROMS's supported legacy varinfo.dat avoids the YAML parser path. Link signature warnings are fatal.

## Distribution

The build copies all browser dependencies and licenses to dist/. HTTPS or localhost HTTP is required; file:// is unsupported. Relative worker URLs support repository subpaths. No CDN or runtime remote-data service is required. Offline installation/service-worker caching is not implemented.
