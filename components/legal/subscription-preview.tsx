import { ArrowUpRight, Check, Sparkles, Layers3, HardDrive, Bot } from "lucide-react";

export function SubscriptionPreview({ compact = false }: { compact?: boolean }) {
  return <section id="subscription" className={`subscription-preview ${compact ? "subscription-compact" : ""}`} aria-labelledby={compact ? "subscription-small-title" : "subscription-title"}>
    <div className="subscription-intro"><span className="pill"><Sparkles size={14} />Следующая глава · скоро</span><h2 id={compact ? "subscription-small-title" : "subscription-title"}>Больше места<br />для больших идей.</h2><p>Готовим подписку для тех, кто хочет учиться вместе с ИИ ещё больше.</p><a className="button" href="/payment">О будущей подписке <ArrowUpRight size={16} /></a></div>
    <div className="subscription-benefits"><div><Layers3 size={21} /><span><strong>Больше материалов</strong><small>Расширенная учебная библиотека</small></span><Check size={16} /></div><div><HardDrive size={21} /><span><strong>Больше пространства</strong><small>Увеличенное хранилище для лекций</small></span><Check size={16} /></div><div><Bot size={21} /><span><strong>Больше общения с ИИ</strong><small>Повышенные лимиты помощника и конспектов</small></span><Check size={16} /></div><p>Стоимость и точные лимиты объявим перед запуском. Сейчас оплата не требуется.</p></div>
  </section>;
}
