# BTRC QoS Monitoring - POC Dashboard Minimum Scope Specification

| Metadata | Value |
|----------|-------|
| **Document** | Dev-Spec(POC-DASHBOARD-MIN-SCOPE) |
| **Version** | DRAFT v0.1 |
| **Created** | 2026-02-02 |
| **Stage** | DRAFT |
| **POC Dashboards** | 3 of 4 (Executive, Regulatory, Operational) |
| **Excluded** | Technical Operations (Dashboard 3) |

---

## 1. POC Scope Summary

### Dashboard Selection

| # | Dashboard | POC Role | Geo Depth | Data Cycle | Tabs |
|---|-----------|----------|-----------|------------|------|
| 1 | **Executive** | National picture for leadership | National → Division (8) | Daily/Weekly aggregates | 3 |
| 2 | **Regulatory** | Drill-down with time filter & violations | National → Division → District (64) | Real-time + historical | 3 |
| 4 | **Operational Data** | ISP-submitted static/monthly data | National → Division → District (64) | Monthly snapshots | 3 |

### Excluded from POC

| # | Dashboard | Reason |
|---|-----------|--------|
| 3 | Technical Operations | Internal ops concern; platform health/agent monitoring not needed to demonstrate regulatory value to BTRC |

### POC Narrative

```
Dashboard 4 (ISP Data)           Dashboard 2 (Measured Data)
"What ISPs declare"              "What we detect"
────────────────┐                ┌────────────────
                │                │
                ▼                ▼
           Dashboard 1 (Executive View)
           "National summary for leadership"
```

---

## 2. Dashboard 1: Executive (National → Division)

### Dashboard Objective

| Attribute | Value |
|-----------|-------|
| **Purpose** | Provide BTRC leadership with a national-level summary of broadband performance, geographic distribution, and compliance status |
| **Primary Audience** | BTRC Chairman, Commissioners, Senior Directors |
| **Decision Support** | National policy direction, resource allocation, enforcement priorities |
| **Geo Depth (POC)** | National aggregate → 8 Division breakdown (NO district drill-down) |
| **Refresh Rate** | Daily aggregation; manual refresh |
| **Data Sources** | QoS Collector (measured), ISP-Submitted (declared), Compliance Engine (calculated) |

---

### Tab E1: Performance Scorecard

**Tab Objective**: Answer "How is Bangladesh's broadband performing nationally?"

#### E1 Elements

| ID | Element Name | Description | Viz Type | Data Source | DB Tables | Method | Shape | Position | Area % |
|----|-------------|-------------|----------|-------------|-----------|--------|-------|----------|--------|
| E1.1 | National Avg Download Speed | Weighted average download speed across all ISPs nationally; trend vs last month | Card-KPI | QoS Collector | `ts_qos_measurements` → `hourly_qos_stats` (CA) | AVG(download_speed) weighted by subscriber_count | Square | Top-Left | 12% |
| E1.2 | National Avg Upload Speed | Weighted average upload speed across all ISPs nationally; trend vs last month | Card-KPI | QoS Collector | `ts_qos_measurements` → `hourly_qos_stats` (CA) | AVG(upload_speed) weighted by subscriber_count | Square | Top-Center-Left | 12% |
| E1.3 | National Service Availability | Overall network uptime percentage; 30-day rolling window | Card-KPI | QoS Collector | `ts_qos_measurements` → `daily_compliance_summary` (CA) | AVG(availability_pct) across all ISPs | Square | Top-Center-Right | 12% |
| E1.4 (remove)| Active ISP Count | Count of ISPs actively monitored with data in last 7 days | Card-KPI | QoS Collector | `isps` JOIN `ts_qos_measurements` | COUNT(DISTINCT isp_id) WHERE last_measurement > NOW()-7d | Square | Top-Right | 12% |
| E1.5 | Speed Trend (12 Months) | National average speed over 12 months with target line overlay | Graph-Line | QoS Collector | `daily_compliance_summary` (CA) | AVG(download_speed) GROUP BY month | Rectangular (wide) | Middle-Left | 25% |
| E1.6 | Division Performance Ranking | Horizontal bar chart ranking 8 divisions by avg speed; color-coded tiers | Graph-Bar-Horizontal | QoS Collector | `ts_qos_measurements` JOIN `geo_divisions` | AVG(download_speed) GROUP BY division_id ORDER BY speed DESC | Rectangular (wide) | Middle-Right | 25% |
| E1.7 (remove)| Performance by ISP Category | Table showing Nationwide/Regional/Zonal/District ISP categories with avg speed, availability, ISP count | Table-Data | QoS Collector | `isps` JOIN `hourly_qos_stats` JOIN `isp_license_categories` | AVG(speed), AVG(availability) GROUP BY license_category | Rectangular (full-width) | Bottom | 15% |

#### E1 Layout Grid (1920x1080 viewport)

