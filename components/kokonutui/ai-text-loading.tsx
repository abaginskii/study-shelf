"use client";
/** AI Text Loading — adapted from Kokonut UI (MIT, © 2025 kokonutUI).
 * Source: https://kokonutui.com/r/ai-text-loading.json — see ./LICENSE.
 * CSS replaces Motion; status announcements are stable and reduced motion is respected.
 */
import { useEffect, useState } from "react";
const DEFAULT_TEXTS = ["Готовлю ответ", "Формулирую объяснение"];
export default function AITextLoading({ texts = DEFAULT_TEXTS, interval = 2800 }: { texts?: string[]; interval?: number }) {
  const [index, setIndex] = useState(0);
  useEffect(() => { if (texts.length < 2) return; const timer = setInterval(() => setIndex(previous => (previous + 1) % texts.length), interval); return () => clearInterval(timer); }, [interval, texts.length]);
  return <span className="kokonut-loading" role="status"><span className="sr-only">{texts[0] || "Подождите"}</span><span className="thinking-dots" aria-hidden="true"><i /><i /><i /></span><span key={index} className="thinking-text" aria-hidden="true">{texts[index % Math.max(1, texts.length)] || "Подождите"}</span></span>;
}
