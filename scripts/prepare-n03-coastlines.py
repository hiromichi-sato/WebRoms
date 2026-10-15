"""Derive display-only coastlines from the union of N03 land polygons."""
import hashlib
import gzip
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / '.tools' / 'coastline-python'))
from shapely import make_valid, coverage_union_all
from shapely.geometry import Polygon, box
from shapely.ops import unary_union

folder = ROOT / 'assets' / 'coastlines' / 'n03-2026'
index_path = folder / 'index.json'
index = json.loads(index_path.read_text(encoding='utf-8'))
for tile in index['tiles']:
    name = tile['file'].replace('.json', '-coast.json')
    existing = folder / name
    if '--resume' in sys.argv and existing.exists():
        payload = existing.read_bytes()
        json.loads(gzip.decompress(payload) if existing.suffix == '.gz' else payload)
        tile['coastlineFile'] = name
        tile['coastlineSha256'] = hashlib.sha256(payload).hexdigest()
        continue
    source = folder / tile['file']
    data = json.loads(gzip.decompress(source.read_bytes()) if source.suffix == '.gz' else source.read_bytes())
    b = tile['bounds']
    extent = box(b['west'], b['south'], b['east'], b['north'])
    polygons = [Polygon(p['rings'][0], p['rings'][1:]) for p in data['polygons']]
    clipped = [(polygon if polygon.is_valid else make_valid(polygon)).intersection(extent) for polygon in polygons]
    try:
        merged = coverage_union_all(clipped)
        if not merged.is_valid:
            raise ValueError('Invalid coverage union')
    except Exception:
        merged = unary_union(clipped)
    members = list(merged.geoms) if hasattr(merged, 'geoms') else [merged]
    paths = []
    for polygon in members:
        if polygon.geom_type != 'Polygon':
            continue
        current = []
        points = list(polygon.exterior.coords)
        for a, c in zip(points, points[1:]):
            seam = any(abs(a[axis] - edge) < 1e-8 and abs(c[axis] - edge) < 1e-8
                       for axis, edge in [(0, b['west']), (0, b['east']), (1, b['south']), (1, b['north'])])
            if seam:
                if len(current) > 1:
                    paths.append(current)
                current = []
            else:
                if not current:
                    current.append(a)
                current.append(c)
        if len(current) > 1:
            paths.append(current)
    payload = gzip.compress(json.dumps({'paths': paths}, separators=(',', ':')).encode(), mtime=0)
    (folder / name).write_bytes(payload)
    tile['coastlineFile'] = name
    tile['coastlineSha256'] = hashlib.sha256(payload).hexdigest()
    print(name, len(paths), flush=True)
index['coastlineProcessing'] = 'Shapely union of municipal polygons; exterior coastline only; artificial tile edges omitted; display only'
index_path.write_text(json.dumps(index, indent=2) + '\n', encoding='utf-8')
