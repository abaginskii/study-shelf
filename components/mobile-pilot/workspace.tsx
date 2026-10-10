"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, ChevronRight, FileText, FolderOpen, GraduationCap, HelpCircle, Home, Library, Menu, Plus, Search, Sparkles, UserRound, X } from "lucide-react";
import type { MaterialCard } from "@/lib/types";
import type { WorkspacePage } from "@/components/workspace/workspace";
import { BrandWordmark } from "@/components/brand/wordmark";
import styles from "./workspace.module.css";

const sections = [
  { id: "home", label: "Главная", icon: Home },
  { id: "materials", label: "Библиотека", icon: Library },
  { id: "subjects", label: "Предметы", icon: FolderOpen },
  { id: "knowledge", label: "Знания", icon: BookOpen },
  { id: "review", label: "Практика", icon: GraduationCap },
  { id: "assistant", label: "polka.ai", icon: Sparkles },
] as const;

type HeaderProps = {
  page: WorkspacePage;
  username: string;
  navigate: (page: WorkspacePage) => void;
  search: () => void;
  add: () => void;
  previewSite: () => void;
  detail?: boolean;
  back?: () => void;
};

export function MobileWorkspaceHeader({ page, username, navigate, search, add, previewSite, detail, back }: HeaderProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (menuOpen && !node.open) node.showModal();
    if (!menuOpen && node.open) node.close();
  }, [menuOpen]);
  const close = () => { setMenuOpen(false); trigger.current?.focus(); };
  const go = (destination: WorkspacePage) => { close(); navigate(destination); };
  const afterClose = (action: () => void) => { close(); action(); };
  return <>
    <header className={styles.header} data-mobile-pilot-header>
      <div className={styles.headerInner}>
        {detail && back ? <button type="button" className={styles.headerButton} onClick={back} aria-label="Назад"><ArrowLeft size={22} /></button> : <button ref={trigger} type="button" className={styles.headerButton} onClick={() => setMenuOpen(true)} aria-label="Открыть все разделы" aria-haspopup="dialog" aria-expanded={menuOpen}><Menu size={21} /></button>}
        <button type="button" className={styles.brand} onClick={() => navigate("home")} aria-label="polka — главная"><BrandWordmark tone="light" className={styles.wordmark} /></button>
        <div className={styles.headerActions}>
          <button type="button" className={styles.headerButton} onClick={search} aria-label="Поиск в polka"><Search size={21} /></button>
          <button type="button" className={styles.profileButton} onClick={() => navigate("account")} aria-label="Открыть polka.id"><span>{username.slice(0, 1).toUpperCase()}</span></button>
        </div>
      </div>
    </header>
    <dialog ref={dialog} className={styles.sectionsSheet} aria-label="Разделы polka" onCancel={event => { event.preventDefault(); close(); }} onClose={() => setMenuOpen(false)} onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div className={styles.sheetHandle} aria-hidden="true" />
      <div className={styles.sheetHeading}><div><span>Ваше пространство</span><h2>Разделы polka</h2></div><button type="button" className={styles.headerButton} onClick={close} aria-label="Закрыть разделы"><X size={21} /></button></div>
      <nav className={styles.sheetNavigation} aria-label="Все разделы polka">{sections.map(item => <button type="button" key={item.id} onClick={() => go(item.id)} aria-current={page === item.id && !detail ? "page" : undefined}><span className={styles.sectionIcon}><item.icon size={21} /></span><strong>{item.label}</strong><ChevronRight size={17} /></button>)}</nav>
      <button type="button" className={styles.sheetProfile} onClick={() => go("account")}><span className={styles.profileAvatar}>{username.slice(0, 1).toUpperCase()}</span><span><strong>{username}</strong><small>polka.id · Ваш аккаунт</small></span><ChevronRight size={17} /></button>
      <div className={styles.sheetActions}><button type="button" className={styles.primaryButton} onClick={() => afterClose(add)}><Plus size={19} />Добавить материал</button><button type="button" className={styles.aboutButton} onClick={() => afterClose(previewSite)}><HelpCircle size={17} />О polka</button></div>
    </dialog>
  </>;
}

type DashboardProps = {
  username: string;
  materials: MaterialCard[];
  topics: number;
  reviews: number;
  loading: boolean;
  add: () => void;
  open: (id: string) => void;
  navigate: (page: WorkspacePage) => void;
  review: (id: string) => void;
  search: () => void;
  subject: (name: string) => void;
};

const formatLabel = { text: "Текст", pdf: "PDF", image: "Фото", audio: "Аудио", video: "Видео" };
function updatedLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "Europe/Moscow" }).format(date);
}

