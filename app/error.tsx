"use client";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="fatal-error"><div className="brand-mark">п</div><h1>Не удалось открыть страницу</h1><p>Попробуйте ещё раз. Ваши сохранённые материалы останутся в библиотеке.</p><button className="button primary" onClick={reset}>Попробовать снова</button></main>;
}
