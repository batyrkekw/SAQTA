"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Crown, Leaf, Quote, Sprout } from "lucide-react";
import { useI18n } from "./language-provider";
import styles from "./home-community.module.css";

const stories = [
  { name: "Айдана", role: "Покупатель", quote: "Люблю идею забрать вкусную выпечку по пути домой. Хорошая еда заслуживает оказаться на столе, а не в мусоре." },
  { name: "Данияр", role: "Владелец пекарни", quote: "Хочется начинать утро с понятного плана: что печь и сколько. Такой помощник был бы очень кстати небольшой пекарне." },
  { name: "Алина", role: "Управляющая кофейней", quote: "Мне близко, что здесь думают и о бизнесе, и о еде. Один сервис для планирования и подходящих остатков — понятная идея." },
];
const plans = [
  { name: "Free", price: 0, icon: Sprout, audience: "Первый шаг", description: "Для знакомства с SaqtaFood и ежедневных находок.", features: ["Поиск и бронирование в SAVE", "Бесплатное размещение остатков", "Каталог до 3 товаров"], future: [] },
  { name: "Starter", price: 15000, icon: Leaf, audience: "Для одной точки", description: "Для пекарни или кофейни, которая планирует выпечку по данным.", features: ["14 дней бесплатно", "До 20 товаров, 1 точка", "300 запусков прогноза в месяц", "Загрузка CSV и Excel"], future: ["Уведомления об излишках"] },
  { name: "Pro", price: 30000, icon: Crown, audience: "Больше масштаба", description: "Для сети точек и команды, которая смотрит вперёд.", features: ["Всё из Starter", "До 100 товаров и 10 точек", "1000 запусков прогноза в месяц", "Проверка прогноза на истории"], future: ["Команда до 10 пользователей", "Помощь с подключением и приоритетная поддержка"] },
] as const;

export function HomeCommunity() {
  const { t } = useI18n();
  return (
    <section className={styles.community} aria-labelledby="community-title" data-reveal>
      <div className={styles.inner}>
        <div className={styles.heading}>
          <div><p className={styles.kicker}>{t("ЛЮДИ И ХОРОШАЯ ЕДА")}</p><h2 id="community-title">{t("Идея, которой")}<br /><em>{t("хочется поделиться.")}</em></h2></div>
          <p className={styles.disclosure}><span>{t("Примеры отзывов")}</span>{t("Вымышленные истории для макета. Заменим их реальными отзывами после интервью.")}</p>
        </div>
        <div className={styles.stories}>{stories.map(({ name, role, quote }, index) => <figure key={name} className={styles.story}>
          <div className={styles.quoteTop}><Quote size={25} strokeWidth={1.4} aria-hidden="true" /><span>{t("Пример")}</span></div>
          <blockquote>{t(quote)}</blockquote>
          <figcaption><span className={`${styles.avatar} ${styles[`avatar${index}`]}`} aria-hidden="true">{t(name).slice(0, 1)}</span><span><strong>{t(name)}</strong><small>{t(role)}</small></span></figcaption>
        </figure>)}</div>
      </div>
    </section>
  );
}

export function HomePricing() {
  const { t, money } = useI18n();
  const [annual, setAnnual] = useState(false);
  // A year costs ten months, the same rule as the billing server.
  const monthly = (price: number) => annual ? Math.round(price * 10 / 12) : price;
  return (
    <>
    <section id="pricing" className={styles.pricing} aria-labelledby="pricing-title" data-reveal>
      <div className={styles.inner}>
        <div className={styles.heading}>
          <div><p className={styles.kicker}>{t("РАСТИТЕ В СВОЁМ ТЕМПЕ")}</p><h2 id="pricing-title">{t("От первого шага")}<br /><em>{t("до большого дела.")}</em></h2></div>
          <div className={styles.billing} role="group" aria-label={t("Период подписки")}><button type="button" aria-pressed={!annual} onClick={() => setAnnual(false)}>{t("Месяц")}</button><button type="button" aria-pressed={annual} onClick={() => setAnnual(true)}>{t("Год")}<span>−17%</span></button></div>
        </div>
        <p className={styles.pricingNote}><span>{t("Концепция подписок")}</span>{t("Сейчас все доступные функции бесплатны. Платные тарифы ещё не запущены.")}</p>
        <div className={styles.plans}>{plans.map((plan, index) => <article key={plan.name} className={`${styles.plan} ${styles[`tier${index}`]}`} aria-labelledby={`plan-${plan.name}`}>
          <div className={styles.planTop}><span className={styles.planIcon}><plan.icon size={24} strokeWidth={1.5} aria-hidden="true" /></span><span>{t(plan.audience)}</span></div>
          <h3 id={`plan-${plan.name}`}>{plan.name}</h3>
          <p className={styles.planDescription}>{t(plan.description)}</p>
          <div className={styles.price}><strong>{money(monthly(plan.price))}</strong><span>{t("/ месяц")}</span></div>
          <p className={styles.billingNote}>{plan.price === 0 ? t("Бесплатно для старта") : annual ? `${money(plan.price * 10)} ${t("за год · единым платежом")}` : t("При ежемесячной оплате")}</p>
          <ul className={styles.features}>
            {plan.features.map(feature => <li key={feature}><Check size={15} aria-hidden="true" />{t(feature)}</li>)}
            {plan.future.map(feature => <li key={feature}><Check size={15} aria-hidden="true" /><span>{t(feature)}<small>{t("Планируется")}</small></span></li>)}
          </ul>
          {plan.price === 0 ? <Link href="/save" className={styles.planButton}>{t("Начать бесплатно")}<ArrowUpRight size={17} aria-hidden="true" /></Link> : <Link href="/billing" className={styles.planButton} aria-label={`${t("Подключить")} ${plan.name}`}>{t("Попробовать 14 дней")}<ArrowUpRight size={17} aria-hidden="true" /></Link>}
        </article>)}</div>
        <p className={styles.planFootnote}>{t("Новые пекарни получают 14 дней Starter бесплатно, без карты. Оплата картой онлайн или по счёту для ИП и ТОО.")}</p>
      </div>
    </section>
    </>
  );
}
