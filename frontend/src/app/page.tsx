"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Check, FileSpreadsheet, ShoppingBag, Store, TrendingDown } from "lucide-react";
import { BakeTicket } from "@/components/bake-ticket";
import { HomePricing } from "@/components/home-community";
import { ProductHeader } from "@/components/product-header";
import { ForecastPlayground } from "@/components/forecast-playground";
import { SanaSpark } from "@/components/sana-thread";
import { useI18n } from "@/components/language-provider";
import styles from "./home.module.css";

const steps = [
  { icon: FileSpreadsheet, title: "Загрузите продажи", text: "Excel или CSV из кассы. Нет истории — ответьте на короткую анкету, и план будет предварительным." },
  { icon: TrendingDown, title: "Получите план на завтра", text: "Сколько печь каждого изделия, с запасом, который задаёте вы. Чем больше дней в истории, тем точнее." },
  { icon: Store, title: "Продайте остаток", text: "То, что всё-таки осталось, опубликуйте в SaqtaFood Save со скидкой. Публикация бесплатна." },
];
const sides = [
  { tone: "bakery", title: "Для пекарни и кофейни", points: ["План выпечки на каждый день", "Меньше списаний и ночных подсчётов", "Остатки уходят покупателям, а не в мусор"], cta: "Попробовать 14 дней бесплатно", href: "/forecast" },
  { tone: "buyer", title: "Для покупателя", points: ["Свежая выпечка рядом со скидкой", "Бронь в пару нажатий, без предоплаты", "Забираете в удобное время по коду"], cta: "Найти выпечку рядом", href: "/save" },
];
const offers = [
  ["Круассаны, 4 шт.", "Забрать до 21:00, ул. Достык", "−50%"],
  ["Бородинский хлеб", "Забрать до 20:30, пр. Республики", "−40%"],
  ["Самса, 6 шт.", "Забрать до 22:00, ул. Кенесары", "−35%"],
];
const questions = [
  ["Сколько стоит SaqtaFood?", "Для покупателей бесплатно. Для бизнеса один тариф: 15 000 ₸ в месяц за каждую точку, все функции включены. Первые 14 дней бесплатно, без карты. Размещение остатков в Save бесплатно, комиссия 5% с завершённой продажи."],
  ["Можно начать без истории продаж?", "Да. Ответьте на короткую анкету о продуктах и днях работы: вы получите предварительный план и уточните его, когда накопятся реальные продажи."],
  ["Кто видит данные моей пекарни?", "Только ваша организация. Данные разных пекарен разделены на сервере; покупатели видят только опубликованные вами предложения."],
  ["Как оплатить тариф?", "Картой онлайн через TipTop Pay или по счёту для ИП и ТОО: переводом или через Kaspi. Тариф включается автоматически после оплаты."],
  ["Как покупателю забрать выпечку?", "Выбрать предложение в Save, забронировать нужное количество и забрать в указанное время по коду. Оплата — продавцу при получении."],
];

