"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Crown, Leaf, Sprout } from "lucide-react";
import { useI18n } from "./language-provider";
import styles from "./home-community.module.css";

const plans = [
  { name: "Free", price: 0, icon: Sprout, audience: "Первый шаг", description: "Для знакомства с SaqtaFood и ежедневных находок.", features: ["Поиск и бронирование в SAVE", "Бесплатное размещение остатков", "Каталог до 3 товаров"], future: [] },
  { name: "Starter", price: 15000, icon: Leaf, audience: "Для одной точки", description: "Для пекарни или кофейни, которая планирует выпечку по данным.", features: ["14 дней бесплатно", "До 20 товаров, 1 точка", "300 запусков прогноза в месяц", "Загрузка CSV и Excel"], future: ["Уведомления об излишках"] },
  { name: "Pro", price: 30000, icon: Crown, audience: "Больше масштаба", description: "Для сети точек и команды, которая смотрит вперёд.", features: ["Всё из Starter", "До 100 товаров и 10 точек", "1000 запусков прогноза в месяц", "Проверка прогноза на истории"], future: ["Команда до 10 пользователей", "Помощь с подключением и приоритетная поддержка"] },
] as const;

export function HomePricing() {
  const { t, money } = useI18n();
  const [annual, setAnnual] = useState(false);
  // A year costs ten months, the same rule as the billing server.
  const monthly = (price: number) => annual ? Math.round(price * 10 / 12) : price;
  return (
    <>
    <section id="pricing" className={styles.pricing} aria-labelledby="pricing-title">
      <div className={styles.inner}>
        <div className={styles.heading}>
          <div><h2 id="pricing-title">{t("Тарифы")}</h2><p className={styles.pricingLead}>{t("Платите только за прогноз. Размещение остатков в Save бесплатно на любом тарифе.")}</p></div>
          <div className={styles.billing} role="group" aria-label={t("Период подписки")}><button type="button" aria-pressed={!annual} onClick={() => setAnnual(false)}>{t("Месяц")}</button><button type="button" aria-pressed={annual} onClick={() => setAnnual(true)}>{t("Год")}<span>−17%</span></button></div>
        </div>
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
