// Простейшая клиентская навигация по путям (без сторонних роутеров):
// смена URL и подписка компонентов на её изменение.
type Listener = () => void;
const listeners = new Set<Listener>();

export function navigate(to: string): void {
  window.history.pushState({}, '', to);
  listeners.forEach((fn) => fn());
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getPath(): string {
  return window.location.pathname;
}

export function getSearchParam(key: string): string | null {
  return new URLSearchParams(window.location.search).get(key);
}