```
┌───────────┬───────────┬───────────┬───────────┐
│   E1.1    │   E1.2    │   E1.3    │   E1.4    │  12% each = 48% row
│  DL Speed │  UL Speed │  Avail %  │  ISP Count│  Height: ~15%
│  (Square) │  (Square) │  (Square) │  (Square) │
├───────────┴─────┬─────┴───────────┴───────────┤
│     E1.5        │          E1.6                │  25% each = 50%
│  Speed Trend    │   Division Ranking           │  Height: ~45%
│  (Rect-wide)    │   (Rect-wide)                │
├─────────────────┴──────────────────────────────┤
│                   E1.7                          │  15% = full width
│         Performance by ISP Category             │  Height: ~25%
│              (Rect-full-width)                  │
└─────────────────────────────────────────────────┘
```

---

### Tab E2: Geographic Intelligence

**Tab Objective**: Answer "Where are we strong/weak across divisions?"

#### E2 Elements

| ID | Element Name | Description | Viz Type | Data Source | DB Tables | Method | Shape | Position | Area % |
|----|-------------|-------------|----------|-------------|-----------|--------|-------|----------|--------|
| E2.1 | Division Performance Map | Choropleth map of Bangladesh colored by avg speed per division; 3-tier color scale (Green/Yellow/Red) | Map-Choropleth | QoS Collector | `ts_qos_measurements` JOIN `geo_divisions` | AVG(download_speed) GROUP BY division_id | Rectangular (tall) | Left | 40% |
| E2.2 | Division Comparison Table | Sortable table: Division, Avg Speed, Availability %, ISP Count, PoP Count, Trend arrow | Table-Ranking | QoS Collector + ISP-Submitted | `hourly_qos_stats` JOIN `geo_divisions` JOIN `pops` | AVG(speed), AVG(availability), COUNT(pops) GROUP BY division | Rectangular (tall) | Right-Top | 30% |
| E2.3 (Remove)| Urban vs Rural Gap | Paired horizontal bars showing urban vs rural avg speed per division | Graph-Bar-Grouped | QoS Collector | `ts_qos_measurements` JOIN `pops` (urban_rural flag) | AVG(speed) GROUP BY division, urban_rural_flag | Rectangular (wide) | Right-Bottom | 15% |
| E2.4 (Remove)| PoP Coverage Summary | 3 status cards: Adequate/Marginal/Critical district counts based on PoP density | Card-Status (x3) | ISP-Submitted | `pops` JOIN `geo_districts` JOIN population data | COUNT(districts) WHERE pop_per_100k >= threshold | Square (x3) | Bottom-Left | 15% |

#### E2 Layout Grid

```
┌──────────────────────┬──────────────────────────┐
│       E2.1           │         E2.2             │
│   Division Map       │  Division Comparison     │  40% + 30%
│   (Choropleth)       │  Table (Ranking)         │  Height: ~55%
│   (Rect-tall)        │  (Rect-tall)             │
│                      ├──────────────────────────┤
│                      │         E2.3             │
│                      │  Urban vs Rural Gap      │  15%
│                      │  (Rect-wide)             │  Height: ~20%
├──────────────────────┴──────────────────────────┤
│  E2.4a    │  E2.4b     │  E2.4c                 │
│ Adequate  │ Marginal   │ Critical               │  15%
│ (Square)  │ (Square)   │ (Square)               │  Height: ~15%
└───────────┴────────────┴─────────────────────────┘
```

---

### Tab E3: Compliance Overview

**Tab Objective**: Answer "Who is meeting/violating standards at a glance?"

#### E3 Elements

| ID | Element Name | Description | Viz Type | Data Source | DB Tables | Method | Shape | Position | Area % |
|----|-------------|-------------|----------|-------------|-----------|--------|-------|----------|--------|
| E3.1 | ISP Compliance Traffic Lights | Grid of ISPs grouped by category (Nationwide/Regional/Zonal) with Green/Yellow/Red status tiles | Grid-Traffic-Light | Compliance Engine | `compliance_scores` JOIN `isps` JOIN `isp_license_categories` | CASE WHEN score >= 90 THEN Green WHEN >= 70 THEN Yellow ELSE Red | Rectangular (full-width) | Top | 25% |
| E3.2 | Violations by Category | Horizontal bar chart showing violation count by type: Speed, Availability, Latency, Packet Loss | Graph-Bar-Horizontal | Compliance Engine | `sla_violations` | COUNT(*) GROUP BY violation_type WHERE period = current_month | Rectangular (wide) | Middle-Left | 20% |
| E3.3 | Top 10 Violators | Ranked table of ISPs with highest violation counts: ISP Name, Violation Count, Severity, Trend | Table-Ranking | Compliance Engine | `sla_violations` JOIN `isps` | COUNT(*) GROUP BY isp_id ORDER BY count DESC LIMIT 10 | Rectangular (wide) | Middle-Right | 20% |
| E3.4 | Violation Trend (6 Months) | Stacked bar chart showing monthly violation counts by category over 6 months | Graph-Stacked-Bar | Compliance Engine | `sla_violations` | COUNT(*) GROUP BY month, violation_type ORDER BY month | Rectangular (full-width) | Bottom-Top | 20% |
| E3.5 | Violations by Division | Table: Division, Total Violations, Speed, Availability, Latency, Packet Loss, Trend | Table-Data | Compliance Engine | `sla_violations` JOIN `geo_divisions` | COUNT(*) GROUP BY division_id, violation_type | Rectangular (full-width) | Bottom | 15% |

