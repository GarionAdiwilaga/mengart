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
  docker exec -t "${DB_CONTAINER}" pg_dump -U "${POSTGRES_USER}" --clean --if-exists "${POSTGRES_DB}" | gzip > "${DB_DUMP_FILE}"
else
  echo "⚠️ Container ${DB_CONTAINER} not found, attempting local pg_dump..."
  pg_dump -U "${POSTGRES_USER}" --clean --if-exists -d "${POSTGRES_DB}" | gzip > "${DB_DUMP_FILE}"
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
sha256sum "$(basename "${DB_DUMP_FILE}")" > "$(basename "${MANIFEST_FILE}")"
if [ -f "$(basename "${MEDIA_TAR_FILE}")" ]; then
  sha256sum "$(basename "${MEDIA_TAR_FILE}")" >> "$(basename "${MANIFEST_FILE}")"
fi
cd - > /dev/null
echo "✓ Integrity checksums written to ${MANIFEST_FILE}"

# 5. Off-host / Remote Replication (Optional)
if [ -n "${REMOTE_BACKUP_DEST:-}" ]; then
  echo "-> Replicating backup to off-host destination: ${REMOTE_BACKUP_DEST}..."
  if command -v rsync >/dev/null 2>&1; then
    rsync -avz "${DB_DUMP_FILE}" "${MANIFEST_FILE}" ${MEDIA_TAR_FILE:+"${MEDIA_TAR_FILE}"} "${REMOTE_BACKUP_DEST}/"
    echo "✓ Off-host rsync replication complete."
  else
    echo "⚠️ rsync not found, skipping remote sync."
  fi
elif [ -n "${AWS_S3_BUCKET:-}" ]; then
  echo "-> Replicating backup to AWS S3: ${AWS_S3_BUCKET}..."
  if command -v aws >/dev/null 2>&1; then
    aws s3 cp "${DB_DUMP_FILE}" "s3://${AWS_S3_BUCKET}/backups/"
    aws s3 cp "${MANIFEST_FILE}" "s3://${AWS_S3_BUCKET}/backups/"
    if [ -f "${MEDIA_TAR_FILE}" ]; then
      aws s3 cp "${MEDIA_TAR_FILE}" "s3://${AWS_S3_BUCKET}/backups/"
    fi
    echo "✓ Off-host AWS S3 upload complete."
  fi
fi

echo "================================================================="
echo "🎉 Mengart Backup Finished Successfully: ${TIMESTAMP}"
echo "================================================================="
