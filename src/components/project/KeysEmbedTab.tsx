"use client";

import { useState, useSyncExternalStore } from "react";
import { api } from "../api";
import { IssueKeyDialog, KeyTable, type KeyRow } from "../KeysBoard";
import { AddButton, ConfirmDialog } from "../ui/Modal";
import { SecretDialog } from "../ui/SecretDialog";
import { Alert, Button, Card, CodeBlock, CopyButton, EmptyState, Spinner, Tabs, Toolbar } from "../ui/primitives";
import type { ProjectData } from "./types";

const subscribe = () => () => {};
const browserOrigin = () => window.location.origin;
const serverOrigin = () => "";

export function KeysEmbedTab({ project, hubUrl, reloadKeys }: { project: ProjectData; hubUrl: string; reloadKeys: () => Promise<void> }) {
  return (
    <div className="space-y-8">
      <WorkerKeys project={project} reloadKeys={reloadKeys} />
      <SigningSecret project={project} />
      <Embed project={project} hubUrl={hubUrl} />
    </div>
  );
}

function SectionTitle({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-3">
      <h2 className="text-base font-semibold">{title}</h2>
      {children ? <p className="mt-1 text-sm leading-relaxed text-muted">{children}</p> : null}
    </div>
  );
}

function WorkerKeys({ project, reloadKeys }: { project: ProjectData; reloadKeys: () => Promise<void> }) {
  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<KeyRow | null>(null);
  return (
    <section>
      <SectionTitle title="Khoá worker">Worker là tiến trình tự nhận và xử lý góp ý của riêng dự án này. Khoá chỉ hiện một lần khi cấp; hub chỉ lưu bản băm.</SectionTitle>
      <Toolbar right={<AddButton onClick={() => setIssuing(true)}>Cấp khoá worker</AddButton>} />
      {project.keys.length === 0 ? <EmptyState title="Chưa có khoá worker nào" /> : <KeyTable keys={project.keys} onRevoke={setRevoking} />}

      <IssueKeyDialog
        open={issuing}
        onClose={() => setIssuing(false)}
        endpoint={`/api/admin/projects/${project.slug}/keys`}
        title="Cấp khoá worker"
        onIssued={(k) => {
          setIssuing(false);
          setIssued(k);
          void reloadKeys();
        }}
      />
      <SecretDialog
        open={!!issued}
        onClose={() => setIssued(null)}
        title="Khoá worker mới"
        value={issued ?? ""}
        warning="Khoá này chỉ hiện MỘT LẦN. Đóng hộp thoại là không xem lại được — hãy sao chép và đặt vào cấu hình của worker."
        note={
          <>
            Worker gửi khoá trong header <code className="font-mono">Authorization: Bearer …</code>. Khoá chỉ dùng được cho dự án <span className="font-mono">{project.slug}</span>.
          </>
        }
      />
      <ConfirmDialog
        open={!!revoking}
        danger
        title="Thu hồi khoá worker"
        message={
          <>
            Khoá <strong>{revoking?.label}</strong> ({revoking?.prefix}…) sẽ ngừng dùng được ngay; worker đang chạy với khoá này sẽ báo lỗi cho tới khi bạn cấp khoá mới.
          </>
        }
        confirmLabel="Thu hồi khoá"
        onCancel={() => setRevoking(null)}
        onConfirm={async () => {
          const r = await api(`/api/admin/keys/${revoking!.id}`, { method: "DELETE" });
          if (!r.ok) return r.error;
          setRevoking(null);
          void reloadKeys();
        }}
      />
    </section>
  );
}

