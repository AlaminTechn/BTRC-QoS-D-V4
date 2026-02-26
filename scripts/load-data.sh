#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Load POC v2.11 data into TimescaleDB
# Usage: ./scripts/load-data.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
POC_DIR="$ROOT/dummy_data/poc_data_v2.11"
SCHEMA="$POC_DIR/poc_schema_v2.11.sql"

# Load .env
[ -f "$ROOT/.env" ] && source "$ROOT/.env"
DB_USER="${DB_USER:-btrc_admin}"
DB_PASSWORD="${DB_PASSWORD:-btrc_poc_2026}"
DB_NAME="${DB_NAME:-btrc_qos_poc}"
DB_PORT="${DB_PORT:-5433}"
DB_HOST="${DB_HOST:-localhost}"

export PGPASSWORD="$DB_PASSWORD"
PSQL="psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME"

echo "=== BTRC QoS v4 — POC Data Loader ==="
echo "  Database: $DB_NAME @ $DB_HOST:$DB_PORT"
echo "  Data dir: $POC_DIR"
echo ""

# 1. Apply schema
echo "[1/3] Applying schema..."
$PSQL -f "$SCHEMA" 2>&1 | grep -E "ERROR|CREATE|ALTER|INSERT" | head -20
echo "  ✓ Schema applied"

# 2. Run Python loader
echo "[2/3] Loading JSON data..."
cd "$POC_DIR"
python3 load_poc_data.py \
    --dir . \
    --host "$DB_HOST" \
    --port "$DB_PORT" \
    --user "$DB_USER" \
    --password "$DB_PASSWORD" \
    --db "$DB_NAME" \
    2>&1 | tail -30

echo "  ✓ Data loaded"

# 3. Verify
echo "[3/3] Verifying row counts..."
$PSQL -c "
SELECT tablename, n_live_tup
FROM pg_stat_user_tables
WHERE n_live_tup > 0
ORDER BY n_live_tup DESC
LIMIT 15;
"

echo ""
echo "=== Load complete! ==="
echo "Connect Metabase to: postgresql://$DB_USER:***@localhost:$DB_PORT/$DB_NAME"
