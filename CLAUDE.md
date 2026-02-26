# BTRC-QoS-D-v4 — Claude Code Context Archive

> **Purpose:** Drop this file into a new Claude Code session to restore full project context with minimal token usage.
> Last updated: 2026-02-26

---

## Project Identity

- **Name:** BTRC QoS Monitoring Dashboard v4
- **Stack:** React 18 + Vite 5 + React-Leaflet v4 + Ant Design v5 + ECharts  ←→  Metabase (backend/auth)
- **DB:** TimescaleDB (PostgreSQL 15 + PostGIS + pg_trgm), port **5433**
- **Tile server:** Martin (Rust/PMTiles), port **3001**
- **Frontend dev:** Vite, port **5173**
- **Metabase:** port **3000**, credentials: `alamin.technometrics22@gmail.com` / `Test@123`
- **DB creds:** `btrc_admin` / `btrc_poc_2026` / DB `btrc_qos_poc`
- **Package manager:** `yarn` (not npm)
- **Docker:** `docker compose` (V2, no hyphen)

---

## Directory Structure

```
BTRC-QoS-D-v4/
├── CLAUDE.md                    ← this file
├── README.md                    ← quick start
├── docker-compose.yml           ← 4 services: timescaledb/metabase/martin/frontend
├── .env.example                 ← copy to .env
├── docker/
│   ├── 01-extensions.sql        ← timescaledb + postgis + pg_trgm + CREATE DATABASE metabase_app
│   ├── martin-config.yaml       ← PMTiles source: /tiles/bangladesh.pmtiles
│   └── Dockerfile.frontend      ← multi-stage: dev / build / prod (nginx)
├── scripts/
│   ├── start.sh                 ← docker compose up + status
│   ├── load-data.sh             ← apply schema + load POC data
│   └── download-tiles.sh        ← pmtiles extract (Bangladesh bbox)
├── geodata/
│   ├── bangladesh_divisions_8.geojson   ← NAME_1 property, 8 divisions
│   └── bgd_districts.geojson           ← shapeName property, 64 districts
├── tiles/                       ← place bangladesh.pmtiles here
├── dummy_data/                  ← symlink → V3 dummy_data/poc_data_v2.11/
├── docs/spec.md                 ← BTRC-FXBB-QOS-POC_Dev-Spec draft v0.1
└── btrc-frontend/
    ├── package.json
    ├── vite.config.js           ← proxy /api→:3000, /tiles→:3001
    ├── index.html
    └── src/
        ├── main.jsx
        ├── index.css
        ├── App.jsx              ← BrowserRouter + Guard + Routes
        ├── api/metabase.js      ← MetabaseAPI class
        ├── contexts/AuthContext.jsx
        ├── hooks/
        │   ├── useMetabaseCard.js   ← fetch+cache single card
        │   └── useDrillData.js      ← drill-down data hook
        ├── components/
        │   ├── layout/AppLayout.jsx
        │   └── maps/DrillDownMap.jsx  ← React-Leaflet choropleth + drill
        └── pages/
            ├── LoginPage.jsx
            ├── ExecutiveDashboard.jsx
            ├── RegulatoryDashboard.jsx
            └── OperationalDashboard.jsx
```

---

## POC Data v2.11 — Key Facts

- **Date window:** Feb 1–15, 2026 (violations + timeseries)
- **Scale:** 8 divisions, 64 districts, 494 upazilas, 40 ISPs, ~800 PoPs, 200 violations

### Database Schema Tables

**Foundation (static)**
```sql
geo_divisions(id, name_en, name_bn, division_code, iso_code [BD-A…BD-H], area_sqkm, hq_lat, hq_lng)
geo_districts(id, division_id, name_en, name_bn, district_code, iso_code [ALL NULL!], area_sqkm, hq_lat, hq_lng)
geo_upazilas(id, district_id, name_en, name_bn, upazila_code)
license_categories(id, name, code, max_download_mbps, max_upload_mbps)
service_types(id, name, code, protocol, port_range)
```

