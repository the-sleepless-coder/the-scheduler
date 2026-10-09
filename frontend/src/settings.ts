export const DEFAULT_PAGES = [
  { id: 'monthly', label: 'Monthly (월간)' },
  { id: 'weekly', label: 'Weekly (주간)' },
  { id: 'daily', label: 'Daily (오늘)' },
] as const;

export type DefaultPage = (typeof DEFAULT_PAGES)[number]['id'];

export function getDefaultPage(): DefaultPage {
  const saved = localStorage.getItem('defaultPage');
  return DEFAULT_PAGES.some((p) => p.id === saved)
    ? (saved as DefaultPage)
    : 'monthly';
}

export function setDefaultPage(page: DefaultPage) {
  localStorage.setItem('defaultPage', page);
}

export const MEMO_LAYOUTS = [
  { id: 'list', label: '위아래 목록 (기본)' },
  { id: 'grid', label: '격자' },
  { id: 'row', label: '옆으로 나열' },
] as const;

export type MemoLayout = (typeof MEMO_LAYOUTS)[number]['id'];

export function getMemoLayout(): MemoLayout {
  const saved = localStorage.getItem('memoLayout');
  return MEMO_LAYOUTS.some((l) => l.id === saved)
    ? (saved as MemoLayout)
    : 'list';
}

export function setMemoLayout(layout: MemoLayout) {
  localStorage.setItem('memoLayout', layout);
}

/** 하루 시작 시간 (시) — Time Boxing 그리드가 이 시각부터 24시간 표시 */
export function getDayStartHour(): number {
  const saved = Number(localStorage.getItem('dayStartHour'));
  return Number.isInteger(saved) && saved >= 0 && saved <= 23 ? saved : 6;
}

export function setDayStartHour(hour: number) {
  localStorage.setItem('dayStartHour', String(hour));
}

/** Memo 탭 폴더(분류) 순서 — 드래그로 변경한 순서 저장 */
export function getFolderOrder(): string[] {
  try {
    const raw = localStorage.getItem('folderOrder');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function setFolderOrder(order: string[]) {
  localStorage.setItem('folderOrder', JSON.stringify(order));
}

/** Memo 탭에서 접어둔 상위 항목 id들 — 페이지를 나갔다 와도 그대로 유지 */
export function getCollapsedItems(): number[] {
  try {
    const raw = localStorage.getItem('collapsedMemoItems');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((n) => typeof n === 'number') : [];
  } catch {
    return [];
  }
}

export function setCollapsedItems(ids: number[]) {
  localStorage.setItem('collapsedMemoItems', JSON.stringify(ids));
}
