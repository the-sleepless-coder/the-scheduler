// VITE_API_URL이 있으면 그걸, 없으면 페이지를 연 호스트 기준으로 5004.
// → localhost로 열면 localhost:5004, LAN IP로 열면 그 IP:5004 (다른 기기 접속 대응)
const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  `http://${window.location.hostname}:5004`;

export interface UserInfo {
  id: number;
  email: string;
  name: string;
}

export interface RecurringItem {
  id: number;
  title: string;
  category: string | null;
}

export interface WeekItem {
  id: number;
  weekStart: string;
  title: string;
  category: string | null;
  // "0,2,4" (0=월). null이면 매일
  days: string | null;
}

export interface MemoItem {
  id: number;
  month: string;
  category: string;
  text: string;
  parentId: number | null;
  content: string | null;
  assigned: boolean;
  completed: boolean;
  position: number;
}

export interface MemoItemLog {
  id: number;
  memoItemId: number;
  date: string;
  label: string;
  count: number;
  unit: string;
}

export interface MindTopic {
  id: number;
  month: string;
  name: string;
  isFolder: boolean;
  content: string | null;
}

export interface MonthMemo {
  id: number;
  month: string; // YYYY-MM
  date: string; // YYYY-MM-DD
  category: string;
  content: string;
  createdAt: string;
}

export interface PeriodItem {
  id: number;
  startDate: string;
  endDate: string;
  title: string;
  category: string | null;
}

export interface Task {
  id: number;
  title: string;
  category: string | null;
  date: string;
  completed: boolean;
  memo: string | null;
  subItemId: number | null;
  position: number;
  isChore: boolean;
  highPriority: boolean;
  top3Order: number | null;
  startTime: string | null;
  endTime: string | null;
  recurringId: number | null;
  weekItemId: number | null;
  periodItemId: number | null;
  // 타임박스 복사본이면 원본 할일 id (To Do 목록엔 안 뜸)
  parentTaskId: number | null;
}

export function getToken() {
  return localStorage.getItem('accessToken');
}

