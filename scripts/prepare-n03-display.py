"""Build dissolved, pre-clipped display tiles; model classification stays unchanged."""
import gzip
import hashlib
import json
from pathlib import Path
import sys
from concurrent.futures import ProcessPoolExecutor, as_completed

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / '.tools' / 'coastline-python'))
from shapely import make_valid, coverage_union_all
from shapely.geometry import Polygon, box
from shapely.ops import unary_union

folder = ROOT / 'assets' / 'coastlines' / 'n03-2026'
output = folder / 'display'
cache = ROOT / '.tools' / 'n03-display-cache'

def polygons(geometry):
    if geometry.geom_type == 'Polygon':
        yield geometry
    elif hasattr(geometry, 'geoms'):
        for member in geometry.geoms:
            yield from polygons(member)

def prepare_tile(tile):
    cached = cache / (tile['file'] + '.json')
    if cached.exists():
        record = json.loads(cached.read_text())
        if record['sourceSha256'] == tile['sha256'] and all(
            (output / p['file']).exists() and hashlib.sha256((output / p['file']).read_bytes()).hexdigest() == p['sha256']
            for p in record['tiles'].values()
        ):
            return record['tiles']
    result = {}
    raw = (folder / tile['file']).read_bytes()
    if hashlib.sha256(raw).hexdigest() != tile['sha256']:
        raise ValueError('Source hash mismatch: ' + tile['file'])
    data = json.loads(gzip.decompress(raw))
    b = tile['bounds']
    extent = box(b['west'], b['south'], b['east'], b['north'])
    clipped = []
    for feature in data['polygons']:
        p = Polygon(feature['rings'][0], feature['rings'][1:])
        clipped.append((p if p.is_valid else make_valid(p)).intersection(extent))
    try:
        merged = coverage_union_all(clipped)
        if not merged.is_valid:
            raise ValueError('Invalid coverage')
    except Exception:
        merged = unary_union(clipped)
    for y in range(round(b['south'] * 4), round(b['north'] * 4)):
        for x in range(round(b['west'] * 4), round(b['east'] * 4)):
            groups = []
            for p in polygons(merged.intersection(box(x/4, y/4, (x+1)/4, (y+1)/4))):
                if p.area == 0:
                    continue
                groups.append({'outer': list(p.exterior.coords)[:-1],
                               'holes': [list(r.coords)[:-1] for r in p.interiors], 'box': list(p.bounds)})
            if not groups:
                continue
            key = f'{x}_{y}'
            payload = gzip.compress(json.dumps({'groups': groups}, separators=(',', ':')).encode(), mtime=0)
            name = key + '.json.gz'
            (output / name).write_bytes(payload)
            result[key] = {'file': name, 'sha256': hashlib.sha256(payload).hexdigest(),
                                   'bytes': len(payload), 'vertices': sum(len(p['outer']) + sum(map(len, p['holes'])) for p in groups)}
    cached.write_text(json.dumps({'sourceSha256': tile['sha256'], 'tiles': result}))
    return result

if __name__ == '__main__':
    output.mkdir(exist_ok=True)
    cache.mkdir(exist_ok=True)
    source = json.loads((folder / 'index.json').read_text(encoding='utf-8'))
    index = {k: source[k] for k in ['source', 'date', 'license', 'sourceUrl', 'crs']}
    index.update(format='webroms-n03-display-v1', subdivisions=4,
                 processing='Municipal union; clipped to 0.25 degree display tiles; no geometric simplification; model masks unchanged', tiles={})
    with ProcessPoolExecutor(max_workers=4) as executor:
        tasks = {executor.submit(prepare_tile, tile): tile for tile in source['tiles']}
        for task in as_completed(tasks):
            index['tiles'].update(task.result())
            print(tasks[task]['file'], len(index['tiles']), flush=True)
    index['tiles'] = dict(sorted(index['tiles'].items()))
    (output / 'index.json').write_text(json.dumps(index, separators=(',', ':')) + '\n', encoding='utf-8')
    print('Prepared display tiles:', len(index['tiles']))
