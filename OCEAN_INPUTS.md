# Geographic inputs and tidal boundaries

## Implemented workflow

1. Choose a georeferenced terrain preset or import terrain from Shape / NetCDF.
2. Import TS and biological initial concentrations in the format below. The target terrain owns its mask, bathymetry, and grid dimensions.
3. Optionally import a two-dimensional MDT / ADT surface. Its values replace the initial sea surface and the baseline on non-closed, non-periodic boundaries. They are not added a second time as steric height.
4. Import a prepared FES ocean-height package. Specified wet boundaries switch to open connection; closed and periodic boundaries are preserved. No fictional FES data are supplied.
5. Run the spin-up without history output. Then select a 14-, 15-, or 30-day additional RUN and the sampling interval. Time and astronomical phase continue without resetting.

An idealized terrain without coordinates gets no geographic tide. With geographic coordinates and tides ON, a missing package uses an explicitly labelled idealized M2+S2 tide: amplitudes 0.30/0.15 m, periods 12.4206012/12 hours, zero phase at simulation start, identical along the wet boundary. This produces a roughly 14.77-day spring/neap envelope, not a local prediction or a JMA/FES correction. Imported invalid or stale packages still fail validation. The default horizon is 45 days including spin-up and output. Fully closed domains receive no tidal forcing. No browser auto-save, credentials, restart files, or automatic background downloads are used.

Tides and non-tidal sea level have independent ON/OFF checkboxes. Disabled panels are grey. Sea level defaults OFF (external height zero). For geographic terrain, ON applies the bundled HYBRID_MDT_CNES_CLS22_CMEMS2020 unless custom surface data are already selected. The original NetCDF4 is preserved locally; a lossless MDT-only packed atlas is used offline. See src/data/mdt/README.md for source hashes, diffusion extrapolation, disconnected-water warnings and data terms. Non-geographic terrain retains its initial height (normally zero). Both OFF also suspend stored corrections, without deleting them. Neither switch resets the initial field or clamps the evolving interior surface to zero.

## FES preparation

The repository does not contain the original FES atlas. Obtain FES2022 ocean-height data through AVISO registration and accept the applicable licence. FES2022 current products are not used. An ocean tide is not a loading tide or an MDT.

In step 04, set the UTC start and prediction duration, including spin-up plus the desired output interval. Save the FES generation request. On a machine with the licensed atlas, NumPy and official PyFES >= 2026.2.0:

```powershell
python scripts/prepare-fes.py --request webroms-tide-request.json --atlas C:/data/FES2022/ocean_tide.yaml --output webroms-tides.json
```

Import that JSON in step 04. The helper uses the official PyFES prediction engine rather than implementing astronomical arguments in JavaScript. It excludes loading tide and the separately returned equilibrium long-period term. The constituents in the supplied official atlas configuration remain active. It rejects extrapolated or undefined coastal predictions. Original atlas files are never copied into the package. Check that the YAML actually points to FES2022 ocean heights; the helper cannot certify the provenance of an arbitrary user atlas.

The output has `format=webroms-tides-v1`, `kind=ocean-tide`, `unit=m`, UTC `epoch`, increasing `times` in seconds, grid signature, source/DOI/licence/processing metadata, and `points=[{cell,lon,lat,height:[...]}]`. Every wet outer rho point is required, including shared corners. Predictions have a 30-minute interval and are linearly interpolated by ROMS. Terrain dimensions, extent, wet boundary coverage, missing data, units, and time coverage are checked. Changing geometry can require regeneration. Static TS, biological and velocity boundaries use their own two-record time axis, avoiding a large repeated 3D time series.

## Boundary physics and corrections

- Automatic velocity (default) uses Chapman surface, Flather depth-mean velocity with zero external velocity reference, zero normal gradient for 3D velocity, and radiation/nudging for tracers. Specified wet boundaries use this open connection while automatic velocity is selected. Closed and periodic boundaries are unchanged. This is a teaching default, not a proven optimum for every regional circulation.
- Open tracer/3D nudging uses a 1-day outflow timescale and inflow factor 10. These are modelling defaults, not regionally calibrated parameters.
- Tracer values come from the nearest initial cell unless edited. Advanced manual velocity accepts layer velocities only; depth means are automatically calculated. Equal sigma layer thickness (THETA_S=THETA_B=0) makes the arithmetic mean thickness-weighted. Manual open connections use radiation/nudging for 3D velocity; manual specified boundaries are clamped.
- ROMS continuity accounts for storage: dV/dt = river inflow + surface volume sources - outward boundary transport. No extra zero-net-transport correction is enabled. ROMS explicitly warns against VolCons when tides are enabled; enforcing instantaneous inflow=outflow would suppress tidal storage. Budget diagnostics and a validated non-tidal transport correction remain future work.
- Density-induced surface and velocity changes are solved inside ROMS. FES prescribes the external tidal surface, not interior surface values or FES2022 current data. No equilibrium or real-world reproduction guarantee is implied.
- Advanced correction accepts 1-6 hour UTC samples in cm. Residual mode means an additive correction. Absolute mode first adds the declared datum offset and subtracts the initial surface at the selected cell plus the uncorrected tide. The input must cover the entire run; additional output cannot pass its end.
- Absolute input uses the selected boundary cell's actual external baseline, including manual height overrides. A corner with two conflicting baseline values is rejected rather than choosing one silently.
- Correction locations must be actual wet boundary cells. An interior bay gauge cannot be assigned directly to a bay entrance. No automatic inference of four independent corner observations from one gauge is claimed.
- Corrections spread through connected water with weight `(1-distance/radius)^2`, zero beyond the radius. The weighted residual is divided by `max(1,sum(weights))`, so distant effects fade rather than staying constant. This is a spatial boundary adjustment, not state/4D variational assimilation or a bay-resonance inversion.
- Default residual limit is +/-200 cm, configurable up to 1000 cm. It is an input-validation policy, not a scientific limit on real tides. Rejection is based on the residual, not raw tide-minus-MDT. No run proceeds with invalid correction data.

