"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, BookOpen, Command, FileText, FolderOpen, GraduationCap, HelpCircle, LayoutGrid, Library, Menu, MessageCircle, Plus, Search, Sparkles, UserRound, X } from "lucide-react";
import type { MaterialCard, Topic } from "@/lib/types";
import { BrandWordmark } from "@/components/brand/wordmark";
import { PolkaLanding } from "@/components/marketing/polka-landing";
import styles from "./workspace.module.css";

export type WorkspacePage = "home" | "materials" | "subjects" | "knowledge" | "review" | "assistant" | "account";
const sections = [
  { id: "home", label: "Обзор", icon: LayoutGrid },
  { id: "materials", label: "Материалы", icon: Library },
  { id: "subjects", label: "Предметы", icon: FolderOpen },
  { id: "knowledge", label: "Знания", icon: BookOpen },
  { id: "review", label: "Практика", icon: GraduationCap },
  { id: "assistant", label: "polka.ai", icon: MessageCircle },
] as const;

type HeaderProps = { page: WorkspacePage; username: string; navigate: (page: WorkspacePage) => void; search: () => void; previewSite: () => void; add?: () => void };

export function WorkspaceHeader({ page, username, navigate, search, previewSite, add }: HeaderProps) {
  const menu = useRef<HTMLDetailsElement>(null);
  const go = (destination: WorkspacePage) => { if (menu.current) menu.current.open = false; navigate(destination); };
  useEffect(() => {
    const dismissOutside = (event: PointerEvent) => { const node = menu.current; if (node?.open && event.target instanceof Node && !node.contains(event.target)) node.open = false; };
    const dismissEscape = (event: KeyboardEvent) => { const node = menu.current; if (event.key === "Escape" && node?.open) { node.open = false; node.querySelector("summary")?.focus(); } };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissEscape);
    return () => { document.removeEventListener("pointerdown", dismissOutside); document.removeEventListener("keydown", dismissEscape); };
  }, []);
  return <header className={styles.header} data-workspace-header>
    <aside className={styles.sidebar} aria-label="Боковая панель">
      <button type="button" className={styles.wordmark} onClick={() => go("home")} aria-label="polka — обзор"><BrandWordmark tone="dark" /></button>
      <span className={styles.sidebarLabel}>ВАША БИБЛИОТЕКА</span>
      <nav className={styles.navigation} aria-label="Основная навигация" data-workspace-nav>{sections.map(item => <button type="button" key={item.id} aria-current={page === item.id ? "page" : undefined} onClick={() => go(item.id)}><item.icon size={18} /><span>{item.label}</span>{item.id === "assistant" ? <span className={styles.aiDot} /> : null}</button>)}</nav>
      {add ? <button type="button" className={styles.sidebarAdd} onClick={add}><Plus size={17} />Добавить материал</button> : null}
      <div className={styles.sidebarBottom}>
        <button type="button" className={styles.sidebarLink} onClick={previewSite}><HelpCircle size={17} />О polka <ArrowRight size={14} /></button>
        <a className={styles.sidebarLink} href="/contact"><MessageCircle size={17} />Помощь</a>
        <button type="button" className={styles.sidebarProfile} onClick={() => go("account")} aria-current={page === "account" ? "page" : undefined} aria-label="Открыть polka.id"><span className={styles.avatar}>{username.slice(0, 1).toUpperCase()}</span><span><strong>{username}</strong><small>polka.id</small></span><ArrowRight size={16} /></button>
      </div>
    </aside>
    <div className={styles.topbar}>
      <button type="button" className={styles.mobileLogo} onClick={() => go("home")} aria-label="polka — обзор"><BrandWordmark tone="dark" /></button>
      <span className={styles.breadcrumb}>Моя библиотека <span>/</span> <strong>{sections.find(item => item.id === page)?.label || "polka.id"}</strong></span>
      <div className={styles.topbarActions}>
        <button type="button" className={`${styles.searchTrigger} v2-search-trigger`} onClick={search} aria-label="Открыть поиск и команды"><Search size={18} /><span>Поиск в библиотеке</span><kbd>⌘ K</kbd></button>
        {add ? <button type="button" className={styles.topbarAdd} onClick={add}><Plus size={17} /><span>Добавить</span></button> : null}
        <button type="button" className={`${styles.profileTrigger} v2-profile-trigger`} onClick={() => go("account")} aria-label="Открыть polka.id"><span className={styles.avatar}>{username.slice(0, 1).toUpperCase()}</span></button>
        <details ref={menu} className={styles.mobileMenu}><summary aria-label="Открыть меню разделов"><Menu size={20} /></summary><nav aria-label="Разделы библиотеки" data-workspace-mobile-nav>{sections.map(item => <button type="button" key={item.id} aria-current={page === item.id ? "page" : undefined} onClick={() => go(item.id)}><item.icon size={17} />{item.label}</button>)}<button type="button" onClick={() => go("account")}><UserRound size={17} />polka.id</button><button type="button" onClick={() => { if (menu.current) menu.current.open = false; previewSite(); }}><HelpCircle size={17} />О polka</button></nav></details>
      </div>
    </div>
  </header>;
}

