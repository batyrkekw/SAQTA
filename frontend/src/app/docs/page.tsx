import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, BookOpen, Database, ShieldCheck, ChartNoAxesCombined } from 'lucide-react';

export const metadata = { title: 'Документация' };
export default function Documentation() {
  const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8000/api').replace(/\/api\/?$/, '');
  return <main className="mx-auto max-w-4xl px-6 py-12 md:py-20">
    <Link href="/" className="inline-flex items-center gap-2 text-sm text-forest"><ArrowLeft size={16}/> На главную SAQTA</Link>
    <div className="mt-12 flex items-center gap-4"><BookOpen className="text-primary" size={34}/><div><p className="eyebrow">Центр знаний</p><h1 className="page-title mt-2">Как устроена SAQTA</h1></div></div>
    <p className="mt-6 max-w-2xl leading-7 text-[#637369]">Forecast помогает планировать производство по истории продаж. Save позволяет предложить подходящие остатки со скидкой. Все операции сохраняются в общей базе данных.</p>
    <div className="mt-8 grid gap-4 sm:grid-cols-2">{[
      ['README · English', '/docs/README.md', 'Установка, архитектура, тесты и развёртывание'],
      ['Фирменный стиль', '/docs/BRAND.md', 'Логотип, цвета и правила использования'],
      ['Контракт API', '/docs/API_CONTRACT.md', 'Эндпоинты и форматы данных'],
      ['Интерактивный OpenAPI', `${apiUrl}/docs`, 'Проверка запросов к работающему backend'],
    ].map(([title, href, description]) => <a key={href} href={href} className="card p-6 transition-colors hover:border-primary"><span className="flex items-center justify-between font-semibold text-forest">{title}<ArrowUpRight size={18}/></span><p className="mt-2 text-sm text-[#637369]">{description}</p></a>)}</div>
    <section className="card mt-8 space-y-7 p-7">
      <div><h2 className="flex items-center gap-2 font-semibold"><ChartNoAxesCombined size={20} className="text-primary"/> Прозрачный прогноз</h2><p className="mt-3 text-sm leading-7 text-[#637369]">Статистический baseline использует недавние продажи и историю того же дня недели. Рекомендация учитывает доступный остаток и настраиваемый страховой запас. MAE рассчитывается только на хронологически отложенных наблюдениях. Прогноз — оценка спроса, а не гарантия продаж.</p></div>
      <div><h2 className="flex items-center gap-2 font-semibold"><Database size={20} className="text-primary"/> Измерение результатов</h2><p className="mt-3 text-sm leading-7 text-[#637369]">Вес и выручка в разделе «Эффект» относятся к полученным заказам. Списания сравниваются с предшествующим периодом той же длины. Сравнение не устанавливает причину изменений. Расчёт CO₂ не используется; сценарий возможной экономии показан отдельно от фактических результатов.</p></div>
      <div><h2 className="flex items-center gap-2 font-semibold"><ShieldCheck size={20} className="text-primary"/> Демо и рабочие данные</h2><p className="mt-3 text-sm leading-7 text-[#637369]">Демо использует воспроизводимые синтетические записи. В MVP нет авторизации: общая публичная установка не подходит для конфиденциальных данных пекарни. Режим реальных данных подключается к отдельной пустой базе; управление доступом требуется до работы с частными данными.</p></div>
    </section>
    <Link href="/dashboard" className="btn btn-primary mt-8">Открыть приложение <ArrowUpRight size={16}/></Link>
  </main>;
}
