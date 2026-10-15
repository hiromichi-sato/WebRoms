# Japan Land Mask: N03 2026

Source: Ministry of Land, Infrastructure, Transport and Tourism (MLIT),
National Land Numerical Information, Administrative Zones (N03), 2026-01-01.
Hokkaido and Tohoku only. Not a global coastline dataset.

- Source and terms: https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2026.html
- License: CC BY 4.0, https://creativecommons.org/licenses/by/4.0/
- Attribution: WebROMS land mask processed from MLIT National Land Numerical Information (Administrative Zones, 2026).
- No endorsement by MLIT is implied. This dataset is not covered by the software MIT license.

Processing: original municipal polygons retained, non-geometric attributes removed,
coordinates rounded to 1e-7 degrees, indexed by overlapping one-degree tiles.
Polygons crossing tiles are repeated and deduplicated on loading. Model queries
union overlapping polygons: internal administrative borders are not coastlines.
Only tiles overlapping the geographic calculation region and a small buffer load.
JGD2011 geographic coordinates are used on the WGS84 model grid without an
epoch-dependent sub-metre datum correction. Original and derived hashes are in index.json.

N03 polygons define land only within their local support. Offshore or unsupported
regions fall back to ETOPO. Small islands, lakes, river mouths, reclamation and
narrow passages require visual checking at the chosen calculation resolution.
No navigation, engineering safety, or survey-grade accuracy is guaranteed.

Rebuild: `node scripts/prepare-n03-land.mjs`. Original main Shapefile sets and
metadata are kept outside the distribution in `data/coastlines/n03-2026/`.
The original ZIPs and unused 2024/2025 Tohoku ZIPs were removed after preparation.
