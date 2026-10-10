# Bundled MDT

Source: user-provided `mdt_hybrid_cnes_cls22_cmems2020_global.nc`.
The original remains in `roms/sample/` (not included in Git or the release).
Copyright CNES / CLS / E.U. Copernicus Marine Service. AVISO data terms apply,
not the application's MIT licence. Confirm redistribution conditions before
publishing this derived atlas. No permission to redistribute the original is
asserted by this notice.

- Product: HYBRID_MDT_CNES_CLS22_CMEMS2020, 1993-2012 mean, 1/8 degree.
- Source-file DOI: https://doi.org/10.24400/527896/a01-2023.003
- Current hybrid product page DOI: https://doi.org/10.24400/527896/a01-2024.010
- Product: https://www.aviso.altimetry.fr/en/data/products/auxiliary-products/mdt/mdt-global-hybrid-cnes-cls-cmems.html
- Terms: https://www.aviso.altimetry.fr/fileadmin/documents/data/License_Aviso.pdf

The file DOI and current catalogue DOI differ; both are retained without
silently rewriting the original metadata. `metadata.json` includes all source
global attributes, source SHA-256, output SHA-256, and processing details.

`atlas.bin` is little-endian int16, latitude-major, 1440 x 2880. Values are
original packed MDT values times 0.0001 metres, with -32768 meaning missing.
No source precision or spatial resolution is discarded. Only MDT is included;
geostrophic velocity and error fields are not used to force the model.

Reproduce from repository root with Python, netCDF4 and NumPy installed:

```sh
python scripts/prepare-mdt.py roms/sample/mdt_hybrid_cnes_cls22_cmems2020_global.nc
```

In the browser, the user's geographic model grid receives bilinear samples
of valid source neighbours. Longitude wraps across the date line. For wet
model cells with no valid source sample, solve steady diffusion:

`d(eta)/d(tau) = kappa * Laplacian(eta) -> Laplacian(eta) = 0`.

Known values are fixed Dirichlet anchors. Land and outer model edges have
zero normal flux. The discrete stencil uses `1/dx^2` and `1/dy^2`, solved
with SOR 1.5, tolerance 1e-8 metres and a 20000-sweep limit. The diffusion
time is mathematical, not an ocean simulation time; kappa does not change
the steady solution. Initial wave-front propagation only initializes the
iteration; it is not the final extrapolation method.

Unanchored disconnected water components have no unique diffusion solution.
Use the nearest valid atlas value within 50 km of any cell in the component;
if none exists, use zero. Each component receives one uniform value, avoiding
an artificial internal sea-level slope. This fallback may reference values
across land, but diffusion itself never crosses land. Source-interpolated,
diffusion-extrapolated, nearby-value and zero-fallback cells
are distinguished in settings and NetCDF `mdt_fill_status` metadata. A
terrain change requires reapplication. Coastal extrapolation is not an
observation of bay-scale dynamic topography.