#### E3 Layout Grid

```
┌─────────────────────────────────────────────────┐
│                    E3.1                          │
│         ISP Compliance Traffic Lights            │  25%
│           (Rect-full-width)                      │  Height: ~20%
├───────────────────────┬─────────────────────────┤
│        E3.2           │        E3.3             │
│  Violations by Type   │  Top 10 Violators       │  20% + 20%
│  (Rect-wide)          │  (Rect-wide)            │  Height: ~25%
├───────────────────────┴─────────────────────────┤
│                    E3.4                          │
│          Violation Trend (6 Months)              │  20%
│           (Rect-full-width)                      │  Height: ~25%
├─────────────────────────────────────────────────┤
│                    E3.5                          │
│          Violations by Division                  │  15%
│           (Rect-full-width)                      │  Height: ~20%
└─────────────────────────────────────────────────┘
```

---

### Executive Dashboard Summary

| Tab | Elements | Primary Question |
|-----|----------|-----------------|
| E1: Performance Scorecard | 7 | "How is broadband performing nationally?" |
| E2: Geographic Intelligence | 4 (+3 sub-cards) | "Where are we strong/weak?" |
| E3: Compliance Overview | 5 | "Who is meeting/violating standards?" |
| **TOTAL** | **16** | |

---

## 3. Dashboard 2: Regulatory (Drill-down → District)

### Dashboard Objective

| Attribute | Value |
|-----------|-------|
| **Purpose** | Enable BTRC operations staff to drill-down into ISP performance with time filters, detect threshold violations, and document compliance issues down to district level |
| **Primary Audience** | BTRC Compliance Officers, Operations Staff |
| **Decision Support** | SLA enforcement, violation detection, regional intervention |
| **Geo Depth (POC)** | National → Division → District (full 64 districts) |
| **Refresh Rate** | Real-time (5 min) for SLA monitoring; On-demand for reports |
| **Data Sources** | QoS Collector (primary), SNMP Collector (infrastructure), ISP-Submitted (license data) |
| **Key Feature** | User-selectable time range filter (1h, 24h, 7d, 30d, custom) applied globally |

---

### Tab R1: SLA Monitoring

**Tab Objective**: Answer "Which ISPs are currently violating SLA thresholds?"

#### R1 Elements

| ID | Element Name | Description | Viz Type | Data Source | DB Tables | Method | Shape | Position | Area % |
|----|-------------|-------------|----------|-------------|-----------|--------|-------|----------|--------|
| R1.1 | Compliant ISPs Count | Count of ISPs meeting all SLA requirements in selected time window | Card-Status (Green) | QoS Collector | `compliance_scores` | COUNT(isp_id) WHERE overall_score >= threshold | Square | Top-Left | 10% |
| R1.2 | At Risk ISPs Count | Count of ISPs approaching SLA thresholds (within 5% margin) | Card-Status (Yellow) | QoS Collector | `compliance_scores` | COUNT(isp_id) WHERE score BETWEEN warn_threshold AND violation_threshold | Square | Top-Center | 10% |
| R1.3 | Violation ISPs Count | Count of ISPs currently in SLA violation | Card-Alert (Red) | QoS Collector | `compliance_scores` | COUNT(isp_id) WHERE overall_score < violation_threshold | Square | Top-Right | 10% |
| R1.4 (Remove)| Package Compliance Matrix | Table comparing target vs actual speed by package tier (10/25/50/100/200+ Mbps); gap % column | Table-Matrix | QoS Collector | `ts_qos_measurements` JOIN `packages` | AVG(measured_speed) GROUP BY package_tier vs packages.download_speed_mbps | Rectangular (wide) | Middle-Left | 25% |
| R1.5 (Remove)| Real-Time Threshold Alerts | Live scrolling alert list: ISP, Metric, Threshold, Actual, Duration, Severity; with acknowledge button | Panel-Alert | QoS Collector | `alerts` JOIN `sla_thresholds` | SELECT * FROM alerts WHERE status = 'OPEN' ORDER BY severity, created_at DESC | Rectangular (tall) | Middle-Right | 25% |
| R1.6 (Remove)| PoP-Level Incident Table | Sortable table: Incident ID, ISP, PoP Location, Metric Type, Status (Open/Ack/Resolved); filter by status | Table-Data | QoS Collector | `incidents` JOIN `pops` JOIN `isps` | SELECT * FROM incidents WHERE status IN ('OPEN','ACKNOWLEDGED') ORDER BY created_at DESC | Rectangular (full-width) | Bottom | 20% |

