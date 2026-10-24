import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, BarChart3, Check, ChevronRight, CircleCheck, Clock3, Database, Leaf, Package, ScanLine, ShieldCheck, Sparkles, Store, TrendingUp } from "lucide-react";
import LandingAnalytics from "@/components/landing-analytics";
import { ProductHeader } from "@/components/product-header";

function BreadIllustration() {
  return (
    <svg viewBox="0 0 600 420" fill="none" aria-hidden="true" className="h-full w-full">
      <ellipse cx="311" cy="353" rx="194" ry="24" fill="#D6DEB9" />
      <path d="M126 280C126 210 177 144 280 124C393 102 478 145 484 220C490 294 419 331 311 342C204 353 126 330 126 280Z" fill="#B46A36" />
      <path d="M126 268C126 198 177 132 280 112C393 90 478 133 484 208C490 282 419 319 311 330C204 341 126 318 126 268Z" fill="#E0A464" />
      <path d="M140 249C150 199 200 149 287 133C370 117 442 140 462 190" stroke="#F2C78E" strokeWidth="12" strokeLinecap="round" />
      <path d="M217 165C206 186 205 212 218 238" stroke="#B76F37" strokeWidth="23" strokeLinecap="round" />
      <path d="M212 163C202 182 201 206 213 230" stroke="#F6D8A9" strokeWidth="13" strokeLinecap="round" />
      <path d="M287 143C272 164 269 197 280 222" stroke="#B76F37" strokeWidth="23" strokeLinecap="round" />
      <path d="M282 141C268 162 266 191 275 214" stroke="#F6D8A9" strokeWidth="13" strokeLinecap="round" />
      <path d="M355 142C338 164 335 193 344 214" stroke="#B76F37" strokeWidth="23" strokeLinecap="round" />
      <path d="M350 140C335 161 333 186 339 206" stroke="#F6D8A9" strokeWidth="13" strokeLinecap="round" />
      <path d="M415 156C399 176 398 194 403 210" stroke="#B76F37" strokeWidth="20" strokeLinecap="round" />
      <path d="M411 154C397 172 395 188 399 202" stroke="#F6D8A9" strokeWidth="11" strokeLinecap="round" />
      <g fill="#F5CE96" opacity=".8">
        <ellipse cx="185" cy="268" rx="3" ry="5" transform="rotate(-30 185 268)" />
        <ellipse cx="244" cy="289" rx="3" ry="5" transform="rotate(45 244 289)" />
        <ellipse cx="321" cy="271" rx="3" ry="5" transform="rotate(-20 321 271)" />
        <ellipse cx="379" cy="284" rx="3" ry="5" transform="rotate(35 379 284)" />
        <ellipse cx="439" cy="247" rx="3" ry="5" transform="rotate(20 439 247)" />
      </g>
      <path d="M108 139C119 132 123 121 119 109M106 121C92 123 85 115 85 104C98 104 108 110 106 121ZM119 109C118 96 126 87 138 86C139 99 132 109 119 109Z" stroke="#237A57" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M470 306L479 293M480 307L493 304M466 297L464 285" stroke="#237A57" strokeWidth="3" strokeLinecap="round" />
      <path d="M427 88L434 81M435 94L445 93M421 79L420 69" stroke="#A0BA80" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

const workflow = [
  { icon: Database, number: "01", title: "Соберите историю", description: "Загрузите продажи, производство и списания из CSV или добавьте записи вручную." },
  { icon: TrendingUp, number: "02", title: "Спланируйте выпечку", description: "Получите объяснимый прогноз спроса с учётом дня недели, недавних продаж и остатков." },
  { icon: Store, number: "03", title: "Дайте остаткам шанс", description: "Разместите подходящие товары в SAQTA Save и предложите покупателям забрать их со скидкой." },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-[#F7F7F2] text-[#202622]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-4">Перейти к содержимому</a>
      <ProductHeader />

      <main id="main">
        <section className="relative mx-auto grid max-w-[1360px] items-center gap-8 px-6 pb-14 pt-8 md:px-12 md:pb-20 lg:grid-cols-[1.08fr_1fr] lg:gap-6 lg:pt-14">
          <div className="relative z-10 max-w-[650px]">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#DCE4D6] bg-[#EDF1E7] py-2 pl-2.5 pr-3.5 text-xs font-semibold uppercase tracking-[.12em] text-[#3C624C]"><span className="h-1.5 w-1.5 rounded-full bg-[#237A57]" /> Создано в Казахстане · Для пекарен</div>
            <h1 className="text-[clamp(2.75rem,5.3vw,4.6rem)] font-semibold leading-[1.06] tracking-[-.065em] text-[#123C2F]">Хороший хлеб.<br />Точный план.<br /><span className="relative inline-block">Меньше лишнего.<svg viewBox="0 0 430 13" className="absolute -bottom-3 left-0 h-3 w-full text-[#B9DD72]" aria-hidden="true"><path d="M3 8C116 1 267 1 425 7" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" /></svg></span></h1>
            <p className="mt-9 max-w-[445px] text-base leading-7 text-[#5D6B62] md:text-lg">Планируйте выпечку на основе спроса, замечайте излишки заранее и продавайте подходящие остатки через SAQTA Save.</p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="/forecast" className="inline-flex items-center gap-5 rounded-full bg-[#123C2F] px-6 py-4 text-sm font-semibold text-white transition hover:bg-[#237A57]">Посмотреть в действии <ArrowUpRight size={18} /></Link>
              <a href="#how-it-works" className="inline-flex items-center gap-2 px-2 py-3 text-sm font-medium text-[#123C2F]">Как работает SAQTA <ArrowDown size={15} /></a>
            </div>
            <p className="mt-5 flex items-center gap-2 text-xs text-[#6A786E]"><CircleCheck size={14} /> Рабочее демо на синтетических данных · Без регистрации</p>
          </div>

          <div className="relative mt-4 min-h-[410px] lg:mt-0 lg:min-h-[510px]">
            <div className="absolute inset-x-0 top-7 bottom-5 overflow-hidden rounded-[40px] bg-[#E7EDDC] lg:left-3">
              <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(#8CA174_0.8px,transparent_0.8px)] [background-size:16px_16px]" />
              <div className="absolute top-7 left-7 flex items-center gap-2 rounded-full bg-white/75 px-3 py-2 text-xs font-semibold uppercase tracking-[.15em] text-[#4D6D4F]"><Leaf size={12} /> У каждого продукта есть ценность</div>
              <div className="absolute inset-x-0 bottom-5 top-16"><BreadIllustration /></div>
              <div className="absolute bottom-6 left-7 text-xs font-medium tracking-wide text-[#55704F]">Артықты азайт. Асты сақта.</div>
            </div>
            <div className="absolute right-0 top-0 w-[206px] rotate-[3deg] rounded-2xl border border-[#E3E8DC] bg-white p-4 shadow-[0_12px_40px_#123C2F0A] md:right-1">
              <div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wider text-[#6A786E]">SAQTA Forecast</span><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EFF6E8] text-[#237A57]"><Sparkles size={14} /></span></div>
              <p className="mt-3 text-lg font-semibold leading-tight tracking-tight text-[#123C2F]">Сначала спрос.<br />Затем выпечка.</p>
              <div className="mt-4 flex items-center gap-2 border-t border-[#EEF0EA] pt-3 text-xs text-[#5D6B62]"><ShieldCheck size={14} className="text-[#237A57]" /> Объяснимый прогноз</div>
            </div>
            <Link href="/save" className="absolute bottom-0 left-0 flex w-[234px] items-center gap-3 rounded-2xl border border-[#E1E7DD] bg-white p-4 shadow-[0_12px_40px_#123C2F0A] transition hover:-translate-y-1 lg:-left-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#C7F36B] text-[#123C2F]"><Package size={24} strokeWidth={1.6} /></div>
              <div><p className="text-sm font-semibold text-[#123C2F]">SAQTA Save</p><p className="mt-1 text-xs text-[#5D6B62]">Хорошая еда. Новый шанс.</p></div>
              <ArrowUpRight size={16} className="ml-auto shrink-0 text-[#237A57]" />
            </Link>
          </div>
        </section>

        <div className="border-y border-[#DFE5DC]">
          <div className="mx-auto flex max-w-[1264px] flex-col justify-between gap-4 px-6 py-6 text-sm text-[#5D6B62] md:flex-row md:items-center md:px-0"><p className="font-medium text-[#123C2F]">Predict demand. Save food. Protect tomorrow.</p><p className="flex items-center gap-2 text-xs"><span className="h-1 w-1 rounded-full bg-[#237A57]" /> Одна система: от решения о выпечке до продажи остатков</p></div>
        </div>

        <section id="product" className="mx-auto max-w-[1360px] px-6 py-20 md:px-12 md:py-24">
          <div className="mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div><p className="mb-3 text-xs font-semibold uppercase tracking-[.18em] text-[#237A57]">Два модуля. Общая цель.</p><h2 className="max-w-[600px] text-3xl font-semibold leading-tight tracking-[-.045em] text-[#123C2F] md:text-[40px]">Меньше неопределённости.<br />Больше осмысленных решений.</h2></div>
            <p className="max-w-[300px] text-sm leading-6 text-[#5D6B62]">Сначала предотвращаем излишки. Помогаем продать подходящие остатки, когда они всё-таки появились.</p>
          </div>
          <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
            <div className="relative overflow-hidden rounded-[24px] bg-[#123C2F] p-7 text-white md:p-9">
              <div className="flex items-center gap-3 text-[#C7F36B]"><TrendingUp size={20} /><span className="text-xs font-semibold uppercase tracking-[.15em]">SAQTA Forecast</span></div>
              <h3 className="mt-6 max-w-[390px] text-2xl font-medium leading-tight tracking-[-.025em] md:text-3xl">Пеките с пониманием<br />завтрашнего спроса</h3>
              <p className="mt-4 max-w-[420px] text-sm leading-6 text-[#CFDDD4]">История продаж превращается в понятную рекомендацию: сколько произвести, какие остатки учесть и где есть риск нехватки.</p>
              <ul className="mt-7 space-y-3 text-sm text-[#E4ECE7]">{["Недавние продажи и история по дням недели", "Рекомендация с учётом доступных остатков", "Объяснение метода и оценка на прошлых данных"].map((item) => <li key={item} className="flex items-start gap-2.5"><Check size={16} className="mt-0.5 shrink-0 text-[#C7F36B]" />{item}</li>)}</ul>
              <Link href="/forecast" className="mt-9 inline-flex items-center gap-4 rounded-full bg-[#C7F36B] px-5 py-3 text-sm font-semibold text-[#123C2F] transition hover:bg-[#D7FA91]">Построить прогноз <ArrowUpRight size={17} /></Link>
              <p className="mt-5 text-xs text-[#AFBFAD]">Прогноз — оценка спроса, а не гарантия продаж.</p>
            </div>
            <div className="flex flex-col rounded-[24px] border border-[#E1E6DB] bg-[#ECF0E4] p-7 md:p-9">
              <div className="flex items-center gap-3 text-[#237A57]"><Store size={20} /><span className="text-xs font-semibold uppercase tracking-[.15em]">SAQTA Save</span></div>
              <h3 className="mt-6 max-w-[340px] text-2xl font-medium leading-tight tracking-[-.025em] text-[#123C2F] md:text-3xl">Осталась выпечка?<br />Найдите её покупателя.</h3>
              <p className="mt-4 max-w-[360px] text-sm leading-6 text-[#5D6B62]">Разместите доступную продукцию со скидкой, укажите время самовывоза и управляйте заказами в одном месте.</p>
              <div className="mt-7 grid grid-cols-3 gap-2 border-t border-[#D5DECE] pt-6 text-[#123C2F]">{[{ icon: Package, label: "Разместите" }, { icon: ScanLine, label: "Примите заказ" }, { icon: Clock3, label: "Передайте" }].map(({ icon: Icon, label }) => <div key={label}><Icon size={22} strokeWidth={1.5} /><p className="mt-3 text-xs font-medium">{label}</p></div>)}</div>
              <Link href="/save" className="mt-8 inline-flex items-center gap-3 self-start text-sm font-semibold text-[#123C2F]">Перейти в SAQTA Save <ArrowUpRight size={17} /></Link>
              <p className="mt-5 text-xs leading-5 text-[#63725F]">Размещение бесплатно для пекарен на всех тарифах. Демо-заказы без реальных платежей; только пригодная к продаже продукция.</p>
            </div>
          </div>
        </section>

        <section className="bg-white px-6 py-20 md:px-12">
          <div className="mx-auto grid max-w-[1264px] gap-10 lg:grid-cols-[.85fr_1.15fr] lg:gap-20">
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[.18em] text-[#237A57]">Видеть полную картину</p>
              <h2 className="text-3xl font-semibold leading-tight tracking-[-.04em] text-[#123C2F] md:text-[38px]">Ваши данные.<br />Ваш следующий шаг.</h2>
              <p className="mt-5 max-w-[380px] text-sm leading-7 text-[#5D6B62]">Продажи, производство, остатки и списания связаны в одной панели. Фильтруйте по периоду и точке — показатели пересчитываются по записям в базе.</p>
              <Link href="/forecast?view=results" className="mt-7 inline-flex items-center gap-3 text-sm font-semibold text-[#123C2F]">Открыть аналитику <ArrowRight size={16} /></Link>
            </div>
            <div className="overflow-hidden rounded-2xl border border-[#E2E8E1] bg-[#F7F7F2]">
              <div className="flex items-center justify-between border-b border-[#E2E8E1] px-6 py-4"><p className="flex items-center gap-2 text-sm font-semibold text-[#123C2F]"><BarChart3 size={17} /> От данных к действию</p><span className="rounded-full bg-[#E7EDD9] px-2.5 py-1 text-xs font-semibold tracking-wide text-[#526844]">ЖИВЫЕ ДАННЫЕ</span></div>
              <LandingAnalytics />
              <div className="divide-y divide-[#E2E8E1] px-6">{[{ title: "Продажи и производство", detail: "Сравните спрос и объём выпечки", icon: TrendingUp, href: "/forecast?view=results" }, { title: "Остатки и списания", detail: "Найдите товары с излишками", icon: Package, href: "/forecast?view=data" }, { title: "Подтверждённые результаты", detail: "Отдельно учёт, отдельно оценки", icon: Leaf, href: "/forecast?view=results" }].map(({ title, detail, icon: Icon, href }) => <Link href={href} key={title} className="group flex items-center gap-4 py-5"><span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E2E8E1] bg-white text-[#237A57]"><Icon size={18} /></span><div><p className="text-sm font-medium text-[#123C2F]">{title}</p><p className="mt-1 text-xs text-[#5D6B62]">{detail}</p></div><ChevronRight size={16} className="ml-auto text-[#5D6B62] transition group-hover:translate-x-1" /></Link>)}</div>
              <p className="border-t border-[#E2E8E1] px-6 py-3 text-xs leading-5 text-[#6A786E]">В демо используются синтетические записи. Реальные результаты зависят от данных пекарни.</p>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="mx-auto max-w-[1360px] px-6 py-20 md:px-12 md:py-24">
          <div className="text-center"><p className="mb-3 text-xs font-semibold uppercase tracking-[.18em] text-[#237A57]">Просто встроить в рабочий день</p><h2 className="text-3xl font-semibold tracking-[-.04em] text-[#123C2F] md:text-[38px]">От истории продаж — к плану на завтра</h2></div>
          <div className="mt-12 grid gap-8 md:grid-cols-3">{workflow.map(({ icon: Icon, number, title, description }) => <div key={number} className="relative border-t border-[#D8E2D4] pt-7"><div className="flex items-center justify-between"><span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#E8EEDD] text-[#237A57]"><Icon size={22} strokeWidth={1.6} /></span><span className="text-sm font-medium text-[#5D6B62]">{number}</span></div><h3 className="mt-5 text-lg font-semibold tracking-tight text-[#123C2F]">{title}</h3><p className="mt-3 max-w-[330px] text-sm leading-7 text-[#5D6B62]">{description}</p></div>)}</div>
        </section>

        <section className="mx-auto max-w-[1360px] px-6 pb-20 md:px-12">
          <div className="grid gap-8 rounded-[28px] bg-[#E9EEDC] p-7 md:p-10 lg:grid-cols-[1.15fr_1fr] lg:gap-20">
            <div><p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] text-[#237A57]"><Leaf size={14} /> Ответственное отношение к эффекту</p><h2 className="text-2xl font-semibold leading-tight tracking-[-.035em] text-[#123C2F] md:text-3xl">Сохранять ценность.<br />Считать честно.</h2><p className="mt-4 max-w-[460px] text-sm leading-7 text-[#53634E]">Мы учитываем продажи через SAQTA Save, вес продукции и зарегистрированные списания. Изменение показателей само по себе не доказывает влияние SAQTA.</p><Link href="/forecast?view=results" className="mt-6 inline-flex items-center gap-3 text-sm font-semibold text-[#123C2F]">Как считаем результаты <ArrowUpRight size={17} /></Link></div>
            <div className="grid gap-5 self-center">{[{ title: "Прозрачные расчёты", body: "Фактические записи отделены от прогнозов и потенциальной экономии." }, { title: "Без придуманных обещаний", body: "Без неподтверждённых CO₂-коэффициентов и гарантий сокращения отходов." }, { title: "Проверяемые допущения", body: "Предварительные тарифы Forecast отделены от сценарной экономии пекарни. Save остаётся бесплатным." }].map(({ title, body }) => <div key={title} className="flex items-start gap-3"><Check size={18} className="mt-0.5 shrink-0 text-[#237A57]" /><div><h3 className="text-sm font-semibold text-[#123C2F]">{title}</h3><p className="mt-1 text-xs leading-6 text-[#53634E]">{body}</p></div></div>)}</div>
          </div>
        </section>

        <section className="bg-[#123C2F] px-6 py-14 md:px-12 md:py-16">
          <div className="mx-auto flex max-w-[1264px] flex-col justify-between gap-7 md:flex-row md:items-center"><div><p className="mb-3 text-xs font-medium uppercase tracking-[.18em] text-[#C7F36B]">Сделайте первый шаг</p><h2 className="text-3xl font-medium tracking-[-.04em] text-white md:text-4xl">Завтра начинается<br />с хорошего плана.</h2></div><div><Link href="/forecast" className="inline-flex items-center gap-6 rounded-full bg-[#C7F36B] px-6 py-4 text-sm font-semibold text-[#123C2F] transition hover:bg-[#D7FA91]">Исследовать демо <ArrowUpRight size={18} /></Link><p className="mt-3 text-center text-xs text-[#B9CCC0]">Прогнозы · Учёт · SAQTA Save</p></div></div>
        </section>
      </main>

      <footer className="mx-auto max-w-[1360px] px-6 pb-7 pt-12 md:px-12">
        <div className="flex flex-col justify-between gap-8 md:flex-row"><div><Link href="/" aria-label="SAQTA — главная"><Image src="/brand/saqta-logo.svg" width={132} height={29} alt="SAQTA" /></Link><p className="mt-4 max-w-[280px] text-xs leading-6 text-[#5D6B62]">Технологии для осмысленной выпечки.<br />Начинаем с пекарен Астаны.</p></div><nav className="grid grid-cols-2 gap-x-12 gap-y-3 text-xs text-[#536358] md:grid-cols-3" aria-label="Навигация в подвале"><Link href="/forecast">SAQTA Forecast</Link><Link href="/save">SAQTA Save</Link><Link href="/docs">Документация</Link><Link href="/forecast?view=results">Эффект</Link><Link href="/about">О проекте</Link><Link href="/forecast?view=data">Данные и настройки</Link></nav></div>
        <div className="mt-9 flex flex-col justify-between gap-2 border-t border-[#DFE5DC] pt-5 text-xs text-[#6A786E] md:flex-row"><p>© {new Date().getFullYear()} SAQTA. Сохраняем то, что ценно.</p><p>Демонстрационный MVP · Синтетические данные · Без реальных платежей</p></div>
      </footer>
    </div>
  );
}
