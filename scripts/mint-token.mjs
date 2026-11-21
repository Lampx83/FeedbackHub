#!/usr/bin/env node
/**
 * Ký token người dùng để thử API (đóng vai ứng dụng chủ).
 *   node scripts/mint-token.mjs <slug> <signingSecret> <uid> "<Tên>" [role] [phút]
 * Ứng dụng thật làm việc này trong máy chủ của nó, KHÔNG BAO GIỜ trong trình duyệt.
 */
import { SignJWT } from "jose";

const [slug, secret, uid, name, role = "STAFF", minutes = "10"] = process.argv.slice(2);
if (!slug || !secret || !uid || !name) {
  console.error('Dùng: node scripts/mint-token.mjs <slug> <signingSecret> <uid> "<Tên>" [role] [phút]');
  process.exit(1);
}
const token = await new SignJWT({ prj: slug, uid, name, role })
  .setProtectedHeader({ alg: "HS256" })
  .setAudience("feedback-hub")
  .setIssuedAt()
  .setExpirationTime(`${minutes}m`)
  .sign(new TextEncoder().encode(secret));
console.log(token);