#### R1 Layout Grid

```
┌──────────────┬──────────────┬──────────────┐
│    R1.1      │    R1.2      │    R1.3      │
│  Compliant   │   At Risk    │  Violation   │  10% x3 = 30%
│   (Square)   │   (Square)   │   (Square)   │  Height: ~12%
├──────────────┴──┬───────────┴──────────────┤
│      R1.4       │         R1.5             │
│ Package Matrix  │  Threshold Alerts        │  25% + 25%
│  (Rect-wide)    │  (Rect-tall)             │  Height: ~45%
├─────────────────┴──────────────────────────┤
│                  R1.6                       │
│       PoP-Level Incident Table              │  20%
│          (Rect-full-width)                  │  Height: ~30%
└─────────────────────────────────────────────┘
```

---

### Tab R2: Regional Drill-Down

**Tab Objective**: Answer "Where are service quality issues concentrated, down to district level?"

#### R2 Elements

| ID | Element Name | Description | Viz Type | Data Source | DB Tables | Method | Shape | Position | Area % |
|----|-------------|-------------|----------|-------------|-----------|--------|-------|----------|--------|
| R2.1 | Division Performance Map | Choropleth map colored by compliance score; click division to drill into districts | Map-Choropleth | QoS Collector | `ts_qos_measurements` JOIN `geo_divisions` | AVG(compliance_score) GROUP BY division_id | Rectangular (tall) | Left | 35% |
| R2.2 | Division/District Ranking Table | Sortable table: Area Name, Compliance Score, Avg Speed, Availability, Violation Count, Trend; toggles between division and district view | Table-Ranking | QoS Collector | `hourly_qos_stats` JOIN `geo_divisions` / `geo_districts` | AVG(speed), AVG(availability), COUNT(violations) GROUP BY geo_id | Rectangular (tall) | Right-Top | 30% |
| R2.3 | ISP Performance by Selected Area | Drill-down table: when user selects a division/district, shows ISPs serving that area with PoP count, Avg Speed, Availability, Violations, Score | Table-Data | QoS Collector | `ts_qos_measurements` JOIN `pops` JOIN `isps` WHERE geo_id = selected | AVG(speed), AVG(availability), COUNT(violations) GROUP BY isp_id WHERE division/district = selected | Rectangular (full-width) | Bottom | 20% |
| R2.4 | Time Range Filter | Global time filter: 1h, 24h, 7d, 30d, Custom date range; applies to all elements on this tab | Filter-Control | N/A | N/A | N/A | Rectangular (toolbar) | Top (toolbar) | 5% |
| R2.5 | Geo Breadcrumb | Navigation breadcrumb: National > Division > District; click to navigate back | Nav-Breadcrumb | N/A | N/A | N/A | Rectangular (toolbar) | Top (below filter) | 5% |

#### R2 Layout Grid

```
┌─────────────────────────────────────────────────┐
│  R2.4: Time Filter [1h|24h|7d|30d|Custom]       │  5% (toolbar)
├─────────────────────────────────────────────────┤
│  R2.5: National > Dhaka Division > (District)    │  5% (breadcrumb)
├──────────────────────┬──────────────────────────┤
│       R2.1           │         R2.2             │
│   Division Map       │  Division/District       │  35% + 30%
│   (Choropleth)       │  Ranking Table           │  Height: ~50%
│   Click to drill     │  (Rect-tall)             │
│   (Rect-tall)        │                          │
├──────────────────────┴──────────────────────────┤
│                    R2.3                          │
│     ISP Performance in Selected Area             │  20%
│           (Rect-full-width)                      │  Height: ~25%
└─────────────────────────────────────────────────┘
```

---

### Tab R3: Violation Analysis

**Tab Objective**: Answer "What violations have occurred, where, and what is the trend?"

#### R3 Elements

| ID | Element Name | Description | Viz Type | Data Source | DB Tables | Method | Shape | Position | Area % |
|----|-------------|-------------|----------|-------------|-----------|--------|-------|----------|--------|
| R3.1 | Pending Violations Count | Violations needing review in selected time window | Card-Status | Compliance Engine | `sla_violations` WHERE status = 'PENDING' | COUNT(*) | Square | Top-Left | 8% |
| R3.2 | Active Violations Count | Violations currently under investigation | Card-Status | Compliance Engine | `sla_violations` WHERE status = 'ACTIVE' | COUNT(*) | Square | Top-Center | 8% |
| R3.3 | Resolved Violations Count | Violations resolved in selected time window | Card-Status | Compliance Engine | `sla_violations` WHERE status = 'RESOLVED' | COUNT(*) | Square | Top-Right | 8% |
| R3.4 | Violation Detail Table | Full violation list: ID, ISP, Type (Speed/Avail/Latency/PktLoss), Severity, Division, District, Duration, Status; sortable, filterable, exportable | Table-Data | Compliance Engine | `sla_violations` JOIN `isps` JOIN `pops` JOIN `geo_districts` | SELECT * with user-applied filters ORDER BY severity DESC, created_at DESC | Rectangular (full-width) | Middle | 35% |
| R3.5 | Violation Trend (by Time Filter) | Line/bar chart showing violation count over time matching the selected time filter; grouped by violation type | Graph-Stacked-Bar | Compliance Engine | `sla_violations` | COUNT(*) GROUP BY time_bucket, violation_type | Rectangular (wide) | Bottom-Left | 22% |
| R3.6 | Violations by District Heatmap | Choropleth showing violation density by district; darker = more violations | Map-Choropleth | Compliance Engine | `sla_violations` JOIN `geo_districts` | COUNT(*) GROUP BY district_id | Rectangular (wide) | Bottom-Right | 22% |

