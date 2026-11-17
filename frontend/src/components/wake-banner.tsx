"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/language-provider";
import { SanaSpark } from "@/components/sana-thread";
import { WAKE_EVENT } from "@/lib/api";

/** Shown while the free API host is starting after a quiet period. */
export function WakeBanner() {
  const { t } = useI18n();
  const [waking, setWaking] = useState(false);
  useEffect(() => {
    const onWake = (event: Event) => setWaking(Boolean((event as CustomEvent<boolean>).detail));
    window.addEventListener(WAKE_EVENT, onWake);
    return () => window.removeEventListener(WAKE_EVENT, onWake);
  }, []);
  if (!waking) return null;
  return (
    <div role="status" className="wake-banner">
      <SanaSpark size={14} className="wake-spark" />
      <span>{t("Сервер SaqtaFood просыпается после паузы. Это займёт до минуты — данные загрузятся сами.")}</span>
    </div>
  );
}
