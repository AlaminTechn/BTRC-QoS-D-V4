#!/usr/bin/env python3
"""
setup_metabase.py — BTRC QoS Dashboard v4 — Full Metabase Backend Setup
========================================================================
Creates:
  - Initial admin account (if fresh Metabase installation)
  - TimescaleDB database connection
  - Collection: "BTRC QoS v4"
  - All SQL questions (cards) for Regulatory + Executive dashboards
  - Dashboards with tabs (Regulatory, Executive)
  - Permission groups (Admin, Regulatory Officers, Executive Viewers)
  - Query caching (5-minute global TTL)
  - Outputs: btrc-frontend/src/config/metabase_cards.json

Usage:
  pip install requests
  python scripts/setup_metabase.py

  # Or with custom settings:
  METABASE_URL=http://localhost:3000 \\
  METABASE_USER=admin@example.com \\
  METABASE_PASS=password \\
  python scripts/setup_metabase.py

Idempotent: safe to re-run; existing cards/dashboards are reused.
"""

import os, sys, json, time, uuid, requests
from pathlib import Path

# ── Configuration ──────────────────────────────────────────────────────────
METABASE_URL  = os.environ.get("METABASE_URL",  "http://localhost:3000")
MB_EMAIL      = os.environ.get("METABASE_USER", "alamin.technometrics22@gmail.com")
MB_PASS       = os.environ.get("METABASE_PASS", "Test@123")
DB_HOST       = os.environ.get("DB_HOST",       "localhost")
DB_PORT       = int(os.environ.get("DB_PORT",   "5433"))
DB_NAME       = os.environ.get("DB_NAME",       "btrc_qos_poc")
DB_USER       = os.environ.get("DB_USER",       "btrc_admin")
DB_PASS       = os.environ.get("DB_PASSWORD",   "btrc_poc_2026")
COLLECTION    = "BTRC QoS v4"
OUTPUT_FILE   = Path(__file__).parent.parent / "btrc-frontend/src/config/metabase_cards.json"
CACHE_TTL_SEC = 300   # 5 minutes


# ══════════════════════════════════════════════════════════════════════════════
# SQL Card Definitions
# Each entry: name, key, description, collection, display, sql, template_tags
# ══════════════════════════════════════════════════════════════════════════════

def ttag(display_name, required=False):
    """Build a Metabase template-tag definition."""
    return {
        "id":           str(uuid.uuid4()),
        "name":         display_name.lower().replace(" ", "_"),
        "display-name": display_name,
        "type":         "text",
        "required":     required,
        "default":      None,
    }

def make_ttags(*names):
    return {n.lower(): ttag(n.capitalize()) for n in names}


