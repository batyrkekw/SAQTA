"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Leaf, Sprout } from "lucide-react";
import { useI18n } from "./language-provider";
import styles from "./home-community.module.css";

const plans = [
  { name: "Save", tier: 0, price: 0, icon: Sprout, audience: "Для покупателей", description: "Находите продукты со скидкой рядом и забирайте их у продавца.", features: ["Поиск и бронирование бесплатно", "Без регистрации карты", "Оплата продавцу при получении"], href: "/save", action: "Найти продукты" },
  { name: "Business", tier: 2, price: 15000, icon: Leaf, audience: "Для пекарен, кафе и сетей", description: "Один тариф со всеми функциями. Платите за каждую точку, которую подключаете.", features: ["План выпечки на каждый день", "Загрузка CSV и Excel, анкета без истории", "Проверка прогноза на истории", "До 100 продуктов и 500 запусков в месяц на точку", "Размещение остатков в Save бесплатно, 5% с продажи"], href: "/billing", action: "Попробовать 14 дней" },
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
          <div><h2 id="pricing-title">{t("Тарифы")}</h2><p className={styles.pricingLead}>{t("Покупателям всё бесплатно. Бизнес платит одну цену за точку, без разных пакетов.")}</p></div>
          <div className={styles.billing} role="group" aria-label={t("Период подписки")}><button type="button" aria-pressed={!annual} onClick={() => setAnnual(false)}>{t("Месяц")}</button><button type="button" aria-pressed={annual} onClick={() => setAnnual(true)}>{t("Год")}<span>−17%</span></button></div>
        </div>
        <div className={`${styles.plans} ${styles.plansTwo}`}>{plans.map(plan => <article key={plan.name} className={`${styles.plan} ${styles[`tier${plan.tier}`]}`} aria-labelledby={`plan-${plan.name}`}>
          <div className={styles.planTop}><span className={styles.planIcon}><plan.icon size={24} strokeWidth={1.5} aria-hidden="true" /></span><span>{t(plan.audience)}</span></div>
          <h3 id={`plan-${plan.name}`}>{plan.name}</h3>
          <p className={styles.planDescription}>{t(plan.description)}</p>
          <div className={styles.price}><strong>{plan.price === 0 ? t("0 ₸") : money(monthly(plan.price))}</strong><span>{t(plan.price === 0 ? "всегда" : "в месяц за точку")}</span></div>
          <p className={styles.billingNote}>{plan.price === 0 ? t("Без подписки") : annual ? `${money(plan.price * 10)} ${t("за точку на год, единым платежом")}` : `${t("3 точки —")} ${money(plan.price * 3)} ${t("в месяц")}`}</p>
          <ul className={styles.features}>
            {plan.features.map(feature => <li key={feature}><Check size={15} aria-hidden="true" />{t(feature)}</li>)}
          </ul>
          <Link href={plan.href} className={styles.planButton} aria-label={plan.price ? `${t("Подключить")} ${plan.name}` : undefined}>{t(plan.action)}<ArrowUpRight size={17} aria-hidden="true" /></Link>
        </article>)}</div>
        <p className={styles.planFootnote}>{t("Новые пекарни получают 14 дней бесплатно, до 3 точек, без карты. Оплата картой онлайн или по счёту для ИП и ТОО.")}</p>
      </div>
    </section>
    </>
  );
}
