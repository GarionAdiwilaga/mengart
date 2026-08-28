#!/usr/bin/env bash
# ==============================================================================
# Mengart Production Automated Backup Script
# Creates transactional database dumps and compressed media storage archives
# with SHA-256 integrity verification and automated retention pruning.
# ==============================================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DB_CONTAINER="${DB_CONTAINER:-mengart_postgres}"
POSTGRES_USER="${POSTGRES_USER:-mengart}"
POSTGRES_DB="${POSTGRES_DB:-mengart_db}"
STORAGE_PATH="${STORAGE_ROOT_DIR:-./storage}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

mkdir -p "${BACKUP_DIR}"

echo "================================================================="
echo "📦 Starting Mengart Production Backup: ${TIMESTAMP}"
echo "================================================================="

# 1. PostgreSQL Transactional Backup
DB_DUMP_FILE="${BACKUP_DIR}/mengart_db_${TIMESTAMP}.sql.gz"
echo "-> Dumping PostgreSQL database from ${DB_CONTAINER}..."
if docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
  docker exec -t "${DB_CONTAINER}" pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" | gzip > "${DB_DUMP_FILE}"
else
  echo "⚠️ Container ${DB_CONTAINER} not found, attempting local pg_dump..."
  pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" | gzip > "${DB_DUMP_FILE}"
fi
echo "✓ Database dumped: ${DB_DUMP_FILE} ($(du -h "${DB_DUMP_FILE}" | cut -f1))"

# 2. Media Storage Backup
MEDIA_TAR_FILE="${BACKUP_DIR}/mengart_media_${TIMESTAMP}.tar.gz"
echo "-> Archiving media storage from ${STORAGE_PATH}..."
if [ -d "${STORAGE_PATH}" ]; then
  tar -czf "${MEDIA_TAR_FILE}" -C "$(dirname "${STORAGE_PATH}")" "$(basename "${STORAGE_PATH}")"
  echo "✓ Media storage archived: ${MEDIA_TAR_FILE} ($(du -h "${MEDIA_TAR_FILE}" | cut -f1))"
else
  echo "⚠️ Storage path ${STORAGE_PATH} does not exist, skipping media archive."
fi

# 3. Generate SHA-256 Integrity Checksums
MANIFEST_FILE="${BACKUP_DIR}/manifest_${TIMESTAMP}.sha256"
echo "-> Generating SHA-256 integrity manifest..."
cd "${BACKUP_DIR}"
sha256sum "$(basename "${DB_DUMP_FILE}")" > "${MANIFEST_FILE}"
if [ -f "${MEDIA_TAR_FILE}" ]; then
  sha256sum "$(basename "${MEDIA_TAR_FILE}")" >> "${MANIFEST_FILE}"
fi
cd - > /dev/null
echo "✓ Integrity checksums written to ${MANIFEST_FILE}"

# 4. Retention Policy: Prune backups older than RETENTION_DAYS
echo "-> Pruning backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -type f -name "mengart_*" -mtime "+${RETENTION_DAYS}" -delete
find "${BACKUP_DIR}" -type f -name "manifest_*" -mtime "+${RETENTION_DAYS}" -delete
echo "✓ Retention cleanup complete."

echo "================================================================="
echo "🎉 Mengart Backup Finished Successfully: ${TIMESTAMP}"
echo "================================================================="
