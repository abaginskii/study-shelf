import { ArrowUpRight, Check, BookOpen, HardDrive, Sparkles } from "lucide-react";
import { PLAN, PILOT_LIMITS } from "@/lib/plans";

export function SubscriptionPreview({ compact = false }: { compact?: boolean }) {
  return <section id="subscription" className={`subscription-preview ${compact ? "subscription-compact" : ""}`} aria-labelledby={compact ? "subscription-small-title" : "subscription-title"}>
    <div className="subscription-intro"><span className="pill">Один тариф. Все инструменты.</span><h2 id={compact ? "subscription-small-title" : "subscription-title"}>Ваша учебная система.</h2><div className="plan-price"><strong>{PLAN.priceRub} ₽</strong><span>за {PLAN.periodDays} дней</span></div><p>Материалы, конспекты, понятия, повторение и помощник в одном пространстве.</p><a className="button" href="/pricing">Состав тарифа <ArrowUpRight size={16} /></a><small className="plan-availability">Пока идёт бесплатный тестовый доступ. Продажи ещё не открыты.</small></div>
    <div className="subscription-benefits"><div><Sparkles size={21} /><span><strong>{PILOT_LIMITS.aiPeriod} запусков ИИ за {PLAN.periodDays} дней</strong><small>Конспекты, распознавание и ответы в чате · до {PILOT_LIMITS.aiDaily} в день</small></span><Check size={16} /></div><div><BookOpen size={21} /><span><strong>{PILOT_LIMITS.materials} материалов и {PILOT_LIMITS.topics} понятий</strong><small>PDF, фото, аудио и текст · тесты по вашим лекциям</small></span><Check size={16} /></div><div><HardDrive size={21} /><span><strong>{PILOT_LIMITS.storageBytes / 1024 / 1024} МБ для оригиналов</strong><small>Личная библиотека, поиск, история чатов и экспорт</small></span><Check size={16} /></div><p>Продление вручную. Автоматических списаний нет. <a href="/payment">Оплата и возвраты</a></p></div>
  </section>;
}