**Master**
```sql
isps(id, name, license_number, license_category_id, division_id, district_id, contact_*, website, established_year, is_active)
pops(id, isp_id, name_en, name_bn, pop_code, division_id, district_id, upazila_id, latitude, longitude, is_active, capacity_mbps, ...)
```

**TimeSeries (hypertables) — SPLIT in v2.11**
```sql
ts_qos_speed_tests(id, pop_id, isp_id, timestamp, download_mbps, upload_mbps, test_duration_s, test_server, ...)
ts_qos_ping_tests(id, pop_id, isp_id, timestamp, latency_ms, jitter_ms, packet_loss_pct, packets_sent, packets_recv)
ts_qos_dns_tests(id, pop_id, isp_id, timestamp, resolution_time_ms, dns_server, domain_tested, success)
ts_qos_http_tests(id, pop_id, isp_id, timestamp, response_time_ms, http_status, url_tested, content_size_bytes)
ts_qos_traceroute_tests(id, pop_id, isp_id, timestamp, hop_count, avg_hop_latency_ms, destination, success)
-- NOTE: ts_qos_measurements does NOT exist in v2.11
-- NOTE: ts_subscriber_counts → renamed ts_subscriber_session_counts
```

**Compliance**
```sql
sla_violations(id, violation_uuid, isp_id, pop_id, violation_type, severity, status,
  detection_time, resolution_time, expected_value, actual_value, deviation_pct,
  affected_subscribers, division_id, district_id, penalty_amount_bdt,
  isp_notified_at, dispute_reason, violation_start, violation_end)
  -- 200 rows, severity: CRITICAL/HIGH/MEDIUM/LOW, status: OPEN/RESOLVED/DISPUTED

compliance_scores(id, isp_id, period_start, period_end, overall_score,
  download_score, upload_score, latency_score, availability_score, violation_count)
  -- 40 rows (1 per ISP)
```

**New in v2.11**
```sql
snmp_targets(id, pop_id, ip_address, community, version, port)
bandwidth_snapshots(id, pop_id, timestamp, in_bps, out_bps, utilization_pct)
subscriber_count_sources(id, isp_id, period, total_subscribers, source)
```

### Date Window Fix Pattern (important!)
```sql
-- WRONG (returns nothing for static POC data):
WHERE timestamp > NOW() - INTERVAL '30 days'

-- CORRECT:
WHERE timestamp > (SELECT MAX(timestamp) FROM ts_qos_speed_tests) - INTERVAL '30 days'
WHERE detection_time > (SELECT MAX(detection_time) FROM sla_violations) - INTERVAL '30 days'
```

---

## GeoJSON Name Mappings (DB → GeoJSON) — CRITICAL FOR MAPS

### Divisions (`NAME_1` property in GeoJSON)
| DB `name_en` | GeoJSON `NAME_1` | `iso_code` |
|---|---|---|
| Dhaka | Dhaka | BD-C |
| Chattagram | **Chittagong** | BD-B |
| Rajshahi | **Rajshani** | BD-E |
| Khulna | Khulna | BD-D |
| Barishal | Barishal | BD-A |
| Sylhet | Sylhet | BD-F |
| Rangpur | Rangpur | BD-G |
| Mymensingh | Mymensingh | BD-H |

### Districts (`shapeName` property in GeoJSON)
| DB `name_en` | GeoJSON `shapeName` |
|---|---|
| Bogura | **Bogra** |
| Brahmanbaria | **Brahamanbaria** |
| Chapainawabganj | **Nawabganj** |
| Chattogram | **Chittagong** |
| Coxsbazar | **Cox's Bazar** |
| Jashore | **Jessore** |
| Jhalakathi | **Jhalokati** |
| Moulvibazar | **Maulvibazar** |
| Netrokona | **Netrakona** |
| (all others) | same as DB |