export default function Home() {
  const { t } = useI18n();
  return (
    <div className={styles.page}>
      <a href="#main" className={styles.skip}>{t("Перейти к содержимому")}</a>
      <ProductHeader />
      <main id="main">
        <section className={styles.hero} aria-labelledby="home-title">
          <div className={styles.heroCopy}>
            <h1 id="home-title">{t("Пеките столько, сколько купят.")}</h1>
            <p className={styles.lead}>{t("SaqtaFood смотрит на ваши продажи и каждый вечер подсказывает, сколько печь завтра. А то, что всё-таки осталось, покупатели рядом забирают со скидкой.")}</p>
            <div className={styles.actions}>
              <Link href="/forecast" className={styles.primary}>{t("Попробовать 14 дней бесплатно")}<ArrowUpRight size={18} aria-hidden="true" /></Link>
              <Link href="/save" className={styles.secondary}>{t("Купить выпечку со скидкой")}</Link>
            </div>
            <ul className={styles.facts}>
              {["Без карты на старте", "Excel и CSV из кассы", "Қазақша, русский, English"].map(fact => <li key={fact}><Check size={15} aria-hidden="true" />{t(fact)}</li>)}
            </ul>
          </div>
          <BakeTicket />
        </section>

        <section className={styles.how} aria-labelledby="how-title">
          <h2 id="how-title">{t("Как это работает")}</h2>
          <ol className={styles.steps}>
            {steps.map(({ icon: Icon, title, text }, index) => (
              <li key={title}>
                <span className={styles.stepIndex} aria-hidden="true">{index + 1}</span>
                <Icon size={22} strokeWidth={1.6} aria-hidden="true" className={styles.stepIcon} />
                <h3>{t(title)}</h3>
                <p>{t(text)}</p>
              </li>
            ))}
          </ol>
        </section>

        <ForecastPlayground />

        <section className={styles.sides} aria-label={t("Для кого SaqtaFood")}>
          {sides.map(side => (
            <article key={side.tone} className={side.tone === "bakery" ? styles.sideBakery : styles.sideBuyer}>
              {side.tone === "bakery"
                ? <div className={styles.sidePhoto}><Image src="/images/artisan-bread.jpg" alt={t("Ремесленный хлеб с хрустящей корочкой на деревянной доске")} fill sizes="(max-width: 860px) 100vw, 40vw" /></div>
                : <ShoppingBag size={34} strokeWidth={1.4} className={styles.sideIcon} aria-hidden="true" />}
              <h2>{t(side.title)}</h2>
              <ul>{side.points.map(point => <li key={point}><Check size={16} aria-hidden="true" />{t(point)}</li>)}</ul>
              {side.tone === "buyer" && <div className={styles.offers} aria-label={t("Пример предложений в Save")}><p className={styles.offersLabel}>{t("Так выглядят предложения в Save")}</p>{offers.map(([name, place, deal]) => <div key={name} className={styles.offer}><strong>{t(name)}</strong><b>{deal}</b><span>{t(place)}</span></div>)}</div>}
              <Link href={side.href} className={side.tone === "bakery" ? styles.primary : styles.secondary}>{t(side.cta)}<ArrowUpRight size={18} aria-hidden="true" /></Link>
            </article>
          ))}
        </section>

        <HomePricing />

        <section className={styles.questions} aria-labelledby="questions-title">
          <h2 id="questions-title">{t("Частые вопросы")}</h2>
          <div className={styles.answers}>{questions.map(([question, answer]) => <details key={question}><summary>{t(question)}<span className={styles.plus} aria-hidden="true" /></summary><p>{t(answer)}</p></details>)}</div>
        </section>

        <section className={styles.closing} aria-labelledby="closing-title">
          <h2 id="closing-title">{t("Завтрашний план — уже сегодня вечером.")}</h2>
          <div className={styles.closingActions}>
            <Link href="/forecast" className={styles.lime}>{t("Попробовать 14 дней бесплатно")}<ArrowUpRight size={18} aria-hidden="true" /></Link>
            <Link href="/billing" className={styles.ghost}>{t("Тарифы и оплата")}</Link>
          </div>
        </section>
      </main>
      <footer className={styles.footer}>
        <Link href="/" aria-label={t("SaqtaFood — главная")}><Image src="/brand/saqta-logo.svg" width={112} height={25} alt="SaqtaFood" /></Link>
        <p>© {new Date().getFullYear()} SaqtaFood. {t("Сделано в Казахстане.")} <span className={styles.ecosystem}><SanaSpark size={10} />{t("Часть экосистемы SANA")}</span></p>
        <nav aria-label={t("Навигация в подвале")}>
          <Link href="/forecast">Forecast</Link><Link href="/save">Save</Link><Link href="/billing">{t("Тарифы")}</Link>
          <Link href="/offer">{t("Публичная оферта")}</Link><Link href="/privacy">{t("Политика конфиденциальности")}</Link><Link href="/terms">{t("Пользовательское соглашение")}</Link>
        </nav>
      </footer>
    </div>
  );
}
