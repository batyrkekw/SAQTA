"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Crown, Leaf, Quote, Sprout, X } from "lucide-react";
import { useI18n } from "./language-provider";
import { Modal } from "./ui";
import styles from "./home-community.module.css";

const stories = [
  { name: "Айдана", role: "Покупатель", quote: "Люблю идею забрать вкусную выпечку по пути домой. Хорошая еда заслуживает оказаться на столе, а не в мусоре." },
  { name: "Данияр", role: "Владелец пекарни", quote: "Хочется начинать утро с понятного плана: что печь и сколько. Такой помощник был бы очень кстати небольшой пекарне." },
  { name: "Алина", role: "Управляющая кофейней", quote: "Мне близко, что здесь думают и о бизнесе, и о еде. Один сервис для планирования и подходящих остатков — понятная идея." },
];
const plans = [
  { name: "Start", price: 0, icon: Sprout, audience: "Первый шаг", description: "Для знакомства с SAQTA и ежедневных находок.", features: ["Поиск и бронирование в SAVE", "Анкета и базовый прогноз", "Загрузка CSV и Excel"], future: [] },
  { name: "Growth", price: 14900, icon: Leaf, audience: "Для своего дела", description: "Для пекарни или кофейни, которая растёт.", features: ["Всё из Start", "До 3 точек и 100 товаров", "История прогнозов и отчёты"], future: ["Команда до 3 пользователей", "Уведомления об излишках"] },
  { name: "Scale", price: 39900, icon: Crown, audience: "Больше масштаба", description: "Для сети и команды, которая смотрит вперёд.", features: ["Всё из Growth", "До 10 точек и 500 товаров"], future: ["Команда до 10 пользователей", "Сравнение точек в одной панели", "Помощь с подключением и приоритетная поддержка"] },
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
  const [selected, setSelected] = useState<(typeof plans)[number] | null>(null);
  const monthly = (price: number) => annual ? Math.round(price * 0.8) : price;
  return (
    <>
    <section id="pricing" className={styles.pricing} aria-labelledby="pricing-title" data-reveal>
      <div className={styles.inner}>
        <div className={styles.heading}>
          <div><p className={styles.kicker}>{t("РАСТИТЕ В СВОЁМ ТЕМПЕ")}</p><h2 id="pricing-title">{t("От первого шага")}<br /><em>{t("до большого дела.")}</em></h2></div>
          <div className={styles.billing} role="group" aria-label={t("Период подписки")}><button type="button" aria-pressed={!annual} onClick={() => setAnnual(false)}>{t("Месяц")}</button><button type="button" aria-pressed={annual} onClick={() => setAnnual(true)}>{t("Год")}<span>−20%</span></button></div>
        </div>
        <p className={styles.pricingNote}><span>{t("Концепция подписок")}</span>{t("Сейчас все доступные функции бесплатны. Платные тарифы ещё не запущены.")}</p>
        <div className={styles.plans}>{plans.map((plan, index) => <article key={plan.name} className={`${styles.plan} ${styles[`tier${index}`]}`} aria-labelledby={`plan-${plan.name}`}>
          <div className={styles.planTop}><span className={styles.planIcon}><plan.icon size={24} strokeWidth={1.5} aria-hidden="true" /></span><span>{t(plan.audience)}</span></div>
          <h3 id={`plan-${plan.name}`}>{plan.name}</h3>
          <p className={styles.planDescription}>{t(plan.description)}</p>
          <div className={styles.price}><strong>{money(monthly(plan.price))}</strong><span>{t("/ месяц")}</span></div>
          <p className={styles.billingNote}>{plan.price === 0 ? t("Бесплатно для старта") : annual ? `${money(monthly(plan.price) * 12)} ${t("за год · единым платежом")}` : t("При ежемесячной оплате")}</p>
          <ul className={styles.features}>
            {plan.features.map(feature => <li key={feature}><Check size={15} aria-hidden="true" />{t(feature)}</li>)}
            {plan.future.map(feature => <li key={feature}><Check size={15} aria-hidden="true" /><span>{t(feature)}<small>{t("Планируется")}</small></span></li>)}
          </ul>
          {plan.price === 0 ? <Link href="/forecast" className={styles.planButton}>{t("Начать бесплатно")}<ArrowUpRight size={17} aria-hidden="true" /></Link> : <button type="button" className={styles.planButton} aria-label={`${t("Посмотреть тариф")} ${plan.name}`} onClick={() => setSelected(plan)}>{t("Посмотреть тариф")}<ArrowUpRight size={17} aria-hidden="true" /></button>}
        </article>)}</div>
        <p className={styles.planFootnote}>{t("Цены и лимиты предварительные. Оплата не принимается, ограничения тарифов сейчас не применяются.")}</p>
      </div>
    </section>
      {/* Keep the fixed dialog outside the section with a reveal transform. */}
      {selected && <Modal title={`Тариф ${selected.name}`} onClose={() => setSelected(null)}>
        <div className={styles.planDialog}>
          <p className={styles.dialogBadge}>{t("Предварительный тариф")}</p>
          <p className={styles.dialogPrice}>{money(monthly(selected.price))}<span>{t("/ месяц")}</span></p>
          <p>{annual ? `${money(monthly(selected.price) * 12)} ${t("за год · единым платежом")}` : t("При ежемесячной оплате")}</p>
          <ul>{[...selected.features, ...selected.future].map(feature => <li key={feature}><Check size={15} aria-hidden="true" />{t(feature)}</li>)}</ul>
          <p className={styles.dialogNotice}>{t("Это состав будущей подписки, а не доступный к оплате продукт. Пока можно бесплатно попробовать текущие возможности FORECAST.")}</p>
          <Link href="/forecast" className="btn-primary" onClick={() => setSelected(null)}>{t("Попробовать FORECAST")}<ArrowUpRight size={16} aria-hidden="true" /></Link>
          <button className={styles.closeDialog} type="button" onClick={() => setSelected(null)}><X size={13} aria-hidden="true" />{t("Вернуться к тарифам")}</button>
        </div>
      </Modal>}
    </>
  );
}