const dateLabel = (value: string) => { const date = new Date(value); return Number.isNaN(date.valueOf()) ? "" : new Intl.DateTimeFormat("ru", { day: "numeric", month: "short" }).format(date); };
const formatLabel = { text: "Текст", pdf: "PDF", image: "Фото", audio: "Аудио", video: "Видео" };
type DashboardProps = { username: string; materials: MaterialCard[]; topics: number; reviews: number; loading: boolean; add: () => void; open: (id: string) => void; navigate: (page: WorkspacePage) => void; review: (id: string) => void; search: () => void; subject: (name: string) => void };

export function WorkspaceDashboard({ username, materials, topics, reviews, loading, add, open, navigate, review, search, subject }: DashboardProps) {
  const ready = materials.filter(item => item.status === "ready");
  const inbox = materials.filter(item => item.status === "inbox");
  const recent = [...materials].sort((a, b) => new Date(b.updatedAt).valueOf() - new Date(a.updatedAt).valueOf());
  const current = recent.find(item => item.status === "ready") || recent[0];
  const subjects = Array.from(new Set(materials.map(item => item.subject || "Без предмета")));
  return <div className={`${styles.dashboard} v2-dashboard`} data-workspace-dashboard>
    <section className={styles.welcome}>
      <div><span className={styles.eyebrow}>ВАШЕ УЧЕБНОЕ ПРОСТРАНСТВО</span><h1>Привет, <span>{username}.</span></h1><p>{materials.length ? "Всё, что вы изучаете, уже на вашей полке." : "Соберите на своей полке всё, что хотите понять."}</p></div>
      <button type="button" className={styles.primaryButton} onClick={add}><Plus size={18} />Добавить материал</button>
    </section>
    <button type="button" className={`${styles.commandEntry} v2-command-entry`} onClick={search}><Search size={20} /><span>Найти среди своих материалов и знаний</span><kbd><Command size={13} />K</kbd><ArrowRight size={18} /></button>
    <section className={styles.stats} aria-label="Ваша библиотека">{[{ label: "Материалы", count: materials.length, page: "materials", icon: Library }, { label: "Конспекты", count: ready.length, page: "materials", icon: FileText }, { label: "Понятия", count: topics, page: "knowledge", icon: BookOpen }, { label: "Повторения", count: reviews, page: "review", icon: GraduationCap }].map(item => <button type="button" key={item.label} onClick={() => navigate(item.page as WorkspacePage)}><span className={styles.statLabel}><item.icon size={16} />{item.label}</span><span className={styles.statValue}>{loading && !materials.length ? <span className={styles.statSkeleton} aria-label="Загружаем" /> : item.count}<ArrowRight size={17} /></span></button>)}</section>
    <div className={styles.focusGrid}>
      <section className={`${styles.card} ${styles.continueCard}`} aria-label="Продолжить изучение"><div className={styles.cardLabel}><span>ПРОДОЛЖИТЬ ИЗУЧЕНИЕ</span><BookOpen size={17} /></div>
        {loading && !materials.length ? <div className={styles.loadingContent} role="status"><span className={styles.skeleton} /><span className={styles.skeleton} /><p>Загружаем вашу библиотеку…</p></div> : current ? <><span className={styles.materialMeta}>{current.subject || "Без предмета"}<span>·</span>{formatLabel[current.kind]}</span><h2>{current.title}</h2><p className={styles.excerpt}>{current.excerpt || "Материал сохранён. Откройте источник, подготовьте конспект и разберитесь в главном."}</p><div className={styles.cardActions}><button type="button" className={styles.primaryButton} onClick={() => open(current.id)}>Продолжить <ArrowRight size={17} /></button>{current.status === "ready" ? <button type="button" className={styles.secondaryButton} onClick={() => review(current.id)}><GraduationCap size={17} />Проверить себя</button> : null}</div></> : <><div className={styles.emptyBook} aria-hidden="true"><BookOpen size={26} strokeWidth={1.4} /></div><h2>Ваша следующая идея<br />начинается здесь.</h2><p>Добавьте лекцию, PDF, запись или заметку. polka поможет превратить материал в понятный конспект.</p><button type="button" className={styles.primaryButton} onClick={add}><Plus size={17} />Добавить первый материал</button></>}
      </section>
      <section className={`${styles.card} ${styles.aiCard}`}><div className={styles.cardLabel}><span className={styles.aiBadge}><Sparkles size={14} />polka.ai</span><span>РЯДОМ, КОГДА НУЖНО</span></div><div className={styles.aiArt} aria-hidden="true"><Sparkles size={32} strokeWidth={1.3} /><span /><span /></div><h2>Понять, а не просто<br />прочитать.</h2><p>Задайте вопрос по своим материалам. Разберите сложную тему и вернитесь к источнику из ответа.</p><button type="button" className={`${styles.aiPrompt} v2-ai-prompt-entry`} onClick={() => navigate("assistant")}><span>Спросить polka.ai</span><ArrowRight size={18} /></button><small>ИИ может ошибаться — сверяйтесь с оригиналом.</small></section>
    </div>
    <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>СОХРАНЕНО ДЛЯ ВАС</span><h2>Ваша библиотека</h2></div><button type="button" className={styles.textAction} onClick={() => navigate("materials")}>Все материалы <ArrowRight size={16} /></button></div>
    <div className={styles.libraryGrid}>
      <section className={`${styles.card} ${styles.recent}`} aria-label="Последние материалы">{loading && !materials.length ? <p role="status" className={styles.loadingList}>Загружаем материалы…</p> : recent.length ? recent.slice(0, 4).map(item => <button type="button" className={`${styles.materialRow} v2-material-row`} data-material-row key={item.id} onClick={() => open(item.id)}><span className={styles.fileIcon}><FileText size={20} /></span><span className={styles.rowCopy}><strong>{item.title}</strong><small>{item.subject || "Без предмета"} · {dateLabel(item.createdAt)}</small></span><span className={`${styles.rowStatus} ${item.status === "ready" ? styles.readyStatus : ""}`}>{item.status === "ready" ? "Готово" : "Входящие"}</span><ArrowRight size={16} /></button>) : <div className={styles.listEmpty}><Library size={27} strokeWidth={1.5} /><h3>Место для ваших материалов</h3><p>Лекции и заметки соберутся здесь.</p><button type="button" className={styles.textAction} onClick={add}>Добавить материал <Plus size={16} /></button></div>}</section>
      <section className={`${styles.card} ${styles.subjects}`}><div className={styles.cardLabel}><span>ПРЕДМЕТЫ</span><FolderOpen size={17} /></div>{subjects.length ? <div className={styles.subjectList}>{subjects.slice(0, 4).map(name => <button type="button" key={name} onClick={() => subject(name)}><span>{name}</span><small>{materials.filter(item => (item.subject || "Без предмета") === name).length}</small><ArrowRight size={15} /></button>)}</div> : <p className={styles.subjectEmpty}>Добавьте предмет при загрузке — связанные материалы будут рядом.</p>}<button type="button" className={styles.textAction} onClick={() => navigate("subjects")}>Открыть предметы <ArrowRight size={16} /></button></section>
    </div>
    {inbox.length ? <button type="button" className={styles.inboxStrip} onClick={() => navigate("materials")}><span><span className={styles.inboxDot} />Материалы для разбора <strong>{inbox.length}</strong></span><span>Перейти к материалам <ArrowRight size={16} /></span></button> : null}
  </div>;
}