### Code pattern (in JS)
```js
const DIV_DB_TO_GEO = { Chattagram:'Chittagong', Rajshahi:'Rajshani' };
const DIST_DB_TO_GEO = {
  Bogura:'Bogra', Brahmanbaria:'Brahamanbaria', Chapainawabganj:'Nawabganj',
  Chattogram:'Chittagong', Coxsbazar:"Cox's Bazar", Jashore:'Jessore',
  Jhalakathi:'Jhalokati', Moulvibazar:'Maulvibazar', Netrokona:'Netrakona',
};
const toGeoDiv  = n => DIV_DB_TO_GEO[n]  || n;
const toGeoDist = n => DIST_DB_TO_GEO[n] || n;
```

---

## Metabase Integration

### API Class (`src/api/metabase.js`)
```js
class MetabaseAPI {
  async login(email, password)        // POST /api/session → stores token
  async getCurrentUser()              // GET /api/user/current
  async getCardData(cardId, params)   // POST /api/card/:id/query
  async runQuery(databaseId, sql)     // POST /api/dataset (native SQL)
  async getDatabaseId(name)           // GET /api/database → find by name
  isAuthenticated()                   // check token in memory
  logout()                            // DELETE /api/session
}
export const metabaseAPI = new MetabaseAPI();
// VITE_METABASE_URL default: http://localhost:3000 (proxied via /api in dev)
```

### Hook (`src/hooks/useMetabaseCard.js`)
```js
const { rows, columns, loading, error, refetch } = useMetabaseCard(cardId, params, deps);
// rows: plain objects keyed by lowercased SQL alias
// Example row: { division: 'Dhaka', total: 12, critical: 3, high: 5, medium: 4, low: 0 }
```

### parseRows pattern
```js
const parseRows = (result) => result.rows.map(row =>
  Object.fromEntries(result.columns.map((col, i) => {
    const key = (col.name || col.displayName || `col${i}`)
      .toLowerCase().replace(/[^a-z0-9]+/g, '_')
      .replace(/_+/g, '_').replace(/^_|_$/g, '');
    return [key, row[i]];
  }))
);
```

### Metabase Template Tags for Filters
```sql
-- Metabase card SQL with optional filters:
WHERE 1=1
  [[ AND d.name_en = {{division}} ]]
  [[ AND di.name_en = {{district}} ]]
  [[ AND i.name = {{isp}} ]]
```
- `{{variable}}` = required; `[[ AND ... {{variable}} ]]` = optional

---

## Dashboard Spec (48 elements across 3 dashboards)

### Executive Dashboard (`/executive`) — 3 tabs, 16 elements
**E1 Performance Scorecard**
- E1.1 National QoS Score (gauge/KPI)
- E1.2 ISP Compliance Status (3 KPI cards: Compliant/At-Risk/Violation)
- E1.3 Top 10 Performing ISPs (table: rank, ISP, score, trend)
- E1.4 Bottom 5 ISPs (table: ISP, score, issues)
- E1.5 30-day Performance Trend (line chart: download/upload/latency over time)

**E2 Geographic Intelligence**
- E2.1 Division Performance Map (choropleth: avg download by division)
- E2.2 Division Rankings (bar chart or table)
- E2.3 Critical Coverage Gaps (table: areas below threshold)

**E3 Compliance Overview**
- E3.1 Active Violations by Type (donut chart)
- E3.2 Violation Severity Distribution (stacked bar: CRITICAL/HIGH/MEDIUM/LOW)
- E3.3 Resolution Time Analysis (histogram or KPI)
- E3.4 Penalty Exposure (KPI: total BDT, avg per ISP)
- E3.5 Compliance Trend (line chart)
- E3.6 Division Compliance Heatmap
- E3.7 Monthly Summary (table)

### Regulatory Dashboard (`/regulatory`) — 3 tabs, 17 elements
**R1 SLA Monitoring**
- R1.1 SLA Compliant ISPs (scalar)
- R1.2 At-Risk ISPs (scalar)
- R1.3 Violation ISPs (scalar)
- R1.4 Download Threshold Compliance (progress/KPI)
- R1.5 Upload Threshold Compliance (progress/KPI)
- R1.6 Latency Threshold Compliance (progress/KPI)

**R2 Regional Drill-Down** ← MAIN FEATURE
- R2.1 Division Performance Summary (table: 8 rows, click→drill)
- R2.2 District Performance Map (choropleth, drill-down)
- R2.3 ISP Performance by Area (table: filtered by div/dist)
- R2.4 District Ranking Table (sortable)
- R2.5 Coverage Gap Analysis (table)

