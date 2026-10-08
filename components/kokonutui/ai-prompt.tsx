"use client";
/**
 * AI Prompt Input — adapted from @kokonutui (MIT, © 2025 kokonutUI).
 * Official source: https://kokonutui.com/r/ai-prompt.json
 * Replaced Tailwind/Motion with local CSS, removed unsupported model/file controls,
 * wired submission, IME handling and accessible loading state. See ./LICENSE.
 */
import { ArrowUp, Square } from "lucide-react";
import { useEffect } from "react";
import { useAutoResizeTextarea } from "./use-auto-resize-textarea";
type Props = { value: string; change: (value: string) => void; submit: () => void; busy: boolean; stop: () => void; disabled?: boolean; placeholder?: string };
export default function AIPrompt({ value, change, submit, busy, stop, disabled, placeholder = "Спросить polka.ai" }: Props) {
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({ minHeight: 32, maxHeight: 132 });
  useEffect(() => { adjustHeight(!value); }, [value, adjustHeight]);
  return <form className="kokonut-prompt" onSubmit={event => { event.preventDefault(); if (!disabled && !busy && value.trim()) submit(); }}>
    <textarea ref={textareaRef} enterKeyHint="send" aria-label="Спросить polka.ai" value={value} maxLength={1000} disabled={disabled} placeholder={placeholder} rows={1} onChange={event => { change(event.target.value); adjustHeight(); }} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
    {busy ? <button className="prompt-send prompt-stop" type="button" onClick={stop} aria-label="Остановить ответ"><Square size={15} fill="currentColor" /></button> : <button className="prompt-send" type="submit" disabled={disabled || !value.trim()} aria-label="Отправить сообщение"><ArrowUp size={19} /></button>}
  </form>;
}