#### R3 Layout Grid

```
┌──────────────┬──────────────┬──────────────┐
│    R3.1      │    R3.2      │    R3.3      │
│  Pending     │   Active     │  Resolved    │  8% x3 = 24%
│  (Square)    │  (Square)    │  (Square)    │  Height: ~10%
├──────────────┴──────────────┴──────────────┤
│                   R3.4                      │
│        Violation Detail Table               │  35%
│          (Rect-full-width)                  │  Height: ~40%
├───────────────────────┬─────────────────────┤
│        R3.5           │       R3.6          │
│  Violation Trend      │  Violations by      │  22% + 22%
│  (Stacked Bar)        │  District Heatmap   │  Height: ~35%
│  (Rect-wide)          │  (Rect-wide)        │
└───────────────────────┴─────────────────────┘
```

---

### Regulatory Dashboard Summary

| Tab | Elements | Primary Question |
|-----|----------|-----------------|
| R1: SLA Monitoring | 6 | "Who is violating SLA thresholds right now?" |
| R2: Regional Drill-Down | 5 (incl. 2 controls) | "Where are issues concentrated?" |
| R3: Violation Analysis | 6 | "What violations occurred and what's the trend?" |
| **TOTAL** | **17** | |

---

## 4. Dashboard 4: Operational Data (ISP-Submitted)

### Dashboard Objective

| Attribute | Value |
|-----------|-------|
| **Purpose** | Display ISP-declared data including subscriber counts, package details, geographic coverage, and PoP locations; represents "what ISPs report" as opposed to "what we measure" |
| **Primary Audience** | BTRC Market Analysts, Finance Division |
| **Decision Support** | Market analysis, coverage planning, ISP accountability |
| **Geo Depth (POC)** | National → Division → District (64 districts) |
| **Refresh Rate** | Monthly (aligned with ISP submission cycle) |
| **Data Sources** | ISP API (monthly submissions), ISP-Submitted (product/infra data) |
| **RBAC Note** | Revenue data restricted to BTRC_ADMIN + BTRC_FINANCE roles |

---

### Tab O1: Market Overview

**Tab Objective**: Answer "What is the current broadband market landscape?"

#### O1 Elements

| ID | Element Name | Description | Viz Type | Data Source | DB Tables | Method | Shape | Position | Area % |
|----|-------------|-------------|----------|-------------|-----------|--------|-------|----------|--------|
| O1.1 | Total Subscribers | National total broadband subscriber count from latest ISP submission | Card-KPI | ISP API | `subscriber_snapshots` | SUM(total_subscribers) WHERE snapshot_month = latest | Square | Top-Left | 10% |
| O1.2 (Remove)| Total ISPs Reporting | Count of ISPs that submitted data in latest reporting period | Card-KPI | ISP API | `api_submissions` | COUNT(DISTINCT isp_id) WHERE submission_month = latest AND status = 'ACCEPTED' | Square | Top-Center-Left | 10% |
| O1.3 | Total PoPs Declared | Total PoPs declared across all ISPs | Card-KPI | ISP-Submitted | `pops` | COUNT(*) WHERE status = 'ACTIVE' | Square | Top-Center-Right | 10% |
| O1.4 | National Bandwidth Capacity | Sum of ISP-declared total bandwidth capacity | Card-KPI | ISP-Submitted | `bandwidth_snapshots` | SUM(total_international_mbps + total_bdix_mbps + total_cache_mbps) WHERE month = latest | Square | Top-Right | 10% |
| O1.5 | Subscriber Distribution by Division | Horizontal bar chart showing subscriber count per division | Graph-Bar-Horizontal | ISP API | `subscriber_snapshots` JOIN `geo_divisions` | SUM(total_subscribers) GROUP BY division_id ORDER BY total DESC | Rectangular (wide) | Middle-Left | 25% |
| O1.6 | Market Share by ISP (Top 15) | Pie/donut chart showing subscriber market share for top 15 ISPs + "Others" | Graph-Donut | ISP API | `subscriber_snapshots` | SUM(subscribers) GROUP BY isp_id / SUM(all_subscribers) * 100 ORDER BY share DESC LIMIT 15 | Rectangular (wide) | Middle-Right | 25% |
| O1.7 (Remove) | ISP Submission Status | Table: ISP Name, Last Submission Date, Status (On-time/Late/Missing), Data Completeness % | Table-Data | ISP API | `api_submissions` JOIN `isps` | SELECT isp, max(submitted_at), status, completeness_pct GROUP BY isp_id | Rectangular (full-width) | Bottom | 15% |

