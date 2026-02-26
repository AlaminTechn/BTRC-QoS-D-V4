# BTRC QoS Monitoring Dashboard v4

React-Leaflet frontend + Metabase backend for BTRC broadband QoS monitoring.

## Quick Start

```bash
# 1. Copy env
cp .env.example .env

# 2. Start services (Metabase + TimescaleDB + Martin tile server)
docker compose up -d timescaledb metabase martin
# Wait ~60s for Metabase to initialize

# 3. Load POC data
bash scripts/load-data.sh

# 4. Start frontend
cd btrc-frontend
yarn install
yarn dev
# → http://localhost:5173

# 5. (Optional) Download offline tiles
bash scripts/download-tiles.sh
```

## Services

| Service | URL | Credentials |
|---|---|---|
| Frontend | http://localhost:5173 | - |
| Metabase | http://localhost:3000 | alamin.technometrics22@gmail.com / Test@123 |
| TimescaleDB | localhost:5433 | btrc_admin / btrc_poc_2026 |
| Martin (tiles) | http://localhost:3001 | - |

## Dashboard Pages

- `/executive` — Executive dashboard (KPIs, maps, compliance)
- `/regulatory` — Regulatory dashboard (SLA, drill-down map, violations)
- `/operational` — Operational dashboard (ISP comparison, coverage)

## Offline Tiles

Place `bangladesh.pmtiles` in the `tiles/` directory, then set `VITE_TILE_URL` in `.env`:

```env
VITE_TILE_URL=http://localhost:3001/tiles/bangladesh/{z}/{x}/{y}
```

Without offline tiles, OpenStreetMap is used as fallback.

## GeoJSON Files

Located in `geodata/`:
- `bangladesh_divisions_8.geojson` — 8 divisions, `NAME_1` property
- `bgd_districts.geojson` — 64 districts, `shapeName` property

Served from `btrc-frontend/public/geodata/` in dev (copy or symlink).

## POC Data

Date window: **Feb 1–15, 2026**
- 8 divisions, 64 districts, 40 ISPs, ~800 PoPs, 200 violations

See `CLAUDE.md` for full schema reference.