# ──────────────────────────────────────────────────────────────────────────────
# REGULATORY CARDS  (SQL corrected to match actual v2.11 schema)
#
# Key schema facts:
#   - isps.name_en          (not .name)
#   - isp_license_categories (not license_categories), column name_en
#   - ts_qos_speed_tests.time (not .timestamp), no isp_id — join via pops
#   - ts_qos_ping_tests.rtt_avg_ms (not .latency_ms), no isp_id
#   - sla_violations has NO division_id/district_id — join through:
#       sla_violations.pop_id → pops.district_id → geo_districts.division_id → geo_divisions
#   - sla_violations.status values: DETECTED, ACKNOWLEDGED, DISPUTED, WAIVED, RESOLVED
#   - sla_violations.affected_subscribers_est (not .affected_subscribers)
#   - compliance_scores.score_month (not period_start/period_end)
# ──────────────────────────────────────────────────────────────────────────────
REGULATORY_CARDS = [

    # ── R1 SLA Monitoring ────────────────────────────────────────────────────

    dict(
        key="REG_R1_COMPLIANT",
        name="[R1] Compliant ISPs",
        description="Count of ISPs with zero violations",
        collection="regulatory", display="scalar",
        sql="""
SELECT COUNT(DISTINCT i.id) AS compliant_isps
FROM isps i
WHERE i.is_active = true
  AND NOT EXISTS (SELECT 1 FROM sla_violations v WHERE v.isp_id = i.id)
""",
        template_tags={},
    ),

    dict(
        key="REG_R1_AT_RISK",
        name="[R1] At-Risk ISPs",
        description="ISPs with 1–4 violations",
        collection="regulatory", display="scalar",
        sql="""
SELECT COUNT(DISTINCT isp_id) AS at_risk_isps
FROM (
    SELECT isp_id, COUNT(*) AS cnt
    FROM sla_violations
    GROUP BY isp_id
    HAVING COUNT(*) BETWEEN 1 AND 4
) t
""",
        template_tags={},
    ),

    dict(
        key="REG_R1_VIOLATION",
        name="[R1] Violation ISPs",
        description="ISPs with 5+ violations",
        collection="regulatory", display="scalar",
        sql="""
SELECT COUNT(DISTINCT isp_id) AS violation_isps
FROM (
    SELECT isp_id, COUNT(*) AS cnt
    FROM sla_violations
    GROUP BY isp_id
    HAVING COUNT(*) >= 5
) t
""",
        template_tags={},
    ),

    dict(
        key="REG_R1_ISP_SLA_TABLE",
        name="[R1] ISP SLA Status Table",
        description="Per-ISP violation count, score, and status",
        collection="regulatory", display="table",
        sql="""
SELECT
    i.name_en                AS isp,
    lc.name_en               AS license_category,
    COUNT(DISTINCT p.id)     AS pop_count,
    COUNT(DISTINCT v.id)     AS violations,
    SUM(CASE WHEN v.severity = 'CRITICAL' THEN 1 ELSE 0 END) AS critical,
    ROUND(AVG(c.overall_score)::numeric, 1)   AS compliance_score,
    MIN(v.detection_time)::date               AS first_violation,
    CASE
        WHEN COUNT(DISTINCT v.id) = 0     THEN 'COMPLIANT'
        WHEN COUNT(DISTINCT v.id) < 5     THEN 'AT_RISK'
        ELSE 'VIOLATION'
    END                      AS status
FROM isps i
JOIN isp_license_categories lc ON i.license_category_id = lc.id
LEFT JOIN pops              p   ON p.isp_id  = i.id
LEFT JOIN sla_violations    v   ON v.isp_id  = i.id
LEFT JOIN compliance_scores c   ON c.isp_id  = i.id
WHERE i.is_active = true
GROUP BY i.name_en, lc.name_en
ORDER BY violations DESC, i.name_en
""",
        template_tags={},
    ),

    # ── R2 Regional Drill-Down ───────────────────────────────────────────────
    # NOTE: sla_violations has no division_id/district_id.
    #       Geography is: violations.pop_id → pops.district_id → districts.division_id → divisions

    dict(
        key="REG_R2_DIV_VIOLATIONS",
        name="[R2] Division Violation Summary",
        description="Violation totals per division (for choropleth map). No filter.",
        collection="regulatory", display="table",
        sql="""
SELECT
    d.name_en                                                    AS division,
    COUNT(v.id)                                                  AS total,
    SUM(CASE WHEN v.severity = 'CRITICAL' THEN 1 ELSE 0 END)   AS critical,
    SUM(CASE WHEN v.severity = 'HIGH'     THEN 1 ELSE 0 END)   AS high,
    SUM(CASE WHEN v.severity = 'MEDIUM'   THEN 1 ELSE 0 END)   AS medium,
    SUM(CASE WHEN v.severity = 'LOW'      THEN 1 ELSE 0 END)   AS low
FROM geo_divisions d
LEFT JOIN geo_districts  di ON di.division_id = d.id
LEFT JOIN pops           p  ON p.district_id  = di.id
LEFT JOIN sla_violations v  ON v.pop_id       = p.id
GROUP BY d.name_en
ORDER BY total DESC
""",
        template_tags={},
    ),

    dict(
        key="REG_R2_DIST_VIOLATIONS",
        name="[R2] District Violation Summary",
        description="Violation totals per district. Filter: {{division}}",
        collection="regulatory", display="table",
        sql="""
SELECT
    di.name_en                                                   AS district,
    d.name_en                                                    AS division,
    COUNT(v.id)                                                  AS total,
    SUM(CASE WHEN v.severity = 'CRITICAL' THEN 1 ELSE 0 END)   AS critical,
    SUM(CASE WHEN v.severity = 'HIGH'     THEN 1 ELSE 0 END)   AS high,
    SUM(CASE WHEN v.severity = 'MEDIUM'   THEN 1 ELSE 0 END)   AS medium,
    SUM(CASE WHEN v.severity = 'LOW'      THEN 1 ELSE 0 END)   AS low
FROM geo_districts di
JOIN geo_divisions d ON di.division_id = d.id
LEFT JOIN pops           p  ON p.district_id = di.id
LEFT JOIN sla_violations v  ON v.pop_id      = p.id
WHERE 1=1
  [[ AND d.name_en = {{division}} ]]
GROUP BY di.name_en, d.name_en
ORDER BY total DESC
""",
        template_tags=make_ttags("division"),
    ),

    dict(
        key="REG_R2_POP_MARKERS",
        name="[R2] PoP Markers",
        description="PoP lat/lng + violation counts. Filters: {{division}} {{district}}",
        collection="regulatory", display="table",
        sql="""
SELECT
    p.id,
    p.name_en,
    p.latitude,
    p.longitude,
    d.name_en                                                    AS division_name,
    di.name_en                                                   AS district_name,
    COUNT(v.id)                                                  AS violations,
    SUM(CASE WHEN v.severity = 'CRITICAL' THEN 1 ELSE 0 END)   AS critical
FROM pops p
JOIN geo_districts  di ON p.district_id  = di.id
JOIN geo_divisions  d  ON di.division_id = d.id
LEFT JOIN sla_violations v ON v.pop_id = p.id
WHERE p.latitude  IS NOT NULL
  AND p.longitude IS NOT NULL
  [[ AND d.name_en  = {{division}} ]]
  [[ AND di.name_en = {{district}} ]]
GROUP BY p.id, p.name_en, p.latitude, p.longitude, d.name_en, di.name_en
ORDER BY violations DESC
""",
        template_tags=make_ttags("division", "district"),
    ),

    dict(
        key="REG_R2_ISP_BY_AREA",
        name="[R2] ISP Performance by Area",
        description="ISP speed/latency/violations per area. Filters: {{division}} {{district}}",
        collection="regulatory", display="table",
        sql="""
-- CTE pre-aggregates timeseries (15-day window) before joining static tables.
-- Direct JOIN to hypertables without time filter causes full table scans (3min+).
WITH recent_speed AS (
    SELECT pop_id, AVG(download_mbps) AS avg_dl, AVG(upload_mbps) AS avg_ul
    FROM ts_qos_speed_tests
    WHERE time >= (SELECT MAX(time) FROM ts_qos_speed_tests) - INTERVAL '15 days'
    GROUP BY pop_id
),
recent_ping AS (
    SELECT pop_id, AVG(rtt_avg_ms) AS avg_latency
    FROM ts_qos_ping_tests
    WHERE time >= (SELECT MAX(time) FROM ts_qos_ping_tests) - INTERVAL '15 days'
    GROUP BY pop_id
)
SELECT
    i.name_en                                 AS isp,
    d.name_en                                 AS division,
    di.name_en                                AS district,
    lc.name_en                                AS license_category,
    COUNT(DISTINCT p.id)                      AS pop_count,
    ROUND(AVG(rs.avg_dl)::numeric, 2)         AS avg_download_mbps,
    ROUND(AVG(rs.avg_ul)::numeric, 2)         AS avg_upload_mbps,
    ROUND(AVG(rp.avg_latency)::numeric, 1)    AS avg_latency_ms,
    COUNT(DISTINCT v.id)                      AS violations
FROM pops p
JOIN isps                   i   ON p.isp_id             = i.id
JOIN isp_license_categories lc  ON i.license_category_id = lc.id
JOIN geo_districts          di  ON p.district_id        = di.id
JOIN geo_divisions          d   ON di.division_id       = d.id
LEFT JOIN recent_speed      rs  ON rs.pop_id            = p.id
LEFT JOIN recent_ping       rp  ON rp.pop_id            = p.id
LEFT JOIN sla_violations    v   ON v.pop_id             = p.id
WHERE 1=1
  [[ AND d.name_en  = {{division}} ]]
  [[ AND di.name_en = {{district}} ]]
GROUP BY i.name_en, d.name_en, di.name_en, lc.name_en
ORDER BY violations DESC, avg_download_mbps DESC NULLS LAST
""",
        template_tags=make_ttags("division", "district"),
    ),

    dict(
        key="REG_R2_DIV_PERF_SUMMARY",
        name="[R2] Division Performance Summary Table",
        description="Division-level ISP/PoP/speed/violation summary",
        collection="regulatory", display="table",
        sql="""
-- CTE pre-aggregates timeseries (15-day window) before joining static tables.
-- Direct JOIN to hypertables without time filter causes full table scans (3min+).
WITH recent_speed AS (
    SELECT pop_id,
           AVG(download_mbps) AS avg_dl,
           AVG(upload_mbps)   AS avg_ul
    FROM ts_qos_speed_tests
    WHERE time >= (SELECT MAX(time) FROM ts_qos_speed_tests) - INTERVAL '15 days'
    GROUP BY pop_id
),
recent_ping AS (
    SELECT pop_id,
           AVG(rtt_avg_ms) AS avg_latency
    FROM ts_qos_ping_tests
    WHERE time >= (SELECT MAX(time) FROM ts_qos_ping_tests) - INTERVAL '15 days'
    GROUP BY pop_id
)
SELECT
    d.name_en                                   AS division,
    COUNT(DISTINCT i.id)                        AS isp_count,
    COUNT(DISTINCT p.id)                        AS pop_count,
    ROUND(AVG(rs.avg_dl)::numeric, 2)           AS avg_download_mbps,
    ROUND(AVG(rs.avg_ul)::numeric, 2)           AS avg_upload_mbps,
    ROUND(AVG(rp.avg_latency)::numeric, 1)      AS avg_latency_ms,
    COUNT(DISTINCT v.id)                        AS violations,
    SUM(CASE WHEN v.severity = 'CRITICAL' THEN 1 ELSE 0 END) AS critical
FROM geo_divisions d
LEFT JOIN geo_districts   di ON di.division_id = d.id
LEFT JOIN pops            p  ON p.district_id  = di.id
LEFT JOIN isps            i  ON p.isp_id       = i.id
LEFT JOIN recent_speed    rs ON rs.pop_id      = p.id
LEFT JOIN recent_ping     rp ON rp.pop_id      = p.id
LEFT JOIN sla_violations  v  ON v.pop_id       = p.id
GROUP BY d.name_en
ORDER BY violations DESC
""",
        template_tags={},
    ),

    # ── R3 Violation Analysis ────────────────────────────────────────────────
    # Status values in data: DETECTED, ACKNOWLEDGED, DISPUTED, WAIVED, RESOLVED
    # "Pending" = not yet resolved = DETECTED + ACKNOWLEDGED

    dict(
        key="REG_R3_PENDING",
        name="[R3] Pending Violations",
        description="Count of active/pending violations (DETECTED or ACKNOWLEDGED)",
        collection="regulatory", display="scalar",
        sql="""
SELECT COUNT(*) AS pending_violations
FROM sla_violations
WHERE status IN ('DETECTED', 'ACKNOWLEDGED')
""",
        template_tags={},
    ),

    dict(
        key="REG_R3_DISPUTED",
        name="[R3] Disputed Violations",
        description="Count of DISPUTED violations",
        collection="regulatory", display="scalar",
        sql="SELECT COUNT(*) AS disputed_violations FROM sla_violations WHERE status = 'DISPUTED'",
        template_tags={},
    ),

    dict(
        key="REG_R3_RESOLVED",
        name="[R3] Resolved Violations",
        description="Count of RESOLVED violations",
        collection="regulatory", display="scalar",
        sql="SELECT COUNT(*) AS resolved_violations FROM sla_violations WHERE status = 'RESOLVED'",
        template_tags={},
    ),

    dict(
        key="REG_R3_DETAIL",
        name="[R3] Violation Detail Table",
        description="Full violation table. Filters: {{division}} {{district}} {{isp}} {{severity}} {{status}}",
        collection="regulatory", display="table",
        sql="""
SELECT
    v.id,
    i.name_en               AS isp,
    v.violation_type,
    v.severity,
    v.status,
    d.name_en               AS division,
    di.name_en              AS district,
    v.detection_time,
    v.expected_value,
    v.actual_value,
    v.deviation_pct,
    v.affected_subscribers_est AS affected_subscribers,
    v.penalty_amount_bdt
FROM sla_violations v
JOIN isps             i   ON v.isp_id       = i.id
LEFT JOIN pops           p   ON v.pop_id       = p.id
LEFT JOIN geo_districts  di  ON p.district_id  = di.id
LEFT JOIN geo_divisions  d   ON di.division_id = d.id
WHERE 1=1
  [[ AND d.name_en   = {{division}} ]]
  [[ AND di.name_en  = {{district}} ]]
  [[ AND i.name_en   = {{isp}} ]]
  [[ AND v.severity  = {{severity}} ]]
  [[ AND v.status    = {{status}} ]]
ORDER BY v.detection_time DESC
""",
        template_tags=make_ttags("division", "district", "isp", "severity", "status"),
    ),

    dict(
        key="REG_R3_TREND",
        name="[R3] Violation Trend by Severity",
        description="Daily violation counts per severity (14-day window)",
        collection="regulatory", display="line",
        sql="""
SELECT
    DATE(v.detection_time)  AS day,
    v.severity,
    COUNT(*)                AS cnt
FROM sla_violations v
WHERE v.detection_time >= (
    SELECT MAX(detection_time) FROM sla_violations
) - INTERVAL '14 days'
GROUP BY day, v.severity
ORDER BY day
""",
        template_tags={},
    ),

    dict(
        key="REG_R3_GEO",
        name="[R3] Violations by Geography",
        description="Division/district violation breakdown. Filter: {{division}}",
        collection="regulatory", display="table",
        sql="""
SELECT
    d.name_en                                                    AS division,
    di.name_en                                                   AS district,
    COUNT(*)                                                     AS total,
    SUM(CASE WHEN v.severity = 'CRITICAL' THEN 1 ELSE 0 END)   AS critical,
    SUM(CASE WHEN v.severity = 'HIGH'     THEN 1 ELSE 0 END)   AS high,
    SUM(CASE WHEN v.severity = 'MEDIUM'   THEN 1 ELSE 0 END)   AS medium,
    SUM(CASE WHEN v.severity = 'LOW'      THEN 1 ELSE 0 END)   AS low
FROM sla_violations v
LEFT JOIN pops           p   ON v.pop_id       = p.id
LEFT JOIN geo_districts  di  ON p.district_id  = di.id
LEFT JOIN geo_divisions  d   ON di.division_id = d.id
WHERE 1=1
  [[ AND d.name_en = {{division}} ]]
GROUP BY d.name_en, di.name_en
ORDER BY total DESC
""",
        template_tags=make_ttags("division"),
    ),
]


