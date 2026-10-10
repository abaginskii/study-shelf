"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowDownToLine, ArrowLeft, ArrowRight, AudioLines, BookOpen, Check, ChevronRight, CircleHelp, FileText, FolderOpen, GraduationCap, ImageIcon, LayoutGrid, Library, LoaderCircle, MessageCircle, Plus, Search, ShieldCheck, Sparkles, Trash2, Upload, Video, X, UserRound } from "lucide-react";
import type { Material, MaterialCard, Topic } from "../lib/types";
import dynamic from "next/dynamic";
import { ConceptList } from "@/components/learning/concept-list";
const QuizSession = dynamic(() => import("@/components/learning/quiz-session"));
import AITextLoading from "@/components/kokonutui/ai-text-loading";
import { LegalFooter } from "@/components/legal/footer";
import { BrandWordmark } from "@/components/brand/wordmark";
import { PolkaLanding } from "@/components/marketing/polka-landing";
import { CommandPalette, DesignLanding, WorkspaceDashboard, WorkspaceHeader } from "@/components/workspace/workspace";
import { MobileTabBar, MobileWorkspaceDashboard, MobileWorkspaceHeader } from "@/components/mobile-pilot/workspace";
import { useMobilePilot } from "@/components/mobile-pilot/use-mobile-pilot";
const AccountPage = dynamic(() => import("@/components/account/account-page"), { loading: () => <div className="loading-panel"><Spinner label="Открываем аккаунт…" /></div> });
const ChatPanel = dynamic(() => import("@/components/chat/chat-panel"), { loading: () => <div className="loading-panel"><Spinner label="Открываем polka.ai…" /></div> });

