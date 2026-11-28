"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/components/api";
import { Alert, Button, Card, Field, Input, Spinner } from "@/components/ui/primitives";
import { GoogleButton } from "./GoogleButton";

export function LoginForm({ googleClientId }: { googleClientId?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await api("/api/admin/login", { body: { email: email.trim(), password } });
    if (!r.ok) {
      setError(r.error);
      setBusy(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  async function viaGoogle(credential: string) {
    setBusy(true);
    setError(null);
    const r = await api("/api/admin/google", { body: { credential } });
    if (!r.ok) {
      setError(r.error);
      setBusy(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  // Google chỉ phục vụ nút trên https hoặc localhost.
  const [googleOk, setGoogleOk] = useState(false);
  useEffect(() => {
    setGoogleOk(Boolean(googleClientId) && (window.location.protocol === "https:" || window.location.hostname === "localhost"));
  }, [googleClientId]);

  return (
    <Card className="p-5">
      {googleOk && googleClientId ? (
        <div className="mb-4 space-y-4">
          <GoogleButton clientId={googleClientId} onCredential={(c) => void viaGoogle(c)} onError={setError} />
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" />
            hoặc dùng email và mật khẩu
            <span className="h-px flex-1 bg-line" />
          </div>
        </div>
      ) : null}
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus />
        </Field>
        <Field label="Mật khẩu">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </Field>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Button type="submit" className="w-full" disabled={busy || !email || !password}>
          {busy ? <Spinner /> : null}
          Đăng nhập
        </Button>
      </form>
    </Card>
  );
}
