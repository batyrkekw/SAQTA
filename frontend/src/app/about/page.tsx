import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ChartNoAxesCombined, ShieldCheck, ShoppingBag } from "lucide-react";
import { ProductHeader } from "@/components/product-header";
import { PRICING_CONNECTION_COPY, PRICING_CONNECTION_TITLE } from "@/features/forecast/pricing.config";

export const metadata = { title: "О проекте SAQTA" };

export default function AboutPage() {
  return <><ProductHeader/><main id="main" className="mx-auto max-w-5xl px-6 pb-20 pt-10">
    <div className="flex items-center gap-4"><Image src="/brand/saqta-symbol.svg" width={56} height={56} alt=""/><p className="eyebrow">Создано в Казахстане · начинаем с пекарен Астаны</p></div>
    <h1 className="mt-7 max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-[#123C2F] md:text-4xl">Сохранение еды начинается<br className="hidden sm:block"/> с хорошего плана.</h1>
    <p className="mt-6 max-w-3xl text-base leading-8 text-[#5D6B62]">SAQTA — технология для пекарен, которым нужно точнее планировать выпечку и находить покупателей для подходящих остатков. Название вдохновлено казахским «сақта»: сохранять, беречь, защищать.</p>
    <div className="mt-10 grid gap-5 md:grid-cols-2">
      <section className="card p-7"><ChartNoAxesCombined className="text-[#237A57]" size={28}/><h2 className="mt-5 text-xl font-semibold text-[#123C2F]">SAQTA Forecast</h2><p className="mt-4 text-sm leading-7 text-[#5D6B62]">Платное направление продукта: история продаж, объяснимый прогноз, рекомендация с учётом остатков и проверка на прошлых днях. Сценарный калькулятор помогает оценить возможное сокращение затрат на списания.</p><Link href="/forecast" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#237A57]">Открыть прогнозирование<ArrowRight size={16}/></Link></section>
      <section className="card p-7"><ShoppingBag className="text-[#237A57]" size={28}/><h2 className="mt-5 text-xl font-semibold text-[#123C2F]">SAQTA Save</h2><p className="mt-4 text-sm leading-7 text-[#5D6B62]">Бесплатное размещение пригодных к продаже остатков на всех тарифах. Пекарня задаёт цену и окно самовывоза, покупатель оформляет демо-заказ. Количество резервируется в базе; отмена возвращает резерв.</p><Link href="/save" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#237A57]">Перейти в SAQTA Save<ArrowRight size={16}/></Link></section>
    </div>
    <section className="mt-8 rounded-2xl border border-[#DAE4D0] bg-[#EBF1DF] p-7"><h2 className="text-xl font-semibold text-[#123C2F]">Сначала предотвращать излишки. Затем сохранять их ценность.</h2><p className="mt-4 text-sm leading-7 text-[#536257]">Forecast работает до производства, Save — с остатками после него. Продажа остатка не доказывает, что продукт иначе был бы выброшен. Прогноз и экономия не гарантированы; показатели выдач и списаний опираются на записи, а не на выдуманные экологические коэффициенты.</p></section>
    <section className="card mt-8 p-7"><h2 className="text-xl font-semibold text-[#123C2F]">{PRICING_CONNECTION_TITLE}</h2><p className="mt-4 text-sm leading-7 text-[#5D6B62]">{PRICING_CONNECTION_COPY}</p><Link href="/forecast?view=pricing" className="btn-secondary mt-5">Посмотреть предварительные тарифы</Link></section>
    <section className="mt-8 flex items-start gap-3 rounded-2xl border border-[#E4E8DE] p-6"><ShieldCheck className="mt-1 shrink-0 text-[#237A57]" size={22}/><div><h2 className="font-semibold text-[#123C2F]">Открытое демо — только синтетические данные</h2><p className="mt-3 text-sm leading-7 text-[#5D6B62]">В публичной версии нет авторизации и разделения доступа. Реальные файлы пекарни нужно подготавливать локально и импортировать в отдельное закрытое окружение. Анкета не заменяет историю ежедневных продаж.</p><Link href="/docs" className="mt-4 inline-flex text-sm font-semibold text-[#237A57]">Методика и документация</Link></div></section>
  </main></>;
}