# ──────────────────────────────────────────────────────────────────────────────
# EXECUTIVE CARDS  (SQL corrected to match actual v2.11 schema)
# ──────────────────────────────────────────────────────────────────────────────
EXECUTIVE_CARDS = [

    # ── E1 Performance Scorecard ─────────────────────────────────────────────

    dict(
        key="EXEC_E1_NATIONAL_SCORE",
        name="[E1] National QoS Score",
        description="Average compliance score across all active ISPs",
        collection="executive", display="scalar",
        sql="""
SELECT ROUND(AVG(overall_score)::numeric, 1) AS national_qos_score
FROM compliance_scores c
JOIN isps i ON c.isp_id = i.id
WHERE i.is_active = true
""",
        template_tags={},
    ),

    dict(
        key="EXEC_E1_ISP_PERFORMANCE",
        name="[E1] ISP Performance Table",
        description="Per-ISP score, speed, latency, violations",
        collection="executive", display="table",
        sql="""
SELECT
    i.name_en                                 AS isp,
    lc.name_en                                AS license_category,
    COUNT(DISTINCT p.id)                      AS pop_count,
    ROUND(AVG(s.download_mbps)::numeric, 2)   AS avg_download,
    ROUND(AVG(s.upload_mbps)::numeric,   2)   AS avg_upload,
    ROUND(AVG(pi.rtt_avg_ms)::numeric,   1)   AS avg_latency,
    COUNT(DISTINCT v.id)                      AS violations,
    ROUND(AVG(c.overall_score)::numeric,  1)  AS score
FROM isps i
JOIN isp_license_categories lc ON i.license_category_id = lc.id
LEFT JOIN pops               p  ON p.isp_id  = i.id
LEFT JOIN ts_qos_speed_tests s  ON s.pop_id  = p.id
LEFT JOIN ts_qos_ping_tests  pi ON pi.pop_id = p.id
LEFT JOIN sla_violations     v  ON v.isp_id  = i.id
LEFT JOIN compliance_scores  c  ON c.isp_id  = i.id
WHERE i.is_active = true
GROUP BY i.name_en, lc.name_en
ORDER BY score DESC NULLS LAST
""",
        template_tags={},
    ),

    dict(
        key="EXEC_E1_ISP_BY_CATEGORY",
        name="[E1] ISPs by License Category",
        description="Count of ISPs per license category (for donut chart)",
        collection="executive", display="pie",
        sql="""
SELECT lc.name_en AS category, COUNT(i.id) AS isp_count
FROM isp_license_categories lc
LEFT JOIN isps i ON i.license_category_id = lc.id AND i.is_active = true
GROUP BY lc.name_en
ORDER BY isp_count DESC
""",
        template_tags={},
    ),

    # ── E2 Geographic Intelligence ────────────────────────────────────────────

    dict(
        key="EXEC_E2_DIV_SUMMARY",
        name="[E2] Division Performance Summary",
        description="Division-level violations + avg speed (for choropleth map)",
        collection="executive", display="table",
        sql="""
SELECT
    d.name_en                                   AS division,
    COUNT(DISTINCT i.id)                        AS isp_count,
    COUNT(DISTINCT p.id)                        AS pop_count,
    ROUND(AVG(s.download_mbps)::numeric, 2)     AS avg_download,
    ROUND(AVG(s.upload_mbps)::numeric,   2)     AS avg_upload,
    COUNT(DISTINCT v.id)                        AS violations,
    SUM(CASE WHEN v.severity = 'CRITICAL' THEN 1 ELSE 0 END) AS critical,
    SUM(CASE WHEN v.severity = 'HIGH'     THEN 1 ELSE 0 END) AS high,
    SUM(CASE WHEN v.severity = 'MEDIUM'   THEN 1 ELSE 0 END) AS medium,
    SUM(CASE WHEN v.severity = 'LOW'      THEN 1 ELSE 0 END) AS low
FROM geo_divisions d
LEFT JOIN geo_districts      di ON di.division_id = d.id
LEFT JOIN pops               p  ON p.district_id  = di.id
LEFT JOIN isps               i  ON p.isp_id       = i.id
LEFT JOIN ts_qos_speed_tests s  ON s.pop_id       = p.id
LEFT JOIN sla_violations     v  ON v.pop_id       = p.id
GROUP BY d.name_en
ORDER BY violations DESC
""",
        template_tags={},
    ),

    # ── E3 Compliance Overview ────────────────────────────────────────────────

    dict(
        key="EXEC_E3_VIOLATION_TYPE",
        name="[E3] Violations by Type",
        description="Violation count per type (for donut chart)",
        collection="executive", display="pie",
        sql="""
SELECT violation_type, COUNT(*) AS cnt
FROM sla_violations
GROUP BY violation_type
ORDER BY cnt DESC
""",
        template_tags={},
    ),

    dict(
        key="EXEC_E3_VIOLATION_SEV",
        name="[E3] Violations by Severity",
        description="Violation count per severity level",
        collection="executive", display="pie",
        sql="""
SELECT severity, COUNT(*) AS cnt
FROM sla_violations
GROUP BY severity
ORDER BY CASE severity
    WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2
    WHEN 'MEDIUM'   THEN 3 WHEN 'LOW'  THEN 4
END
""",
        template_tags={},
    ),

    dict(
        key="EXEC_E3_TREND",
        name="[E3] Violation Trend (14 days)",
        description="Daily violation counts by severity over last 14 days",
        collection="executive", display="line",
        sql="""
SELECT
    DATE(v.detection_time)  AS day,
    v.severity,
    COUNT(*)                AS cnt
FROM sla_violations v
WHERE v.detection_time >= (
    SELECT MAX(detection_time) FROM sla_violations
) - INTERVAL '14 days'
GROUP BY day, v.severity
ORDER BY day
""",
        template_tags={},
    ),

    dict(
        key="EXEC_E3_PENALTY",
        name="[E3] Total Penalty Exposure",
        description="Total + average penalty amount in BDT",
        collection="executive", display="scalar",
        sql="""
SELECT
    SUM(penalty_amount_bdt)                    AS total_penalty_bdt,
    ROUND(AVG(penalty_amount_bdt)::numeric, 0) AS avg_per_violation
FROM sla_violations
WHERE penalty_amount_bdt IS NOT NULL
""",
        template_tags={},
    ),
]

