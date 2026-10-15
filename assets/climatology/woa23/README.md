# NOAA WOA23 Spatial Climatology

Source: NOAA NCEI World Ocean Atlas 2023, objectively analyzed observations.
https://www.ncei.noaa.gov/products/world-ocean-atlas
This is not a dynamical ocean reanalysis or a velocity/sea-level product.

- Temperature/salinity: 2015-2022 (B5C2), original 0.25-degree grid.
- Nitrate/phosphate/silicate: 1965-2022 (all), original 1-degree grid.
- Annual, Northern Hemisphere winter (13) and summer (15).
- Bundled coverage: 120-155 E, 20-50 N. Original global CSV archives remain under data/noaa/woa23/source/.
- No 2023 observations or invented 2015-2023 nutrient mean are claimed.

Selected standard depths retain original horizontal profiles. Missing seasonal
depths use annual values. Model initialization uses local inverse-distance
interpolation of four surrounding profiles and vertical linear interpolation,
holding the nearest valid vertical endpoint outside observed support.
Plankton, detritus, flow and sea level are not inferred observations from WOA.
Quarter-degree grid spacing does not imply resolved coastal currents or narrow fronts.

Source URLs, original gzip checksums, derived checksums and processing are in
index.json and explicit project JSONs. Rebuild with node scripts/fetch-woa-spatial.mjs.
Retain NOAA acknowledgment and provenance when redistributing derived data.
