import { lookup } from "node:dns/promises";
import net from "node:net";

/** Địa chỉ nội bộ / loopback / link-local / metadata đám mây: máy chủ hub không được gọi tới (chống SSRF). */
function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    const c = Number(ip.split(".")[2]);
    return (
      a === 10 || a === 127 || a === 0 || a >= 224 ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) || (a === 192 && b === 0 && c === 0)
    );
  }
  const v = ip.toLowerCase();
  // IPv4 nhúng trong IPv6: URL chuẩn hoá "::ffff:127.0.0.1" thành dạng hex "::ffff:7f00:1" nên phải xử lý cả hai.
  const dotted = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return isPrivateIp(dotted[1]);
  const hex = v.match(/^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1], 16), lo = parseInt(hex[2], 16);
    return isPrivateIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || /^fe[89abcdef]/.test(v) || v.startsWith("2002:") || v.startsWith("64:ff9b:");
}

/** Chỉ https (hoặc http nếu HUB_ALLOW_PRIVATE_WEBHOOKS=1) và đích phải phân giải ra địa chỉ công cộng. Ném lỗi tiếng Việt nếu không. */
export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  const allowPrivate = process.env.HUB_ALLOW_PRIVATE_WEBHOOKS === "1";
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("Địa chỉ không hợp lệ");
  }
  if (u.protocol !== "https:" && !(allowPrivate && u.protocol === "http:")) throw new Error("Chỉ chấp nhận địa chỉ https://");
  if (u.username || u.password) throw new Error("Địa chỉ không được chứa tài khoản/mật khẩu");
  if (allowPrivate) return u;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new Error("Không phân giải được tên miền");
  if (addrs.some((a) => isPrivateIp(a.address))) throw new Error("Không được gọi tới địa chỉ nội bộ");
  return u;
}