export function DesignLanding({ back, add }: { back: () => void; add: () => void }) { return <PolkaLanding preview back={back} start={add} />; }

export function CommandPalette({ materials, topics, navigate, open, add, close, previewSite }: { materials: MaterialCard[]; topics: Topic[]; navigate: (page: WorkspacePage) => void; open: (id: string) => void; add: () => void; close: () => void; previewSite: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  useEffect(() => { const node = ref.current; node?.showModal(); input.current?.focus(); return () => node?.close(); }, []);
  const q = query.trim().toLocaleLowerCase("ru");
  const commands = [{ title: "Добавить материал", label: "Действие", icon: Plus, run: add }, ...sections.map(item => ({ title: item.label, label: "Раздел", icon: item.icon, run: () => navigate(item.id) })), { title: "polka.id · Аккаунт", label: "Раздел", icon: UserRound, run: () => navigate("account") }, { title: "О polka", label: "О сервисе", icon: LayoutGrid, run: previewSite }];
  const rows = [...commands.filter(item => item.title.toLocaleLowerCase("ru").includes(q)), ...materials.filter(item => `${item.title} ${item.subject}`.toLocaleLowerCase("ru").includes(q)).map(item => ({ title: item.title, label: item.subject || "Материал", icon: FileText, run: () => open(item.id) })), ...topics.filter(item => `${item.title} ${item.body}`.toLocaleLowerCase("ru").includes(q)).map(item => ({ title: item.title, label: "Понятие · открыть источник", icon: BookOpen, run: () => open(item.materialId) }))].slice(0, 10);
  const selected = Math.min(active, Math.max(0, rows.length - 1));
  const choose = (index: number) => { const row = rows[index]; if (row) { close(); row.run(); } };
  useEffect(() => { ref.current?.querySelector(`#command-result-${selected}`)?.scrollIntoView({ block: "nearest" }); }, [selected]);
  return <dialog ref={ref} className={`${styles.commandDialog} v2-command-dialog`} aria-label="Поиск и команды" onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}><div className={styles.commandSearch}><Search size={21} /><input ref={input} placeholder="Материал, понятие или действие…" aria-label="Поиск материалов и команд" role="combobox" aria-controls="command-results" aria-expanded={true} aria-autocomplete="list" aria-activedescendant={rows.length ? `command-result-${selected}` : undefined} value={query} onChange={event => { setQuery(event.target.value); setActive(0); }} onKeyDown={event => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setActive(previous => Math.max(0, Math.min(rows.length - 1, previous + (event.key === "ArrowDown" ? 1 : -1)))); } if (event.key === "Enter") { event.preventDefault(); choose(selected); } }} /><button type="button" className={styles.commandClose} onClick={close} aria-label="Закрыть поиск"><X size={19} /></button></div><div id="command-results" role="listbox" aria-label="Результаты поиска">{rows.map((item, index) => <button type="button" role="option" aria-selected={index === selected} id={`command-result-${index}`} key={`${item.label}-${item.title}-${index}`} onClick={() => choose(index)} onPointerMove={() => setActive(index)}><item.icon size={18} /><span><strong>{item.title}</strong><small>{item.label}</small></span><ArrowRight size={15} /></button>)}{!rows.length ? <p className={`${styles.commandEmpty} v2-command-empty`} data-command-empty>Ничего не найдено. Попробуйте другое название.</p> : null}</div><footer><span>↑ ↓ выбрать · ↵ открыть</span><span>Esc закрыть</span></footer></dialog>;
}
