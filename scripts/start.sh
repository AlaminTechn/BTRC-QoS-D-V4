#!/usr/bin/env bash
# start.sh — Full stack startup for BTRC QoS Dashboard v4
# Usage:  bash scripts/start.sh [--skip-setup] [--skip-data]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SKIP_SETUP=false
SKIP_DATA=false
for arg in "$@"; do
  case $arg in
    --skip-setup) SKIP_SETUP=true ;;
    --skip-data)  SKIP_DATA=true  ;;
  esac
done

echo "═══════════════════════════════════════════"
echo "  BTRC QoS Dashboard v4 — Startup"
echo "═══════════════════════════════════════════"

[ ! -f .env ] && cp .env.example .env && echo "✅ Created .env from .env.example"

# ── 0. Stop any previously running BTRC v4 containers ────────────────────
echo "⏹  Stopping previous containers (if any)..."
docker compose down --remove-orphans 2>/dev/null || true

# ── 1. Start infrastructure ───────────────────────────────────────────────
docker compose up -d timescaledb metabase martin frontend
echo "⏳ Waiting for TimescaleDB..."
for i in $(seq 1 30); do
  docker compose exec -T timescaledb pg_isready -U btrc_admin -d btrc_qos_poc -q 2>/dev/null && \
    echo "✅ TimescaleDB ready" && break
  sleep 3
done

# ── 2. Load POC data ──────────────────────────────────────────────────────
if [ "$SKIP_DATA" = "false" ]; then
  echo "▶ Loading POC data..."
  bash scripts/load-data.sh
fi

# ── 3. Run Metabase setup (cards, dashboards, permissions, caching) ───────
if [ "$SKIP_SETUP" = "false" ]; then
  echo "▶ Running Metabase setup (waits for Metabase to be ready)..."
  python3 -c "import requests" 2>/dev/null || pip3 install requests -q
  python3 scripts/setup_metabase.py
  echo "✅ Metabase setup complete"
fi

# ── 4. Frontend ───────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════"
echo "  Services:"
echo "  Frontend:    http://localhost:5173"
echo "  Metabase:    http://localhost:3000"
echo "  TimescaleDB: localhost:${DB_PORT:-5433}"
echo "  Martin:      http://localhost:3001"
echo "═══════════════════════════════════════════"
echo ""
echo "Run frontend:  cd btrc-frontend && yarn install && yarn dev"
echo "No tiles?      bash scripts/download-tiles.sh"
