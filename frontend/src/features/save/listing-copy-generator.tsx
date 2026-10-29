"use client";

import { useI18n } from "@/components/language-provider";

import { Field,Notice } from "@/components/ui";
import { generateListingCopy,type ListingCopyInput } from "@/lib/listing-copy";
import { Copy,Sparkles } from "lucide-react";
import { useState } from "react";

export function ListingCopyGenerator({ input, onUse }: { input: ListingCopyInput; onUse: (value: string) => void }) {
  const { t, language } = useI18n();

  const [text, setText] = useState(""), [error, setError] = useState(""), [message, setMessage] = useState("");
  function generate() {
    setError(""); setMessage("");
    try { setText(generateListingCopy(input, language)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Проверьте параметры объявления."); }
  }
  async function copy() {
    setError(""); setMessage("");
    try { await navigator.clipboard.writeText(text); setMessage("Текст скопирован. Это черновик; публикация выполняется отдельно."); }
    catch { setError("Браузер не разрешил копирование. Выделите текст объявления и скопируйте вручную."); }
  }
  return <section className="mt-5 space-y-3 rounded-xl border border-[#DDE6D3] bg-[#F7F9F2] p-4" aria-label={t("Генератор текста объявления")}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold text-[#123C2F]">{t("Текст для SAQTA Save")}</h3><button type="button" className="btn-secondary" onClick={generate}><Sparkles size={14}/>{t("Сгенерировать текст")}</button></div>
    <p className="text-xs leading-6 text-[#5D6B62]">{t("Шаблон использует только заполненные поля. Состав, аллергены, свежесть и срок годности не придумываются. Проверьте черновик до публикации.")}</p>
    {text && <><Field label={t("Черновик объявления")} hint={t(`${text.length} / 1 000 символов. Текст можно редактировать.`)}><textarea className="field min-h-44 resize-y" maxLength={1000} value={text} onChange={event => { setText(event.target.value); setMessage(""); }}/></Field><div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary" onClick={() => { void copy(); }} disabled={!text.trim()}><Copy size={14}/>{t("Скопировать")}</button><button type="button" className="btn-secondary" disabled={!text.trim()} onClick={() => { onUse(text); setMessage("Черновик вставлен в описание. Проверьте его и нажмите «Опубликовать» или «Сохранить»."); }}>{t("Использовать в описании")}</button></div></>}
    {error && <Notice kind="error">{t(error)}</Notice>}{message && <Notice kind="success">{t(message)}</Notice>}
  </section>;
}
