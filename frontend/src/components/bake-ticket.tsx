"use client";

import { useI18n } from "@/components/language-provider";
import { Check, ShoppingBag } from "lucide-react";
import styles from "@/app/home.module.css";

// An illustrative plan, labelled as an example: the shape of what Forecast returns every evening.
const rows = [
  { name: "Багет", usual: 44, bake: 38 },
  { name: "Круассан", usual: 32, bake: 24 },
  { name: "Самса с мясом", usual: 48, bake: 52 },
  { name: "Бородинский", usual: 14, bake: 14 },
  { name: "Синнабон", usual: 20, bake: 16 },
];

export function BakeTicket() {
  const { t, number } = useI18n();
  return (
    <div className={styles.ticketWrap}>
      <article className={styles.ticket} aria-label={t("Пример плана выпечки на завтра")}>
        <header className={styles.ticketHead}>
          <p className={styles.ticketKicker}>{t("Пример расчёта")}</p>
          <h2 className={styles.ticketTitle}>{t("План выпечки на завтра")}</h2>
          <p className={styles.ticketMeta}>{t("Посчитано вечером по продажам за 8 недель")}</p>
        </header>
        <table className={styles.ticketTable}>
          <thead><tr><th scope="col">{t("Изделие")}</th><th scope="col">{t("Обычно")}</th><th scope="col">{t("Испечь")}</th></tr></thead>
          <tbody>
            {rows.map((row, index) => {
              const delta = row.bake - row.usual;
              return (
                <tr key={row.name} style={{ animationDelay: `${300 + index * 140}ms` }}>
                  <th scope="row">{t(row.name)}</th>
                  <td>{number(row.usual)}</td>
                  <td><strong>{number(row.bake)}</strong>{delta !== 0 && <span className={delta < 0 ? styles.less : styles.more}>{delta > 0 ? "+" : "−"}{number(Math.abs(delta))}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <footer className={styles.ticketFoot}>
          <span>{t("Остаток к закрытию")}</span>
          <strong>{t("≈ 7 шт. вместо 19")}</strong>
        </footer>
      </article>
      <div className={styles.saveNote}>
        <span className={styles.saveIcon}><ShoppingBag size={18} aria-hidden="true" /></span>
        <span><strong>{t("6 круассанов за полцены")}</strong><small>{t("Остаток дня в SaqtaFood Save. Забронировали за 12 минут.")}</small></span>
        <span className={styles.saveCheck}><Check size={14} aria-hidden="true" /></span>
      </div>
    </div>
  );
}
