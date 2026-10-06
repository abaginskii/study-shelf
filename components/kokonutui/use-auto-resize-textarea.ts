"use client";
/** Adapted from Kokonut UI use-auto-resize-textarea (MIT, © 2025 kokonutUI).
 * Source: https://kokonutui.com/r/ai-prompt.json — see ./LICENSE.
 */
import { useCallback, useEffect, useRef } from "react";
export function useAutoResizeTextarea({ minHeight, maxHeight = 220 }: { minHeight: number; maxHeight?: number }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const adjustHeight = useCallback((reset = false) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = `${minHeight}px`;
    if (!reset) textarea.style.height = `${Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight))}px`;
  }, [minHeight, maxHeight]);
  useEffect(() => { adjustHeight(); const resize = () => adjustHeight(); window.addEventListener("resize", resize); return () => window.removeEventListener("resize", resize); }, [adjustHeight]);
  return { textareaRef, adjustHeight };
}