function SigningSecret({ project }: { project: ProjectData }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);

  async function reveal() {
    setBusy(true);
    setError(null);
    const r = await api<{ signingSecret: string }>(`/api/admin/projects/${project.slug}/secret`);
    setBusy(false);
    if (r.ok) setSecret(r.data.signingSecret);
    else setError(r.error);
  }

  return (
    <section>
      <SectionTitle title="Khoá ký token">
        Ứng dụng của bạn dùng khoá này để ký token cho người dùng (xem đoạn mã bên dưới). Đặt trong biến môi trường của MÁY CHỦ ứng dụng, tuyệt đối không đưa lên trình duyệt hay commit vào mã nguồn.
      </SectionTitle>
      <Card className="p-4">
        {secret ? (
          <div className="space-y-2">
            <div className="flex items-stretch gap-2">
              <code className="min-w-0 flex-1 select-all break-all rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-[13px]">{secret}</code>
              <CopyButton text={secret} size="md" />
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSecret(null)}>
              Ẩn khoá
            </Button>
          </div>
        ) : (
          <Button variant="secondary" onClick={reveal} disabled={busy}>
            {busy ? <Spinner /> : null}
            Hiện khoá ký token
          </Button>
        )}
        {error ? <Alert tone="error" className="mt-3">{error}</Alert> : null}
        <div className="mt-4 border-t border-line pt-4">
          <Alert tone="warn">Đổi khoá làm MỌI token đã ký bằng khoá cũ hỏng ngay: nút góp ý trên ứng dụng sẽ ngừng hoạt động cho tới khi bạn cập nhật khoá mới vào máy chủ ứng dụng.</Alert>
          <Button variant="danger" className="mt-3" onClick={() => setRotating(true)}>
            Đổi khoá ký token…
          </Button>
        </div>
      </Card>

      <ConfirmDialog
        open={rotating}
        danger
        title="Đổi khoá ký token?"
        message="Token cũ sẽ hỏng ngay lập tức. Hãy chuẩn bị cập nhật khoá mới vào cấu hình máy chủ của ứng dụng."
        requireText={project.slug}
        confirmLabel="Đổi khoá"
        onCancel={() => setRotating(false)}
        onConfirm={async () => {
          const r = await api<{ signingSecret: string }>(`/api/admin/projects/${project.slug}/rotate-secret`, { method: "POST", body: {} });
          if (!r.ok) return r.error;
          setRotating(false);
          setSecret(null);
          setFresh(r.data.signingSecret);
        }}
      />
      <SecretDialog
        open={!!fresh}
        onClose={() => setFresh(null)}
        title="Khoá ký token mới"
        value={fresh ?? ""}
        warning="Khoá cũ đã hỏng. Cập nhật khoá mới này vào máy chủ của ứng dụng ngay (biến môi trường), không đặt ở trình duyệt."
      />
    </section>
  );
}

type Lang = "script" | "node" | "python" | "php";

