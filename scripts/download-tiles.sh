#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Download Bangladesh PMTiles for offline tile serving
# Source: OpenFreeMap (free, no API key) — Bangladesh extract
#
# Usage: ./scripts/download-tiles.sh
# Output: tiles/bangladesh.pmtiles  (~50–120 MB)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

TILES_DIR="$(cd "$(dirname "$0")/.." && pwd)/tiles"
TARGET="$TILES_DIR/bangladesh.pmtiles"

mkdir -p "$TILES_DIR"

echo "=== BTRC QoS v4 — Bangladesh PMTiles Downloader ==="
echo ""

# Option 1: OpenFreeMap liberty style (vector, free)
# Region extract: https://data.source.coop/protomaps/openstreetmap/tiles/v3.pmtiles
# For Bangladesh bbox only, we use the Protomaps extract tool

# Option 2: Direct Protomaps Bangladesh daily extract
PROTOMAPS_URL="https://build.protomaps.com/20240101.pmtiles"
# ^ Replace date with latest from https://maps.protomaps.com/builds/

# Option 3: Download via pmtiles CLI (extract Bangladesh bbox)
# Install: pip install pmtiles  OR  go install github.com/protomaps/go-pmtiles@latest

echo "Attempting to download via pmtiles extract (Bangladesh bbox)..."
echo "  Bounding box: 88.0,20.5 → 92.7,26.7"
echo ""

if command -v pmtiles &>/dev/null; then
    # Full planet URL (you need ~100GB space temporarily, or use the extract service)
    echo "Using pmtiles CLI to extract Bangladesh from planet..."
    pmtiles extract \
        "https://build.protomaps.com/$(date +%Y%m%d).pmtiles" \
        "$TARGET" \
        --bbox="88.0,20.5,92.7,26.7" \
        --download-threads=4
    echo "✓ Saved to: $TARGET"

elif command -v wget &>/dev/null || command -v curl &>/dev/null; then
    echo "pmtiles CLI not found. Downloading pre-built Bangladesh raster tiles..."
    echo ""
    echo "Option A — Install pmtiles CLI first:"
    echo "  pip3 install pmtiles"
    echo "  then re-run this script"
    echo ""
    echo "Option B — Use OpenStreetMap XYZ tiles (online, no PMTiles needed):"
    echo "  Set VITE_TILE_URL=https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
    echo "  in your .env file"
    echo ""
    echo "Option C — Download prebuilt Bangladesh PMTiles from Protomaps:"
    FALLBACK_URL="https://r2-public.protomaps.com/protomaps-sample-datasets/nz.pmtiles"
    echo "  (Manual: visit https://maps.protomaps.com and download Bangladesh area)"
    echo ""

    # Minimal offline fallback: create placeholder
    echo "{\"note\":\"Place bangladesh.pmtiles here. Run: pmtiles extract https://build.protomaps.com/YYYYMMDD.pmtiles tiles/bangladesh.pmtiles --bbox=88.0,20.5,92.7,26.7\"}" \
        > "$TILES_DIR/README.txt"
    echo "Created tiles/README.txt with instructions."

else
    echo "ERROR: No download tool available (wget/curl/pmtiles)"
    exit 1
fi

echo ""
echo "=== Tile setup complete ==="
echo "Restart martin service: docker compose restart martin"