ALL_CARDS = REGULATORY_CARDS + EXECUTIVE_CARDS


# ══════════════════════════════════════════════════════════════════════════════
# Metabase Setup Client
# ══════════════════════════════════════════════════════════════════════════════

class MetabaseSetup:
    def __init__(self):
        self.base = METABASE_URL.rstrip("/")
        self.session = requests.Session()
        self.session.headers["Content-Type"] = "application/json"
        self.token = None

    def _get(self, path, **kw):
        r = self.session.get(f"{self.base}{path}", **kw)
        r.raise_for_status()
        return r.json()

    def _post(self, path, body=None, **kw):
        r = self.session.post(f"{self.base}{path}", json=body or {}, **kw)
        r.raise_for_status()
        return r.json()

    def _put(self, path, body=None, **kw):
        r = self.session.put(f"{self.base}{path}", json=body or {}, **kw)
        r.raise_for_status()
        return r.json()

    def _delete(self, path, **kw):
        r = self.session.delete(f"{self.base}{path}", **kw)
        r.raise_for_status()
        return r

    def _auth(self, token):
        self.token = token
        self.session.headers["X-Metabase-Session"] = token

    # ── Wait for Metabase to be ready ────────────────────────────────────────
    def wait_for_ready(self, timeout=180, interval=5):
        print(f"⏳ Waiting for Metabase at {self.base} ...")
        end = time.time() + timeout
        while time.time() < end:
            try:
                r = requests.get(f"{self.base}/api/health", timeout=5)
                if r.status_code == 200 and r.json().get("status") == "ok":
                    print("✅ Metabase is ready")
                    return True
            except Exception:
                pass
            time.sleep(interval)
        raise TimeoutError("Metabase did not become ready in time")

    # ── Initial setup (fresh install) ────────────────────────────────────────
    def initial_setup_if_needed(self):
        props = self._get("/api/session/properties")
        setup_token = props.get("setup-token")
        if not setup_token:
            print("ℹ️  Metabase already set up — skipping initial setup")
            return False

        print("🔧 Running initial Metabase setup ...")
        try:
            self._post("/api/setup", {
                "token": setup_token,
                "user": {
                    "first_name": "BTRC",
                    "last_name":  "Admin",
                    "email":      MB_EMAIL,
                    "password":   MB_PASS,
                    "site_name":  "BTRC QoS",
                },
                "prefs": {
                    "site_name":      "BTRC QoS Dashboard",
                    "allow_tracking": False,
                },
            })
            print("✅ Initial setup complete")
        except Exception as e:
            # 403 = setup token invalid / already done via web UI — safe to continue
            print(f"ℹ️  /api/setup returned error ({e}) — Metabase already configured, continuing")
        return True

    # ── Login ────────────────────────────────────────────────────────────────
    def login(self):
        print(f"🔑 Logging in as {MB_EMAIL} ...")
        data = self._post("/api/session", {"username": MB_EMAIL, "password": MB_PASS})
        self._auth(data["id"])
        print("✅ Logged in")

    # ── Database connection ───────────────────────────────────────────────────
    def get_or_create_database(self):
        dbs_resp = self._get("/api/database")
        dbs = dbs_resp.get("data", dbs_resp) if isinstance(dbs_resp, dict) else dbs_resp
        existing = next(
            (d for d in dbs if d.get("name", "").lower() in ("btrc qos poc", "btrc_qos_poc", "btrc qos")),
            None
        )
        if existing:
            print(f"ℹ️  Database already exists: id={existing['id']}")
            return existing["id"]

        print("🗄️  Creating TimescaleDB connection ...")
        db_host_internal = "timescaledb" if DB_HOST == "localhost" else DB_HOST
        data = self._post("/api/database", {
            "name":    "BTRC QoS POC",
            "engine":  "postgres",
            "details": {
                "host":                  db_host_internal,
                "port":                  5432,
                "dbname":                DB_NAME,
                "user":                  DB_USER,
                "password":              DB_PASS,
                "ssl":                   False,
                "tunnel-enabled":        False,
                "schema-filter-type":    "inclusion",
                "schema-filters-patterns": "public",
                "advanced-options":      False,
            },
        })
        db_id = data["id"]
        print(f"✅ Database created: id={db_id}")

        # Trigger sync
        try:
            self._post(f"/api/database/{db_id}/sync_schema")
            print("   Triggered schema sync")
        except Exception:
            pass
        return db_id

    # ── Collection ───────────────────────────────────────────────────────────
    def get_or_create_collection(self):
        colls = self._get("/api/collection")
        existing = next((c for c in colls if c.get("name") == COLLECTION), None)
        if existing:
            print(f"ℹ️  Collection '{COLLECTION}' exists: id={existing['id']}")
            return existing["id"]
        data = self._post("/api/collection", {
            "name":  COLLECTION,
            "color": "#1890ff",
        })
        coll_id = data["id"]
        print(f"✅ Collection created: id={coll_id}")
        return coll_id

    # ── Cards ────────────────────────────────────────────────────────────────
    def _existing_cards_by_name(self):
        """Return {name: id} for all cards in the collection."""
        cards = self._get("/api/card")
        return {c["name"]: c["id"] for c in cards}

    def create_cards(self, db_id, coll_id):
        """Create all cards; return {key: id}."""
        existing = self._existing_cards_by_name()
        card_ids = {}

        for card in ALL_CARDS:
            name = card["name"]
            if name in existing:
                print(f"  ↩️  Card exists: [{card['key']}] {name}")
                card_ids[card["key"]] = existing[name]
                continue

            # Build template-tags structure
            ttags = card.get("template_tags", {})
            # Build parameters array from template tags
            parameters = [
                {
                    "id":     t["id"],
                    "type":   "string/=",
                    "target": ["variable", ["template-tag", k]],
                    "name":   t["display-name"],
                    "slug":   k,
                }
                for k, t in ttags.items()
            ]

            body = {
                "name":          name,
                "description":   card.get("description", ""),
                "collection_id": coll_id,
                "display":       card.get("display", "table"),
                "dataset_query": {
                    "type":     "native",
                    "database": db_id,
                    "native": {
                        "query":         card["sql"].strip(),
                        "template-tags": ttags,
                    },
                },
                "visualization_settings": _viz_settings(card.get("display", "table")),
                "parameters": parameters,
            }

            try:
                data = self._post("/api/card", body)
                card_ids[card["key"]] = data["id"]
                print(f"  ✅ Created card: [{card['key']}] id={data['id']}")
            except Exception as e:
                print(f"  ❌ Failed to create [{card['key']}]: {e}")
                card_ids[card["key"]] = None

        return card_ids

    # ── Dashboards ───────────────────────────────────────────────────────────
    def create_dashboards(self, card_ids, coll_id):
        """Create (or fully rebuild) Regulatory + Executive dashboards with tabs.

        Always rebuilds dashcards so that re-running after card recreation
        (e.g. after archiving stale cards) produces a populated dashboard.
        """
        dash_ids = {}

        # Only non-archived dashboards are returned by default
        existing_dashes = self._get("/api/dashboard")
        existing_names  = {d["name"]: d["id"] for d in existing_dashes}

        for dash_spec in [
            _regulatory_dashboard_spec(card_ids),
            _executive_dashboard_spec(card_ids),
        ]:
            name    = dash_spec["name"]
            rebuild = name in existing_names  # True → already exists, just rebuild cards

            if rebuild:
                dash_id = existing_names[name]
                print(f"  🔄 Rebuilding dashcards: {name} id={dash_id}")
            else:
                # Step 1: create empty dashboard
                dash = self._post("/api/dashboard", {
                    "name":          name,
                    "description":   dash_spec.get("description", ""),
                    "collection_id": coll_id,
                })
                dash_id = dash["id"]
                print(f"  ✅ Created dashboard: {name} id={dash_id}")

            # Step 2: ensure tabs exist (idempotent — Metabase merges by name)
            dash_detail = self._get(f"/api/dashboard/{dash_id}")
            existing_tabs = {t["name"]: t["id"] for t in dash_detail.get("tabs", [])}

            if not existing_tabs:
                tabs_def = [{"id": -(i+1), "name": t["name"]} for i, t in enumerate(dash_spec["tabs"])]
                self._put(f"/api/dashboard/{dash_id}", {"tabs": tabs_def, "dashcards": []})
                dash_detail  = self._get(f"/api/dashboard/{dash_id}")
                existing_tabs = {t["name"]: t["id"] for t in dash_detail.get("tabs", [])}

            # Step 3: build dashcards for every tab
            dashcards = []
            for tab_spec in dash_spec["tabs"]:
                tab_id = existing_tabs.get(tab_spec["name"])
                if not tab_id:
                    continue
                for card_place in tab_spec.get("cards", []):
                    cid = card_ids.get(card_place["key"])
                    if not cid:
                        continue
                    dashcards.append({
                        "id":               -(len(dashcards) + 1),
                        "card_id":          cid,
                        "dashboard_tab_id": tab_id,
                        "col":              card_place["col"],
                        "row":              card_place["row"],
                        "size_x":           card_place["w"],
                        "size_y":           card_place["h"],
                        "parameter_mappings":     [],
                        "visualization_settings": {},
                    })

            # Step 4: push all dashcards (replaces existing set)
            self._put(f"/api/dashboard/{dash_id}", {
                "tabs":      [{"id": v, "name": k} for k, v in existing_tabs.items()],
                "dashcards": dashcards,
            })
            print(f"     → {len(dashcards)} cards placed across {len(existing_tabs)} tabs")
            dash_ids[name] = dash_id

        return dash_ids

    # ── Permission Groups ────────────────────────────────────────────────────
    def setup_permission_groups(self, coll_id):
        """Create BTRC permission groups and grant collection access."""
        existing = self._get("/api/permissions/group")
        existing_names = {g["name"]: g["id"] for g in existing}

        groups = {}
        for name in ["BTRC Regulatory Officers", "BTRC Executive Viewers"]:
            if name in existing_names:
                print(f"  ↩️  Group exists: {name}")
                groups[name] = existing_names[name]
                continue
            data = self._post("/api/permissions/group", {"name": name})
            groups[name] = data["id"]
            print(f"  ✅ Created group: {name} id={data['id']}")

        # Grant view access to collection for both groups
        try:
            graph = self._get("/api/collection/graph")
            groups_graph = graph.get("groups", {})
            for gid in groups.values():
                key = str(gid)
                if key not in groups_graph:
                    groups_graph[key] = {}
                groups_graph[key][str(coll_id)] = "read"
            self._put("/api/collection/graph", {"groups": groups_graph, "revision": graph.get("revision", 0)})
            print("  ✅ Collection permissions updated")
        except Exception as e:
            print(f"  ⚠️  Could not update collection permissions: {e}")

        return groups

    # ── Query Caching ────────────────────────────────────────────────────────
    def enable_caching(self):
        """Enable global query caching in Metabase (server-side result cache).
        Correct settings for current Metabase versions:
          enable-query-caching  — master on/off switch
          query-caching-max-ttl — max seconds to cache (default 35 days; we use 5 min)
          query-caching-max-kb  — max result size to cache in KB
        """
        # Bulk update via PUT /api/setting is the most reliable approach
        payload = {
            "enable-query-caching": True,
            "query-caching-max-ttl": CACHE_TTL_SEC,  # 300 = 5 minutes
            "query-caching-max-kb":  2048,            # cache results up to 2 MB
        }
        try:
            self._put("/api/setting", payload)
            print(f"  ✅ Query caching enabled (TTL={CACHE_TTL_SEC}s, max-kb=2048)")
        except Exception:
            # Fallback: individual per-setting PUTs
            for key, value in payload.items():
                try:
                    self._put(f"/api/setting/{key}", {"value": value})
                    print(f"  ✅ {key} = {value}")
                except Exception as e:
                    print(f"  ⚠️  Could not set {key}: {e}")

    # ── Write Config ─────────────────────────────────────────────────────────
    def write_config(self, card_ids, db_id):
        OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
        config = {
            "_comment":     "Auto-generated by scripts/setup_metabase.py — do not edit manually",
            "_generated":   time.strftime("%Y-%m-%dT%H:%M:%S"),
            "_metabase_url": METABASE_URL,
            "_db_id":       db_id,
        }
        config.update({k: v for k, v in card_ids.items() if v is not None})
        OUTPUT_FILE.write_text(json.dumps(config, indent=2))
        print(f"\n📄 Card IDs written to: {OUTPUT_FILE}")

    # ── Main Run ─────────────────────────────────────────────────────────────
    def run(self):
        print("\n" + "═"*60)
        print("  BTRC QoS v4 — Metabase Setup")
        print("═"*60 + "\n")

        self.wait_for_ready()
        self.initial_setup_if_needed()
        self.login()

        print("\n▶ Database connection")
        db_id = self.get_or_create_database()

        print("\n▶ Collection")
        coll_id = self.get_or_create_collection()

        print("\n▶ Creating cards")
        card_ids = self.create_cards(db_id, coll_id)

        print("\n▶ Creating dashboards")
        self.create_dashboards(card_ids, coll_id)

        print("\n▶ Permission groups")
        self.setup_permission_groups(coll_id)

        print("\n▶ Query caching")
        self.enable_caching()

        self.write_config(card_ids, db_id)

        created = sum(1 for v in card_ids.values() if v)
        total   = len(ALL_CARDS)
        print(f"\n✅ Done — {created}/{total} cards configured\n")
        _print_summary(card_ids)