export function MobileWorkspaceDashboard({ username, materials, topics, reviews, loading, add, open, navigate, review, search, subject }: DashboardProps) {
  const recent = [...materials].sort((a, b) => new Date(b.updatedAt).valueOf() - new Date(a.updatedAt).valueOf());
  const current = recent.find(item => item.status === "ready") || recent[0];
  const ready = materials.filter(item => item.status === "ready");
  const inbox = materials.filter(item => item.status === "inbox");
  const subjects = [...new Set(materials.map(item => item.subject).filter(Boolean))];
  const isLoading = loading && !materials.length;
  return <div className={styles.dashboard} data-mobile-pilot-dashboard>
    <section className={styles.welcome}><div><p>Рады видеть вас, {username}</p><h1>Сегодня</h1></div><button type="button" className={styles.addButton} onClick={add} aria-label="Добавить материал"><Plus size={24} /></button></section>
    <button type="button" className={styles.search} onClick={search}><Search size={19} /><span>Материалы, понятия, идеи</span></button>
    <section className={styles.continueCard} aria-label="Продолжить изучение">
      <div className={styles.cardEyebrow}><span>{current ? "ПРОДОЛЖИТЬ ИЗУЧЕНИЕ" : "ВАША ЛИЧНАЯ ПОЛКА"}</span><Image src="/icons/polka-512.png" width={46} height={46} alt="" unoptimized /></div>
      {isLoading ? <div className={styles.heroLoading} role="status"><span /><span /><p>Открываем вашу библиотеку…</p></div> : current ? <><div className={styles.materialMeta}><span>{current.subject || "Без предмета"}</span><span>{formatLabel[current.kind]}</span></div><h2>{current.title}</h2><p className={styles.heroExcerpt}>{current.excerpt || "Откройте материал, выделите главное и соберите свой конспект."}</p><button type="button" className={styles.primaryButton} onClick={() => open(current.id)}>Продолжить <ArrowRight size={19} /></button>{current.status === "ready" ? <button type="button" className={styles.heroSecondary} onClick={() => review(current.id)}><GraduationCap size={18} />Проверить себя</button> : null}</> : <><h2>Всё, что хочется<br />понять. В одном месте.</h2><p className={styles.heroExcerpt}>Лекции, заметки и вопросы — ваша полка поможет увидеть главное.</p><button type="button" className={styles.primaryButton} onClick={add}><Plus size={19} />Добавить первый материал</button></>}
    </section>
    <section className={styles.stats} aria-label="Ваша библиотека">{[{ label: "Материалы", value: materials.length, page: "materials" }, { label: "Понятия", value: topics, page: "knowledge" }, { label: "Повторения", value: reviews, page: "review" }].map(item => <button type="button" key={item.label} onClick={() => navigate(item.page as WorkspacePage)}><strong>{isLoading ? <span className={styles.statLoading} aria-label="Загружаем" /> : item.value}</strong><span>{item.label}</span></button>)}</section>
    <button type="button" className={styles.aiEntry} onClick={() => navigate("assistant")}><span className={styles.aiIcon}><Sparkles size={23} strokeWidth={1.7} /></span><span><strong>Разберёмся вместе</strong><small>Спросите polka.ai по своим материалам</small></span><ChevronRight size={19} /></button>
    <section aria-label="Последние материалы"><div className={styles.sectionHeading}><h2>На вашей полке</h2><button type="button" onClick={() => navigate("materials")}>Все<ChevronRight size={16} /></button></div><div className={styles.materialList}>{isLoading ? <div className={styles.listLoading} role="status">Загружаем материалы…</div> : recent.length ? recent.slice(0, 3).map(item => <button type="button" className={styles.materialRow} data-mobile-material-row key={item.id} onClick={() => open(item.id)}><span className={`${styles.fileIcon} ${item.status === "ready" ? styles.readyIcon : ""}`}><FileText size={22} strokeWidth={1.6} /></span><span className={styles.rowCopy}><strong>{item.title}</strong><small>{item.subject || formatLabel[item.kind]} · {updatedLabel(item.updatedAt)}</small></span><ChevronRight size={17} /></button>) : <button type="button" className={styles.emptyRow} onClick={add}><Library size={22} /><span><strong>Здесь будут ваши материалы</strong><small>Добавьте первый — остальное соберётся</small></span><Plus size={20} /></button>}</div></section>
    <section className={styles.learningGrid} aria-label="Учиться по своим материалам"><button type="button" className={styles.learningCard} onClick={() => navigate("knowledge")}><BookOpen size={24} strokeWidth={1.6} /><strong>Знания</strong><span>{topics ? `${topics} понятий из ваших лекций` : "Соберите главное из лекций"}</span><ArrowRight size={18} /></button><button type="button" className={`${styles.learningCard} ${styles.practiceCard}`} onClick={() => navigate("review")}><GraduationCap size={25} strokeWidth={1.6} /><strong>Практика</strong><span>{ready.length ? "Проверьте, что запомнили" : "Вопросы появятся с конспектами"}</span><ArrowRight size={18} /></button></section>
    {subjects.length ? <section className={styles.subjectSection}><div className={styles.sectionHeading}><h2>Предметы</h2><button type="button" onClick={() => navigate("subjects")}>Все<ChevronRight size={16} /></button></div><div className={styles.subjects}>{subjects.slice(0, 3).map(name => <button type="button" key={name} onClick={() => subject(name)}><FolderOpen size={16} /><span>{name}</span></button>)}</div></section> : null}
    {inbox.length ? <button type="button" className={styles.inbox} onClick={() => navigate("materials")}><span className={styles.inboxDot} /><span>Ждут вашего внимания<strong>{inbox.length} во входящих</strong></span><ChevronRight size={18} /></button> : null}
  </div>;
}

const tabs = [
  { id: "home", label: "Главная", icon: Home },
  { id: "materials", label: "Библиотека", icon: Library },
  { id: "assistant", label: "AI", icon: Sparkles },
  { id: "review", label: "Практика", icon: GraduationCap },
  { id: "account", label: "Профиль", icon: UserRound },
] as const;

export function MobileTabBar({ page, navigate, detail }: { page: WorkspacePage; navigate: (page: WorkspacePage) => void; detail?: boolean }) {
  const active = detail || page === "subjects" || page === "knowledge" ? "materials" : page;
  return <nav className={styles.tabBar} aria-label="Навигация приложения" data-mobile-pilot-nav>{tabs.map(tab => <button type="button" key={tab.id} data-page={tab.id} onClick={() => navigate(tab.id)} aria-label={tab.id === "assistant" ? "polka.ai" : tab.label} aria-current={active === tab.id ? "page" : undefined}><span className={styles.tabIcon}><tab.icon size={24} strokeWidth={active === tab.id ? 2 : 1.7} /></span><span>{tab.label}</span></button>)}</nav>;
}
