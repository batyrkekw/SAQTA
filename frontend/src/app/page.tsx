"use client";

import { useI18n } from "@/components/language-provider";

import LandingAnalytics from "@/components/landing-analytics";
import { ProductHeader } from "@/components/product-header";
import { ArrowDown,ArrowRight,ArrowUpRight,BarChart3,Check,ChevronRight,CircleCheck,Clock3,Database,Leaf,Package,ScanLine,Store,TrendingUp } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

const workflow = [
  { icon: Database, number: "01", title: "Соберите историю", description: "Загрузите продажи, производство и списания из CSV или добавьте записи вручную." },
  { icon: TrendingUp, number: "02", title: "Спланируйте выпечку", description: "Получите объяснимый прогноз спроса с учётом дня недели, недавних продаж и остатков." },
  { icon: Store, number: "03", title: "Дайте остаткам шанс", description: "Разместите подходящие товары в SAQTA Save и предложите покупателям забрать их со скидкой." },
];

export default function Home() {
  const { t } = useI18n();

  return (
    <div className="landing-page min-h-screen bg-[#F7F7F2] text-[#202622]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-4">{t("Перейти к содержимому")}</a>
      <ProductHeader />

      <main id="main">
        <section className="home-hero">
          <div className="hero-copy">
            <div className="hero-kicker"><span /> {t(" Сделано в Казахстане. Для тех, кто печёт.")}</div>
            <h1>{t("Хороший хлеб.")}<br />{t("Точный план.")}<br /><span>{t("Ничего лишнего.")}</span></h1>
            <p className="hero-description">{t("Вы создаёте вкус. Мы помогаем сохранить ценность. Планируйте выпечку по спросу и находите покупателей для подходящих остатков.")}</p>
            <div className="hero-actions">
              <Link href="/forecast" className="hero-primary">{t("Открыть демо ")}<ArrowUpRight size={19} /></Link>
              <a href="#how-it-works" className="hero-secondary">{t("Как это работает ")}<ArrowDown size={16} /></a>
            </div>
            <p className="hero-note"><CircleCheck size={15} /> {t(" Без регистрации · Синтетические данные")}</p>
            <div className="hero-footnote"><span>01 — SAQTA FORECAST</span><span>02 — SAQTA SAVE</span></div>
          </div>
          <div className="hero-visual">
            <Image src="/images/artisan-bread.jpg" alt={t("Ремесленный хлеб с хрустящей корочкой на деревянной доске")} fill priority sizes="(max-width: 800px) 100vw, 50vw" className="hero-photo" />
            <div className="hero-photo-shade" />
            <div className="hero-photo-top"><span><Leaf size={14} /> {t(" Сохраняем то, что ценно.")}</span><span className="hero-edition">ASTANA, KZ</span></div>
            <div className="hero-caption"><span>{t("АРТЫҚТЫ АЗАЙТ.")}</span><span>{t("Асты сақта.")}</span></div>
            <Link href="/forecast" className="hero-insight">
              <div className="insight-icon"><TrendingUp size={21} /></div>
              <div><span className="insight-label">SAQTA FORECAST</span><p>{t("Завтра начинается с плана")}</p><span className="insight-detail">{t("От истории продаж — к решению")}</span></div>
              <ArrowUpRight size={20} />
            </Link>
          </div>
        </section>

        <div className="border-y border-[#DFE5DC]">
          <div className="mx-auto flex max-w-[1360px] flex-col justify-between gap-4 px-6 py-6 text-sm text-[#5D6B62] md:flex-row md:items-center md:px-12"><p className="font-medium text-[#123C2F]">{t("Прогнозируйте спрос. Сохраняйте еду. Берегите завтра.")}</p><p className="flex items-center gap-2 text-xs"><span className="h-1 w-1 rounded-full bg-[#237A57]" /> {t(" Одна система: от решения о выпечке до продажи остатков")}</p></div>
        </div>

        <section id="product" className="mx-auto max-w-[1360px] px-6 py-20 md:px-12 md:py-24">
          <div className="mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div><p className="mb-3 text-xs font-semibold uppercase tracking-[.18em] text-[#237A57]">{t("Два модуля. Общая цель.")}</p><h2 className="max-w-[600px] text-3xl font-semibold leading-tight tracking-[-.045em] text-[#123C2F] md:text-[40px]">{t("Меньше неопределённости.")}<br />{t("Больше осмысленных решений.")}</h2></div>
            <p className="max-w-[300px] text-sm leading-6 text-[#5D6B62]">{t("Сначала предотвращаем излишки. Помогаем продать подходящие остатки, когда они всё-таки появились.")}</p>
          </div>
          <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
            <div className="relative overflow-hidden rounded-[24px] bg-[#123C2F] p-7 text-white md:p-9">
              <div className="flex items-center gap-3 text-[#C7F36B]"><TrendingUp size={20} /><span className="text-xs font-semibold uppercase tracking-[.15em]">SAQTA Forecast</span></div>
              <h3 className="mt-6 max-w-[390px] text-2xl font-medium leading-tight tracking-[-.025em] md:text-3xl">{t("Пеките с пониманием")}<br />{t("завтрашнего спроса")}</h3>
              <p className="mt-4 max-w-[420px] text-sm leading-6 text-[#CFDDD4]">{t("История продаж превращается в понятную рекомендацию: сколько произвести, какие остатки учесть и где есть риск нехватки.")}</p>
              <ul className="mt-7 space-y-3 text-sm text-[#E4ECE7]">{["Недавние продажи и история по дням недели", "Рекомендация с учётом доступных остатков", "Объяснение метода и оценка на прошлых данных"].map((item) => <li key={item} className="flex items-start gap-2.5"><Check size={16} className="mt-0.5 shrink-0 text-[#C7F36B]" />{t(item)}</li>)}</ul>
              <Link href="/forecast" className="mt-9 inline-flex items-center gap-4 rounded-full bg-[#C7F36B] px-5 py-3 text-sm font-semibold text-[#123C2F] transition hover:bg-[#D7FA91]">{t("Построить прогноз ")}<ArrowUpRight size={17} /></Link>
              <p className="mt-5 text-xs text-[#AFBFAD]">{t("Прогноз — оценка спроса, а не гарантия продаж.")}</p>
            </div>
            <div className="flex flex-col rounded-[24px] border border-[#E1E6DB] bg-[#ECF0E4] p-7 md:p-9">
              <div className="flex items-center gap-3 text-[#237A57]"><Store size={20} /><span className="text-xs font-semibold uppercase tracking-[.15em]">SAQTA Save</span></div>
              <h3 className="mt-6 max-w-[340px] text-2xl font-medium leading-tight tracking-[-.025em] text-[#123C2F] md:text-3xl">{t("Осталась выпечка?")}<br />{t("Найдите её покупателя.")}</h3>
              <p className="mt-4 max-w-[360px] text-sm leading-6 text-[#5D6B62]">{t("Разместите доступную продукцию со скидкой, укажите время самовывоза и управляйте заказами в одном месте.")}</p>
              <div className="mt-7 grid grid-cols-3 gap-2 border-t border-[#D5DECE] pt-6 text-[#123C2F]">{[{ icon: Package, label: "Разместите" }, { icon: ScanLine, label: "Примите заказ" }, { icon: Clock3, label: "Передайте" }].map(({ icon: Icon, label }) => <div key={label}><Icon size={22} strokeWidth={1.5} /><p className="mt-3 text-xs font-medium">{t(label)}</p></div>)}</div>
              <Link href="/save" className="mt-8 inline-flex items-center gap-3 self-start text-sm font-semibold text-[#123C2F]">{t("Перейти в SAQTA Save ")}<ArrowUpRight size={17} /></Link>
              <p className="mt-5 text-xs leading-5 text-[#63725F]">{t("Размещение бесплатно для пекарен на всех тарифах. Демо-заказы без реальных платежей; только пригодная к продаже продукция.")}</p>
            </div>
          </div>
        </section>

        <section className="bg-white px-6 py-20 md:px-12">
          <div className="mx-auto grid max-w-[1264px] gap-10 lg:grid-cols-[.85fr_1.15fr] lg:gap-20">
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[.18em] text-[#237A57]">{t("Видеть полную картину")}</p>
              <h2 className="text-3xl font-semibold leading-tight tracking-[-.04em] text-[#123C2F] md:text-[38px]">{t("Ваши данные.")}<br />{t("Ваш следующий шаг.")}</h2>
              <p className="mt-5 max-w-[380px] text-sm leading-7 text-[#5D6B62]">{t("Продажи, производство, остатки и списания связаны в одной панели. Фильтруйте по периоду и точке — показатели пересчитываются по записям в базе.")}</p>
              <Link href="/forecast?view=results" className="mt-7 inline-flex items-center gap-3 text-sm font-semibold text-[#123C2F]">{t("Открыть аналитику ")}<ArrowRight size={16} /></Link>
            </div>
            <div className="overflow-hidden rounded-2xl border border-[#E2E8E1] bg-[#F7F7F2]">
              <div className="flex items-center justify-between border-b border-[#E2E8E1] px-6 py-4"><p className="flex items-center gap-2 text-sm font-semibold text-[#123C2F]"><BarChart3 size={17} /> {t(" От данных к действию")}</p><span className="rounded-full bg-[#E7EDD9] px-2.5 py-1 text-xs font-semibold tracking-wide text-[#526844]">{t("ДАННЫЕ ДЕМО")}</span></div>
              <LandingAnalytics />
              <div className="divide-y divide-[#E2E8E1] px-6">{[{ title: "Продажи и производство", detail: "Сравните спрос и объём выпечки", icon: TrendingUp, href: "/forecast?view=results" }, { title: "Остатки и списания", detail: "Найдите товары с излишками", icon: Package, href: "/forecast?view=data" }, { title: "Подтверждённые результаты", detail: "Отдельно учёт, отдельно оценки", icon: Leaf, href: "/forecast?view=results" }].map(({ title, detail, icon: Icon, href }) => <Link href={href} key={title} className="group flex items-center gap-4 py-5"><span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E2E8E1] bg-white text-[#237A57]"><Icon size={18} /></span><div><p className="text-sm font-medium text-[#123C2F]">{t(title)}</p><p className="mt-1 text-xs text-[#5D6B62]">{t(detail)}</p></div><ChevronRight size={16} className="ml-auto text-[#5D6B62] transition group-hover:translate-x-1" /></Link>)}</div>
              <p className="border-t border-[#E2E8E1] px-6 py-3 text-xs leading-5 text-[#6A786E]">{t("В демо используются синтетические записи. Реальные результаты зависят от данных пекарни.")}</p>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="mx-auto max-w-[1360px] px-6 py-20 md:px-12 md:py-24">
          <div className="text-center"><p className="mb-3 text-xs font-semibold uppercase tracking-[.18em] text-[#237A57]">{t("Просто встроить в рабочий день")}</p><h2 className="text-3xl font-semibold tracking-[-.04em] text-[#123C2F] md:text-[38px]">{t("От истории продаж — к плану на завтра")}</h2></div>
          <div className="mt-12 grid gap-8 md:grid-cols-3">{workflow.map(({ icon: Icon, number, title, description }) => <div key={number} className="relative border-t border-[#D8E2D4] pt-7"><div className="flex items-center justify-between"><span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#E8EEDD] text-[#237A57]"><Icon size={22} strokeWidth={1.6} /></span><span className="text-sm font-medium text-[#5D6B62]">{t(number)}</span></div><h3 className="mt-5 text-lg font-semibold tracking-tight text-[#123C2F]">{t(title)}</h3><p className="mt-3 max-w-[330px] text-sm leading-7 text-[#5D6B62]">{t(description)}</p></div>)}</div>
        </section>

        <section className="mx-auto max-w-[1360px] px-6 pb-20 md:px-12">
          <div className="grid gap-8 rounded-[28px] bg-[#E9EEDC] p-7 md:p-10 lg:grid-cols-[1.15fr_1fr] lg:gap-20">
            <div><p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] text-[#237A57]"><Leaf size={14} /> {t(" Ответственное отношение к эффекту")}</p><h2 className="text-2xl font-semibold leading-tight tracking-[-.035em] text-[#123C2F] md:text-3xl">{t("Сохранять ценность.")}<br />{t("Считать честно.")}</h2><p className="mt-4 max-w-[460px] text-sm leading-7 text-[#53634E]">{t("Мы учитываем продажи через SAQTA Save, вес продукции и зарегистрированные списания. Изменение показателей само по себе не доказывает влияние SAQTA.")}</p><Link href="/forecast?view=results" className="mt-6 inline-flex items-center gap-3 text-sm font-semibold text-[#123C2F]">{t("Как считаем результаты ")}<ArrowUpRight size={17} /></Link></div>
            <div className="grid gap-5 self-center">{[{ title: "Прозрачные расчёты", body: "Фактические записи отделены от прогнозов и потенциальной экономии." }, { title: "Без придуманных обещаний", body: "Без неподтверждённых CO₂-коэффициентов и гарантий сокращения отходов." }, { title: "Проверяемые допущения", body: "Предварительные тарифы Forecast отделены от сценарной экономии пекарни. Save остаётся бесплатным." }].map(({ title, body }) => <div key={title} className="flex items-start gap-3"><Check size={18} className="mt-0.5 shrink-0 text-[#237A57]" /><div><h3 className="text-sm font-semibold text-[#123C2F]">{t(title)}</h3><p className="mt-1 text-xs leading-6 text-[#53634E]">{t(body)}</p></div></div>)}</div>
          </div>
        </section>

        <section className="bg-[#123C2F] px-6 py-14 md:px-12 md:py-16">
          <div className="mx-auto flex max-w-[1264px] flex-col justify-between gap-7 md:flex-row md:items-center"><div><p className="mb-3 text-xs font-medium uppercase tracking-[.18em] text-[#C7F36B]">{t("Сделайте первый шаг")}</p><h2 className="text-3xl font-medium tracking-[-.04em] text-white md:text-4xl">{t("Завтра начинается")}<br />{t("с хорошего плана.")}</h2></div><div><Link href="/forecast" className="inline-flex items-center gap-6 rounded-full bg-[#C7F36B] px-6 py-4 text-sm font-semibold text-[#123C2F] transition hover:bg-[#D7FA91]">{t("Исследовать демо ")}<ArrowUpRight size={18} /></Link><p className="mt-3 text-center text-xs text-[#B9CCC0]">{t("Прогнозы · Учёт · SAQTA Save")}</p></div></div>
        </section>
      </main>

      <footer className="mx-auto max-w-[1360px] px-6 pb-7 pt-12 md:px-12">
        <div className="flex flex-col justify-between gap-8 md:flex-row"><div><Link href="/" aria-label={t("SAQTA — главная")}><Image src="/brand/saqta-logo.svg" width={132} height={29} alt="SAQTA" /></Link><p className="mt-4 max-w-[280px] text-xs leading-6 text-[#5D6B62]">{t("Технологии для осмысленной выпечки.")}<br />{t("Начинаем с пекарен Астаны.")}</p></div><nav className="grid grid-cols-2 gap-x-12 gap-y-3 text-xs text-[#536358] md:grid-cols-3" aria-label={t("Навигация в подвале")}><Link href="/forecast">SAQTA Forecast</Link><Link href="/save">SAQTA Save</Link><Link href="/docs">{t("Документация")}</Link><Link href="/forecast?view=results">{t("Эффект")}</Link><Link href="/about">{t("О проекте")}</Link><Link href="/forecast?view=data">{t("Данные и настройки")}</Link></nav></div>
        <div className="mt-9 flex flex-col justify-between gap-2 border-t border-[#DFE5DC] pt-5 text-xs text-[#6A786E] md:flex-row"><p>© {t(new Date().getFullYear())} {t(" SAQTA. Сохраняем то, что ценно.")}</p><p>{t("Демонстрационный MVP · Синтетические данные · Без реальных платежей")}</p></div>
      </footer>
    </div>
  );
}