**R3 Violation Analysis**
- R3.1 Pending Violations (scalar)
- R3.2 Active/Disputed Violations (scalar)
- R3.3 Resolved Violations (scalar)
- R3.4 Violation Detail Table (sortable: 12 cols)
- R3.5 Violation Trend by Severity (line chart)
- R3.6 Violations by Geography (table/map: Division→District)

### Operational Dashboard (`/operational`) — 3 tabs, 15 elements
**O1 Market Overview**
- O1.1 Total ISPs (scalar)
- O1.2 Total PoPs (scalar)
- O1.3 Active Connections (scalar)
- O1.4 ISP by License Category (donut)
- O1.5 ISP Performance Scatter (x=download, y=upload, size=subscribers)
- O1.6 ISP Comparison Table (12 cols: name, category, PoPs, download, upload, latency, availability, subscribers, violations, score)

**O2 Package & Subscriber**
- O2.1 Subscriber Distribution (bar: by ISP)
- O2.2 Package Tier Analysis (stacked bar: by category)
- O2.3 Bandwidth Utilization (line: utilization % over time)
- O2.4 Top ISPs by Subscribers (table)

**O3 Geographic Coverage**
- O3.1 Coverage Map (choropleth: PoP density by district)
- O3.2 Underserved Areas (table: districts with <2 ISPs)
- O3.3 PoP Distribution (table: by division)
- O3.4 Upazila Coverage (table: top 20 upazilas by PoP count)

---

## Metabase Cards Reference (if Metabase already configured)

> Run `GET /api/dashboard/5` and `GET /api/dashboard/6` to get current card IDs.
> Card IDs change per installation. Use SQL below to identify cards by query content.

### Useful SQL Queries for Identifying Cards
```sql
-- Find cards by keyword in SQL
SELECT id, name FROM metabase_app.public.report_card WHERE dataset_query::text LIKE '%geo_divisions%';
SELECT id, name FROM metabase_app.public.report_card WHERE dataset_query::text LIKE '%sla_violations%';
```

### Expected Data Shapes from SQL
```sql
-- Division KPI (for DrillDownMap divisionData prop):
SELECT d.name_en as division, COUNT(*) as total,
  SUM(CASE WHEN v.severity='CRITICAL' THEN 1 ELSE 0 END) as critical,
  SUM(CASE WHEN v.severity='HIGH' THEN 1 ELSE 0 END) as high,
  SUM(CASE WHEN v.severity='MEDIUM' THEN 1 ELSE 0 END) as medium,
  SUM(CASE WHEN v.severity='LOW' THEN 1 ELSE 0 END) as low
FROM geo_divisions d
LEFT JOIN sla_violations v ON v.division_id = d.id
GROUP BY d.name_en;

-- District KPI (for DrillDownMap districtData prop, filtered by division):
SELECT di.name_en as district, COUNT(*) as total,
  SUM(CASE WHEN v.severity='CRITICAL' THEN 1 ELSE 0 END) as critical ...
FROM geo_districts di
LEFT JOIN sla_violations v ON v.district_id = di.id
JOIN geo_divisions d ON di.division_id = d.id
WHERE d.name_en = :division
GROUP BY di.name_en;

-- PoP markers (for DrillDownMap popMarkers prop):
SELECT p.id, p.name_en, p.latitude, p.longitude,
  d.name_en as division_name, di.name_en as district_name,
  COUNT(v.id) as violations,
  SUM(CASE WHEN v.severity='CRITICAL' THEN 1 ELSE 0 END) as critical
FROM pops p
JOIN geo_divisions d ON p.division_id = d.id
JOIN geo_districts di ON p.district_id = di.id
LEFT JOIN sla_violations v ON v.pop_id = p.id
GROUP BY p.id, p.name_en, p.latitude, p.longitude, d.name_en, di.name_en;
```

---

## DrillDownMap Component API

File: `src/components/maps/DrillDownMap.jsx`

