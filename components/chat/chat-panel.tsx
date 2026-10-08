"use client";

import { Check, ChevronDown, Copy, FileText, LoaderCircle, Menu, MessageCircle, Plus, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { MaterialCard } from "@/lib/types";
import PromptBar from "@/components/PromptBar";
import AITextLoading from "@/components/kokonutui/ai-text-loading";
import LatticeLoader from "@/components/LatticeLoader";

type Source = { id: string; title: string; index?: number };
type Message = { id: string; role: "user" | "assistant"; content: string; sources?: Source[]; createdAt: string; status?: string };
type Chat = { id: string; title: string; updatedAt?: string; materialIds: string[]; messages: Message[]; status: "idle" | "streaming" | "failed" };
type ChatCard = { id: string; title: string; updatedAt: string; materialIds: string[] };
type StreamEvent = { type: "start"; chatId: string; userMessageId: string; assistantMessageId: string } | { type: "delta"; text: string } | { type: "done"; chat: Chat } | { type: "error"; error: string; retryable?: boolean };
type Props = { materials: MaterialCard[]; aiAvailable: boolean; username: string; openMaterial: (id: string) => void };
async function jsonRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...options?.headers } });
  const result = await response.json().catch(() => ({ error: "Не удалось прочитать ответ сервера." }));
  if (!response.ok) throw new Error(result.error || "Не удалось выполнить действие.");
  return result as T;
}
const freshChat = (): Chat => ({ id: "", title: "Новый диалог", materialIds: [], messages: [], status: "idle" });
function setChatURL(id: string) { const url = new URL(window.location.href); url.searchParams.set("page", "assistant"); if (id) { url.searchParams.set("chat", id); url.searchParams.delete("material"); } else { url.searchParams.delete("chat"); url.searchParams.delete("material"); } window.history.replaceState({}, "", url); }
const prettyDate = (value: string) => new Intl.DateTimeFormat("ru", { day: "numeric", month: "short" }).format(new Date(value));

function InlineText({ text, sources, open }: { text: string; sources: Source[]; open: (id: string) => void }) {
  return <>{text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[\d+\])/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    const number = /^\[(\d+)\]$/.exec(part);
    const source = number ? sources.find((item, position) => (item.index || position + 1) === Number(number[1])) : undefined;
    if (number && source) { return <button className="inline-citation" key={index} title={source.title} aria-label={`Открыть источник ${number[1]}: ${source.title}`} onClick={() => open(source.id)}>{number[1]}</button>; }
    return part;
  })}</>;
}
function MessageContent({ message, open }: { message: Message; open: (id: string) => void }) {
  const sources = message.sources || [];
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flushList = () => { if (list.length) { blocks.push(<ul key={`list-${blocks.length}`}>{list.map((item, index) => <li key={index}><InlineText text={item} sources={sources} open={open} /></li>)}</ul>); list = []; } };
  message.content.split("\n").forEach((line, index) => {
    if (/^\s*[-*]\s+/.test(line)) { list.push(line.replace(/^\s*[-*]\s+/, "")); return; }
    flushList();
    if (!line.trim()) { blocks.push(<div className="message-paragraph-gap" key={index} />); return; }
    const heading = /^#{1,4}\s+(.+)$/.exec(line);
    if (heading) blocks.push(<h3 key={index}><InlineText text={heading[1]} sources={sources} open={open} /></h3>);
    else blocks.push(<p key={index}><InlineText text={line} sources={sources} open={open} /></p>);
  });
  flushList();
  return <div className="chat-prose">{blocks}</div>;
}

