#!/bin/bash
# Runs once on fresh volume — creates the Metabase metadata database.
# CREATE DATABASE cannot run inside a transaction (.sql files run in one),
# so this must be a .sh init script.
set -e

echo ">>> [init] Creating metabase_app database..."
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "CREATE DATABASE metabase_app OWNER \"$POSTGRES_USER\";"
echo ">>> [init] metabase_app created."