#### O1 Layout Grid

```
┌───────────┬───────────┬───────────┬───────────┐
│   O1.1    │   O1.2    │   O1.3    │   O1.4    │
│Subscribers│ ISPs Rptg │ PoPs Decl │ Bandwidth │  10% x4 = 40%
│  (Square) │  (Square) │  (Square) │  (Square) │  Height: ~15%
├───────────┴─────┬─────┴───────────┴───────────┤
│     O1.5        │          O1.6                │
│ Subscriber by   │  Market Share (Top 15)       │  25% + 25%
│ Division (Bar)  │  (Donut chart)               │  Height: ~45%
│ (Rect-wide)     │  (Rect-wide)                 │
├─────────────────┴──────────────────────────────┤
│                   O1.7                          │
│        ISP Submission Status Table              │  15%
│           (Rect-full-width)                     │  Height: ~25%
└─────────────────────────────────────────────────┘
```

---

### Tab O2: Package & Subscriber Analysis

**Tab Objective**: Answer "What broadband packages and tiers are ISPs offering and how are subscribers distributed?"

#### O2 Elements

| ID | Element Name | Description | Viz Type | Data Source | DB Tables | Method | Shape | Position | Area % |
|----|-------------|-------------|----------|-------------|-----------|--------|-------|----------|--------|
| O2.1 | Package Tier Distribution | Stacked bar chart grouping packages into speed tiers: 0-10, 10-25, 25-50, 50-100, 100+ Mbps; bars = ISP count per tier | Graph-Stacked-Bar | ISP-Submitted | `packages` | COUNT(*) GROUP BY CASE speed_tier WHEN download_speed <= 10 THEN '0-10' ... END | Rectangular (wide) | Top-Left | 25% |
| O2.2 | Subscriber Distribution by Tier | Donut chart showing % of subscribers on each speed tier | Graph-Donut | ISP API | `subscriber_snapshots` JOIN `packages` | SUM(subscribers) GROUP BY speed_tier / SUM(total) * 100 | Rectangular (wide) | Top-Right | 25% |
| O2.3 | Package Detail Table | Full table: ISP, Package Name, DL Speed, UL Speed, Price (BDT), MIR, CIR, Subscribers, Contention Ratio; sortable by any column | Table-Data | ISP-Submitted | `packages` JOIN `isps` | SELECT * FROM packages JOIN isps ORDER BY download_speed_mbps DESC | Rectangular (full-width) | Middle | 30% |
| O2.4 | Average Package Price by Tier | Grouped bar chart showing avg monthly price per speed tier; bars grouped by ISP category | Graph-Bar-Grouped | ISP-Submitted | `packages` JOIN `isp_license_categories` | AVG(monthly_price_bdt) GROUP BY speed_tier, license_category | Rectangular (full-width) | Bottom | 20% |

#### O2 Layout Grid

```
┌───────────────────────┬─────────────────────────┐
│        O2.1           │        O2.2             │
│  Package Tier Dist    │  Subscriber by Tier     │  25% + 25%
│  (Stacked Bar)        │  (Donut)                │  Height: ~25%
│  (Rect-wide)          │  (Rect-wide)            │
├───────────────────────┴─────────────────────────┤
│                    O2.3                          │
│         Package Detail Table                     │  30%
│           (Rect-full-width)                      │  Height: ~40%
├─────────────────────────────────────────────────┤
│                    O2.4                          │
│       Avg Package Price by Tier                  │  20%
│           (Rect-full-width)                      │  Height: ~25%
└─────────────────────────────────────────────────┘
```

---

### Tab O3: Geographic Coverage

**Tab Objective**: Answer "Where are ISPs deployed and where are the coverage gaps?"

#### O3 Elements

