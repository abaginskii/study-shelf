"use client";

import OrderHistory from "@/components/billing/order-history";
import { ThemeSelector } from "@/components/theme/theme-provider";
import { ArrowDownToLine, ArrowUpRight, Bot, Check, Copy, HardDrive, Library, LoaderCircle, LogOut, Mail, RefreshCw, ShieldCheck, Smartphone, Sparkles, SunMoon, UserRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { AccountSummary } from "@/lib/types";
import { InstallApp } from "@/components/pwa/install-app";

type Meter = { used: number; limit: number };
type Props = { username: string; busy: string; exportData: () => void; logout: () => void };
const bytes = (value: number) => value === 0 ? "0 МБ" : value < 1024 * 1024 ? `${Math.ceil(value / 1024)} КБ` : value >= 1024 * 1024 * 1024 ? `${(value / 1024 / 1024 / 1024).toFixed(1)} ГБ` : `${(value / 1024 / 1024).toFixed(1)} МБ`;

function UsageMeter({ label, value, storage = false }: { label: string; value: Meter; storage?: boolean }) {
  const percent = Math.min(100, Math.round(value.used / Math.max(1, value.limit) * 100));
  return <div className="usage-meter"><div className="usage-meter-heading"><span>{label}</span><strong>{storage ? bytes(value.used) : value.used}<span> из {storage ? bytes(value.limit) : value.limit}</span></strong></div><div className="usage-track" role="progressbar" aria-label={label} aria-valuenow={value.used} aria-valuemin={0} aria-valuemax={value.limit}><span style={{ width: `${percent}%` }} /></div><span className="meter-hint">{value.used >= value.limit ? "Лимит достигнут" : storage ? `${bytes(Math.max(0, value.limit - value.used))} свободно` : `${Math.max(0, value.limit - value.used)} осталось`}</span></div>;
}

export default function AccountPage({ username, busy, exportData, logout }: Props) {
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/account", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить аккаунт.");
      setAccount(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Аккаунт недоступен.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function copyShelfId() {
    if (!account?.user.id) return;
    try {
      await navigator.clipboard.writeText(account.user.id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Не удалось скопировать ID. Выделите его вручную.");
    }
  }

  const accessTitle = account?.access.kind === "subscription"
    ? account.access.paid ? "Подписка активна" : "Подписка завершена"
    : "Бесплатный тестовый доступ";

  return <div className="account-page">
    <header className="page-heading account-heading"><div><span className="eyebrow">ЛИЧНЫЙ КАБИНЕТ</span><h1>Аккаунт</h1><p>Ваш доступ, настройки и место для учебных материалов.</p></div><button className="button glass-button" disabled={loading} onClick={() => void load()}><RefreshCw size={16} />Обновить</button></header>
    {error ? <div className="notice error-notice" role="alert">{error}<button onClick={() => void load()}>Повторить</button></div> : null}

    <section className="account-hero account-card" aria-labelledby="account-name">
      <div className="account-identity"><span className="avatar avatar-large"><UserRound size={27} /></span><div><span className="eyebrow">ВАША УЧЁТНАЯ ЗАПИСЬ</span><h2 id="account-name">{username}</h2><p>Личная учебная библиотека</p></div></div>
      <div className="shelf-id-card"><div className="shelf-id-art"><Library size={19} /></div><div className="shelf-id-copy"><span className="eyebrow">ПОЛКА ID</span><code>{account?.user.id ? `PL-${account.user.id.split("-")[0].toUpperCase()}` : "ЗАГРУЖАЕМ…"}</code></div><button className="icon-button" type="button" disabled={!account?.user.id} onClick={() => void copyShelfId()} aria-label="Скопировать Полка ID"><span className="sr-only">Скопировать ID для поддержки</span>{copied ? <Check size={17} /> : <Copy size={17} />}</button><span className="sr-only" aria-live="polite">{copied ? "Полка ID скопирован" : ""}</span></div>
      <div className="account-access"><div><span className="eyebrow">ТЕКУЩИЙ ДОСТУП</span><h3>{account ? accessTitle : "Ваш доступ"}</h3><p>{account?.access.endsAt ? `Оплаченный период до ${new Intl.DateTimeFormat("ru", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Moscow" }).format(new Date(account.access.endsAt))}. ${account.access.status === "expired" ? "Чтение и экспорт сохранены." : "Продление вручную."}` : account ? "Ваши действующие возможности показаны ниже." : "Загружаем сведения о доступе…"}</p></div><span className={`access-badge ${account?.access.status === "expired" ? "expired" : ""}`}><Check size={14} />{account?.access.status === "expired" ? "Период завершён" : "Активен"}</span><a className="button primary" href={account?.access.billingEnabled ? "/checkout" : "/pricing"}>{account?.access.billingEnabled ? account.access.paid ? "Продлить · 399 ₽" : "Подключить · 399 ₽" : "Тариф и условия"}<ArrowUpRight size={16} /></a></div>
      <div className="account-hero-foot"><span><ShieldCheck size={15} />Ваши материалы видны только в вашем аккаунте.</span>{account?.owner ? <a className="text-button" href="/admin"><ShieldCheck size={15} />Панель владельца <ArrowUpRight size={15} /></a> : null}</div>
    </section>

    <div className="account-grid">
      <section className="account-card usage-section"><div className="account-section-title"><span className="section-icon"><HardDrive size={19} /></span><div><h2>Использование</h2><p>Лимиты и объём вашей библиотеки.</p></div></div>{loading && !account ? <div className="account-loading"><LoaderCircle className="spin" size={20} />Загружаем данные…</div> : account ? <><UsageMeter label="Материалы" value={account.usage.materials} /><UsageMeter label="Хранилище" value={account.usage.storage} storage /><UsageMeter label="Запуски ИИ за 30 дней" value={{ used: account.usage.ai.periodUsed, limit: account.usage.ai.periodLimit }} /><p className="account-footnote">{account.usage.ai.periodResetsAt ? `Период завершится ${new Intl.DateTimeFormat("ru", { day: "numeric", month: "long", timeZone: "Europe/Moscow" }).format(new Date(account.usage.ai.periodResetsAt))}.` : "30-дневный период начнётся с первого запуска ИИ."}</p><UsageMeter label="Запуски ИИ сегодня" value={account.usage.ai} /><p className="account-footnote">Дневной лимит обновится {new Intl.DateTimeFormat("ru", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" }).format(new Date(account.usage.ai.resetsAt))} МСК. {account.usage.storage.reservedBytes > 0 ? `${bytes(account.usage.storage.reservedBytes)} зарезервировано для загрузок.` : ""}</p><p className="account-footnote">Запуск ИИ — обработка файла, конспект, ответ помощника или проверка вашего ответа. Извлечение текстового слоя PDF не расходует лимит.</p><div className="account-mini-stats"><span><Library size={15} />{account.usage.topics.used} понятий</span><span><Bot size={15} />{account.usage.chats.used} диалогов</span><span><Sparkles size={15} />{account.usage.reviews.used} повторений</span></div></> : <p className="muted">Данные об использовании пока недоступны.</p>}</section>

      <section className="account-card appearance-section"><div className="account-section-title"><span className="section-icon"><SunMoon size={19} /></span><div><h2>Внешний вид</h2><p>Выберите удобную тему оформления.</p></div></div><ThemeSelector /><p className="account-footnote">Настройка сохранится на этом устройстве.</p></section>

      <section className="account-card"><div className="account-section-title"><span className="section-icon"><Smartphone size={19} /></span><div><h2>Полка на телефоне</h2><p>Открывайте библиотеку как приложение.</p></div></div><InstallApp /></section>

      <section className="account-card"><div className="account-section-title"><span className="section-icon"><ArrowDownToLine size={19} /></span><div><h2>Ваши данные</h2><p>Сохраните копию учебной библиотеки.</p></div></div><button className="button glass-button full" disabled={!!busy} onClick={exportData}>{busy === "export" ? <LoaderCircle size={17} className="spin" /> : <ArrowDownToLine size={17} />}{busy === "export" ? "Готовим экспорт…" : "Скачать библиотеку · JSON"}</button><p className="account-footnote">Тексты, понятия, история чатов и повторения. Оригинальные файлы скачиваются со страниц материалов.</p></section>

      <section className="account-card account-wide"><div className="account-section-title"><span className="section-icon"><Library size={19} /></span><div><h2>Платежи и продление</h2><p>История заказов по этой учётной записи.</p></div></div><OrderHistory /></section>

      <section className="account-card account-wide support-section"><div className="account-section-title"><span className="section-icon"><Mail size={19} /></span><div><h2>Нужна помощь?</h2><p>Проблема с доступом, материалами или аккаунтом.</p></div></div><a className="button" href="mailto:polka.sluzhbazaboty@yandex.ru">Написать в поддержку <ArrowUpRight size={16} /></a></section>
    </div>

    <div className="account-bottom"><div><a href="/offer">Оферта</a><a href="/privacy">Конфиденциальность</a><a href="/payment">Оплата и возврат</a></div><button className="button subtle" disabled={!!busy} onClick={logout}>{busy === "logout" ? <LoaderCircle className="spin" size={16} /> : <LogOut size={16} />}Выйти из аккаунта</button></div>
  </div>;
}