# ══════════════════════════════════════════════════════════════════════════════
# Dashboard Layout Specs
# ══════════════════════════════════════════════════════════════════════════════

def _regulatory_dashboard_spec(cids):
    return {
        "name":        "Regulatory Dashboard",
        "description": "SLA monitoring, regional drill-down, violation analysis",
        "tabs": [
            {
                "name": "R1 SLA Monitoring",
                "cards": [
                    {"key": "REG_R1_COMPLIANT",    "col": 0,  "row": 0, "w": 8, "h": 3},
                    {"key": "REG_R1_AT_RISK",       "col": 8,  "row": 0, "w": 8, "h": 3},
                    {"key": "REG_R1_VIOLATION",     "col": 16, "row": 0, "w": 8, "h": 3},
                    {"key": "REG_R1_ISP_SLA_TABLE", "col": 0,  "row": 3, "w": 24, "h": 10},
                ],
            },
            {
                "name": "R2 Regional Drill-Down",
                "cards": [
                    {"key": "REG_R2_DIV_PERF_SUMMARY", "col": 0,  "row": 0, "w": 12, "h": 8},
                    {"key": "REG_R2_DIV_VIOLATIONS",   "col": 12, "row": 0, "w": 12, "h": 8},
                    {"key": "REG_R2_ISP_BY_AREA",      "col": 0,  "row": 8, "w": 24, "h": 10},
                ],
            },
            {
                "name": "R3 Violation Analysis",
                "cards": [
                    {"key": "REG_R3_PENDING",   "col": 0,  "row": 0, "w": 8,  "h": 3},
                    {"key": "REG_R3_DISPUTED",  "col": 8,  "row": 0, "w": 8,  "h": 3},
                    {"key": "REG_R3_RESOLVED",  "col": 16, "row": 0, "w": 8,  "h": 3},
                    {"key": "REG_R3_TREND",     "col": 0,  "row": 3, "w": 14, "h": 8},
                    {"key": "REG_R3_GEO",       "col": 14, "row": 3, "w": 10, "h": 8},
                    {"key": "REG_R3_DETAIL",    "col": 0,  "row": 11,"w": 24, "h": 12},
                ],
            },
        ],
    }


