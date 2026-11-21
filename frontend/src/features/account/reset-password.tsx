"use client";

import { useI18n } from "@/components/language-provider";
import { Card, Field, Notice } from "@/components/ui";
import { useAccount } from "@/features/account/account";
import { errorMessage, post } from "@/lib/api";
import { formValidationMessage } from "@/lib/validation";
import { KeyRound, LoaderCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";

/** Request a reset link. Always shows the same answer, whether the email exists or not. */
export function ForgotPassword({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const invalid = formValidationMessage(event.currentTarget); if (invalid) { setError(invalid); return; }
    const email = String(new FormData(event.currentTarget).get("email") || "").trim();
    setPending(true); setError("");
    try { setMessage((await post<{ message: string }>("/auth/forgot", { email })).message); }
    catch (reason) { setError(errorMessage(reason)); } finally { setPending(false); }
  }
  return <form noValidate className="space-y-4" onSubmit={event => { void submit(event); }}>
    <p className="text-sm text-[#536257]">{t("Укажите email аккаунта. Мы пришлём ссылку, по которой можно задать новый пароль.")}</p>
    <Field label="Email"><input className="field" type="email" name="email" autoComplete="email" required maxLength={254} /></Field>
    {error && <Notice kind="error">{t(error)}</Notice>}
    {message && <Notice kind="success">{t(message)}</Notice>}
    <div className="flex flex-wrap gap-3"><button className="btn-primary" disabled={pending || Boolean(message)} type="submit">{pending && <LoaderCircle size={15} className="animate-spin" />}{t("Отправить ссылку")}</button><button className="btn-secondary" type="button" onClick={onBack}>{t("Вернуться ко входу")}</button></div>
  </form>;
}

export function ResetPassword() {
  const { t } = useI18n();
  const token = useSearchParams().get("token") || "";
  const { open } = useAccount();
  const [pending, setPending] = useState(false), [error, setError] = useState(""), [done, setDone] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const invalid = formValidationMessage(event.currentTarget); if (invalid) { setError(invalid); return; }
    const data = new FormData(event.currentTarget);
    if (data.get("password") !== data.get("repeat")) { setError("Пароли не совпадают"); return; }
    setPending(true); setError("");
    try { setDone((await post<{ message: string }>("/auth/reset", { token, password: String(data.get("password")) })).message); }
    catch (reason) { setError(errorMessage(reason)); } finally { setPending(false); }
  }
  return <div className="mx-auto max-w-lg"><Card title={t("Новый пароль")} action={<KeyRound size={18} className="text-[#237A57]" />}>
    {!token ? <Notice kind="error">{t("Ссылка неполная. Откройте ссылку из письма целиком или запросите новую.")}</Notice> : done ? <div className="space-y-4"><Notice kind="success">{t(done)}</Notice><button className="btn-primary" onClick={open}>{t("Войти")}</button></div> :
      <form noValidate className="space-y-4" onSubmit={event => { void submit(event); }}>
        <Field label={t("Новый пароль")} hint={t("Не менее 10 символов")}><input className="field" type="password" name="password" autoComplete="new-password" minLength={10} maxLength={128} required /></Field>
        <Field label={t("Повторите пароль")}><input className="field" type="password" name="repeat" autoComplete="new-password" minLength={10} maxLength={128} required /></Field>
        <p className="text-xs text-[#5D6B62]">{t("После смены пароля все открытые сеансы завершатся.")}</p>
        {error && <Notice kind="error">{t(error)}</Notice>}
        <button className="btn-primary" disabled={pending} type="submit">{pending && <LoaderCircle size={15} className="animate-spin" />}{t("Сохранить пароль")}</button>
      </form>}
  </Card></div>;
}
