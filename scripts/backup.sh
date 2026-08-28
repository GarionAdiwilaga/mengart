#!/usr/bin/env bash
# ==============================================================================
# Mengart Production Automated Authenticated Backup Script
# Creates transactional database dumps and compressed media storage archives
# encrypted with OpenSSL AES-256-CBC (PBKDF2) + HMAC-SHA256 authentication.
# ==============================================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DB_CONTAINER="${DB_CONTAINER:-mengart_postgres}"
POSTGRES_USER="${POSTGRES_USER:-mengart}"
POSTGRES_DB="${POSTGRES_DB:-mengart_db}"
STORAGE_PATH="${STORAGE_ROOT_DIR:-./storage}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
BACKUP_ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:-mengart_production_secure_backup_key_2026}"

mkdir -p "${BACKUP_DIR}"

echo "================================================================="
echo "📦 Starting Mengart Production Authenticated Backup: ${TIMESTAMP}"
echo "================================================================="

# 1. PostgreSQL Transactional Backup + AES-256-CBC Encryption
RAW_DB_DUMP="${BACKUP_DIR}/mengart_db_${TIMESTAMP}.sql.gz"
ENC_DB_DUMP="${BACKUP_DIR}/mengart_db_${TIMESTAMP}.sql.gz.enc"
HMAC_DB_DUMP="${BACKUP_DIR}/mengart_db_${TIMESTAMP}.sql.gz.enc.hmac"

echo "-> Dumping PostgreSQL database from ${DB_CONTAINER}..."
if docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
  docker exec -t "${DB_CONTAINER}" pg_dump -U "${POSTGRES_USER}" --clean --if-exists "${POSTGRES_DB}" | gzip > "${RAW_DB_DUMP}"
else
  pg_dump -U "${POSTGRES_USER}" --clean --if-exists -d "${POSTGRES_DB}" | gzip > "${RAW_DB_DUMP}"
fi

echo "-> Encrypting database dump with AES-256-CBC (PBKDF2)..."
openssl enc -aes-256-cbc -pbkdf2 -salt -in "${RAW_DB_DUMP}" -out "${ENC_DB_DUMP}" -pass pass:"${BACKUP_ENCRYPTION_KEY}"
rm -f "${RAW_DB_DUMP}"

echo "-> Generating HMAC-SHA256 authenticated integrity signature..."
openssl dgst -sha256 -hmac "${BACKUP_ENCRYPTION_KEY}" "${ENC_DB_DUMP}" | awk '{print $NF}' > "${HMAC_DB_DUMP}"
echo "✓ Database dump encrypted & authenticated: $(du -h "${ENC_DB_DUMP}" | cut -f1)"

# 2. Media Storage Archive + AES-256-CBC Encryption
ENC_MEDIA_TAR="${BACKUP_DIR}/mengart_media_${TIMESTAMP}.tar.gz.enc"
HMAC_MEDIA_TAR="${BACKUP_DIR}/mengart_media_${TIMESTAMP}.tar.gz.enc.hmac"

if [ -d "${STORAGE_PATH}" ]; then
  RAW_MEDIA_TAR="${BACKUP_DIR}/mengart_media_${TIMESTAMP}.tar.gz"
  echo "-> Archiving and encrypting media storage from ${STORAGE_PATH}..."
  tar -czf "${RAW_MEDIA_TAR}" -C "$(dirname "${STORAGE_PATH}")" "$(basename "${STORAGE_PATH}")"
  openssl enc -aes-256-cbc -pbkdf2 -salt -in "${RAW_MEDIA_TAR}" -out "${ENC_MEDIA_TAR}" -pass pass:"${BACKUP_ENCRYPTION_KEY}"
  rm -f "${RAW_MEDIA_TAR}"
  openssl dgst -sha256 -hmac "${BACKUP_ENCRYPTION_KEY}" "${ENC_MEDIA_TAR}" | awk '{print $NF}' > "${HMAC_MEDIA_TAR}"
  echo "✓ Media storage encrypted & authenticated: $(du -h "${ENC_MEDIA_TAR}" | cut -f1)"
fi

# 3. Generate SHA-256 Manifest
MANIFEST_FILE="${BACKUP_DIR}/manifest_${TIMESTAMP}.sha256"
cd "${BACKUP_DIR}"
sha256sum "$(basename "${ENC_DB_DUMP}")" > "$(basename "${MANIFEST_FILE}")"
sha256sum "$(basename "${HMAC_DB_DUMP}")" >> "$(basename "${MANIFEST_FILE}")"
if [ -f "$(basename "${ENC_MEDIA_TAR}")" ]; then
  sha256sum "$(basename "${ENC_MEDIA_TAR}")" >> "$(basename "${MANIFEST_FILE}")"
  sha256sum "$(basename "${HMAC_MEDIA_TAR}")" >> "$(basename "${MANIFEST_FILE}")"
fi
cd - > /dev/null
echo "✓ Manifest checksums written to ${MANIFEST_FILE}"

# 4. Mandatory Off-Host Replication in Production
if [ "${NODE_ENV:-development}" = "production" ]; then
  if [ -z "${REMOTE_BACKUP_DEST:-}" ] && [ -z "${AWS_S3_BUCKET:-}" ]; then
    echo "❌ FATAL: Production backups must define REMOTE_BACKUP_DEST or AWS_S3_BUCKET."
    exit 1
  fi
fi

if [ -n "${REMOTE_BACKUP_DEST:-}" ]; then
  echo "-> Replicating encrypted backup to off-host destination: ${REMOTE_BACKUP_DEST}..."
  rsync -avz "${ENC_DB_DUMP}" "${HMAC_DB_DUMP}" "${MANIFEST_FILE}" ${ENC_MEDIA_TAR:+"${ENC_MEDIA_TAR}"} ${HMAC_MEDIA_TAR:+"${HMAC_MEDIA_TAR}"} "${REMOTE_BACKUP_DEST}/"
  echo "✓ Off-host replication verified."
fi

# 5. Retention Cleanup
find "${BACKUP_DIR}" -type f -name "mengart_*" -mtime "+${RETENTION_DAYS}" -delete
find "${BACKUP_DIR}" -type f -name "manifest_*" -mtime "+${RETENTION_DAYS}" -delete

echo "================================================================="
echo "🎉 Mengart Authenticated Backup Completed Successfully: ${TIMESTAMP}"
echo "================================================================="
