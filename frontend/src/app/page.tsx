"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, Leaf, Pause, Play, ShoppingBag, Sparkles, TrendingUp } from "lucide-react";
import { ProductHeader } from "@/components/product-header";
import { useI18n } from "@/components/language-provider";
import styles from "./home.module.css";

type Path = "save" | "forecast";
const paths = {
  save: {
    eyebrow: "ДЛЯ ТЕХ, КТО ЛЮБИТ ХОРОШУЮ ЕДУ",
    title: "Вкусно. Выгодно. Вовремя.",
    description: "Находите продукты со скидкой рядом с вами. Забирайте их у продавца и давайте хорошей еде ещё один шанс.",
    action: "Найти продукты",
    steps: [
      ["Выберите", "Найдите подходящие продукты и место самовывоза."],
      ["Забронируйте", "Оставьте заявку на нужное количество."],
      ["Заберите", "Заберите заказ в указанное время. Оплата — продавцу."],
    ],
  },
  forecast: {
    eyebrow: "ДЛЯ ТЕХ, КТО СОЗДАЁТ ХОРОШУЮ ЕДУ",
    title: "Завтра понятнее уже сегодня.",
    description: "Планируйте производство по спросу. SAQTA превратит вашу историю продаж в понятные рекомендации.",
    action: "Планировать спрос",
    steps: [
      ["Добавьте данные", "Загрузите Excel или CSV. Нет истории? Начните с анкеты."],
      ["Получите прогноз", "Посмотрите рекомендации и ограничения расчёта."],
      ["Уточняйте план", "Добавляйте реальные продажи, чтобы оценивать точность."],
    ],
  },
};
const questions = [
  ["Что такое SAQTA?", "Два способа бережнее относиться к еде: SAVE помогает найти покупателей для пригодных продуктов, а FORECAST — планировать спрос."],
  ["Можно начать без истории продаж?", "Да. Заполните короткую анкету в FORECAST. Вы получите предварительную оценку и сможете уточнять её реальными данными."],
  ["Как получить продукты?", "Выберите предложение в SAVE, оставьте заявку и заберите продукты у продавца в указанное время. Условия оплаты указаны в предложении."],
];
function subscribeToMotion(callback: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
const motionSnapshot = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const serverMotionSnapshot = () => false;

export default function Home() {
  const { t } = useI18n();
  const [path, setPath] = useState<Path>("save");
  const [paused, setPaused] = useState(false);
  const reducedMotion = useSyncExternalStore(subscribeToMotion, motionSnapshot, serverMotionSnapshot);
  const stopMotion = paused || reducedMotion;
  const root = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = paths[path];

  useEffect(() => {
    if (stopMotion || !root.current || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.setAttribute("data-revealed", "true");
          observer.unobserve(entry.target);
        }
      }
    }, { threshold: 0.12 });
    root.current.querySelectorAll("[data-reveal]").forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [stopMotion]);

  function changeTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === "Home" ? 0 : event.key === "End" ? 1 :
      ["ArrowLeft", "ArrowRight"].includes(event.key) ? 1 - index : null;
    if (next === null) return;
    event.preventDefault();
    setPath(next === 0 ? "save" : "forecast");
    tabs.current[next]?.focus();
  }

  return (
    <div ref={root} className={`${styles.page} ${stopMotion ? styles.paused : ""}`}>
      <a href="#main" className={styles.skip}>{t("Перейти к содержимому")}</a>
      <ProductHeader />
      <main id="main">
        <section className={styles.hero} aria-labelledby="home-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}><span className={styles.dot} />{t("МЕНЬШЕ ПОТЕРЬ. БОЛЬШЕ ПОЛЬЗЫ.")}</p>
            <h1 id="home-title">{t("Хорошая еда.")}<br />{t("Заслуживает")}<br /><span className={styles.serif}>{t("продолжения.")}</span></h1>
            <p className={styles.intro}>{t("Покупайте выгоднее. Планируйте точнее.")}<br />{t("Сохраняйте то, что действительно ценно.")}</p>
            <div className={styles.actions}>
              <Link href="/save" className={styles.primary}>{t("Найти продукты")}<ArrowUpRight size={19} aria-hidden="true" /></Link>
              <Link href="/forecast" className={styles.secondary}>{t("Планировать спрос")}<ArrowUpRight size={18} aria-hidden="true" /></Link>
            </div>
            <a href="#product" className={styles.explore}><span><ArrowDown size={15} aria-hidden="true" /></span>{t("Знакомьтесь, SAQTA")}</a>
          </div>

          <div className={styles.heroArt}>
            <div className={styles.orbit} aria-hidden="true" />
            <div className={styles.photoFrame}>
              <Image src="/images/artisan-bread.jpg" alt={t("Ремесленный хлеб с хрустящей корочкой на деревянной доске")} fill priority sizes="(max-width: 760px) 90vw, 44vw" className={styles.photo} />
              <div className={styles.photoShade} />
              <span className={styles.photoLabel}>SAQTA · {t("Сохраняем то, что ценно.")}</span>
              <p className={styles.photoCaption}>{t("Асты сақта.")}</p>
            </div>
            <div className={styles.seal} aria-hidden="true"><Leaf size={30} strokeWidth={1.5} /><span>{t("С заботой о еде")}</span></div>
            <div className={styles.floatingNote}>
              <span className={styles.noteIcon}><ShoppingBag size={23} aria-hidden="true" /></span>
              <span><small>SAQTA SAVE</small><strong>{t("Хорошей еде — новый шанс.")}</strong></span>
              <span className={styles.noteCheck}><Check size={15} aria-hidden="true" /></span>
            </div>
            <button type="button" className={styles.motionControl} onClick={() => setPaused(value => !value)} disabled={reducedMotion} aria-pressed={stopMotion} aria-label={t(reducedMotion ? "Анимация отключена в настройках устройства" : paused ? "Включить анимацию" : "Остановить анимацию")}>
              {stopMotion ? <Play size={12} aria-hidden="true" /> : <Pause size={12} aria-hidden="true" />}<span>{t("Анимация")}</span>
            </button>
          </div>
        </section>

        <div className={styles.promiseLine}>
          <span><Leaf size={17} aria-hidden="true" />{t("Хорошая еда объединяет.")}</span>
          <p>{t("От продуманного плана — к пустой тарелке.")}</p>
          <span className={styles.origin}>{t("Сделано в Казахстане")}<span aria-hidden="true">↗</span></span>
        </div>

        <section id="product" className={styles.product} aria-labelledby="product-title" data-reveal>
          <div className={styles.sectionHeading}>
            <div><p className={styles.eyebrow}>{t("ВЫБЕРИТЕ СВОЙ ПУТЬ")}</p><h2 id="product-title">{t("Одна идея.")} <span className={styles.serif}>{t("Два простых пути.")}</span></h2></div>
            <div className={styles.tabs} role="tablist" aria-label={t("Как вы хотите использовать SAQTA?")}>
              {(["save", "forecast"] as const).map((value, index) => (
                <button key={value} ref={element => { tabs.current[index] = element; }} type="button" role="tab" id={`path-tab-${value}`} aria-selected={path === value} aria-controls="path-panel" tabIndex={path === value ? 0 : -1} onClick={() => setPath(value)} onKeyDown={event => changeTab(event, index)}>
                  {value === "save" ? <ShoppingBag size={16} aria-hidden="true" /> : <TrendingUp size={16} aria-hidden="true" />}{t(value === "save" ? "Хочу купить" : "У меня бизнес")}
                </button>
              ))}
            </div>
          </div>
          <div id="path-panel" className={`${styles.pathPanel} ${path === "forecast" ? styles.forecast : ""}`} role="tabpanel" aria-labelledby={`path-tab-${path}`} tabIndex={0}>
            <div className={styles.pathCopy} key={path}>
              <p className={styles.pathLabel}>SAQTA {path.toUpperCase()}</p>
              <h3>{t(current.title)}</h3>
              <p className={styles.pathDescription}>{t(current.description)}</p>
              <Link href={`/${path}`} className={styles.pathAction}>{t(current.action)}<ArrowRight size={18} aria-hidden="true" /></Link>
            </div>
            <div className={styles.pathSteps} key={`${path}-steps`}>
              <p className={styles.pathEyebrow}>{t(current.eyebrow)}</p>
              <ol>{current.steps.map(([title, description], index) => <li key={title}>
                <span className={styles.stepNumber}>0{index + 1}</span><div><h4>{t(title)}</h4><p>{t(description)}</p></div>
              </li>)}</ol>
              <div className={styles.pathDecoration} aria-hidden="true">{path === "save" ? <ShoppingBag /> : <TrendingUp />}</div>
            </div>
          </div>
        </section>

        <section className={styles.questions} aria-labelledby="questions-title" data-reveal>
          <div><p className={styles.eyebrow}>{t("ВСЁ ПРОСТО")}</p><h2 id="questions-title">{t("Пара вопросов")}<br /><span className={styles.serif}>{t("перед началом.")}</span></h2><Sparkles size={30} className={styles.sparkle} aria-hidden="true" /></div>
          <div className={styles.answers}>{questions.map(([question, answer]) => <details key={question}><summary>{t(question)}<span className={styles.plus} aria-hidden="true" /></summary><p>{t(answer)}</p></details>)}</div>
        </section>

        <section className={styles.closing} data-reveal>
          <Leaf size={27} strokeWidth={1.5} aria-hidden="true" /><h2>{t("Маленький шаг.")} <span>{t("Большая разница.")}</span></h2><a href="#product" aria-label={t("Выбрать свой путь в SAQTA")}><ArrowUpRight size={27} aria-hidden="true" /></a>
        </section>
      </main>
      <footer className={styles.footer}>
        <Link href="/" aria-label={t("SAQTA — главная")}><Image src="/brand/saqta-logo.svg" width={112} height={25} alt="SAQTA" /></Link>
        <p>© {new Date().getFullYear()} SAQTA · {t("Сохраняем то, что ценно.")}</p>
        <nav aria-label={t("Навигация в подвале")}><Link href="/save">SAVE<ArrowUpRight size={13} aria-hidden="true" /></Link><Link href="/forecast">FORECAST<ArrowUpRight size={13} aria-hidden="true" /></Link></nav>
      </footer>
    </div>
  );
}
