# NOAA profiles and application API

The seven-stage workflow adds `regionalClimate` and `applyRegionalClimate`.
Eight regions now cover southern/northern Pacific Japan, the Japan Sea,
North Pacific, California, South Pacific, North Atlantic and South Atlantic.
Bay presets use the surrounding southern Pacific Japan mean, not in-bay observations.
Seasonal regional selection swaps JJA/DJF in the Southern Hemisphere.
The separate chlorophyll-derived biology and its assumptions are documented in
[WORKFLOW.md](WORKFLOW.md); it uses cumulative, not seasonal, MODIS surface chlorophyll.

## Integration

```js
import * as climate from './src/climatology.js';

const options = climate.getClimatologyOptions(config);
const ensoOptions = climate.ENSO_OPTIONS;
const apply = ensoOptions.some(o => o.id === id)
  ? climate.applyEnsoComposite : climate.applyClimatology;
const next = apply(config, id, { boundaries: false, outOfRange: 'clamp' });
next.initial.distribution = 'climatology';
// next.climatology.id and .product identify the applied source.
```

Both apply functions synchronously return a cloned config, never mutate the input,
and throw on invalid IDs, missing required values, or invalid options. Defaults:
`boundaries: true`, `outOfRange: 'error'`; WOA additionally accepts
`densityKgM3: 1025`. Main explicitly selects clamp and disables boundary edits.
They populate wet-cell painted fields at uniform sigma layer centers, bottom-first,
using `(h + zeta) * (1 - (k + 0.5) / nz)` as positive-down depth below the local
surface. These are the model's uniform sigma centers, not stretched ROMS depths.
Boundary painting uses each boundary's own water level. Closed/open modes are
retained. Velocities, terrain, rivers and nonmapped tracers are retained. Reapply
after changing terrain, water levels or layer count; profiles are static initial
conditions, not time-varying forcing or horizontally resolved NOAA fields.

`getClimatologyOptions(config)` adds `available` and Japanese `reason` fields.
JJA requires northern terrain: explicit `grid.geoBounds` takes precedence over
`TERRAIN_PRESETS[grid.preset].hemisphere`. Invalid or southern explicit bounds do
not fall back to northern metadata. Without config it returns the catalogue.
`getEnsoOptions(config)` optionally provides eligibility for northern presets whose
region is `japan` or `north-pacific`; the ENSO apply function enforces it too.
All catalogue labels are Japanese. Options carry `sourceUrl`, `disclosure`, and
`outOfRangeOptions`; the UI should display source/approximation disclosures.

Exact exports from `src/climatology.js`:

- Data/constants: `CLIMATOLOGY_DATA`, `ENSO_DATA`, `CLIMATOLOGY_OPTIONS`,
  `ENSO_OPTIONS`, `OUT_OF_RANGE_OPTIONS`, `DEFAULT_DENSITY_KG_M3`.
- Catalogue/profile lookup: `getClimatologyOptions`, `getEnsoOptions`,
  `getClimatologyProfile`, `getEnsoComposite`.
- Sampling: `sampleProfile`, `sampleClimatology`, `sampleEnsoComposite`.
- Unit conversion: `micromolKgToMmolM3`, `mmolM3ToMicromolKg`.
- Application: `applyClimatology`, `applyEnsoComposite`.

## WOA23 provenance and deep composite

