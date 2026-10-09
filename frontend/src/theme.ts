export const THEMES = [
  { id: 'onyx', label: '🖤 오닉스' },
  { id: 'navy', label: '🌌 네이비' },
  { id: 'cream', label: '☕ 크림' },
  { id: 'mint', label: '🍃 민트' },
  { id: 'rose', label: '🌸 로즈' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

export function getTheme(): ThemeId {
  const saved = localStorage.getItem('theme');
  return THEMES.some((t) => t.id === saved) ? (saved as ThemeId) : 'onyx';
}

export function applyTheme(id: ThemeId) {
  document.documentElement.dataset.theme = id;
  localStorage.setItem('theme', id);
}

export function initTheme() {
  document.documentElement.dataset.theme = getTheme();
}