## NetCDF contract

Browser input supports NetCDF classic (CDF-1) and 64-bit offset (CDF-2), not HDF5/NetCDF4. Convert other files first. Maximum input is 256 MiB. Coordinates are mandatory for initial fields.

| Element | Contract |
| --- | --- |
| Horizontal coordinates | `lon_rho,lat_rho` as separable 2D grids, or `lon,lat` / `longitude,latitude` as monotonic 1D axes; units `degrees_east`, `degrees_north` |
| Spatial ordering | `[depth,latitude,longitude]` or `[latitude,longitude]` |
| Time | Optional leading `ocean_time` / `time`; choose zero-based record in the initial import UI |
| Terrain | `h(latitude,longitude)`, units `m`, positive `down`; optional `mask_rho`, zero=dry |
| Temperature | `temp`, units `degree_Celsius` or `degrees_Celsius` |
| Salinity | `salt`, units `1`, `PSU`, or `psu` |
| Biology | Current model's explicit tracer keys, same as exported NetCDF; matching `mmol N/m3` or `mmol Si/m3` (legacy UTF-8 superscript also accepted); all active tracers required |
| Vertical coordinates | `depth(depth)` or `z_r(depth,latitude,longitude)`, units `m`, explicit positive `up` or `down`; at least two depths |
| Sea surface | `zeta`, `mdt`, or `adt`, units `m`; global `vertical_datum` and `tide_included="false"` required for baseline import |
| Missing values | `_FillValue`, `missing_value`, NaN; no valid interpolation stencil causes rejection |

Input can be wider, finer or coarser than the terrain. Only the required interpolation stencils are sampled, which is equivalent to cropping with a one-cell interpolation halo. Horizontal interpolation is bilinear with wet valid weights renormalized, not conservative cell-area remapping. Values are interpolated vertically in physical height, not layer number. No horizontal extrapolation is permitted. Vertical extension is rejected by default; explicit endpoint extension is labelled an approximation. WebROMS files can extend their top/bottom layer-center values to their own declared surface/bed, but never below the source bed without explicit extension.

Curvilinear grids, projected NetCDF CRS, arbitrary dimension ordering, unspecified vertical datums, velocity reinitialization, and arbitrary external variable names are not yet imported. Shape CRS conversion is handled by its PRJ reader. Output retains native staggered velocities for analysis, but this initial importer loads TS and biological concentrations, not exact dynamical restart state.

Initial export and results use `webroms_format=geographic-v1`, explicit units, geographic coordinates when known, physical `z_r`, source metadata and `restart=false`. Initial export requires geographic terrain. Reading a saved result's selected record as initial TS/biology is reinitialization, not restart. If the target grid is subsequently edited, reimport to resample from the source again.

## Two-dimensional Shape

Terrain retains the existing Shape contract. Sea-level Shape ZIP requires one polygon shapefile with PRJ and numeric `ZETA_M`, `MDT_M` or `ADT_M` in metres. Include `webroms-sea-level.json` with `datum`, `kind` (`mdt`, `adt`, or `model`), `tideIncluded:false`, and `source`. Every target wet center must fall inside a valid source polygon; uncovered wet cells cause rejection. This path samples polygon attributes, not smooth interpolation of scattered gauges.

Result Shape output is a single user-selected horizontal layer per time, not a 3D replacement for NetCDF. It is streamed into ZIP with provenance. Three-dimensional TS and biology are saved as NetCDF.

## Saving and limitations

Single-file NetCDF retains a 256 MiB estimated memory limit. For long runs select time-separated NetCDF ZIP: one full 3D `.nc` per sample is written to the explicitly selected file with backpressure. Shape also uses streaming. Cancellation aborts the file transaction while preserving the current in-memory model state. ZIP output is limited to an estimated 3.5 GiB and 20,000 times; split larger periods. An additional RUN is limited to one million integration steps; runtime capacity remains under ten million cumulative steps.

Real MDT is bundled from the user-provided hybrid CNES-CLS22/CMEMS2020 atlas; FES remains unbundled. Native synthetic-tide and file round-trip tests do not validate coastal FES predictions. Automatic JMA station harvesting, JMA-versus-FES harmonic residual calibration/held-out validation, and observed PDO/NPGO anomaly patterns remain pending. Coastal MDT diffusion extrapolation is a modelling approximation, not a bay observation. Restart and KINACO remain deferred.

## Sources and distribution

- FES2022: CNES, 2024, *FES2022 (Finite Element Solution) Tidal model (Version 2024)*, https://doi.org/10.24400/527896/A01-2024.004
- Product: https://www.aviso.altimetry.fr/en/data/products/auxiliary-products/global-tide-fes/release-fes22.html
- Licence: https://www.aviso.altimetry.fr/fileadmin/documents/data/License_Aviso.pdf
- Prediction API: https://cnes.github.io/aviso-fes/user_guide.html
- JMA station reference: https://www.data.jma.go.jp/kaiyou/db/tide/suisan/station.php
- ROMS boundaries: https://www.myroms.org/wiki/Boundary_Conditions

FES ocean heights allow commercial use subject to the applicable AVISO terms. FES2022 currents have different restrictions. Attribution alone does not authorize mass redistribution of original unmodified AVISO data. Under Issue 20 (effective 2026-08-10), that requires prior written authorization. Record the terms applying to the actual acquired dataset. Derived packages must retain source, licence, and modification notices. WebROMS's MIT licence does not replace third-party data terms.
