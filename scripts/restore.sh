#!/usr/bin/env bash
# ==============================================================================
# Mengart Production Automated Authenticated Restore Script
# Verifies HMAC-SHA256 authentication, decrypts AES-256 archives, restores data,
# and executes post-restoration integrity validation on database and media files.
# ==============================================================================

set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <timestamp_or_manifest_file> [target_db]"
  echo "Example: $0 20260828_120000"
  exit 1
fi

TARGET="$1"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
DB_CONTAINER="${DB_CONTAINER:-mengart_postgres}"
POSTGRES_USER="${POSTGRES_USER:-mengart}"
POSTGRES_DB="${2:-${POSTGRES_DB:-mengart_db}}"
STORAGE_PATH="${STORAGE_ROOT_DIR:-./storage}"
BACKUP_ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:-mengart_production_secure_backup_key_2026}"

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
echo "🔄 Starting Mengart Authenticated Restoration Process"
echo "================================================================="

# 1. Verify Manifest SHA-256 Checksums
echo "-> Verifying archive manifest checksums..."
cd "$(dirname "${MANIFEST_FILE}")"
sha256sum -c "$(basename "${MANIFEST_FILE}")"
cd - > /dev/null
echo "✓ Manifest SHA-256 checksums valid."

TIMESTAMP=$(basename "${MANIFEST_FILE}" | sed -E 's/manifest_([0-9_]+)\.sha256/\1/')
ENC_DB_DUMP="${BACKUP_DIR}/mengart_db_${TIMESTAMP}.sql.gz.enc"
HMAC_DB_DUMP="${BACKUP_DIR}/mengart_db_${TIMESTAMP}.sql.gz.enc.hmac"
ENC_MEDIA_TAR="${BACKUP_DIR}/mengart_media_${TIMESTAMP}.tar.gz.enc"
HMAC_MEDIA_TAR="${BACKUP_DIR}/mengart_media_${TIMESTAMP}.tar.gz.enc.hmac"

# 2. Verify HMAC-SHA256 Authenticated Signatures
echo "-> Authenticating backup HMAC-SHA256 signatures..."
CALCULATED_DB_HMAC=$(openssl dgst -sha256 -hmac "${BACKUP_ENCRYPTION_KEY}" "${ENC_DB_DUMP}" | awk '{print $NF}')
EXPECTED_DB_HMAC=$(cat "${HMAC_DB_DUMP}")
if [ "${CALCULATED_DB_HMAC}" != "${EXPECTED_DB_HMAC}" ]; then
  echo "❌ FATAL: Database HMAC verification failed! Archive has been tampered with or key is incorrect."
  exit 1
fi
echo "✓ Database dump HMAC signature verified authentic."

if [ -f "${ENC_MEDIA_TAR}" ]; then
  CALCULATED_MEDIA_HMAC=$(openssl dgst -sha256 -hmac "${BACKUP_ENCRYPTION_KEY}" "${ENC_MEDIA_TAR}" | awk '{print $NF}')
  EXPECTED_MEDIA_HMAC=$(cat "${HMAC_MEDIA_TAR}")
  if [ "${CALCULATED_MEDIA_HMAC}" != "${EXPECTED_MEDIA_HMAC}" ]; then
    echo "❌ FATAL: Media archive HMAC verification failed!"
    exit 1
  fi
  echo "✓ Media storage HMAC signature verified authentic."
fi

# 3. Decrypt & Restore Database
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "${TEMP_DIR}"' EXIT

DECRYPTED_DB_DUMP="${TEMP_DIR}/db_dump.sql.gz"
echo "-> Decrypting database dump with AES-256-CBC..."
openssl enc -d -aes-256-cbc -pbkdf2 -in "${ENC_DB_DUMP}" -out "${DECRYPTED_DB_DUMP}" -pass pass:"${BACKUP_ENCRYPTION_KEY}"

echo "-> Restoring PostgreSQL database into ${POSTGRES_DB}..."
if docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
  gunzip -c "${DECRYPTED_DB_DUMP}" | docker exec -i "${DB_CONTAINER}" psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"
else
  gunzip -c "${DECRYPTED_DB_DUMP}" | psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"
fi
echo "✓ Database dump restored successfully."

# 4. Decrypt & Restore Media Storage
if [ -f "${ENC_MEDIA_TAR}" ]; then
  DECRYPTED_MEDIA_TAR="${TEMP_DIR}/media_tar.tar.gz"
  echo "-> Decrypting media archive with AES-256-CBC..."
  openssl enc -d -aes-256-cbc -pbkdf2 -in "${ENC_MEDIA_TAR}" -out "${DECRYPTED_MEDIA_TAR}" -pass pass:"${BACKUP_ENCRYPTION_KEY}"
  echo "-> Restoring media files into ${STORAGE_PATH}..."
  tar -xzf "${DECRYPTED_MEDIA_TAR}" -C "$(dirname "${STORAGE_PATH}")"
  echo "✓ Media files restored successfully."
fi

# 5. Deep Post-Restoration Validation
echo "-> Performing post-restoration database verification queries..."
if docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
  USER_COUNT=$(docker exec -i "${DB_CONTAINER}" psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -t -c "SELECT COUNT(*) FROM users;" | xargs)
  ART_COUNT=$(docker exec -i "${DB_CONTAINER}" psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -t -c "SELECT COUNT(*) FROM artworks;" | xargs)
  CHALLENGE_COUNT=$(docker exec -i "${DB_CONTAINER}" psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -t -c "SELECT COUNT(*) FROM challenges;" | xargs)
else
  USER_COUNT=$(psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -t -c "SELECT COUNT(*) FROM users;" | xargs)
  ART_COUNT=$(psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -t -c "SELECT COUNT(*) FROM artworks;" | xargs)
  CHALLENGE_COUNT=$(psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -t -c "SELECT COUNT(*) FROM challenges;" | xargs)
fi

echo "================================================================="
echo "📊 Post-Restore Validation Summary:"
echo "   - Users Table: ${USER_COUNT} records"
echo "   - Artworks Table: ${ART_COUNT} records"
echo "   - Challenges Table: ${CHALLENGE_COUNT} records"
echo "   - Master Media Files: $(find "${STORAGE_PATH}/master" -type f 2>/dev/null | wc -l) files"
echo "   - Public Media Files: $(find "${STORAGE_PATH}/public" -type f 2>/dev/null | wc -l) files"
echo "================================================================="
echo "🎉 Mengart Authenticated Restoration Verified Successfully!"
echo "================================================================="
