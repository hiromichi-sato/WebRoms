"""Generate an ocean-height-only boundary package from a licensed FES atlas.

Requires numpy and pyfes >= 2026.2.0 (official CNES API).
No atlas download, credential storage, or redistribution is performed here.
"""
import argparse
import json
from pathlib import Path


def main():
    import numpy as np
    import pyfes

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--request', required=True, type=Path)
    parser.add_argument('--atlas', required=True, type=Path, help='Official ocean_tide.yaml, not load_tide.yaml')
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    request = json.loads(args.request.read_text(encoding='utf-8'))
    if request.get('format') != 'webroms-tide-request-v1':
        raise ValueError('Expected WebROMS tide request')
    seconds = request['intervalSeconds']
    if seconds != 1800 or not 1 <= request['days'] <= 366 or not request['points']:
        raise ValueError('Invalid period, interval, or points')
    config = pyfes.config.load(str(args.atlas))
    if not hasattr(config, 'models') or 'tide' not in config.models:
        raise ValueError('Use PyFES >= 2026.2 and an ocean tide YAML')
    offsets = np.arange(0, request['days'] * 86400 + 1, seconds, dtype=np.int64)
    dates = np.datetime64(request['startUtc'].removesuffix('Z'), 'us') + offsets.astype('timedelta64[s]')
    points = []
    for point in request['points']:
        lon = np.full(dates.shape, point['lon'], dtype=np.float64)
        lat = np.full(dates.shape, point['lat'], dtype=np.float64)
        tide, _long_period, quality = pyfes.evaluate_tide(config.models['tide'], dates, lon, lat, settings=config.settings)
        # Deliberately exclude loading tide and the equilibrium long-period term.
        # Atlas constituents still follow the supplied official configuration.
        if np.any(quality <= 0) or not np.all(np.isfinite(tide)):
            raise ValueError(f"No reliable wet interpolation at cell {point['cell']}; no silent extrapolation")
        height = np.asarray(tide, dtype=np.float64) / 100.0
        if np.any(np.abs(height) > 20):
            raise ValueError('Tide exceeds supported height range')
        points.append({**point, 'height': np.round(height, 7).tolist()})
    package = {
        'format': 'webroms-tides-v1', 'kind': 'ocean-tide', 'unit': 'm',
        'source': 'FES2022 / official PyFES ocean heights',
        'doi': 'https://doi.org/10.24400/527896/A01-2024.004',
        'license': 'https://www.aviso.altimetry.fr/fileadmin/documents/data/License_Aviso.pdf',
        'credit': 'The FES2022 Tide product was funded by CNES, produced by LEGOS, NOVELTIS and CLS and made freely available by AVISO',
        'modified': 'Wet boundary interpolation; cm to m; 30-minute predictions; no load tide or equilibrium long-period term',
        'pyfesVersion': getattr(pyfes, '__version__', 'unknown'),
        'gridSignature': request['gridSignature'], 'epoch': request['startUtc'],
        'times': offsets.tolist(), 'points': points,
    }
    # Exclusive creation avoids overwriting a prior scientific product by accident.
    with args.output.open('x', encoding='utf-8') as stream:
        json.dump(package, stream, ensure_ascii=False, allow_nan=False, separators=(',', ':'))
    print(f"Generated {len(points)} boundary points x {len(dates)} times: {args.output}")


if __name__ == '__main__':
    main()
