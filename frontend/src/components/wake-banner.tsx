"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/language-provider";
import { SanaSpark } from "@/components/sana-thread";
import { WAKE_EVENT, warmUpApi } from "@/lib/api";

// The free API host usually starts in about 50 seconds.
const EXPECTED_WAKE_SECONDS = 60;

/** Shown while the free API host is starting after a quiet period. */
export function WakeBanner() {
  const { t } = useI18n();
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    warmUpApi();
    const onWake = (event: Event) => {
      const waking = Boolean((event as CustomEvent<boolean>).detail);
      const at = Date.now();
      setNow(at);
      setStartedAt(waking ? at : null);
    };
    window.addEventListener(WAKE_EVENT, onWake);
    return () => window.removeEventListener(WAKE_EVENT, onWake);
  }, []);
  useEffect(() => {
    if (startedAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  if (startedAt === null) return null;
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  // Never reaches 100% on its own: the bar fills only to 95% while we are still waiting.
  const percent = Math.min(95, Math.round((seconds / EXPECTED_WAKE_SECONDS) * 100));
  return (
    <div role="status" className="wake-banner">
      <SanaSpark size={14} className="wake-spark" />
      <div className="wake-body">
        <span>{t("Сервер SaqtaFood просыпается после паузы. Это займёт до минуты — данные загрузятся сами.")}</span>
        <div className="wake-track" role="progressbar" aria-label={t("Пробуждение сервера")}
             aria-valuemin={0} aria-valuemax={EXPECTED_WAKE_SECONDS} aria-valuenow={Math.min(seconds, EXPECTED_WAKE_SECONDS)}>
          <div className="wake-fill" style={{ transform: `scaleX(${percent / 100})` }} />
        </div>
        <span className="wake-meta">{t(`Прошло ${seconds} с · пробуем снова автоматически`)}</span>
      </div>
    </div>
  );
}
