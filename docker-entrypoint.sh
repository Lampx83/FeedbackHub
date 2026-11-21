#!/bin/sh
# Mỗi lần khởi động: áp migration (chỉ thêm, an toàn chạy lại), tạo tài khoản quản trị đầu tiên nếu chưa có, rồi chạy.
set -e
node_modules/.bin/prisma migrate deploy
node_modules/.bin/tsx prisma/seed.ts || echo "Cảnh báo: bước seed lỗi, bỏ qua (tạo tài khoản quản trị thủ công nếu cần)."
exec node_modules/.bin/next start
