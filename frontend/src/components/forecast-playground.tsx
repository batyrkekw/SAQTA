'use client';

import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { useI18n } from '@/components/language-provider';
import { SanaSpark } from '@/components/sana-thread';
import styles from './forecast-playground.module.css';

/*
 * A small, honest demo of the FORECAST idea on illustrative numbers: the plan for a
 * weekday is the mean of the last four same weekdays, plus a buffer chosen by the
 * visitor. Leftovers and shortages are replayed against those same four days.
 */
const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;
// Illustrative sales of one loaf type for the last four weeks, Monday first.
const HISTORY: number[][] = [
  [38, 41, 36, 40], [35, 37, 39, 36], [40, 38, 41, 43], [42, 39, 44, 41],
  [52, 55, 49, 54], [61, 58, 66, 63], [47, 51, 45, 49],
];
const PRICE = 450; // ₸ per loaf, illustrative

export function planFor(history: number[], bufferPercent: number) {
  const mean = history.reduce((sum, value) => sum + value, 0) / history.length;
  const plan = Math.round(mean * (1 + bufferPercent / 100));
  const leftovers = history.reduce((sum, value) => sum + Math.max(plan - value, 0), 0);
  const shortDays = history.filter(value => value > plan).length;
  const missed = history.reduce((sum, value) => sum + Math.max(value - plan, 0), 0);
  return { mean, plan, leftovers, shortDays, missed };
}

export function ForecastPlayground() {
  const { t, number } = useI18n();
  const id = useId();
  const [day, setDay] = useState(4);
  const [buffer, setBuffer] = useState(10);
  const history = HISTORY[day];
  const result = useMemo(() => planFor(history, buffer), [history, buffer]);
  const max = Math.max(...HISTORY.flat(), result.plan) * 1.08;
  const leftoverCost = result.leftovers * PRICE;

  return <section className={styles.section} aria-labelledby={`${id}-title`} data-reveal>
    <div className={styles.copy}>
      <p className={styles.eyebrow}><SanaSpark size={11} />{t('ПОПРОБУЙТЕ ПРЯМО ЗДЕСЬ')}</p>
      <h2 id={`${id}-title`}>{t('Сколько печь')}<br /><span>{t('на завтра?')}</span></h2>
      <p className={styles.lead}>{t('Выберите день и запас. SAQTA проверит план на прошлых неделях: сколько бы осталось и когда хлеба не хватило бы.')}</p>
      <p className={styles.note}>{t('Условные данные одного батона за 4 недели. Ваш прогноз считается по вашей истории продаж.')}</p>
      <Link href="/forecast" className={styles.cta}>{t('Рассчитать по своим данным')}<ArrowUpRight size={17} aria-hidden="true" /></Link>
    </div>

    <div className={styles.card}>
      <div className={styles.days} role="radiogroup" aria-label={t('День недели')}>
        {DAYS.map((label, index) => <button key={label} type="button" role="radio" aria-checked={day === index} onClick={() => setDay(index)}>{t(label)}</button>)}
      </div>

      <div className={styles.chart} role="img" aria-label={t('Продажи за последние 4 недели и план на выбранный день')}>
        {history.map((value, index) => <div key={index} className={styles.barWrap}>
          <span className={styles.barValue}>{value}</span>
          <div className={`${styles.bar} ${value > result.plan ? styles.short : ''}`} style={{ height: `${(value / max) * 100}%` }} />
          <span className={styles.barLabel}>{t('нед.')} {index + 1}</span>
        </div>)}
        <div className={styles.planLine} style={{ bottom: `calc(${(result.plan / max) * 100}% + 22px)` }}>
          <span>{t('План')} {result.plan}</span>
        </div>
      </div>

      <label className={styles.slider} htmlFor={`${id}-buffer`}>
        <span>{t('Запас сверх среднего')}<b>{buffer}%</b></span>
        <input id={`${id}-buffer`} type="range" min={0} max={25} step={1} value={buffer} onChange={event => setBuffer(Number(event.target.value))} />
      </label>

      <dl className={styles.stats}>
        <div className={styles.primaryStat}><dt>{t('Испечь')}</dt><dd>{result.plan} <small>{t('шт.')}</small></dd></div>
        <div><dt>{t('Осталось бы за 4 дня')}</dt><dd>{result.leftovers} <small>{t('шт.')}</small><em>≈ {number(leftoverCost)} ₸</em></dd></div>
        <div><dt>{t('Дней с нехваткой')}</dt><dd>{result.shortDays} <small>{t('из 4')}</small>{result.missed > 0 && <em>{t('не хватило')} {result.missed} {t('шт.')}</em>}</dd></div>
      </dl>
      <p className={styles.hint} aria-live="polite">{t(result.shortDays === 0 ? 'Нехватки не было — можно попробовать меньший запас.' : result.shortDays >= 2 ? 'Хлеба часто не хватает — запас стоит увеличить.' : 'Баланс: редкая нехватка и немного остатков.')}</p>
    </div>
  </section>;
}
