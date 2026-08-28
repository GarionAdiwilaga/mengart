#!/usr/bin/env bash
# ==============================================================================
# Mengart Production Automated Restore Script
# Restores PostgreSQL database dump and media storage archive with SHA-256 validation.
# ==============================================================================

set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <timestamp_or_manifest_file>"
  echo "Example: $0 20260828_120000"
  exit 1
fi

TARGET="$1"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
DB_CONTAINER="${DB_CONTAINER:-mengart_postgres}"
POSTGRES_USER="${POSTGRES_USER:-mengart}"
POSTGRES_DB="${POSTGRES_DB:-mengart_db}"
STORAGE_PATH="${STORAGE_ROOT_DIR:-./storage}"

if [[ "$TARGET" == *.sha256 ]]; then
  MANIFEST_FILE="$TARGET"
else
  MANIFEST_FILE="${BACKUP_DIR}/manifest_${TARGET}.sha256"
fi

if [ ! -f "${MANIFEST_FILE}" ]; then
  echo "❌ Manifest file not found: ${MANIFEST_FILE}"
  exit 1
fi

echo "================================================================="
echo "🔄 Starting Mengart Restoration Process"
echo "================================================================="

# 1. Verify SHA-256 Checksums
echo "-> Verifying backup archive integrity..."
cd "$(dirname "${MANIFEST_FILE}")"
sha256sum -c "$(basename "${MANIFEST_FILE}")"
cd - > /dev/null
echo "✓ All backup archive checksums verified valid."

TIMESTAMP=$(basename "${MANIFEST_FILE}" | sed -E 's/manifest_([0-9_]+)\.sha256/\1/')
DB_DUMP_FILE="${BACKUP_DIR}/mengart_db_${TIMESTAMP}.sql.gz"
MEDIA_TAR_FILE="${BACKUP_DIR}/mengart_media_${TIMESTAMP}.tar.gz"

# 2. Database Restoration
if [ -f "${DB_DUMP_FILE}" ]; then
  echo "-> Restoring PostgreSQL database from ${DB_DUMP_FILE}..."
  if docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    gunzip -c "${DB_DUMP_FILE}" | docker exec -i "${DB_CONTAINER}" psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"
  else
    gunzip -c "${DB_DUMP_FILE}" | psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"
  fi
  echo "✓ Database restored successfully."
fi

# 3. Media Storage Restoration
if [ -f "${MEDIA_TAR_FILE}" ]; then
  echo "-> Restoring media storage to ${STORAGE_PATH}..."
  tar -xzf "${MEDIA_TAR_FILE}" -C "$(dirname "${STORAGE_PATH}")"
  echo "✓ Media storage restored successfully."
fi

echo "================================================================="
echo "🎉 Mengart Restoration Completed Successfully!"
echo "================================================================="