| ID | Element Name | Description | Viz Type | Data Source | DB Tables | Method | Shape | Position | Area % |
|----|-------------|-------------|----------|-------------|-----------|--------|-------|----------|--------|
| O3.1 | ISP Coverage Map | Map showing PoP locations plotted on Bangladesh; sized by ISP count per district; color by coverage adequacy | Map-Density | ISP-Submitted | `pops` JOIN `geo_districts` | COUNT(pops) GROUP BY district_id plotted at district centroid | Rectangular (tall) | Left | 40% |
| O3.2 | Coverage Summary Cards | 3 cards: Districts with >=3 ISPs (Competitive), 1-2 ISPs (Limited), 0 ISPs (Unserved) | Card-Status (x3) | ISP-Submitted | `pops` JOIN `geo_districts` | COUNT(DISTINCT isp_id) GROUP BY district_id → categorize | Square (x3 stacked) | Right-Top | 15% |
| O3.3 | ISP Coverage Overlap Table | Table: District, ISP Count, PoP Count, Population, PoP/100k ratio; sorted by lowest coverage | Table-Data | ISP-Submitted | `pops` JOIN `geo_districts` JOIN population_data | COUNT(DISTINCT isp_id), COUNT(pops), SUM(population) / COUNT(pops) * 100000 GROUP BY district | Rectangular (wide) | Right-Middle | 25% |
| O3.4 | Division-Level PoP Summary | Table: Division, Total PoPs, ISP Count, Population Coverage %, Districts Below Threshold | Table-Data | ISP-Submitted | `pops` JOIN `geo_divisions` | COUNT(pops), COUNT(DISTINCT isp_id), coverage_pct GROUP BY division_id | Rectangular (full-width) | Bottom | 20% |

#### O3 Layout Grid

```
┌──────────────────────┬──────────────────────────┐
│       O3.1           │  O3.2a  │  O3.2b │O3.2c │
│   Coverage Map       │ Compet. │ Limited│Unsvd │  40% + 15%
│   (PoP Density)      │(Square) │(Square)│(Sqr) │
│   (Rect-tall)        ├─────────┴────────┴──────┤
│                      │         O3.3             │
│                      │  Coverage Overlap Table   │  25%
│                      │  (Rect-wide)             │  Height: ~40%
├──────────────────────┴──────────────────────────┤
│                    O3.4                          │
│       Division-Level PoP Summary                 │  20%
│           (Rect-full-width)                      │  Height: ~20%
└─────────────────────────────────────────────────┘
```

---

### Operational Dashboard Summary

| Tab | Elements | Primary Question |
|-----|----------|-----------------|
| O1: Market Overview | 7 | "What is the broadband market landscape?" |
| O2: Package & Subscriber Analysis | 4 | "What packages exist and who subscribes?" |
| O3: Geographic Coverage | 4 (+3 sub-cards) | "Where are ISPs deployed and where are gaps?" |
| **TOTAL** | **15** | |

---

## 5. Cross-Dashboard Summary

### Element Count

| Dashboard | Tabs | Elements | Cards | Charts | Tables | Maps | Controls |
|-----------|------|----------|-------|--------|--------|------|----------|
| Executive | 3 | 16 | 7 | 5 | 4 | 1 | 0 |
| Regulatory | 3 | 17 | 6 | 3 | 4 | 2 | 2 |
| Operational | 3 | 15 | 7 | 4 | 4 | 1 | 0 |
| **TOTAL** | **9** | **48** | **20** | **12** | **12** | **4** | **2** |

### Visualization Type Summary

| Viz Type | Count | Dashboards Using |
|----------|-------|------------------|
| Card-KPI | 10 | Executive (4), Operational (4), Regulatory (2) |
| Card-Status | 10 | Executive (3), Regulatory (4), Operational (3) |
| Graph-Bar (Horizontal/Grouped) | 5 | Executive (2), Operational (2), Regulatory (1) |
| Graph-Line | 1 | Executive (1) |
| Graph-Stacked-Bar | 3 | Executive (1), Regulatory (1), Operational (1) |
| Graph-Donut | 2 | Operational (2) |
| Table-Data | 7 | Executive (1), Regulatory (3), Operational (3) |
| Table-Ranking | 3 | Executive (1), Regulatory (2) |
| Table-Matrix | 1 | Regulatory (1) |
| Map-Choropleth | 3 | Executive (1), Regulatory (2) |
| Map-Density | 1 | Operational (1) |
| Grid-Traffic-Light | 1 | Executive (1) |
| Panel-Alert | 1 | Regulatory (1) |
| Filter-Control | 1 | Regulatory (1) |
| Nav-Breadcrumb | 1 | Regulatory (1) |

### Data Source to Dashboard Mapping

| Data Source | Executive | Regulatory | Operational | Total Elements |
|-------------|-----------|------------|-------------|----------------|
| QoS Collector | 14 | 13 | 0 | 27 |
| Compliance Engine (calculated) | 5 | 9 | 0 | 14 |
| ISP API (monthly submissions) | 0 | 0 | 7 | 7 |
| ISP-Submitted (product/infra) | 1 | 1 | 8 | 10 |
| SNMP Collector | 0 | 1 | 0 | 1 |

### Aggregation Method Summary