```jsx
<DrillDownMap
  height="520px"
  divisionData={{
    'Dhaka':     { total: 12, critical: 2, high: 4, medium: 5, low: 1 },
    'Chittagong':{ total: 8,  critical: 1, high: 2, medium: 3, low: 2 },
    // ... 8 divisions, keys are GeoJSON NAME_1 values (not DB name_en)
  }}
  districtData={{
    'Gazipur':   { total: 5, critical: 1, high: 2, medium: 2, low: 0 },
    // ... keys are GeoJSON shapeName values
  }}
  popMarkers={[
    { id: 1, name_en: 'Dhaka Central', latitude: 23.75, longitude: 90.38,
      division_name: 'Dhaka', district_name: 'Dhaka',
      violations: 3, critical: 1 }
  ]}
  level="national"          // 'national' | 'division' | 'district'
  selectedDiv="Dhaka"       // GeoJSON NAME_1
  selectedDist="Gazipur"    // GeoJSON shapeName
  onDivClick={(name) => {}} // GeoJSON NAME_1
  onDistClick={(name) => {}}// GeoJSON shapeName
  onPopClick={(pop) => {}}  // full pop object
/>
```

**Notes:**
- `divisionData` keys must use **GeoJSON NAME_1** (e.g. `Chittagong`, not `Chattagram`)
- `districtData` keys must use **GeoJSON shapeName** (e.g. `Bogra`, not `Bogura`)
- Convert DB names with `toGeoDiv()` / `toGeoDist()` helpers before passing
- `level` controls what's rendered: `national` → division choropleth; `division`/`district` → district choropleth
- GeoJSON files served from `public/geodata/` (or copy to Vite `public/` folder)

---

## useDrillData Hook API

File: `src/hooks/useDrillData.js`

```js
const {
  // Data
  divisionData,    // { [geoName]: { total, critical, high, medium, low } }
  districtData,    // same structure, filtered by selectedDiv
  popMarkers,      // [{ id, name_en, latitude, longitude, violations, critical, ... }]
  ispData,         // [{ isp, division, district, download, upload, latency, violations }]
  // State
  level,           // 'national' | 'division' | 'district'
  selectedDiv,     // GeoJSON NAME_1 of selected division
  selectedDist,    // GeoJSON shapeName of selected district
  loading,
  error,
  // Actions
  drillToDiv,      // (geoName) => void
  drillToDist,     // (geoName) => void
  drillUp,         // () => void  — go back one level
  resetDrill,      // () => void  — back to national
} = useDrillData();
```

---

## PMTiles / Offline Tiles

```yaml
# docker/martin-config.yaml
martin:
  listen_addresses: "0.0.0.0:3000"
  sources:
    bangladesh:
      path: /tiles/bangladesh.pmtiles
```

```bash
# Download tiles (requires pmtiles CLI):
# https://github.com/protomaps/go-pmtiles/releases
pmtiles extract https://build.protomaps.com/20241201.pmtiles \
  tiles/bangladesh.pmtiles --bbox=88.0,20.5,92.7,26.7

# Or use protomaps/basemaps NPM package for offline-first:
# npm install -g @protomaps/basemaps
```

Tile URL in frontend:
- Dev: `http://localhost:3001/tiles/bangladesh/{z}/{x}/{y}` (direct)
- Via Vite proxy: `/tiles/bangladesh/{z}/{x}/{y}` → Martin
- Env var: `VITE_TILE_URL` (set in `.env`, unset = OSM fallback)

---

## Docker Services

```yaml
# Ports:
timescaledb: 5433:5432
metabase:    3000:3000
martin:      3001:3000  (PMTiles tile server)
frontend:    5173:5173  (Vite dev) | 80:80 (prod)
```

```bash
# Quick start:
cp .env.example .env
docker compose up -d timescaledb metabase martin
cd btrc-frontend && yarn install && yarn dev

# Load POC data (after DB is ready):
bash scripts/load-data.sh

# Download offline tiles:
bash scripts/download-tiles.sh
```

---

## Development Conventions

