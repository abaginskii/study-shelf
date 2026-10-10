import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { LegalFooter } from "./footer";
import { legalDetails } from "./details";
import { BrandWordmark } from "../brand/wordmark";

export function LegalDocument({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return <div className="legal-site"><header className="legal-header"><a href="/" className="legal-wordmark" aria-label="polka — главная"><BrandWordmark /></a><a className="button subtle" href="/"><ArrowLeft size={16} />К приложению</a></header><main className="legal-document"><span className="eyebrow">polka · {legalDetails.date}</span><h1>{title}</h1><p className="legal-intro">{intro}</p><nav className="legal-document-nav" aria-label="Другие документы"><a href="/pricing">Тариф</a><a href="/offer">Оферта</a><a href="/privacy">Конфиденциальность</a><a href="/payment">Оплата и возвраты</a></nav>{children}</main><LegalFooter /></div>;
}

export function Requisites() {
  return <section><h2>Исполнитель и связь</h2><dl className="legal-requisites"><div><dt>Исполнитель</dt><dd>{legalDetails.name}</dd></div><div><dt>Статус</dt><dd>{legalDetails.status}</dd></div><div><dt>ИНН</dt><dd>{legalDetails.inn}</dd></div><div><dt>Поддержка и обращения</dt><dd><a href={`mailto:${legalDetails.email}`}>{legalDetails.email}</a></dd></div></dl></section>;
}