function Embed({ project, hubUrl }: { project: ProjectData; hubUrl: string }) {
  const origin = useSyncExternalStore(subscribe, browserOrigin, serverOrigin);
  const [lang, setLang] = useState<Lang>("script");
  const hub = hubUrl || origin || "https://địa-chỉ-hub";
  const slug = project.slug;

  const snippets: Record<Lang, { label: string; code: string }> = {
    script: {
      label: "Thẻ <script> (đặt trong trang HTML của ứng dụng)",
      code: `<script src="${hub}/widget.js" data-project="${slug}" data-token-url="/api/feedback-token" defer></script>`,
    },
    node: {
      label: "Node.js — điểm cuối trả token (npm i jose)",
      code: `import { SignJWT } from "jose";

// Khoá ký lấy từ biến môi trường của máy chủ, KHÔNG đặt trong mã chạy ở trình duyệt.
const secret = new TextEncoder().encode(process.env.FEEDBACK_HUB_SECRET);

// Ví dụ với Express: GET /api/feedback-token (chỉ cho người đã đăng nhập)
app.get("/api/feedback-token", requireLogin, async (req, res) => {
  const user = req.user;
  const token = await new SignJWT({
    prj: "${slug}",
    uid: String(user.id),
    name: user.fullName,
    role: user.role,       // tuỳ chọn: quyết định quyền gửi/quản trị
    email: user.email,     // tuỳ chọn
  })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("feedback-hub")
    .setIssuedAt()
    .setExpirationTime("10m") // hub từ chối token sống quá 24 giờ
    .sign(secret);
  res.json({ token });
});`,
    },
    python: {
      label: "Python — điểm cuối trả token (pip install pyjwt)",
      code: `import os, time
import jwt  # PyJWT

SECRET = os.environ["FEEDBACK_HUB_SECRET"]  # khoá ký, chỉ ở máy chủ

def feedback_token(user) -> str:
    now = int(time.time())
    return jwt.encode(
        {
            "prj": "${slug}",
            "uid": str(user.id),
            "name": user.full_name,
            "role": user.role,      # tuỳ chọn
            "email": user.email,    # tuỳ chọn
            "aud": "feedback-hub",
            "iat": now,
            "exp": now + 10 * 60,   # hub từ chối token sống quá 24 giờ
        },
        SECRET,
        algorithm="HS256",
    )

# Ví dụ Flask: trả {"token": "..."} cho người đã đăng nhập
# @app.get("/api/feedback-token")
# @login_required
# def token():
#     return {"token": feedback_token(current_user)}`,
    },
    php: {
      label: "PHP — điểm cuối trả token (không cần thư viện)",
      code: `<?php
function b64url(string $d): string {
    return rtrim(strtr(base64_encode($d), '+/', '-_'), '=');
}

function feedbackToken(array $user): string {
    $secret = getenv('FEEDBACK_HUB_SECRET'); // khoá ký, chỉ ở máy chủ
    $now = time();
    $header = b64url(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $payload = b64url(json_encode([
        'prj'   => '${slug}',
        'uid'   => (string) $user['id'],
        'name'  => $user['name'],
        'role'  => $user['role'],   // tuỳ chọn
        'email' => $user['email'],  // tuỳ chọn
        'aud'   => 'feedback-hub',
        'iat'   => $now,
        'exp'   => $now + 600,      // hub từ chối token sống quá 24 giờ
    ], JSON_UNESCAPED_UNICODE));
    $sig = b64url(hash_hmac('sha256', "$header.$payload", $secret, true));
    return "$header.$payload.$sig";
}

// Điểm cuối /api/feedback-token (sau khi đã kiểm tra đăng nhập):
header('Content-Type: application/json');
echo json_encode(['token' => feedbackToken($currentUser)]);`,
    },
  };
  const cur = snippets[lang];

  return (
    <section>
      <SectionTitle title="Nhúng vào ứng dụng">
        Hai bước: (1) thêm thẻ script vào trang; (2) viết một điểm cuối trong MÁY CHỦ ứng dụng để ký token cho người đang đăng nhập — nút nổi gọi điểm cuối đó (<code className="font-mono">data-token-url</code>) để lấy token. Không có điểm cuối thì chỉ người gửi ẩn danh dùng được (khi dự án bật gửi ẩn danh; khi đó bỏ <code className="font-mono">data-token-url</code>).
      </SectionTitle>
      {!hubUrl ? <Alert tone="info" className="mb-3">Chưa đặt biến <code className="font-mono">HUB_PUBLIC_URL</code> trên máy chủ hub nên đoạn mã đang dùng địa chỉ của trình duyệt này ({origin || "…"}). Khi triển khai thật, hãy đặt biến này để mã nhúng đúng địa chỉ công khai.</Alert> : null}
      <Tabs
        tabs={[
          { id: "script", label: "Thẻ script" },
          { id: "node", label: "Node.js" },
          { id: "python", label: "Python" },
          { id: "php", label: "PHP" },
        ]}
        value={lang}
        onChange={setLang}
      />
      <CodeBlock code={cur.code} label={cur.label} />
      {lang !== "script" ? (
        <p className="mt-2 text-[13px] text-muted">
          Biến <code className="font-mono">FEEDBACK_HUB_SECRET</code> là khoá ở mục “Khoá ký token” phía trên. Token phải có <code className="font-mono">prj</code>, <code className="font-mono">aud</code>, <code className="font-mono">exp</code>, <code className="font-mono">uid</code>, <code className="font-mono">name</code>.
        </p>
      ) : project.allowedOrigins.length === 0 ? (
        <Alert tone="warn" className="mt-3">Dự án chưa có “Tên miền được phép” (tab Chung): trình duyệt sẽ không gọi được hub từ trang của ứng dụng cho tới khi bạn thêm tên miền của ứng dụng vào đó.</Alert>
      ) : null}
    </section>
  );
}