| Method | Count | Example |
|--------|-------|---------|
| AVG (weighted) | 8 | National avg speed weighted by subscriber count |
| AVG (simple) | 6 | Division avg availability |
| COUNT | 14 | ISP count, violation count, PoP count |
| COUNT DISTINCT | 4 | Distinct ISPs, distinct districts |
| SUM | 6 | Total subscribers, total bandwidth |
| CASE/categorize | 3 | Traffic light status, speed tier grouping |
| Ratio calculation | 3 | Market share %, PoP per 100k population |
| Time-bucket aggregation | 2 | Monthly violation trend, speed trend |
| Ranking (ORDER BY + LIMIT) | 2 | Top 10 violators, division ranking |

---

## 6. DB Tables Referenced (POC Subset)

### Primary Tables

| Table | Schema Step | Dashboard(s) Using | Purpose |
|-------|------------|-------------------|---------|
| `ts_qos_measurements` | Step 4 (TimeSeries) | Executive, Regulatory | QoS synthetic test results (hypertable) |
| `hourly_qos_stats` | Step 4 (CA) | Executive, Regulatory | Continuous aggregate - hourly rollup |
| `daily_compliance_summary` | Step 4 (CA) | Executive | Continuous aggregate - daily rollup |
| `isps` | Step 1 (Foundation) | All 3 | ISP master data |
| `isp_license_categories` | Step 1 (Foundation) | Executive, Operational | ISP category classification |
| `geo_divisions` | Step 1 (Foundation) | All 3 | 8 Bangladesh divisions |
| `geo_districts` | Step 1 (Foundation) | Regulatory, Operational | 64 Bangladesh districts |
| `pops` | Step 2 (Infrastructure) | All 3 | Points of Presence |
| `packages` | Step 3 (Product) | Regulatory, Operational | Broadband packages |
| `subscriber_snapshots` | Step 3 (Product) | Operational | Monthly subscriber counts |
| `bandwidth_snapshots` | Step 3 (Product) | Operational | ISP bandwidth capacity |
| `compliance_scores` | Step 8 (Compliance) | Executive, Regulatory | Monthly ISP compliance scores |
| `sla_violations` | Step 8 (Compliance) | Executive, Regulatory | Detected SLA violations |
| `sla_thresholds` | Step 8 (Compliance) | Regulatory | Configurable thresholds |
| `incidents` | Step 6 (Operational) | Regulatory | ISP-reported incidents |
| `alerts` | Step 11 (Observability) | Regulatory | System alerts |
| `api_submissions` | Step 10 (Integration) | Operational | ISP API submission tracking |

---

## 7. POC Simplifications vs Full System

| Aspect | Full System (4 Dashboards) | POC (3 Dashboards) | Deferred To |
|--------|---------------------------|---------------------|-------------|
| Dashboards | 4 | 3 | Tech Ops → Phase 2 |
| Total Tabs | 18 | 9 | - |
| Total Elements | 94 | 48 | ~49% reduction |
| Executive Tabs | 5 | 3 | Consumer Experience, PoP Availability → Phase 2 |
| Regulatory Tabs | 5 | 3 | Investigation Center, License Compliance → Phase 2 |
| Operational Tabs | 4 | 3 | Compliance Reporting → Phase 2 |
| Mobile App data | Required | Not used | Phase 2 |
| Consumer complaints | Dashboard element | Excluded | Phase 2 |
| Investigation query builder | Full capability | Excluded | Phase 2 |
| ISP Grade (A/B/C) system | Required | Optional/partial | BTRC approval needed |
| NPS calculation | Required | Excluded | BTRC approval needed |
| Enforcement workflow | Full workflow | View-only summary | Phase 2 |
| Public Dashboard | Planned (Phase 3) | Not applicable | Phase 3 |

---

## Source References

- Dashboard Count Decision: `DEV/02-architecture/BTRC-FXBB-QOS-POC_Design-Doc(DASHBOARD-COUNT-DECISION)_DRAFT_v0.1.md`
- Component Adjustments: `DEV/02-architecture/BTRC-FXBB-QOS-POC_Design-Doc(DASHBOARD-COMPONENT-ADJUSTMENTS)_DRAFT_v0.1.md`
- Executive Dashboard Design: `DEV/05-ui/BTRC-FXBB-QOS-POC_Design-Doc(DASHBOARD-EXECUTIVE)_FINAL_v1.0.md`
- Regulatory Dashboard Design: `DEV/05-ui/BTRC-FXBB-QOS-POC_Design-Doc(DASHBOARD-REGULATORY)_FINAL_v1.0.md`
- Dashboard Elements Spec: `DEV/01-planning/BTRC-FXBB-QOS-POC_Dev-Spec(DASHBOARD-ELEMENTS)_DRAFT_v0.1.md`
- Dashboard Requirements: `DEV/05-ui/BTRC-FXBB-QOS-POC_Design-Doc(DASHBOARD-REQUIREMENTS)_DRAFT_v0.5.md`
- DB Schema Index: `DEV/03-data/BTRC-FXBB-QOS-POC_DB-Schema(INDEX)_FINAL_v1.0.md`

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-02-02 | Initial POC minimal scope specification; 3 dashboards, 9 tabs, 48 elements |

---

**End of Document**
