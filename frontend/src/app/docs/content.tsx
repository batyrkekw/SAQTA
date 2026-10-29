"use client";

import { useI18n } from "@/components/language-provider";

import { ProductHeader } from '@/components/product-header';
import { ArrowLeft,ArrowUpRight,BookOpen,ChartNoAxesCombined,Database,ShieldCheck } from 'lucide-react';
import Link from 'next/link';

export default function Documentation() {
  const { t } = useI18n();

  const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8000/api').replace(/\/api\/?$/, '');
  return <><ProductHeader /><main className="mx-auto max-w-4xl px-6 py-12 md:py-20">
    <Link href="/" className="inline-flex items-center gap-2 text-sm text-forest"><ArrowLeft size={16}/> {t(" На главную SAQTA")}</Link>
    <div className="mt-12 flex items-center gap-4"><BookOpen className="text-primary" size={34}/><div><p className="eyebrow">{t("Центр знаний")}</p><h1 className="page-title mt-2">{t("Как устроена SAQTA")}</h1></div></div>
    <p className="mt-6 max-w-2xl leading-7 text-[#637369]">{t("Forecast помогает планировать производство по истории продаж. Save позволяет предложить подходящие остатки со скидкой. Все операции сохраняются в общей базе данных.")}</p>
    <div className="mt-8 grid gap-4 sm:grid-cols-2">{[
      ['README · English', '/docs/README.md', 'Установка, архитектура, тесты и развёртывание'],
      ['Фирменный стиль', '/docs/BRAND.md', 'Логотип, цвета и правила использования'],
      ['Контракт API', '/docs/API_CONTRACT.md', 'Эндпоинты и форматы данных'],
      ['Интерактивный OpenAPI', `${apiUrl}/docs`, 'Проверка запросов к работающему backend'],
    ].map(([title, href, description]) => <a key={href} href={href} className="card p-6 transition-colors hover:border-primary"><span className="flex items-center justify-between font-semibold text-forest">{t(title)}<ArrowUpRight size={18}/></span><p className="mt-2 text-sm text-[#637369]">{t(description)}</p></a>)}</div>
    <section className="card mt-8 space-y-7 p-7">
      <div><h2 className="flex items-center gap-2 font-semibold"><ChartNoAxesCombined size={20} className="text-primary"/> {t(" Прозрачный прогноз")}</h2><p className="mt-3 text-sm leading-7 text-[#637369]">{t("Статистический baseline использует недавние продажи и историю того же дня недели. Рекомендация учитывает доступный остаток и настраиваемый страховой запас. MAE рассчитывается только на хронологически отложенных наблюдениях. Прогноз — оценка спроса, а не гарантия продаж.")}</p></div>
      <div><h2 className="flex items-center gap-2 font-semibold"><Database size={20} className="text-primary"/> {t(" Измерение результатов")}</h2><p className="mt-3 text-sm leading-7 text-[#637369]">{t("Вес и выручка в результатах Forecast относятся к полученным заказам. Списания сравниваются с предшествующим периодом той же длины. Сравнение не устанавливает причину изменений. Расчёт CO₂ не используется; сценарий возможной экономии показан отдельно от фактических результатов.")}</p></div>
      <div><h2 className="flex items-center gap-2 font-semibold"><ShieldCheck size={20} className="text-primary"/> {t(" Демо и рабочие данные")}</h2><p className="mt-3 text-sm leading-7 text-[#637369]">{t("Демо использует синтетические записи. Для реальных данных требуется вход в собственную организацию и отдельное окружение. Сервер проверяет права доступа; история продаж одной организации недоступна другой.")}</p></div>
    </section>
    <Link href="/forecast" className="btn btn-primary mt-8">{t("Открыть приложение ")}<ArrowUpRight size={16}/></Link>
  </main></>;
}