type User = { id: string; username: string };
type LibraryData = { materials: MaterialCard[]; topics: Topic[]; stats: { materials: number; topics: number; inbox: number; reviews: number } };
type Page = "home" | "materials" | "subjects" | "knowledge" | "review" | "assistant" | "account";
type AuthMode = "login" | "register" | "recover";
type MobileView = { page: Page; query: string; subject: string; statusFilter: string; scroll: number; chat: string | null; material: string | null };
type MobileEntry = { page: Page; study?: string; depth: number };
function routePage(url: URL): Page {
  const requested = url.searchParams.get("page");
  return navigation.some(item => item.id === requested) ? requested as Page : url.searchParams.has("chat") ? "assistant" : "home";
}
function writeMobileEntry(entry: MobileEntry, push = false) {
  const url = new URL(window.location.href);
  if (entry.page === "home") url.searchParams.delete("page"); else url.searchParams.set("page", entry.page);
  if (entry.study) url.searchParams.set("study", entry.study); else url.searchParams.delete("study");
  if (entry.page !== "assistant") { url.searchParams.delete("chat"); url.searchParams.delete("material"); }
  const state = { ...window.history.state, polkaMobilePilot: entry };
  if (push) window.history.pushState(state, "", url); else window.history.replaceState(state, "", url);
}
const emptyLibrary: LibraryData = { materials: [], topics: [], stats: { materials: 0, topics: 0, inbox: 0, reviews: 0 } };
const navigation = [
  { id: "home" as Page, label: "Главная", icon: LayoutGrid },
  { id: "materials" as Page, label: "Материалы", icon: Library },
  { id: "subjects" as Page, label: "Предметы", icon: FolderOpen },
  { id: "knowledge" as Page, label: "База знаний", icon: BookOpen },
  { id: "review" as Page, label: "Повторение", icon: GraduationCap },
  { id: "assistant" as Page, label: "polka.ai", icon: MessageCircle },
  { id: "account" as Page, label: "Аккаунт", icon: UserRound },
];
const dateFormatter = new Intl.DateTimeFormat("ru", { day: "numeric", month: "short" });
const kindLabels = { text: "Текст", pdf: "PDF", image: "Фото", audio: "Аудио", video: "Видео" };
const kindIcons = { text: FileText, pdf: FileText, image: ImageIcon, audio: AudioLines, video: Video };
const fileTypes: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", txt: "text/plain", md: "text/plain", mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", webm: "audio/webm", ogg: "audio/ogg", mp4: "video/mp4", mov: "video/mp4" };
function displayDate(date: string) { const parsed = new Date(date); return Number.isNaN(parsed.getTime()) ? "" : dateFormatter.format(parsed); }
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, headers: options?.body instanceof FormData ? options.headers : { "Content-Type": "application/json", ...options?.headers } });
  const data = await res.json().catch(() => ({ error: "Не удалось прочитать ответ сервера." }));
  if (!res.ok) throw new Error(data.error || "Не удалось выполнить действие. Попробуйте ещё раз.");
  return data as T;
}
function Spinner({ label = "Загрузка…" }: { label?: string }) { return <span className="loading-inline" role="status"><LoaderCircle className="spin" size={18} />{label}</span>; }
function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="empty"><div className="empty-icon">{icon || <Library size={28} />}</div><h3>{title}</h3><p>{children}</p>{action}</div>;
}
function Dialog({ title, children, close, wide = false, error }: { title: string; children: ReactNode; close: () => void; wide?: boolean; error?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => { dialog?.close(); }; }, []);
  return <dialog ref={ref} className={`dialog ${wide ? "dialog-wide" : ""}`} aria-labelledby="dialog-title" onCancel={(e) => { e.preventDefault(); close(); }} onClick={(e) => { if (e.target === e.currentTarget) close(); }}><div className="dialog-inner"><div className="dialog-heading"><h2 id="dialog-title">{title}</h2><button type="button" className="icon-button" aria-label="Закрыть" onClick={close}><X size={20} /></button></div>{error ? <div className="notice error-notice" role="alert">{error}</div> : null}{children}</div></dialog>;
}
function MaterialTile({ material, open }: { material: MaterialCard; open: () => void }) {
  const Icon = kindIcons[material.kind] || FileText;
  return <button className="material-card" onClick={open}><span className="material-kind-row"><span className="material-file-icon"><Icon size={22} strokeWidth={1.6} /></span><span>{kindLabels[material.kind]}</span><ChevronRight size={17} /></span><span className="card-subject">{material.subject || "Без предмета"}</span><strong>{material.title}</strong><span className="card-excerpt">{material.excerpt || "Добавьте текст или создайте конспект, чтобы начать изучение."}</span><span className="card-footer"><span className={`status ${material.status === "ready" ? "status-ready" : ""}`}><span />{material.status === "ready" ? "Конспект готов" : "Нужно разобрать"}</span><span>{displayDate(material.createdAt)}</span></span></button>;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [pilotEligible, setPilotEligible] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [commandOpen, setCommandOpen] = useState(false);
  const [showDesignLanding, setShowDesignLanding] = useState(false);
  const mobilePilotEnabled = useMobilePilot(!!user && pilotEligible);
  const mobilePilot = mobilePilotEnabled && !showDesignLanding;
  const [sessionError, setSessionError] = useState("");
  const [aiAvailable, setAiAvailable] = useState(false);
  const [storageReady, setStorageReady] = useState(true);
  const [library, setLibrary] = useState<LibraryData>(emptyLibrary);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState("");
  const [page, setPage] = useState<Page>("home");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [subject, setSubject] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [auth, setAuth] = useState<AuthMode | null>(null);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadMode, setUploadMode] = useState("file");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [detail, setDetail] = useState<Material | null>(null);
  const detailRef = useRef<Material | null>(null);
  useEffect(() => { detailRef.current = detail; }, [detail]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState("summary");
  const [textDraft, setTextDraft] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const [subjectDraft, setSubjectDraft] = useState("");
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; kind: "material" | "topic"; title: string } | null>(null);
  const [topicOpen, setTopicOpen] = useState(false);
  const [topicTitle, setTopicTitle] = useState("");
  const [topicBodyDraft, setTopicBodyDraft] = useState("");
  const [autoPrepare, setAutoPrepare] = useState(true);
  const [quiz, setQuiz] = useState<{ material: Material } | null>(null);
  const [chatRestoreVersion, setChatRestoreVersion] = useState(0);
  const detailRequest = useRef(0);
  const mobileViews = useRef(new Map<Page, MobileView>());
  const currentView = useRef({ page, query, subject, statusFilter });
  const pendingScroll = useRef(0);
  useEffect(() => { currentView.current = { page, query, subject, statusFilter }; }, [page, query, subject, statusFilter]);
  const saveMobileView = useCallback(() => {
    if (detailRef.current) return;
    const url = new URL(window.location.href);
    const view = currentView.current;
    mobileViews.current.set(view.page, { ...view, scroll: window.scrollY, chat: url.searchParams.get("chat"), material: url.searchParams.get("material") });
  }, []);
  const restoreMobileView = useCallback((next: Page) => {
    const view = mobileViews.current.get(next);
    pendingScroll.current = view?.scroll ?? 0;
    setPage(next); setDetail(null); setQuiz(null);
    setQuery(view?.query ?? ""); setSubject(view?.subject ?? ""); setStatusFilter(view?.statusFilter ?? "all");
  }, []);
  const notice = useCallback((text: string, error = false) => setToast({ text, error }), []);
  const refreshLibrary = useCallback(async () => {
    setLibraryLoading(true); setLibraryError("");
    try { setLibrary(await request<LibraryData>("/api/library")); }
    catch (error) { setLibraryError(error instanceof Error ? error.message : "Не удалось загрузить библиотеку."); }
    finally { setLibraryLoading(false); }
  }, []);
  const loadSession = useCallback(async () => {
    setInitializing(true); setSessionError("");
    try { const session = await request<{ user: User | null; aiAvailable: boolean; storageReady: boolean; mobilePilotEligible: boolean }>("/api/session"); setPilotEligible(session.mobilePilotEligible === true); setUser(session.user); setAiAvailable(session.aiAvailable); setStorageReady(session.storageReady); }
    catch (error) { setPilotEligible(false); setSessionError(error instanceof Error ? error.message : "Сервер недоступен."); }
    finally { setInitializing(false); }
  }, []);
  useEffect(() => { void loadSession(); }, [loadSession]);
  useEffect(() => {
    const root = document.documentElement;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const original = meta?.content;
    const theme = window.matchMedia("(prefers-color-scheme: dark)");
    root.dataset.workspace = user ? "true" : "false";
    root.dataset.publicLanding = user ? "false" : "true";
    root.dataset.mobilePilot = mobilePilot ? "true" : "false";
    const update = () => { if (meta) meta.content = mobilePilot ? theme.matches ? "#090a0e" : "#f2f3f7" : user ? "#040506" : "#0c0d0e"; };
    update(); theme.addEventListener("change", update);
    return () => { theme.removeEventListener("change", update); delete root.dataset.workspace; delete root.dataset.publicLanding; delete root.dataset.mobilePilot; if (meta && original) meta.content = original; };
  }, [user?.id, mobilePilot]);
  useEffect(() => { if (!user) return; const onKey = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); if (!document.querySelector(".dialog[open]")) setCommandOpen(open => !open); } }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [user?.id]);

  useEffect(() => { if (user) { void refreshLibrary(); const params = new URLSearchParams(window.location.search); const requested = params.get("page"); if (params.get("chat")) setPage("assistant"); else if (navigation.some(item => item.id === requested)) setPage(requested as Page); } }, [user, refreshLibrary]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => { window.scrollTo({ top: mobilePilotEnabled && !detail && !quiz ? pendingScroll.current : 0, behavior: "instant" }); });
    return () => cancelAnimationFrame(frame);
  }, [user?.id, page, detail?.id, quiz?.material.id, mobilePilotEnabled]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 6500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { if (detail) { setTextDraft(detail.text); setTitleDraft(detail.title); setSubjectDraft(detail.subject || ""); } }, [detail]);
  const subjects = useMemo(() => Array.from(new Set(library.materials.map(m => m.subject || "Без предмета"))).sort((a, b) => a.localeCompare(b, "ru")), [library.materials]);
  const filtered = useMemo(() => { const q = deferredQuery.toLocaleLowerCase("ru").trim(); return library.materials.filter(m => (!q || `${m.title} ${m.subject} ${m.excerpt}`.toLocaleLowerCase("ru").includes(q)) && (!subject || (m.subject || "Без предмета") === subject) && (statusFilter === "all" || m.status === statusFilter)); }, [library.materials, deferredQuery, subject, statusFilter]);
  const filteredTopics = library.topics.filter(t => `${t.title} ${t.body}`.toLocaleLowerCase("ru").includes(deferredQuery.toLocaleLowerCase("ru")));
  const navigate = useCallback((next: Page) => {
    setShowDesignLanding(false); detailRequest.current++; setDetailLoading(false);
    const url = new URL(window.location.href);
    if (mobilePilotEnabled) {
      saveMobileView();
      const view = mobileViews.current.get(next);
      if (next === "assistant") {
        for (const key of ["chat", "material"] as const) {
          if (view?.[key]) url.searchParams.set(key, view[key]); else url.searchParams.delete(key);
        }
      }
      window.history.replaceState(window.history.state, "", url);
      writeMobileEntry({ page: next, depth: 0 });
      restoreMobileView(next);
    } else {
      if (next === "home") url.searchParams.delete("page"); else url.searchParams.set("page", next);
      if (next !== "assistant") { url.searchParams.delete("chat"); url.searchParams.delete("material"); }
      url.searchParams.delete("study");
      window.history.replaceState({}, "", url);
      setPage(next); setDetail(null); setQuiz(null); setQuery(""); setSubject(""); setStatusFilter("all");
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [mobilePilotEnabled, saveMobileView, restoreMobileView]);
  const showMaterial = useCallback((material: Material, pushHistory = true, saveOrigin = true) => {
    if (mobilePilotEnabled && pushHistory) {
      if (saveOrigin) saveMobileView();
      const previous = window.history.state?.polkaMobilePilot as MobileEntry | undefined;
      writeMobileEntry({ page: currentView.current.page, study: material.id, depth: (previous?.depth ?? 0) + 1 }, true);
    }
    setDetail(material); setDetailTab(material.text ? "summary" : "source");
  }, [mobilePilotEnabled, saveMobileView]);
  const closeMaterial = () => {
    detailRequest.current++; setDetailLoading(false);
    if (mobilePilotEnabled) {
      const entry = window.history.state?.polkaMobilePilot as MobileEntry | undefined;
      if (entry?.study && entry.depth > 0) { window.history.back(); return; }
      writeMobileEntry({ page: currentView.current.page, depth: 0 });
      restoreMobileView(currentView.current.page);
    } else setDetail(null);
  };
  async function run(name: string, task: () => Promise<void>) { setToast(null); setBusy(name); try { await task(); } catch (error) { notice(error instanceof Error ? error.message : "Не удалось выполнить действие.", true); } finally { setBusy(""); } }
  const openMaterial = useCallback(async (id: string, pushHistory = true) => {
    const token = ++detailRequest.current;
    if (mobilePilotEnabled && pushHistory) saveMobileView();
    setShowDesignLanding(false); setDetailLoading(true); setQuiz(null);
    try {
      const result = await request<{ material: Material }>(`/api/materials/${id}`);
      if (token === detailRequest.current) showMaterial(result.material, pushHistory, false);
    } catch (error) {
      if (token === detailRequest.current) notice(error instanceof Error ? error.message : "Материал недоступен.", true);
    } finally { if (token === detailRequest.current) setDetailLoading(false); }
  }, [showMaterial, notice, mobilePilotEnabled, saveMobileView]);
  useEffect(() => {
    if (!mobilePilotEnabled) { setDetailLoading(false); return; }
    const restoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    const initial = new URL(window.location.href);
    const entry = window.history.state?.polkaMobilePilot as MobileEntry | undefined;
    if (!entry) writeMobileEntry({ page: routePage(initial), study: initial.searchParams.get("study") ?? undefined, depth: 0 });
    const restore = () => {
      detailRequest.current++; setDetailLoading(false); setShowDesignLanding(false);
      setChatRestoreVersion(version => version + 1);
      const url = new URL(window.location.href);
      restoreMobileView(routePage(url));
      const study = url.searchParams.get("study");
      if (study) void openMaterial(study, false);
    };
    window.addEventListener("popstate", restore);
    if (initial.searchParams.has("study")) restore();
    return () => { window.removeEventListener("popstate", restore); window.history.scrollRestoration = restoration; detailRequest.current++; };
  }, [mobilePilotEnabled, user?.id, openMaterial, restoreMobileView]);
  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    await run("auth", async () => { const result = await request<{ user: User; recoveryCode?: string }>("/api/auth", { method: "POST", body: JSON.stringify({ action: auth, username: data.get("username"), password: data.get("password"), recoveryCode: data.get("recoveryCode") }) }); await loadSession(); setPage("home"); if (result.recoveryCode) setRecoveryCode(result.recoveryCode); else setAuth(null); notice(auth === "register" ? "Ваша полка готова. Добавьте первый материал." : "Вы вошли в библиотеку."); });
  }
  async function submitMaterial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    if (uploadMode === "file" && !selectedFile) { notice("Выберите файл для загрузки.", true); return; }
    await run("upload", async () => { let body: FormData | string; if (uploadMode === "file" && selectedFile!.size > 4 * 1024 * 1024) { const { upload } = await import("@vercel/blob/client"); const blob = await upload(`users/${user!.id}/uploads/${crypto.randomUUID()}.bin`, selectedFile!, { access: "private", handleUploadUrl: "/api/upload", contentType: fileTypes[selectedFile!.name.split(".").pop()!.toLowerCase()] || selectedFile!.type || "application/octet-stream", clientPayload: JSON.stringify({ size: selectedFile!.size }) }); body = JSON.stringify({ title: form.get("title"), subject: form.get("subject"), upload: { pathname: blob.pathname, filename: selectedFile!.name } }); } else if (uploadMode === "file") { form.set("file", selectedFile!); body = form; } else body = JSON.stringify({ title: form.get("title"), subject: form.get("subject"), text: form.get("text") }); const result = await request<{ material: Material }>("/api/materials", { method: "POST", body }); setUploadOpen(false); setSelectedFile(null); showMaterial(result.material); await refreshLibrary(); notice("Материал сохранён в вашей библиотеке.");
      if (autoPrepare && result.material.kind !== "video") {
        setBusy("prepare"); let prepared = result.material;
        try {
          if (!prepared.text.trim()) {
            notice("Готовим лекцию: извлекаем текст…");
            prepared = (await request<{material:Material}>(`/api/materials/${prepared.id}/extract`, {method:"POST"})).material;
            setDetail(current => current?.id === prepared.id ? prepared : current);
          }
          if (aiAvailable && prepared.text.trim()) {
            notice("Готовим конспект, понятия и вопросы…");
            prepared = (await request<{material:Material}>(`/api/materials/${prepared.id}/generate`, {method:"POST"})).material;
            setDetail(current => current?.id === prepared.id ? prepared : current);
            if (detailRef.current?.id === prepared.id) setDetailTab("summary");
            notice("Лекция готова: конспект, понятия и вопросы. Проверьте результат по оригиналу.");
          } else notice("Материал сохранён. Конспект можно создать после подключения ИИ.");
        } catch (reason) {
          notice(`Оригинал сохранён. ${reason instanceof Error ? reason.message : "Обработку можно повторить со страницы лекции."}`, true);
        } finally { await refreshLibrary(); }
      }
    });
  }
  async function importConcepts() {
    if (!detail) return;
    await run("concepts", async () => {
      const result = await request<{added:number;skipped:number;material:Material}>(`/api/materials/${detail.id}/topics`, {method:"POST"});
      setDetail(current => current?.id === result.material.id ? result.material : current);
      await refreshLibrary();
      notice(result.added ? `Добавлено понятий: ${result.added}. Уже в базе: ${result.skipped}.` : "Эти понятия уже в базе знаний.");
    });
  }
  async function saveMaterial() { if (!detail) return; await run("save", async () => { const result = await request<{ material: Material }>(`/api/materials/${detail.id}`, { method: "PATCH", body: JSON.stringify({ title: titleDraft, subject: subjectDraft, text: textDraft, expectedRevision: detail.revision }) }); setDetail(current => current?.id === result.material.id ? result.material : current); await refreshLibrary(); notice("Изменения сохранены."); }); }
  async function generate() { if (!detail) return; await run("generate", async () => { const result = await request<{ material: Material }>(`/api/materials/${detail.id}/generate`, { method: "POST" }); setDetail(current => current?.id === result.material.id ? result.material : current); setDetailTab("summary"); await refreshLibrary(); notice("Конспект и вопросы готовы. Проверьте их по оригиналу."); }); }
  async function extract() { if (!detail) return; await run("extract", async () => { const result = await request<{ material: Material }>(`/api/materials/${detail.id}/extract`, { method: "POST" }); setDetail(current => current?.id === result.material.id ? result.material : current); await refreshLibrary(); notice("Текст извлечён. Проверьте точность, затем создайте конспект."); }); }
  async function remove() { if (!deleteTarget) return; await run("delete", async () => { await request(`/api/${deleteTarget.kind === "material" ? "materials" : "topics"}/${deleteTarget.id}`, { method: "DELETE" }); if (deleteTarget.kind === "material") closeMaterial(); setDeleteTarget(null); await refreshLibrary(); notice("Удалено из библиотеки."); }); }
  async function startQuiz(id: string) {
    const token = ++detailRequest.current;
    await run("quiz", async () => {
      const result = await request<{ material: Material }>(`/api/materials/${id}`);
      if (token !== detailRequest.current) return;
      if (!result.material.questions.length) { showMaterial(result.material); setDetailTab("summary"); notice("Сначала подготовьте конспект, чтобы получить вопросы."); return; }
      if (mobilePilotEnabled) navigate("review"); else { setDetail(null); setPage("review"); }
      setQuiz({ material: result.material });
    });
  }
  async function submitTopic(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); await run("topic", async () => { await request("/api/topics", { method: "POST", body: JSON.stringify({ title: form.get("title"), body: form.get("body"), materialId: form.get("materialId") }) }); setTopicOpen(false); setTopicTitle(""); setTopicBodyDraft(""); await refreshLibrary(); notice("Понятие добавлено в базу знаний."); }); }
  async function exportData() { await run("export", async () => { const res = await fetch("/api/export"); if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Не удалось экспортировать библиотеку."); } const url = URL.createObjectURL(await res.blob()); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "polka-library.json"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notice("Библиотека экспортирована. Оригиналы файлов скачивайте со страниц материалов."); }); }
  async function logout() { await run("logout", async () => { await request("/api/logout", { method: "POST" }); setUser(null); setPilotEligible(false); mobileViews.current.clear(); setCommandOpen(false); setShowDesignLanding(false); window.history.replaceState({}, "", "/"); setLibrary(emptyLibrary); setDetail(null); setQuiz(null); setPage("home"); }); }

  const Dashboard = mobilePilot ? MobileWorkspaceDashboard : WorkspaceDashboard;
  const addButton = <button className="button primary" onClick={() => { setUploadOpen(true); setSelectedFile(null); }}><Plus size={18} />Добавить материал</button>;

  if (initializing) return <main className="initial-loading"><BrandWordmark tone="dark" /><Spinner label="Открываем вашу полку…" /></main>;
  return <div className={`polka-app${mobilePilot ? " mobile-pilot" : ""}`}>
    {!user ? <PolkaLanding start={() => setAuth("register")} login={() => setAuth("login")} sessionError={sessionError} retry={loadSession} storageReady={storageReady} /> : showDesignLanding ? <DesignLanding back={() => navigate("home")} add={() => setUploadOpen(true)} /> : <div className="app-shell">
      {mobilePilot ? <MobileWorkspaceHeader page={page} username={user.username} navigate={navigate} search={() => setCommandOpen(true)} add={() => { setSelectedFile(null); setUploadOpen(true); }} previewSite={() => { navigate("home"); setShowDesignLanding(true); }} detail={!!detail || !!quiz} back={quiz ? () => setQuiz(null) : closeMaterial} /> : <WorkspaceHeader page={detail ? "materials" : page} username={user.username} navigate={navigate} search={() => setCommandOpen(true)} add={() => { setSelectedFile(null); setUploadOpen(true); }} previewSite={() => { navigate("home"); setShowDesignLanding(true); }} />}

      <div className="app-content">
        <main id="main" className={`workspace ${page === "assistant" && !detail && !showDesignLanding ? "workspace-chat" : ""}`} data-page={page} tabIndex={-1}>
          {libraryError ? <div className="notice error-notice" role="alert"><span>{libraryError}</span><button onClick={refreshLibrary}>Повторить</button></div> : null}
          {detailLoading ? <div className="loading-panel"><Spinner label="Открываем материал…" /></div> : detail ? <>
            <button className="back-button" onClick={closeMaterial}><ArrowLeft size={17} />К библиотеке</button><div className="detail-heading"><div><span className="eyebrow">{detail.subject || "Без предмета"} <span>·</span> {kindLabels[detail.kind]}</span><h1>{detail.title}</h1><p>Добавлено {displayDate(detail.createdAt)} <span>·</span> {detail.hasFile ? "Оригинал сохранён" : "Текстовый материал"}</p></div><button className="icon-button danger" aria-label="Удалить материал" onClick={() => setDeleteTarget({ id: detail.id, kind: "material", title: detail.title })}><Trash2 size={20} /></button></div>
            <div className="detail-toolbar"><div className="segmented" role="tablist" aria-label="Разделы материала">{[["summary", "Конспект"], ["source", "Оригинал и текст"], ["questions", "Самопроверка"]].map(([id, label]) => <button key={id} role="tab" aria-selected={detailTab === id} className={detailTab === id ? "selected" : ""} onClick={() => setDetailTab(id)}>{label}</button>)}</div><button className="button primary" onClick={generate} disabled={!!busy || !detail.text.trim() || !aiAvailable}>{busy === "generate" ? <Spinner label="Готовим…" /> : <><Sparkles size={17} />{detail.summary ? "Обновить конспект" : "Создать конспект"}</>}</button></div>
            {busy === "generate" || busy === "extract" ? <div className="processing-notice"><AITextLoading texts={[busy === "generate" ? "Создаём конспект и вопросы" : "Извлекаем текст материала"]} /><p>Оригинал сохранён. Дождитесь результата на этой странице.</p></div> : null}
            {!aiAvailable ? <div className="notice"><Sparkles size={18} /><span>ИИ пока не подключён. Материал сохранён; к конспекту и вопросам можно вернуться позже.</span></div> : null}{detail.warning ? <div className="notice"><CircleHelp size={18} /><span>{detail.warning}</span></div> : null}
            {detailTab === "summary" ? <div className="detail-grid"><article className="panel summary-panel"><div className="panel-label"><BookOpen size={18} />Конспект{detail.aiGenerated ? <span className="tag">Подготовлен ИИ</span> : null}</div>{detail.summary ? <div className="prose">{detail.summary}</div> : <Empty icon={<Sparkles size={28} />} title="Давайте разберём этот материал">{detail.text ? "Создайте конспект: краткое объяснение, основные понятия и вопросы для повторения." : "Сначала извлеките или добавьте текст на вкладке «Оригинал и текст»."}</Empty>}<div className="source-reminder"><ShieldCheck size={17} /><span>Проверяйте выводы по оригиналу. ИИ может ошибаться.</span><button onClick={() => setDetailTab("source")}>Открыть источник <ArrowRight size={14} /></button></div></article><aside className="detail-aside"><ConceptList material={detail} topics={library.topics} busy={!!busy} importAll={importConcepts} edit={(title, body) => { setTopicTitle(title); setTopicBodyDraft(body); setTopicOpen(true); }} /><section className="review-callout"><GraduationCap size={26} /><h3>Что осталось в памяти?</h3><p>Несколько вопросов помогут закрепить материал.</p><button className="button" disabled={!detail.questions.length || !!busy} onClick={() => startQuiz(detail.id)}>Проверить себя <ArrowRight size={16} /></button></section></aside></div> : detailTab === "source" ? <div className="detail-grid"><form className="panel source-editor" onSubmit={(event) => { event.preventDefault(); void saveMaterial(); }}><div className="panel-label"><FileText size={18} />Текст материала</div><div className="field-row"><label>Название<input required value={titleDraft} onChange={e => setTitleDraft(e.target.value)} maxLength={160} /></label><label>Предмет<input value={subjectDraft} onChange={e => setSubjectDraft(e.target.value)} list="subject-list" maxLength={80} /></label></div><label>Распознанный текст или ваши заметки<textarea className="source-text" value={textDraft} onChange={e => setTextDraft(e.target.value)} placeholder="Добавьте текст материала. Проверьте распознанные формулы, имена и термины." maxLength={120000} /></label><div className="form-footer"><p>При изменении текста конспект и вопросы нужно создать заново.</p><button className="button primary" disabled={!!busy}>{busy === "save" ? <Spinner label="Сохраняем…" /> : "Сохранить"}</button></div></form><aside className="detail-aside"><section className="panel"><div className="panel-label"><Upload size={18} />Оригинал</div>{detail.hasFile ? <><div className="original-file"><FileText size={26} /><strong>{detail.filename}</strong><small>{detail.size ? `${(detail.size / 1024 / 1024).toFixed(1)} МБ` : kindLabels[detail.kind]}</small></div>{detail.kind === "audio" ? <audio controls preload="none" src={`/api/materials/${detail.id}/file`} /> : null}{detail.kind === "video" ? <video controls preload="none" src={`/api/materials/${detail.id}/file`} /> : null}<a className="button full" href={`/api/materials/${detail.id}/file`} target="_blank" rel="noreferrer"><ArrowDownToLine size={17} />Открыть оригинал</a>{detail.kind !== "video" ? <button className="button subtle full" disabled={!!busy} onClick={extract}>{busy === "extract" ? <Spinner label="Распознаём…" /> : <><Sparkles size={16} />{detail.text ? "Распознать заново" : "Извлечь текст"}</>}</button> : <p className="small muted">Добавьте расшифровку видео в поле текста.</p>}</> : <p className="muted">Этот материал добавлен как текст. Его можно редактировать и дополнять перед созданием конспекта.</p>}</section><div className="notice"><ShieldCheck size={18} /><span>Оригинальный файл хранится отдельно от текста и конспекта.</span></div></aside></div> : <section className="panel">{detail.questions.length ? <><div className="section-heading"><h2>{detail.questions.length} вопросов по материалу</h2><button className="button primary" onClick={() => startQuiz(detail.id)}>Начать повторение <ArrowRight size={16} /></button></div><p className="muted">Сначала ответьте своими словами. После ответа появится объяснение и фрагмент источника.</p><ol className="question-list">{detail.questions.map((q, i) => <li key={i}>{q.question}</li>)}</ol></> : <Empty icon={<GraduationCap size={28} />} title="Вопросы ещё не готовы">Создайте конспект материала, чтобы начать самопроверку.</Empty>}</section>}
          </> : page === "home" ? <>
            <Dashboard username={user.username} materials={library.materials} topics={library.stats.topics} reviews={library.stats.reviews} loading={libraryLoading} add={() => setUploadOpen(true)} open={openMaterial} navigate={navigate} review={startQuiz} search={() => setCommandOpen(true)} subject={name => { navigate("materials"); setSubject(name); }} />
          </> : page === "materials" ? <>
            <PageHeading eyebrow="ЛИЧНАЯ БИБЛИОТЕКА" title="Ваши материалы" text="Всё для учёбы. Всегда под рукой." />
            <div className="filters"><SearchField value={query} change={setQuery} placeholder="Найти материал, тему или понятие…" /><select aria-label="Фильтр по предмету" value={subject} onChange={e => setSubject(e.target.value)}><option value="">Все предметы</option>{subjects.map(s => <option key={s}>{s}</option>)}</select><select aria-label="Фильтр по статусу" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">Все материалы</option><option value="inbox">Входящие</option><option value="ready">Готовы к изучению</option></select></div><div className="results-label">{filtered.length} {filtered.length === 1 ? "материал" : "материалов"}</div>{libraryLoading ? <div className="loading-panel"><Spinner /></div> : filtered.length ? <div className="material-grid">{filtered.map(material => <MaterialTile key={material.id} material={material} open={() => openMaterial(material.id)} />)}</div> : <Empty title={library.materials.length ? "Ничего не нашлось" : "Здесь начинается ваша библиотека"} action={library.materials.length ? <button className="button" onClick={() => { setQuery(""); setSubject(""); setStatusFilter("all"); }}>Сбросить фильтры</button> : addButton}>{library.materials.length ? "Попробуйте другой запрос или выберите все предметы." : "Загрузите файл или добавьте текст. Полка сохранит источник и поможет его изучить."}</Empty>}
          </> : page === "subjects" ? <>
            <PageHeading eyebrow="ПО ПОЛОЧКАМ" title="Ваши предметы" text="Соберите вместе материалы по одной теме." />{subjects.length ? <div className="subject-grid">{subjects.map((s, index) => <button className={`subject-card subject-color-${index % 4}`} key={s} onClick={() => { navigate("materials"); setSubject(s); }}><span className="subject-icon"><FolderOpen size={28} strokeWidth={1.5} /></span><h2>{s}</h2><p>{library.materials.filter(m => (m.subject || "Без предмета") === s).length} материалов</p><span className="subject-arrow"><ArrowRight size={18} /></span></button>)}</div> : <Empty icon={<FolderOpen size={28} />} title="Каждой теме — своя полка" action={addButton}>Укажите предмет при добавлении материала. Его раздел появится здесь автоматически.</Empty>}
          </> : page === "knowledge" ? <>
            <PageHeading eyebrow="СВЯЗАННЫЕ ИДЕИ" title="База знаний" text="Понятия своими словами, с опорой на ваши источники." action={<button className="button primary" disabled={!library.materials.length} onClick={() => { setTopicTitle(""); setTopicBodyDraft(""); setTopicOpen(true); }}><Plus size={17} />Добавить понятие</button>} /><SearchField value={query} change={setQuery} placeholder="Найти понятие…" />{filteredTopics.length ? <div className="topic-grid">{filteredTopics.map(topic => <article className="panel topic-card" key={topic.id}><div className="topic-card-heading"><BookOpen size={19} /><button className="icon-button" aria-label={`Удалить понятие ${topic.title}`} onClick={() => setDeleteTarget({ id: topic.id, kind: "topic", title: topic.title })}><Trash2 size={16} /></button></div><h2>{topic.title}</h2><p className="prose">{topic.body}</p>{topic.sourceQuote ? <blockquote className="topic-evidence"><span>Фрагмент лекции{topic.sourceVersion ? ` · версия ${topic.sourceVersion}` : ""}</span>{topic.sourceQuote}</blockquote> : null}<button className="source-link" onClick={() => openMaterial(topic.materialId)}><FileText size={15} />{library.materials.find(m => m.id === topic.materialId)?.title || "Открыть источник"}<ArrowRight size={14} /></button></article>)}</div> : <Empty icon={<BookOpen size={28} />} title={query ? "Понятие не найдено" : "Идеи становятся знаниями"}>{query ? "Попробуйте другой запрос." : "Сохраните определение из конспекта или добавьте своё. У каждого понятия будет ссылка на источник."}</Empty>}
          </> : page === "review" ? <>
            <PageHeading eyebrow="ВСПОМНИТЬ И ПОНЯТЬ" title="Немного практики" text="Ответьте своими словами. Сверьтесь с материалом." />{quiz ? <QuizSession key={quiz.material.id} material={quiz.material} exit={() => setQuiz(null)} openMaterial={openMaterial} saved={refreshLibrary} /> : library.materials.filter(m => m.status === "ready").length ? <div className="review-list">{library.materials.filter(m => m.status === "ready").map(material => <div className="review-row panel" key={material.id}><span className="stat-icon lavender"><GraduationCap size={23} /></span><div><span className="eyebrow">{material.subject || "Без предмета"}</span><h3>{material.title}</h3><p>Вопросы, ответы и фрагменты источника</p></div><button className="button primary" disabled={!!busy} onClick={() => startQuiz(material.id)}>Повторить <ArrowRight size={16} /></button></div>)}</div> : <Empty icon={<GraduationCap size={28} />} title="Сначала материал, потом практика" action={<button className="button primary" onClick={() => navigate("materials")}>К материалам <ArrowRight size={17} /></button>}>Создайте конспект хотя бы одного материала. Вместе с ним появятся вопросы для повторения.</Empty>}
          </> : page === "account" ? <AccountPage username={user.username} busy={busy} exportData={exportData} logout={logout} /> : <>
            <ChatPanel key={`${user.id}:${mobilePilotEnabled ? chatRestoreVersion : 0}`} materials={library.materials} aiAvailable={aiAvailable} username={user.username} openMaterial={openMaterial} />
          </>}
          {page !== "assistant" || detail ? <LegalFooter compact /> : null}
        </main>
      </div>{mobilePilot ? <MobileTabBar page={page} navigate={navigate} detail={!!detail} /> : <nav className="mobile-nav" aria-label="Мобильная навигация">{(["home", "materials", "assistant", "review", "account"] as Page[]).map(id => navigation.find(item => item.id === id)!).map(item => <button key={item.id} onClick={() => navigate(item.id)} className={page === item.id && !detail ? "active" : ""} aria-current={page === item.id && !detail ? "page" : undefined}><item.icon size={21} /><span>{item.label}</span></button>)}</nav>}
    </div>}
    {user && commandOpen ? <CommandPalette materials={library.materials} topics={library.topics} navigate={navigate} open={openMaterial} add={() => setUploadOpen(true)} close={() => setCommandOpen(false)} previewSite={() => { navigate("home"); setShowDesignLanding(true); }} /> : null}
    {auth ? <Dialog error={toast?.error ? toast.text : undefined} title={recoveryCode ? "Сохраните код восстановления" : auth === "register" ? "Ваша полка начинается здесь" : auth === "recover" ? "Восстановить доступ" : "С возвращением"} close={() => { setAuth(null); setRecoveryCode(""); }}>{recoveryCode ? <div className="recovery-result"><p>Этот код показывается один раз. Сохраните его в менеджере паролей: он понадобится, если вы забудете пароль.</p><code>{recoveryCode}</code><button className="button primary full" onClick={() => { setAuth(null); setRecoveryCode(""); }}>Я сохранил код <Check size={17} /></button></div> : <><p className="dialog-intro">{auth === "register" ? "Личная библиотека для ваших материалов и идей. Создайте аккаунт — и начните учиться." : auth === "recover" ? "Введите имя пользователя, сохранённый код восстановления и новый пароль." : "Продолжим с того места, где остановились."}</p><form className="auth-form" onSubmit={submitAuth}><label>Имя пользователя<input name="username" required autoComplete="username" minLength={3} maxLength={40} placeholder="Например, alex_student" pattern="[a-zA-Z0-9_.\-]{3,40}" title="От 3 до 40 латинских букв, цифр, символов . _ или -" /><span className="field-hint">Латинские буквы, цифры, . _ или -</span></label>{auth === "recover" ? <label>Код восстановления<input name="recoveryCode" autoComplete="off" required /></label> : null}<label>{auth === "recover" ? "Новый пароль" : "Пароль"}<input name="password" type="password" required minLength={auth === "login" ? 1 : 10} maxLength={128} autoComplete={auth === "login" ? "current-password" : "new-password"} placeholder={auth === "login" ? "Ваш пароль" : "Не менее 10 символов"} /></label>{auth === "login" ? <button type="button" className="text-button auth-recover" onClick={() => setAuth("recover")}>Не помню пароль</button> : null}{auth === "register" ? <label className="auth-age"><input type="checkbox" required name="adult" /><span>Мне исполнилось 18 лет</span></label> : null}<button className="button primary full" disabled={!!busy || !storageReady}>{busy === "auth" ? <Spinner label="Подождите…" /> : auth === "register" ? "Создать аккаунт" : auth === "recover" ? "Восстановить доступ" : "Войти"}<ArrowRight size={17} /></button>{auth === "register" ? <p className="auth-terms">Создавая аккаунт, вы принимаете <a href="/offer" target="_blank" rel="noreferrer">условия оферты</a>. Об обработке данных — в <a href="/privacy" target="_blank" rel="noreferrer">политике конфиденциальности</a>.</p> : null}</form><p className="auth-switch">{auth === "register" ? "Уже есть аккаунт?" : "Пока нет аккаунта?"} <button onClick={() => setAuth(auth === "register" ? "login" : "register")}>{auth === "register" ? "Войти" : "Создать полку"}</button></p><div className="auth-privacy"><ShieldCheck size={15} />Материалы защищены входом в аккаунт.</div>{!storageReady ? <div className="notice error-notice">Регистрация появится после подключения хранилища.</div> : null}</>}</Dialog> : null}
    {uploadOpen ? <Dialog error={toast?.error ? toast.text : undefined} title="Добавить материал" close={() => { if (busy !== "upload") setUploadOpen(false); }} wide><p className="dialog-intro">Сохраните то, что хочется понять. К разбору можно вернуться позже.</p><div className="segmented upload-tabs"><button className={uploadMode === "file" ? "selected" : ""} onClick={() => setUploadMode("file")}><Upload size={16} />Загрузить файл</button><button className={uploadMode === "text" ? "selected" : ""} onClick={() => setUploadMode("text")}><FileText size={16} />Добавить текст</button></div><form onSubmit={submitMaterial}>{uploadMode === "file" ? <label className="dropzone" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file && file.size <= 60 * 1024 * 1024) setSelectedFile(file); else notice("Максимальный размер файла — 60 МБ.", true); }}><Upload size={29} strokeWidth={1.5} /><strong>{selectedFile ? selectedFile.name : "Нажмите или перетащите файл"}</strong><span>Файлы до 60 МБ · распознавание до 20 МБ</span><input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.md,.mp3,.wav,.m4a,.webm,.ogg,.mp4,.mov" onChange={e => { const file = e.target.files?.[0]; if (file && file.size > 60 * 1024 * 1024) { notice("Максимальный размер файла — 60 МБ.", true); e.target.value = ""; } else setSelectedFile(file || null); }} /></label> : <label>Текст материала<textarea name="text" required placeholder="Вставьте лекцию, конспект или заметку…" rows={7} maxLength={120000} /></label>}<div className="field-row"><label>Название<input name="title" required placeholder="О чём этот материал?" maxLength={160} /></label><label>Предмет <span className="optional">необязательно</span><input name="subject" placeholder="Например, математика" maxLength={80} list="subject-list" /></label></div><label className="auto-prepare-option"><input type="checkbox" checked={autoPrepare} onChange={event => setAutoPrepare(event.target.checked)} /><span>Автоматически подготовить лекцию<small>Извлечь текст, создать конспект, понятия и вопросы. Используется ИИ и ваша квота; для видео сохранится оригинал.</small></span></label><div className="form-footer"><p><ShieldCheck size={15} />Оригинал сохранится в вашей библиотеке.</p><button className="button primary" disabled={!!busy}>{busy === "upload" ? <Spinner label="Сохраняем…" /> : <><Plus size={17} />Добавить</>}</button></div></form></Dialog> : null}
    {topicOpen ? <Dialog error={toast?.error ? toast.text : undefined} title="Добавить понятие" close={() => setTopicOpen(false)} wide><p className="dialog-intro">Сформулируйте определение своими словами и укажите материал, на который опираетесь.</p><form onSubmit={submitTopic}><label>Понятие<input name="title" required defaultValue={topicTitle} maxLength={160} placeholder="Например, градиентный спуск" /></label><label>Ваше объяснение<textarea name="body" required defaultValue={topicBodyDraft} rows={6} maxLength={10000} placeholder="Что это, почему важно и с чем связано?" /></label><label>Источник<select name="materialId" required defaultValue={detail?.id || library.materials[0]?.id}>{library.materials.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}</select></label><div className="form-footer"><p>Проверьте объяснение по источнику перед сохранением.</p><button className="button primary" disabled={!!busy}>{busy === "topic" ? <Spinner label="Сохраняем…" /> : "Сохранить понятие"}</button></div></form></Dialog> : null}
    {deleteTarget ? <Dialog error={toast?.error ? toast.text : undefined} title="Удалить из библиотеки?" close={() => setDeleteTarget(null)}><p className="dialog-intro">«{deleteTarget.title}» будет удалён{deleteTarget.kind === "material" ? " вместе с оригиналом, конспектом и связанными понятиями" : " из базы знаний"}. Это действие нельзя отменить.</p><div className="dialog-actions"><button className="button" onClick={() => setDeleteTarget(null)}>Оставить</button><button className="button destructive" disabled={!!busy} onClick={remove}>{busy === "delete" ? <Spinner label="Удаляем…" /> : "Удалить"}</button></div></Dialog> : null}
    <datalist id="subject-list">{subjects.map(s => <option key={s} value={s} />)}</datalist>
    {toast ? <div className={`toast ${toast.error ? "toast-error" : ""}`} role={toast.error ? "alert" : "status"}>{toast.error ? <CircleHelp size={19} /> : <Check size={19} />}<span>{toast.text}</span><button aria-label="Скрыть уведомление" onClick={() => setToast(null)}><X size={17} /></button></div> : null}
  </div>;
}

function SearchField({ value, change, placeholder }: { value: string; change: (value: string) => void; placeholder: string }) { return <label className="search-field"><Search size={19} /><input type="search" aria-label={placeholder} placeholder={placeholder} value={value} onChange={e => change(e.target.value)} />{value ? <button className="icon-button" aria-label="Очистить поиск" onClick={() => change("")}><X size={16} /></button> : null}</label>; }
function PageHeading({ eyebrow, title, text, action }: { eyebrow: string; title: string; text: string; action?: ReactNode }) { return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{text}</p></div>{action}</div>; }
