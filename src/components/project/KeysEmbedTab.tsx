"use client";

import { useState, useSyncExternalStore } from "react";
import { BASE_PATH } from "@/lib/base-path";
import { api } from "../api";
import { IssueKeyDialog, KeyTable, type KeyRow } from "../KeysBoard";
import { AddButton, ConfirmDialog } from "../ui/Modal";
import { SecretDialog } from "../ui/SecretDialog";
import { DEFAULT_OPTS, DEFAULT_TRIGGER, companionHtml, nextKit, scriptSnippet, type EmbedOpts } from "@/lib/embed-snippets";
import { Alert, Button, Card, CodeBlock, CopyButton, EmptyState, Field, Input, Select, Spinner, Switch, Tabs, Toolbar } from "../ui/primitives";
import type { ProjectData } from "./types";

const subscribe = () => () => {};
const browserOrigin = () => window.location.origin + BASE_PATH;
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

type Lang = "script" | "next" | "node" | "python" | "php";

function Embed({ project, hubUrl }: { project: ProjectData; hubUrl: string }) {
  const origin = useSyncExternalStore(subscribe, browserOrigin, serverOrigin);
  const [lang, setLang] = useState<Lang>("script");
  const hub = hubUrl || origin || "https://địa-chỉ-hub";
  const slug = project.slug;
  const [o, setO] = useState<Omit<EmbedOpts, "slug" | "hub">>(DEFAULT_OPTS);
  const opts: EmbedOpts = { ...o, slug, hub };
  const set = <K extends keyof typeof o>(k: K, v: (typeof o)[K]) => setO((x) => ({ ...x, [k]: v }));

  const snippets: Record<Exclude<Lang, "script" | "next">, { label: string; code: string }> = {
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
  const kit = nextKit(opts);
  const companion = companionHtml(opts);

  return (
    <section>
      <SectionTitle title="Nhúng vào ứng dụng">
        Hai bước: (1) thêm thẻ script vào trang; (2) viết một điểm cuối trong MÁY CHỦ ứng dụng để ký token cho người đang đăng nhập — nút nổi gọi điểm cuối đó (<code className="font-mono">data-token-url</code>) để lấy token. Không có điểm cuối thì chỉ người gửi ẩn danh dùng được (khi dự án bật gửi ẩn danh; khi đó bỏ <code className="font-mono">data-token-url</code>).
      </SectionTitle>
      {!hubUrl ? <Alert tone="info" className="mb-3">Chưa đặt biến <code className="font-mono">HUB_PUBLIC_URL</code> trên máy chủ hub nên đoạn mã đang dùng địa chỉ của trình duyệt này ({origin || "…"}). Khi triển khai thật, hãy đặt biến này để mã nhúng đúng địa chỉ công khai.</Alert> : null}
      <Tabs
        tabs={[
          { id: "script", label: "Thẻ script" },
          { id: "next", label: "Next.js" },
          { id: "node", label: "Node.js" },
          { id: "python", label: "Python" },
          { id: "php", label: "PHP" },
        ]}
        value={lang}
        onChange={setLang}
      />
      {lang === "script" || lang === "next" ? <EmbedOptions o={o} set={set} project={project} /> : null}
      {lang === "script" ? (
        <>
          <CodeBlock code={scriptSnippet(opts)} label={o.context ? "JavaScript — init() kèm ngữ cảnh (đặt trong trang HTML của ứng dụng)" : "Thẻ <script> (đặt trong trang HTML của ứng dụng)"} />
          {companion ? <CodeBlock code={companion.code} label={companion.label} /> : null}
          {o.auth === "token" ? <p className="mt-2 text-[13px] text-muted">Cần thêm điểm cuối <code className="font-mono">{o.tokenUrl || "/api/feedback-token"}</code> ở máy chủ để ký token — xem các tab Next.js, Node.js, Python, PHP.</p> : null}
          {project.allowedOrigins.length === 0 ? (
            <Alert tone="warn" className="mt-3">Dự án chưa có “Tên miền được phép” (tab Chung): trình duyệt sẽ không gọi được hub từ trang của ứng dụng cho tới khi bạn thêm tên miền của ứng dụng vào đó.</Alert>
          ) : null}
        </>
      ) : lang === "next" ? (
        <>
          {kit.env ? <CodeBlock code={kit.env} label="1. Biến môi trường" /> : null}
          {kit.route ? <CodeBlock code={kit.route} label="2. Điểm cuối token (tệp mới)" /> : null}
          <CodeBlock code={kit.comp} label={kit.route ? "3. Component + 1 dòng trong layout (tệp mới)" : "1. Component + 1 dòng trong layout (tệp mới)"} />
          {companion ? <CodeBlock code={companion.code} label={companion.label} /> : null}
          <p className="mt-2 text-[13px] text-muted">Chỉ thêm tệp mới và <b>một dòng</b> trong layout. Mã trên là App Router; dự án khác dùng thẻ script và một điểm cuối token bằng ngôn ngữ của bạn.</p>
        </>
      ) : (
        <>
          <CodeBlock code={snippets[lang].code} label={snippets[lang].label} />
          <p className="mt-2 text-[13px] text-muted">
            Biến <code className="font-mono">FEEDBACK_HUB_SECRET</code> là khoá ở mục “Khoá ký token” phía trên. Token phải có <code className="font-mono">prj</code>, <code className="font-mono">aud</code>, <code className="font-mono">exp</code>, <code className="font-mono">uid</code>, <code className="font-mono">name</code>.
          </p>
        </>
      )}
    </section>
  );
}

type OptsState = Omit<EmbedOpts, "slug" | "hub">;

function EmbedOptions({ o, set, project }: { o: OptsState; set: <K extends keyof OptsState>(k: K, v: OptsState[K]) => void; project: ProjectData }) {
  const num = (k: "offsetX" | "offsetY") => (e: React.ChangeEvent<HTMLInputElement>) => set(k, Number(e.target.value));
  return (
    <Card className="mb-3 mt-3 p-4">
      <h3 className="text-sm font-semibold">Tuỳ chọn — mã bên dưới đổi theo</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Cách mở góp ý" hint={o.open === "trigger" ? "Không vẽ nút nổi: mở từ nút/mục menu của ứng dụng. Hợp khi các góc màn hình đã kín." : o.open === "mount" ? "Bảng góp ý hiện ngay trong một vùng của trang." : "Nút nổi ở góc màn hình."}>
          <Select value={o.open} onChange={(e) => set("open", e.target.value as OptsState["open"])}>
            <option value="fab">Nút nổi</option>
            <option value="trigger">Từ nút / mục menu có sẵn</option>
            <option value="mount">Nhúng vào một vùng của trang</option>
          </Select>
        </Field>
        <Field label="Người gửi" hint={o.auth === "token" ? "Gửi kèm danh tính người đang đăng nhập (cần điểm cuối token)." : project.anonymousSubmit ? "Khách vãng lai gửi ẩn danh." : "Dự án chưa bật “gửi ẩn danh” (tab Chung) nên chế độ này sẽ không hiện widget."}>
          <Select value={o.auth} onChange={(e) => set("auth", e.target.value as OptsState["auth"])}>
            <option value="token">Người đã đăng nhập (token)</option>
            <option value="anonymous">Khách vãng lai (ẩn danh)</option>
          </Select>
        </Field>
        {o.open === "trigger" ? (
          <Field label="Bộ chọn CSS của nút mở" hint={<>Mặc định <code className="font-mono">{DEFAULT_TRIGGER}</code>: thêm thuộc tính này vào nút bất kỳ. Click được bắt kiểu uỷ quyền nên cả menu hiện ra sau cũng dùng được.</>}>
            <Input value={o.trigger} onChange={(e) => set("trigger", e.target.value)} />
          </Field>
        ) : null}
        {o.open === "mount" ? (
          <Field label="Bộ chọn CSS của vùng nhúng">
            <Input value={o.mount} onChange={(e) => set("mount", e.target.value)} />
          </Field>
        ) : null}
        {o.open === "fab" ? (
          <>
            <Field label="Vị trí nút nổi" hint="Để trống = theo tab Giao diện của dự án.">
              <Select value={o.position} onChange={(e) => set("position", e.target.value as OptsState["position"])}>
                <option value="">Theo dự án</option>
                <option value="bottom-right">Dưới-phải</option>
                <option value="bottom-left">Dưới-trái</option>
                <option value="top-right">Trên-phải</option>
                <option value="top-left">Trên-trái</option>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cách mép ngang (px)"><Input type="number" min={0} max={200} value={o.offsetX} onChange={num("offsetX")} /></Field>
              <Field label="Cách mép dọc (px)"><Input type="number" min={0} max={200} value={o.offsetY} onChange={num("offsetY")} /></Field>
            </div>
            <Field label="Chữ trên nút" hint="Để trống = theo dự án.">
              <Input value={o.label} maxLength={30} onChange={(e) => set("label", e.target.value)} />
            </Field>
            <Field label="Biểu tượng">
              <Select value={o.icon} onChange={(e) => set("icon", e.target.value as OptsState["icon"])}>
                <option value="">Theo dự án</option>
                <option value="lightbulb">Bóng đèn</option>
                <option value="chat">Chat</option>
                <option value="pencil">Bút</option>
                <option value="flag">Cờ</option>
                <option value="plus">Dấu cộng</option>
              </Select>
            </Field>
          </>
        ) : null}
        <Field label="Ngôn ngữ">
          <Select value={o.locale} onChange={(e) => set("locale", e.target.value as OptsState["locale"])}>
            <option value="vi">Tiếng Việt</option>
            <option value="en">English</option>
          </Select>
        </Field>
        <Field label="Màu nền" hint="Tự theo hệ thống, hoặc cố định nếu ứng dụng của bạn không có chế độ tối.">
          <Select value={o.colorScheme} onChange={(e) => set("colorScheme", e.target.value as OptsState["colorScheme"])}>
            <option value="auto">Tự động</option>
            <option value="light">Luôn sáng</option>
            <option value="dark">Luôn tối</option>
          </Select>
        </Field>
        <Field label="Che thêm trong ảnh chụp trang" hint={<>Bộ chọn CSS, ví dụ <code className="font-mono">.student-grades, #email</code>. Ô mật khẩu và phần tử có <code className="font-mono">data-feedbackhub-mask</code> luôn bị che.</>}>
          <Input value={o.mask} placeholder=".ten-lop-css" onChange={(e) => set("mask", e.target.value)} />
        </Field>
      </div>
      <div className="mt-2 border-t border-line pt-1">
        <Switch checked={o.context} onChange={(v) => set("context", v)} label="Gửi kèm ngữ cảnh nội dung" description="Ứng dụng cho hub biết trang đang hiển thị bản ghi nào (vd. bài học, câu hỏi). Góp ý ghi rõ “về dữ liệu nào” để người/AI tìm đúng chỗ sửa. Mã chuyển sang dạng init() có hàm getContext để bạn điền." />
      </div>
    </Card>
  );
}