export default function ChatPanel({ materials, aiAvailable, username, openMaterial }: Props) {
  const [chats, setChats] = useState<ChatCard[]>([]);
  const [active, setActive] = useState<Chat>(freshChat);
  const [scope, setScope] = useState(materials.length ? "library" : "general");
  const [draft, setDraft] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingChat, setLoadingChat] = useState(false);
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [error, setError] = useState("");
  const [copyState, setCopyState] = useState("");
  const [deleteId, setDeleteId] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [pendingRetry, setPendingRetry] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const scrollBox = useRef<HTMLDivElement>(null);
  const infoPanel = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const mounted = useRef(true);
  const activeId = active.id;
  const updateCard = useCallback((chat: Chat) => { if (!chat.id) return; setChats(previous => [{ id: chat.id, title: chat.title, updatedAt: chat.updatedAt || new Date().toISOString(), materialIds: chat.materialIds }, ...previous.filter(item => item.id !== chat.id)]); }, []);
  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try { const data = await jsonRequest<{ chats: ChatCard[] }>("/api/chats"); if (mounted.current) setChats(data.chats); }
    catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : "Не удалось загрузить диалоги."); }
    finally { if (mounted.current) setLoadingHistory(false); }
  }, []);
  useEffect(() => { const frame = requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" })); return () => cancelAnimationFrame(frame); }, []);
  useEffect(() => { mounted.current = true; void fetchHistory(); const params = new URLSearchParams(window.location.search); const requested = params.get("chat"); const materialId = params.get("material"); if (requested && /^[0-9a-f-]{36}$/i.test(requested)) void openChat(requested); else if (materialId && materials.some(material => material.id === materialId)) setScope(materialId); return () => { mounted.current = false; controller.current?.abort(); }; }, [fetchHistory]);
  useEffect(() => { if (stickToBottom.current) { const frame = requestAnimationFrame(() => { const box = scrollBox.current; if (box) box.scrollTop = box.scrollHeight; }); return () => cancelAnimationFrame(frame); } }, [active.messages, busy]);
  useEffect(() => { if (!copyState) return; const timer = setTimeout(() => setCopyState(""), 1800); return () => clearTimeout(timer); }, [copyState]);
  useEffect(() => {
    if (!infoOpen) return;
    const closeOnOutside = (event: PointerEvent) => { if (!infoPanel.current?.contains(event.target as Node)) setInfoOpen(false); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setInfoOpen(false); };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeOnOutside); document.removeEventListener("keydown", closeOnEscape); };
  }, [infoOpen]);
  useEffect(() => { const viewport = window.visualViewport; if (!viewport) return; const root = document.documentElement; const update = () => { root.style.setProperty("--visual-height", `${viewport.height}px`); root.dataset.chatKeyboard = window.innerHeight - viewport.height > 160 ? "open" : "closed"; }; update(); viewport.addEventListener("resize", update); return () => { viewport.removeEventListener("resize", update); root.style.removeProperty("--visual-height"); delete root.dataset.chatKeyboard; }; }, []);
  const scopeIds = scope === "general" ? [] : scope === "library" ? materials.slice(0, 8).map(material => material.id) : [scope];
  const busyElsewhere = active.status === "streaming" && !busy;

  async function openChat(id: string) {
    if (busy) return;
    setLoadingChat(true); setError(""); setPendingRetry(false);
    try { const { chat } = await jsonRequest<{ chat: Chat }>(`/api/chats/${id}`); if (!mounted.current) return; setActive(chat); setChatURL(chat.id); setScope(!chat.materialIds.length ? "general" : chat.materialIds.length === 1 ? chat.materialIds[0] : "library"); setHistoryOpen(false); stickToBottom.current = true; setPendingRetry(chat.status === "failed"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось открыть диалог."); }
    finally { if (mounted.current) setLoadingChat(false); }
  }
  function newChat() { if (busy) return; setChatURL(""); setActive(freshChat()); setDraft(""); setError(""); setPendingRetry(false); setHistoryOpen(false); setScope(materials.length ? "library" : "general"); stickToBottom.current = true; }
  async function deleteChat(id: string) {
    setDeleting(true); setError("");
    try { await jsonRequest(`/api/chats/${id}`, { method: "DELETE" }); setChats(previous => previous.filter(chat => chat.id !== id)); if (activeId === id) newChat(); setDeleteId(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось удалить диалог."); }
    finally { setDeleting(false); }
  }
  async function copy(message: Message) { try { await navigator.clipboard.writeText(message.content); setCopyState(message.id); } catch { setError("Не удалось скопировать текст. Вы можете выделить его вручную."); } }
  async function send(action: "send" | "retry" | "regenerate" = "send", submittedText?: string) {
    const text = (submittedText ?? draft).trim();
    if (busy || !aiAvailable || (action === "send" && !text) || busyElsewhere) return;
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError(""); setPendingRetry(false); stickToBottom.current = true;
    const previous = active;
    const assistantId = crypto.randomUUID(); const userId = crypto.randomUUID(); let streamAssistantId = assistantId;
    const now = new Date().toISOString();
    const oldMessages = action === "send" ? active.messages : active.messages.filter((message, index, all) => !(message.role === "assistant" && index === all.length - 1));
    const nextMessages = [...oldMessages, ...(action === "send" ? [{ id: userId, role: "user" as const, content: text, createdAt: now }] : []), { id: assistantId, role: "assistant" as const, content: "", createdAt: now }];
    setActive({ ...active, title: active.id ? active.title : text.slice(0, 65), materialIds: scopeIds, messages: nextMessages, status: "streaming" });
    if (action === "send") setDraft("");
    let started = false; let done = false;
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, signal: abort.signal, body: JSON.stringify({ chatId: active.id || undefined, requestId: crypto.randomUUID(), ...(action === "send" ? { message: text, materialIds: scopeIds } : {}), action }) });
      if (!response.ok) { const problem = await response.json().catch(() => ({})); throw new Error(problem.error || "Не удалось начать ответ. Попробуйте ещё раз."); }
      if (!response.body) throw new Error("Сервер не отправил ответ.");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      function event(data: StreamEvent) {
        if (!mounted.current) return;
        if (data.type === "start") { setChatURL(data.chatId); started = true; streamAssistantId = data.assistantMessageId; setActive(chat => ({ ...chat, id: data.chatId, messages: chat.messages.map(message => message.id === userId ? { ...message, id: data.userMessageId } : message.id === assistantId ? { ...message, id: data.assistantMessageId } : message) })); }
        if (data.type === "delta") setActive(chat => ({ ...chat, messages: chat.messages.map(message => message.id === streamAssistantId ? { ...message, content: message.content + data.text } : message) }));
        if (data.type === "done") { done = true; setActive(data.chat); updateCard(data.chat); }
        if (data.type === "error") throw new Error(data.error);
      }
      function frame(value: string) { const raw = value.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).join("\n"); if (raw) event(JSON.parse(raw) as StreamEvent); }
      while (true) { const chunk = await reader.read(); if (chunk.done) break; buffer += decoder.decode(chunk.value, { stream: true }); const frames = buffer.split(/\r?\n\r?\n/); buffer = frames.pop() || ""; frames.forEach(frame); }
      buffer += decoder.decode(); if (buffer.trim()) frame(buffer);
      if (!done) throw new Error("Ответ прервался до сохранения. Можно попробовать ещё раз.");
    } catch (reason) {
      if (!mounted.current) return;
      if (abort.signal.aborted) { if (!started) { setActive(previous); if (action === "send") setDraft(text); setError("Отправка остановлена. Сообщение осталось в поле ввода."); setPendingRetry(false); } else { setError("Ответ остановлен. Обновите диалог, чтобы увидеть сохранённый фрагмент, или попробуйте ещё раз."); setPendingRetry(true); setActive(chat => ({ ...chat, status: "failed" })); } }
      else { setError(reason instanceof Error ? reason.message : "Не удалось получить ответ."); setPendingRetry(started || action !== "send"); if (!started) { setActive(previous); if (action === "send") setDraft(text); } else setActive(chat => ({ ...chat, status: "failed" })); }
      void fetchHistory();
    } finally { if (mounted.current) setBusy(false); controller.current = null; }
  }

  const lastAssistant = [...active.messages].reverse().find(message => message.role === "assistant" && message.content.trim());
  return <section className={`chat-workbench ${historyOpen ? "history-visible" : ""}`} aria-label="Диалог с polka.ai">
    <aside className="chat-history"><div className="chat-history-heading"><span>Ваши диалоги</span><button className="icon-button history-close" aria-label="Закрыть список диалогов" onClick={() => setHistoryOpen(false)}><X size={17} /></button></div><button className="chat-new" disabled={busy} onClick={newChat}><Plus size={16} />Новый диалог</button>{loadingHistory ? <span className="history-loading"><LoaderCircle size={16} className="spin" />Загружаем историю…</span> : chats.length ? <div className="history-items">{chats.map(chat => <div className={`history-item ${activeId === chat.id ? "selected" : ""}`} key={chat.id}><button className="history-open" disabled={busy || deleting} onClick={() => openChat(chat.id)}><MessageCircle size={15} /><span><strong>{chat.title}</strong><small>{prettyDate(chat.updatedAt)}</small></span></button><button className="history-remove" disabled={busy || deleting} aria-label={`Удалить диалог «${chat.title}»`} onClick={() => setDeleteId(chat.id)}><Trash2 size={13} /></button>{deleteId === chat.id ? <div className="history-confirm" role="group" aria-label="Подтверждение удаления диалога"><span>Удалить этот диалог?</span><button disabled={deleting} onClick={() => deleteChat(chat.id)}>Удалить</button><button disabled={deleting} onClick={() => setDeleteId("")}>Отмена</button></div> : null}</div>)}</div> : <div className="history-empty"><MessageCircle size={23} strokeWidth={1.5} /><p>Здесь сохранятся<br />ваши разговоры.</p></div>}<p className="history-note">Диалоги хранятся в вашем аккаунте.</p></aside>
    <div className="chat-main"><div className="chat-toolbar"><div className="assistant-toolbar-left"><button className="icon-button history-toggle" aria-label="Показать диалоги" aria-expanded={historyOpen} onClick={() => setHistoryOpen(!historyOpen)}><Menu size={19} /></button><div className="assistant-info" ref={infoPanel}><button type="button" className="assistant-info-trigger" aria-haspopup="dialog" aria-expanded={infoOpen} aria-controls="assistant-info-popover" onClick={() => setInfoOpen(open => !open)}><span className="assistant-mark"><Sparkles size={17} /></span><strong>polka.ai</strong><ChevronDown size={14} /></button>{infoOpen ? <section id="assistant-info-popover" className="assistant-info-popover" role="dialog" aria-label="Как работает polka.ai"><div className="assistant-info-top"><span>ВАШ УЧЕБНЫЙ ИИ</span><button type="button" aria-label="Закрыть информацию" onClick={() => setInfoOpen(false)}><X size={16} /></button></div><h2>Помощник, который работает с вашими материалами</h2><p>Выберите всю библиотеку, отдельный материал или учебный разговор без источников. polka.ai поможет разобраться в теме и покажет, на какие материалы опирается ответ.</p><p>ИИ может ошибаться — сверяйте важные выводы с оригиналом лекции.</p><div className="assistant-info-foot"><Sparkles size={14} />Ответы создаёт Google Gemini</div></section> : null}</div></div></div>
      <div className="chat-scope"><label><FileText size={15} /><select aria-label="Источники для ответа" value={scope} onChange={event => setScope(event.target.value)} disabled={busy || busyElsewhere}><option value="general">Учебный разговор без материалов</option>{materials.length ? <option value="library">{materials.length > 8 ? "Последние 8 материалов" : "Вся библиотека"}</option> : null}{materials.map(material => <option key={material.id} value={material.id}>{material.title}</option>)}</select><ChevronDown size={13} /></label>{scope === "general" ? <span>Объяснения и идеи</span> : <span>Ответы с источниками</span>}</div>
      <div ref={scrollBox} className="chat-messages" role="log" aria-label="Сообщения диалога" aria-live="off" onScroll={() => { const box = scrollBox.current; if (box) stickToBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < 95; }}>
        {loadingChat ? <div className="chat-opening"><LoaderCircle className="spin" size={22} /><p>Открываем диалог…</p></div> : active.messages.map(message => <article className={`chat-message chat-message-${message.role}`} key={message.id}><span className="chat-avatar">{message.role === "assistant" ? <Sparkles size={17} /> : username.slice(0, 1).toUpperCase()}</span><div className="chat-message-body"><span className="chat-message-label">{message.role === "assistant" ? "polka.ai" : "Вы"}</span>{message.content ? <><MessageContent message={message} open={openMaterial} />{busy && message.id === active.messages.at(-1)?.id ? <span className="stream-caret" aria-hidden="true" /> : null}</> : busy ? <LatticeLoader label="Готовлю ответ" doneLabel="Готово" errorLabel="Не удалось" showTimer={false} cellSize={5} gap={2} step={100} color="#9583a6" className="chat-lattice-loader" /> : <p className="interrupted-message">Ответ не завершён.</p>}{message.sources?.length ? <div className="chat-sources"><span>ИСТОЧНИКИ</span>{message.sources.map((source, index) => <button key={source.id} onClick={() => openMaterial(source.id)}><span>{source.index || index + 1}</span><FileText size={13} /><strong>{source.title}</strong></button>)}</div> : null}{message.role === "assistant" && message.content && !busy ? <div className="chat-message-actions"><button onClick={() => copy(message)}>{copyState === message.id ? <Check size={13} /> : <Copy size={13} />}{copyState === message.id ? "Скопировано" : "Копировать"}</button>{message.id === lastAssistant?.id && active.status === "idle" ? <button onClick={() => send("regenerate")} disabled={!aiAvailable}><RefreshCw size={13} />Другой вариант</button> : null}</div> : null}</div></article>)}
      </div>
      <div className="chat-composer-area">{error ? <div className="chat-error" role="alert"><p>{error}</p>{active.id ? <button disabled={busy} onClick={() => openChat(activeId)}><RefreshCw size={13} />Обновить диалог</button> : null}{pendingRetry && active.id ? <button disabled={busy || !aiAvailable} onClick={() => send("retry")}><RefreshCw size={13} />Попробовать ещё раз</button> : <button disabled={busy} onClick={() => setError("")}>Понятно</button>}</div> : null}{busyElsewhere ? <div className="chat-restoring"><AITextLoading texts={["Ответ ещё сохраняется"]} /><button onClick={() => openChat(activeId)} disabled={loadingChat}>Обновить диалог</button></div> : null}{!aiAvailable ? <div className="chat-unavailable">Помощник временно недоступен. Сохранённые диалоги и материалы остаются в библиотеке.</div> : null}<PromptBar className="polka-prompt-bar" placeholder="Спросить polka.ai" value={draft} onChange={setDraft} onSend={(value: string) => void send("send", value)} onAttach={undefined} onDictate={undefined} onEffortChange={undefined} onStop={() => controller.current?.abort()} busy={busy} disabled={!aiAvailable || busyElsewhere || loadingChat} sources={[]} commands={[]} models={[]} efforts={[]} width={840} radius={999} background="#fff" color="#302b36" menuBackground="#fff" sparkColor="#9b7aca" /><p className="chat-privacy">Не отправляйте личные и конфиденциальные данные. Обработка Google Gemini · <a href="/privacy">Конфиденциальность</a></p><span className="sr-only" aria-live="polite">{busy ? "polka.ai готовит ответ." : active.status === "idle" && active.messages.length ? "Ответ готов и сохранён." : ""}</span></div>
    </div>
  </section>;
}