def _executive_dashboard_spec(cids):
    return {
        "name":        "Executive Dashboard",
        "description": "National QoS scorecard, geographic intelligence, compliance overview",
        "tabs": [
            {
                "name": "E1 Performance Scorecard",
                "cards": [
                    {"key": "EXEC_E1_NATIONAL_SCORE", "col": 0,  "row": 0, "w": 6,  "h": 3},
                    {"key": "EXEC_E1_ISP_BY_CATEGORY","col": 6,  "row": 0, "w": 8,  "h": 8},
                    {"key": "EXEC_E1_ISP_PERFORMANCE","col": 0,  "row": 3, "w": 24, "h": 10},
                ],
            },
            {
                "name": "E2 Geographic Intelligence",
                "cards": [
                    {"key": "EXEC_E2_DIV_SUMMARY",   "col": 0, "row": 0, "w": 24, "h": 8},
                ],
            },
            {
                "name": "E3 Compliance Overview",
                "cards": [
                    {"key": "EXEC_E3_PENALTY",        "col": 0,  "row": 0, "w": 8,  "h": 3},
                    {"key": "EXEC_E3_VIOLATION_TYPE", "col": 8,  "row": 0, "w": 8,  "h": 8},
                    {"key": "EXEC_E3_VIOLATION_SEV",  "col": 16, "row": 0, "w": 8,  "h": 8},
                    {"key": "EXEC_E3_TREND",          "col": 0,  "row": 8, "w": 24, "h": 8},
                ],
            },
        ],
    }


# ══════════════════════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════════════════════

def _viz_settings(display):
    if display == "scalar":
        return {"scalar.field": None}
    if display in ("line", "bar"):
        return {"graph.dimensions": ["day"], "graph.metrics": ["cnt"]}
    if display == "pie":
        return {}
    return {}


def _print_summary(card_ids):
    print("┌─────────────────────────────────────────────────────────────┐")
    print("│  Card IDs — add to btrc-frontend/src/config/metabase_cards.json │")
    print("├───────────────────────────────────┬────────────────────────┤")
    for k, v in card_ids.items():
        status = str(v) if v else "FAILED"
        print(f"│  {k:<35} │ {status:<22} │")
    print("└───────────────────────────────────┴────────────────────────┘")


# ══════════════════════════════════════════════════════════════════════════════
# Entry point
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    try:
        MetabaseSetup().run()
    except KeyboardInterrupt:
        print("\n⚠️  Interrupted")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Setup failed: {e}")
        import traceback; traceback.print_exc()
        sys.exit(1)
