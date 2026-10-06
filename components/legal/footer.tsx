import { legalDetails } from "./details";

export function LegalFooter({ compact = false }: { compact?: boolean }) {
  return <footer className={`legal-footer ${compact ? "legal-footer-compact" : ""}`}>
    <div className="legal-footer-brand"><a href="/" aria-label="Полка — главная">полка<span> .</span></a><p>Учиться. Понимать. Возвращаться.</p></div>
    <nav aria-label="Документы и поддержка"><a href="/pricing">Тариф</a><a href="/offer">Оферта</a><a href="/privacy">Конфиденциальность</a><a href="/payment">Оплата и возвраты</a><a href={`mailto:${legalDetails.email}`}>Поддержка</a></nav>
    <div className="legal-footer-details"><span>{legalDetails.name} · ИНН {legalDetails.inn}</span><a href={`mailto:${legalDetails.email}`}>{legalDetails.email}</a><span>Продление вручную · без автоматических списаний</span></div>
  </footer>;
}
