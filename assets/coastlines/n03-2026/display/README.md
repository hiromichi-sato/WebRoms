# N03 Display Tiles

Derived from MLIT National Land Numerical Information N03 2026 (CC BY 4.0).
Source: https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2026.html

Municipal polygons are unioned and clipped to 0.25-degree tiles without geometric
simplification. The original land-classification data remain unchanged.
Tile IDs are floor(longitude * 4)_floor(latitude * 4). The bounds select every
intersecting tile, not just the four corner tiles. Empty tiles are omitted.
index.json records source, processing, SHA-256, byte and vertex counts.

Regenerate with scripts/prepare-n03-display.py (Shapely required). Ordinary users
do not need Python or Shapely; the prepared files are bundled.