[NOAA WOA23](https://www.ncei.noaa.gov/access/world-ocean-atlas-2023/) supplies
one-degree objectively analyzed means (`an`), not individual observations.
Temperature/salinity use the 1991-2020 climate normal (`decav91C0`); nitrate,
phosphate and silicate use 1965-2022 (`all`). DOI references are stored per variable:
temperature `10.25923/54bh-1613`, salinity `10.25923/70qt-9574`, nutrients
`10.25923/39qw-7j08`. Every compressed CSV's exact URL, SHA-256, byte count and
header are recorded in `src/data/climatology-woa23.js`.

Four boxes, west-inclusive/east-exclusive and south-inclusive/north-exclusive,
with longitude in degrees east on 0-360:

| ID | Longitude | Latitude |
| --- | --- | --- |
| japan-pacific | 132-142 | 30-36 |
| japan-north | 140-148 | 38-45 |
| japan-sea | 130-140 | 35-44 |
| north-pacific | 150-230 | 20-55 |

Annual profiles use month code 00. JJA averages months 6,7,8 and DJF averages
12,1,2 with equal month weight at each cell, requiring all three valid values.
Regional means use cos(latitude) weighting and are rounded to six decimals.
Missing/short CSV entries and NOAA fill values remain null, never zero.

The bundled depth axis extends to 5500 m. Temperature and salinity use monthly
seasonal composites through 1500 m; nutrients use them through 500 m. Below those
respective source coverage limits, each seasonal profile uses the annual regional
mean at the same depth. `fields[name].sourceSeason[k]` records the source at every
level. Interpolation across the transition blends the last seasonal and first
annual level; this is an application composite, not a NOAA seasonal deep product.
Within seasonal coverage, missing values are not replaced with annual values.
The original upper-500 m selected levels are retained; below 500 m the spacing is
50 m through 2000 m, then 100 m through 5500 m.

The grid depth is not a guarantee of regional coverage. Current deepest valid
levels are 4900 m for japan-pacific, 3700 m for japan-sea, and 5500 m for
japan-north/north-pacific. Land and shallow seabeds reduce valid cell counts with
depth; these are depth-dependent regional footprints, not one measured column.
`validCells` and `missing` remain available for inspection.

WOA in-situ Celsius temperature is used as model temperature without a
potential-temperature correction. Practical salinity is used directly.
Nutrients are converted from micromol/kg to mmol/m3 by multiplying by
`densityKgM3 / 1000`. The default density 1025 kg/m3 is an explicit approximation,
not an observed density field or equation-of-state calculation.

Only nitrate is mapped to model NO3 (`NO3`, `npzd_NO3_`, `nemuro_NO3_`), and
silicate to NEMURO `nemuro_SiOH`. Phosphate remains available through the sampling
API but is not applied to model tracers. There are NO observed phytoplankton (P),
zooplankton (Z), detritus (D), chlorophyll or ammonium fields in this dataset.
Those values remain model initial conditions; this is not an observed NPZD state.

## GODAS selected ENSO winters

[NOAA PSL GODAS](https://psl.noaa.gov/data/gridded/data.godas.html) is an ocean
assimilation product. Data provided by NOAA PSL, Boulder, Colorado, USA.
Exact OPeNDAP ASCII subset URLs, metadata DAS files and source hashes are stored
in `src/data/climatology-enso.js`. The archived
[ERSSTv5 ONI table](https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt)
checks the DJF anomaly sign for each selected winter; this is not current RONI
classification or a live ENSO forecast.

- El Nino: winter years 1983, 1998, 2016.
- La Nina: winter years 1989, 2000, 2011.

Each winter includes December of the previous year and January/February of the
named year. Nine months receive equal weight; all nine must be valid at a cell
and depth. Spatial averaging then uses cos(latitude) weights. These are selected
event absolute means, NOT anomalies, all-event composites, or full climatologies.
The subset uses latitude indices 284:3:386 (35 samples, approximately
20.166-54.166 N), longitude indices 150:1:229 (80 samples, 150.5-229.5 E),
and levels 0:1:27 (5-459 m). Latitude subsampling is not block averaging.

The source DAS declares `pottmp` as potential temperature in K and `salt` as
salinity in kg/kg, with fill value -9.96921e36. Reduction subtracts 273.15 from
temperature and multiplies salinity by 1000 to store g/kg. The sampler exposes
these as `potentialTemperature` and `salinityMassFraction` with explicit units.
Application uses potential Celsius temperature directly as model temperature
and the g/kg number as model practical salinity. The latter is a numerical
approximation, NOT a TEOS-10 conversion between mass and practical salinity.
No nutrients or biological tracers are supplied or changed by ENSO application.

## Range and missing-value policy

Sampling defaults to `outOfRange: 'missing'` (returns null). Apply defaults to
`'error'`. Explicit `'clamp'` holds the nearest valid endpoint constant above or
below each field's regional coverage. It therefore also fills the GODAS 0-5 m
surface gap and water below 459 m, and WOA depths below a regional seabed limit.
It never crosses internal null gaps; apply rejects required missing values.
Clamped values are approximations, not observations at the requested depth.
Returned `climatology` metadata records the policy, source, applied fields,
temperature/salinity assumptions, and regional/vertical reduction disclosures.

## Reproduction and verification

```powershell
$env:CLIMATOLOGY_CACHE = 'C:\Users\sato\AppData\Local\Temp\webroms-climatology-woa23'
node scripts/fetch-climatology.mjs
node scripts/fetch-climatology-enso.mjs
node --test tests/climatology.test.mjs
```

Without this environment variable, scripts use `os.tmpdir()` plus
`webroms-climatology-woa23`; tests skip only the optional archived-byte check.
Fetchers reuse cached bytes, verify all existing pinned hashes before reduction,
and reject changed source files. The ONI table is a changing upstream resource:
preserve its archived cache for exact replay. Do not silently repin it after a
hash mismatch. No fetching is required at application runtime.

On 2026-10-07 both products were regenerated from preserved original downloads:
35 WOA CSV archives and 27 GODAS/ONI responses passed their recorded byte hashes.
Live re-downloads of the WOA annual temperature archive and GODAS 1998 potential
temperature DAS independently matched their pinned hashes. This live check was
representative, not a fresh download of every source.

Current payload SHA-256 (JSON.stringify in generator field order):

- WOA: `9fa6187db0b57da2bda890f8c0f4d7fa8f6cd4e880c6da120fda84586f40d025`
- ENSO: `29bbb29105ede297be36344edf1e12b6e2ecf844c13706912c044dc784f6d50f`

WOA hashes `{ depthsM, regions, variables, profiles }`; ENSO hashes
`{ depthsM, profiles }`. These payload hashes cover numerical payloads, not all
metadata. Per-source hashes separately cover the original downloaded bytes.
Tests verify parsers, units, missingness, hashes, seasonal/annual transitions,
terrain eligibility, sigma-depth application, boundaries, nonmutation, retained
biology and the main UI call contract.