export function setSession(token: string, user: UserInfo) {
  localStorage.setItem('accessToken', token);
  localStorage.setItem('user', JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('user');
}

export function getUser(): UserInfo | null {
  const raw = localStorage.getItem('user');
  return raw ? (JSON.parse(raw) as UserInfo) : null;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/api${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = Array.isArray(body?.message)
      ? body.message[0]
      : body?.message ?? `요청 실패 (${res.status})`;
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export const api = {
  register: (email: string, password: string, name: string) =>
    request<{ accessToken: string; user: UserInfo }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    }),
  login: (email: string, password: string) =>
    request<{ accessToken: string; user: UserInfo }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  tasks: (date: string) => request<Task[]>(`/tasks?date=${date}`),
  categories: (month?: string) =>
    request<string[]>(
      month ? `/tasks/categories?month=${month}` : '/tasks/categories',
    ),
  tasksRange: (from: string, to: string) =>
    request<Task[]>(`/tasks/range?from=${from}&to=${to}`),
  recurring: () => request<RecurringItem[]>('/recurring'),
  createRecurring: (title: string, category?: string) =>
    request<RecurringItem>('/recurring', {
      method: 'POST',
      body: JSON.stringify({ title, category }),
    }),
  deleteRecurring: (id: number) =>
    request<{ ok: boolean }>(`/recurring/${id}`, { method: 'DELETE' }),
  weekItems: (from: string, to: string) =>
    request<WeekItem[]>(`/week-items?from=${from}&to=${to}`),
  createWeekItem: (
    weekStart: string,
    title: string,
    category?: string,
    days?: string,
  ) =>
    request<WeekItem>('/week-items', {
      method: 'POST',
      body: JSON.stringify({ weekStart, title, category, days }),
    }),
  deleteWeekItem: (id: number) =>
    request<{ ok: boolean }>(`/week-items/${id}`, { method: 'DELETE' }),
  periodItems: (from: string, to: string) =>
    request<PeriodItem[]>(`/period-items?from=${from}&to=${to}`),
  createPeriodItem: (data: {
    startDate: string;
    endDate: string;
    title: string;
    category?: string;
  }) =>
    request<PeriodItem>('/period-items', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deletePeriodItem: (id: number) =>
    request<{ ok: boolean }>(`/period-items/${id}`, { method: 'DELETE' }),
  monthMemos: (month: string) =>
    request<MonthMemo[]>(`/month-memos?month=${month}`),
  saveMonthMemo: (
    date: string,
    category: string,
    content: string,
    id?: number,
  ) =>
    request<MonthMemo | { ok: boolean }>('/month-memos', {
      method: 'PUT',
      body: JSON.stringify({ date, category, content, ...(id ? { id } : {}) }),
    }),
  deleteMonthMemo: (id: number) =>
    request<{ ok: boolean }>(`/month-memos/${id}`, { method: 'DELETE' }),
  memoItems: (month: string) =>
    request<MemoItem[]>(`/memo-items?month=${month}`),
  createMemoItem: (
    month: string,
    category: string,
    text: string,
    parentId?: number,
  ) =>
    request<MemoItem>('/memo-items', {
      method: 'POST',
      body: JSON.stringify({ month, category, text, parentId }),
    }),
  updateMemoItem: (id: number, patch: Partial<MemoItem>) =>
    request<MemoItem>(`/memo-items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteMemoItem: (id: number) =>
    request<{ ok: boolean }>(`/memo-items/${id}`, { method: 'DELETE' }),
  memoItemLogs: (memoItemId: number, from: string, to: string) =>
    request<MemoItemLog[]>(
      `/memo-item-logs?memoItemId=${memoItemId}&from=${from}&to=${to}`,
    ),
  memoItemLogLabels: (memoItemId: number) =>
    request<string[]>(`/memo-item-logs/labels?memoItemId=${memoItemId}`),
  memoItemLogUnits: (memoItemId: number) =>
    request<string[]>(`/memo-item-logs/units?memoItemId=${memoItemId}`),
  createMemoItemLog: (
    memoItemId: number,
    date: string,
    label: string,
    count: number,
    unit: string,
  ) =>
    request<MemoItemLog>('/memo-item-logs', {
      method: 'POST',
      body: JSON.stringify({ memoItemId, date, label, count, unit }),
    }),
  deleteMemoItemLog: (id: number) =>
    request<{ ok: boolean }>(`/memo-item-logs/${id}`, { method: 'DELETE' }),
  hiddenFolders: (month: string) =>
    request<string[]>(`/memo-items/hidden-folders?month=${month}`),
  renameFolder: (month: string, from: string, to: string) =>
    request<{ ok: boolean }>('/memo-items/rename-folder', {
      method: 'POST',
      body: JSON.stringify({ month, from, to }),
    }),
  deleteFolder: (month: string, category: string) =>
    request<{ ok: boolean }>('/memo-items/delete-folder', {
      method: 'POST',
      body: JSON.stringify({ month, category }),
    }),
  copyToNextMonth: (
    month: string,
    opts?: { category?: string; excludeCompleted?: boolean; itemIds?: number[] },
  ) =>
    request<{ ok: boolean; copied: number; nextMonth: string }>(
      '/memo-items/copy-to-next-month',
      {
        method: 'POST',
        body: JSON.stringify({ month, ...opts }),
      },
    ),
  mindTopics: (month: string) =>
    request<MindTopic[]>(`/mind-topics?month=${month}`),
  createMindTopic: (month: string, name: string) =>
    request<MindTopic>('/mind-topics', {
      method: 'POST',
      body: JSON.stringify({ month, name }),
    }),
  updateMindTopic: (id: number, patch: Partial<MindTopic>) =>
    request<MindTopic>(`/mind-topics/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteMindTopic: (id: number) =>
    request<{ ok: boolean }>(`/mind-topics/${id}`, { method: 'DELETE' }),
  createTask: (data: {
    title: string;
    date: string;
    category?: string;
    startTime?: string;
    endTime?: string;
    parentTaskId?: number;
  }) =>
    request<Task>('/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateTask: (id: number, patch: Partial<Task>) =>
    request<Task>(`/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteTask: (id: number) =>
    request<{ ok: boolean }>(`/tasks/${id}`, { method: 'DELETE' }),
};