- **All JS/React packages:** `yarn add` / `yarn dev` / `yarn build`
- **Docker:** `docker compose` (V2, no hyphen)
- **Date window:** Use `(SELECT MAX(timestamp) FROM ts_qos_speed_tests) - INTERVAL 'X days'` not `NOW()`
- **Map data keys:** Always GeoJSON names (after mapping), not DB names
- **ECharts:** via `echarts-for-react` wrapper (`<ReactECharts option={...} />`)
- **Ant Design tabs:** `<Tabs items={[{ key, label, children }]} />`
- **React-Leaflet v4:** `<MapContainer>` + `<GeoJSON key={changeKey} />` (key forces re-render on data change)
- **Leaflet CSS:** import in component: `import 'leaflet/dist/leaflet.css'`

---

## Known Issues / Gotchas

1. **geo_districts.iso_code is ALL NULL** — use `shapeName` matching, not iso_code
2. **Leaflet GeoJSON re-render:** must change `key` prop when data changes (not just style)
3. **React-Leaflet v4 + Vite:** may need `optimizeDeps.exclude: ['leaflet']` in vite.config.js
4. **Metabase template tags `{{var}}`:** require `parameters` array in POST body, not query string
5. **Martin PMTiles:** container port is 3000 internally, mapped to 3001 externally
6. **v2.11 table names:** `ts_qos_measurements` does NOT exist → use `ts_qos_speed_tests` for speed/download/upload
7. **Metabase API auth token:** stored in `localStorage('mb_session')`, auto-restored on page reload via `AuthContext`

---

## Useful Commands

```bash
# DB shell:
docker compose exec timescaledb psql -U btrc_admin -d btrc_qos_poc

# Check tables:
\dt

# Check violations date range:
SELECT MIN(detection_time), MAX(detection_time) FROM sla_violations;

# Check speed test date range:
SELECT MIN(timestamp), MAX(timestamp) FROM ts_qos_speed_tests;

# Metabase API test:
curl -s -X POST http://localhost:3000/api/session \
  -H 'Content-Type: application/json' \
  -d '{"username":"alamin.technometrics22@gmail.com","password":"Test@123"}' | jq .id

# Frontend dev (in btrc-frontend/):
yarn dev

# Frontend build:
yarn build

# Martin tile server check:
curl http://localhost:3001/catalog
```

---

## What Still Needs Implementation

When starting a new session with this CLAUDE.md, these are the pages to implement:

### `src/pages/ExecutiveDashboard.jsx`
- 3 Ant Design Tabs: "Performance Scorecard" / "Geographic Intelligence" / "Compliance Overview"
- Uses `useMetabaseCard` hook for each card
- DrillDownMap for E2.1 (read-only, no drill)
- ECharts for trend line, compliance donut, severity stacked bar

### `src/pages/RegulatoryDashboard.jsx`  ← MAIN DASHBOARD
- 3 Ant Design Tabs: "SLA Monitoring" / "Regional Drill-Down" / "Violation Analysis"
- **R2 tab is the core feature:** DrillDownMap + useDrillData hook
- Drill state: `level` / `selectedDiv` / `selectedDist` — managed by useDrillData
- R3 tab: violation table with severity color-coding

### `src/pages/OperationalDashboard.jsx`
- 3 Tabs: "Market Overview" / "Package & Subscriber" / "Geographic Coverage"
- O3.1 Coverage Map: choropleth of PoP density per district (uses DrillDownMap)
- ECharts for scatter plot (O1.5), subscriber bars (O2.1), utilization line (O2.3)

### `src/hooks/useDrillData.js`
- Fetches division violation summary → builds `divisionData` (GeoJSON keys)
- On drillToDiv → fetches district data for that division
- On drillToDist → fetches PoP markers for that district
- Manages `level` / `selectedDiv` / `selectedDist` state
- All names converted via `toGeoDiv()` / `toGeoDist()` before returning

### `src/components/charts/` (optional — or inline in pages)
- KpiCard.jsx — stat card with title/value/trend
- TrendChart.jsx — ECharts line chart wrapper
- SeverityDonut.jsx — ECharts donut
