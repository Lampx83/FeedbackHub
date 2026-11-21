#!/bin/sh
# Sao lưu Feedback Hub: DB (pg_dump nén) + thư mục tệp đính kèm. Chạy từ thư mục chứa docker-compose.yml.
# Cron mỗi đêm:  30 1 * * *  cd /opt/feedbackhub && ./deploy/backup.sh >> backup.log 2>&1
# ⚠️ Bản sao lưu nằm cùng máy chủ KHÔNG cứu được khi mất máy chủ — hãy đồng bộ thư mục $DEST sang nơi khác (rsync/rclone/S3).
set -eu
DEST="${BACKUP_DIR:-$HOME/backups/feedbackhub}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DEST"

docker compose exec -T db pg_dump -U hub -d feedbackhub | gzip > "$DEST/db-$STAMP.sql.gz"
gzip -t "$DEST/db-$STAMP.sql.gz"   # kiểm tra tệp không hỏng

docker compose exec -T app tar -C /app -cz data > "$DEST/files-$STAMP.tar.gz"

find "$DEST" -name 'db-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
find "$DEST" -name 'files-*.tar.gz' -mtime +"$KEEP_DAYS" -delete
echo "[$(date '+%F %T')] Đã sao lưu: $DEST/db-$STAMP.sql.gz, files-$STAMP.tar.gz"
