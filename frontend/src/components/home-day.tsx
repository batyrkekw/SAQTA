"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUpRight, Check, RotateCcw, Sun, Sunrise, Sunset } from "lucide-react";
import { useI18n } from "@/components/language-provider";
import styles from "@/app/home.module.css";

const stages = [
  {
    id: "morning",
    time: "07:00",
    label: "Утро",
    summary: "Планируем выпечку",
    title: "Начните с плана.",
    description: "История продаж помогает выбрать объём выпечки. Если данных ещё нет, начните с анкеты и уточняйте оценку постепенно.",
    input: "История продаж или анкета",
    output: "План, который можно уточнять",
    product: "Forecast",
    href: "/forecast",
    action: "Перейти в Forecast",
    icon: Sunrise,
    tasks: ["Подготовить историю продаж или заполнить анкету", "Посмотреть прогноз и его ограничения", "Выбрать объём первой выпечки"],
  },
  {
    id: "daytime",
    time: "14:00",
    label: "День",
    summary: "Сверяем с продажами",
    title: "Проверьте, как идёт день.",
    description: "Прогноз полезнее, когда рядом есть факты. Добавляйте продажи, остатки и списания, чтобы оценивать решения на своих данных.",
    input: "Фактические продажи и остатки",
    output: "Данные для следующего прогноза",
    product: "Forecast",
    href: "/forecast",
    action: "Перейти в Forecast",
    icon: Sun,
    tasks: ["Записать фактические продажи", "Отметить остатки и списания", "Учесть результат в следующем плане"],
  },
  {
    id: "evening",
    time: "18:00",
    label: "Вечер",
    summary: "Находим покупателей",
    title: "Дайте остаткам новый шанс.",
    description: "Свежая выпечка ещё может найти покупателя. В Save задайте количество, цену и время самовывоза, а при выдаче проверьте код заказа.",
    input: "Выпечка, которую ещё можно продать",
    output: "Предложение с окном самовывоза",
    product: "Save",
    href: "/save",
    action: "Перейти в Save",
    icon: Sunset,
    tasks: ["Добавить предложение с фото и количеством", "Указать цену и окно самовывоза", "Подтвердить выдачу по коду покупателя"],
  },
] as const;

export function HomeDay() {
  const { t } = useI18n();
  const [selected, setSelected] = useState(0);
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set());
  const stage = stages[selected];
  const StageIcon = stage.icon;
  const completed = stage.tasks.filter((_, index) => checked.has(`${stage.id}-${index}`)).length;
  const progress = t("Отмечено: {0} из {1}").replace("{0}", String(completed)).replace("{1}", String(stage.tasks.length));

  function toggleTask(key: string) {
    setChecked(previous => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <section className={styles.daySection} aria-labelledby="bakery-day-title">
      <div className={styles.dayHeading}>
        <div>
          <p className={styles.eyebrow}>{t("ОДИН ДЕНЬ ПЕКАРНИ")}</p>
          <h2 id="bakery-day-title">{t("От первого плана")}<br /><span className={styles.serif}>{t("до последней булочки.")}</span></h2>
        </div>
        <p>{t("Выберите момент дня и посмотрите, как связаны планирование, продажи и забота об остатках.")}</p>
      </div>

      <div className={styles.dayTimeline} role="group" aria-label={t("Выберите этап рабочего дня")}>
        {stages.map((item, index) => {
          const Icon = item.icon;
          return (
            <button key={item.id} type="button" aria-pressed={selected === index} aria-controls="bakery-day-workspace" onClick={() => setSelected(index)}>
              <Icon size={23} strokeWidth={1.6} aria-hidden="true" />
              <span><strong>{t(item.label)} <time>{item.time}</time></strong><small>{t(item.summary)}</small></span>
              <span className={styles.dayStep} aria-hidden="true">0{index + 1}</span>
            </button>
          );
        })}
      </div>

      <div id="bakery-day-workspace" className={styles.dayWorkspace} data-stage={stage.id}>
        <div className={styles.dayScene}>
          <div className={styles.daySceneTop}>
            <span className={styles.dayProduct}>SaqtaFood {stage.product}</span>
            <span className={styles.dayExample}>{t("Пример рабочего дня")}</span>
          </div>
          <div className={styles.dayClock} aria-hidden="true"><StageIcon size={62} strokeWidth={1} /><span>{stage.time}</span></div>
          <div aria-live="polite" aria-atomic="true">
            <h3>{t(stage.title)}</h3>
            <p className={styles.dayDescription}>{t(stage.description)}</p>
          </div>
          <dl className={styles.dayFlow}>
            <div><dt>{t("С чего начинаем")}</dt><dd>{t(stage.input)}</dd></div>
            <ArrowDown size={17} aria-hidden="true" />
            <div><dt>{t("К чему приходим")}</dt><dd>{t(stage.output)}</dd></div>
          </dl>
          <Link href={stage.href} className={styles.dayAction}>{t(stage.action)}<ArrowUpRight size={19} aria-hidden="true" /></Link>
        </div>

        <div className={styles.dayChecklist}>
          <div className={styles.dayChecklistHeading}><span className={styles.dayChecklistIcon}><Check size={22} aria-hidden="true" /></span><h3>{t("Попробуйте чек-лист")}</h3></div>
          <p className={styles.dayHint}>{t("Учебный пример. Отметки не сохраняются и не меняют данные пекарни.")}</p>
          <fieldset>
            <legend className={styles.dayLegend}>{t(stage.summary)}</legend>
            {stage.tasks.map((task, index) => {
              const key = `${stage.id}-${index}`;
              return <label key={key} className={styles.dayTask}>
                <input type="checkbox" checked={checked.has(key)} onChange={() => toggleTask(key)} />
                <span>{t(task)}</span>
              </label>;
            })}
          </fieldset>
          <div className={styles.dayProgress}>
            <p role="status">{progress}</p>
            <progress aria-label={t("Прогресс пробного чек-листа")} value={completed} max={stage.tasks.length} />
          </div>
          <p className={styles.dayTip}>{t(completed === stage.tasks.length ? "Все шаги отмечены. Перейдите к инструменту или изучите другой этап дня." : "У каждого этапа свой список. Переключайте время — отметки останутся до обновления страницы.")}</p>
          <button type="button" className={styles.dayReset} onClick={() => setChecked(new Set())} disabled={checked.size === 0}><RotateCcw size={14} aria-hidden="true" />{t("Сбросить весь пример")}</button>
        </div>
      </div>
    </section>
  );
}
