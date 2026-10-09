import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  api,
  MemoItem,
  MindTopic,
  MonthMemo,
  PeriodItem,
  RecurringItem,
  Task,
  UserInfo,
  WeekItem,
} from '../api';
import { addDays, fmt, mondayOf, pad, today, weekLabel, WEEKDAYS } from '../dates';
import Logo from '../Logo';
import {
  getCollapsedItems,
  getFolderOrder,
  getMemoLayout,
  setCollapsedItems,
  setFolderOrder,
} from '../settings';

interface Props {
  user: UserInfo;
  initialTab?: 'monthly' | 'weekly' | 'memo';
  initialFolder?: string; // Daily에서 폴더 메모로 바로 넘어올 때
  onFolderConsumed?: () => void; // 위 initialFolder를 다 썼다고 App에 알려줌 (한 번만)
  onLogout: () => void;
  onOpenDaily: (date: string) => void;
  onOpenMy: () => void;
}

type Tab = 'memo' | 'monthly' | 'weekly' | 'detailed';

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 06:00 ~ 23:00
const DROW = 28; // detailed 뷰 시간 한 칸 높이(px)
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

export default function MainPage({
  user,
  initialTab,
  initialFolder,
  onFolderConsumed,
  onLogout,
  onOpenDaily,
  onOpenMy,
}: Props) {
  const [tab, setTab] = useState<Tab>(initialTab ?? 'monthly');

  // Daily에서 폴더 지정해서 들어왔으면 App의 상태를 즉시 비워서
  // 이후 다른 경로로 Main에 다시 들어올 때 같은 폴더가 또 안 열리게 함
  useEffect(() => {
    if (initialFolder) onFolderConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [cursor, setCursor] = useState(() => new Date());
  // Memo 탭 상단 "새로운 항목 만들기" 버튼으로 입력받은 새 폴더 이름
  const [newFolderCat, setNewFolderCat] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [recurring, setRecurring] = useState<RecurringItem[]>([]);
  const [weekItems, setWeekItems] = useState<WeekItem[]>([]);
  const [periodItems, setPeriodItems] = useState<PeriodItem[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  // 화면에 보이는 날짜 범위
  const range = useMemo(() => {
    if (tab === 'monthly') {
      const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const gridStart = mondayOf(first);
      return { start: gridStart, from: fmt(gridStart), to: fmt(addDays(gridStart, 41)) };
    }
    if (tab === 'memo') {
      const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      return { start: first, from: fmt(first), to: fmt(last) };
    }
    // weekly / detailed 모두 주 단위
    const mon = mondayOf(cursor);
    return { start: mon, from: fmt(mon), to: fmt(addDays(mon, 6)) };
  }, [tab, cursor]);

  const month = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}`;
  const [memoItems, setMemoItems] = useState<MemoItem[]>([]);
  const [mindTopics, setMindTopics] = useState<MindTopic[]>([]);
  const [hiddenFolders, setHiddenFolders] = useState<string[]>([]);

  useEffect(() => {
    api.memoItems(month).then(setMemoItems).catch(() => setMemoItems([]));
    api.mindTopics(month).then(setMindTopics).catch(() => setMindTopics([]));
    api
      .hiddenFolders(month)
      .then(setHiddenFolders)
      .catch(() => setHiddenFolders([]));
  }, [month, reloadKey]);

  const addTopic = async (name: string) => {
    await api.createMindTopic(month, name);
    setMindTopics(await api.mindTopics(month));
  };

  const updateTopic = async (id: number, patch: Partial<MindTopic>) => {
    await api.updateMindTopic(id, patch);
    setMindTopics(await api.mindTopics(month));
  };

  const deleteTopic = async (id: number) => {
    await api.deleteMindTopic(id);
    setMindTopics(await api.mindTopics(month));
  };

  // 주간 What's on my mind (키 = 그 주 월요일)
  const weekKey = fmt(mondayOf(cursor));
  const [weekTopics, setWeekTopics] = useState<MindTopic[]>([]);

  useEffect(() => {
    api.mindTopics(weekKey).then(setWeekTopics).catch(() => setWeekTopics([]));
  }, [weekKey, reloadKey]);

  const addWeekTopic = async (name: string) => {
    await api.createMindTopic(weekKey, name);
    setWeekTopics(await api.mindTopics(weekKey));
  };

  const updateWeekTopic = async (id: number, patch: Partial<MindTopic>) => {
    await api.updateMindTopic(id, patch);
    setWeekTopics(await api.mindTopics(weekKey));
  };

  const deleteWeekTopic = async (id: number) => {
    await api.deleteMindTopic(id);
    setWeekTopics(await api.mindTopics(weekKey));
  };

  // Monthly 거터용: 그리드 6주 각각의 주간 주제
  const [weekTopicsByWeek, setWeekTopicsByWeek] = useState<
    Map<string, MindTopic[]>
  >(new Map());

  useEffect(() => {
    if (tab !== 'monthly') return;
    const starts = Array.from({ length: 6 }, (_, w) =>
      fmt(addDays(range.start, w * 7)),
    );
    Promise.all(
      starts.map((ws) => api.mindTopics(ws).catch(() => [] as MindTopic[])),
    ).then((lists) => {
      const map = new Map<string, MindTopic[]>();
      starts.forEach((ws, i) => map.set(ws, lists[i]));
      setWeekTopicsByWeek(map);
    });
  }, [tab, range, reloadKey]);

  const renameFolder = async (from: string, to: string) => {
    await api.renameFolder(month, from, to);
    setReloadKey((k) => k + 1); // 할일 분류까지 바뀌므로 전체 갱신
  };

  const deleteFolder = async (category: string) => {
    await api.deleteFolder(month, category);
    setReloadKey((k) => k + 1);
  };

  // 순수 복사 — 원본은 그대로 두고 다음달에 동일한 항목을 새로 만든다
  const copyToNextMonth = async (opts?: {
    category?: string;
    excludeCompleted?: boolean;
    itemIds?: number[];
  }) => {
    const res = await api.copyToNextMonth(month, opts);
    setReloadKey((k) => k + 1);
    return res;
  };

  const addMemoItem = async (
    category: string,
    text: string,
    parentId?: number,
  ) => {
    await api.createMemoItem(month, category, text, parentId);
    setMemoItems(await api.memoItems(month));
  };

  const updateMemoItem = async (id: number, patch: Partial<MemoItem>) => {
    await api.updateMemoItem(id, patch);
    setMemoItems(await api.memoItems(month));
  };

  const deleteMemoItem = async (id: number) => {
    await api.deleteMemoItem(id);
    setMemoItems(await api.memoItems(month));
  };

  const reorderMemoItems = async (idsInOrder: number[]) => {
    await Promise.all(
      idsInOrder.map((id, i) => {
        const item = memoItems.find((it) => it.id === id);
        return item && item.position !== i
          ? api.updateMemoItem(id, { position: i })
          : Promise.resolve(null);
      }),
    );
    setMemoItems(await api.memoItems(month));
  };

  useEffect(() => {
    api.tasksRange(range.from, range.to).then(setTasks).catch(() => setTasks([]));
    api
      .weekItems(range.from, range.to)
      .then(setWeekItems)
      .catch(() => setWeekItems([]));
    api
      .periodItems(range.from, range.to)
      .then(setPeriodItems)
      .catch(() => setPeriodItems([]));
  }, [range, reloadKey]);

  const addPeriodItem = async (data: {
    startDate: string;
    endDate: string;
    title: string;
    category?: string;
  }) => {
    await api.createPeriodItem(data);
    setReloadKey((k) => k + 1);
  };

  const removePeriodItem = async (id: number) => {
    await api.deletePeriodItem(id);
    setReloadKey((k) => k + 1);
  };

  const byWeek = useMemo(() => {
    const map = new Map<string, WeekItem[]>();
    for (const w of weekItems) {
      const list = map.get(w.weekStart) ?? [];
      list.push(w);
      map.set(w.weekStart, list);
    }
    return map;
  }, [weekItems]);

  const addWeekItem = async (
    weekStart: string,
    title: string,
    category?: string,
    days?: string,
  ) => {
    await api.createWeekItem(weekStart, title, category, days);
    setReloadKey((k) => k + 1);
  };

  // 현재 화면 범위 할일들의 분류 목록 (요일별 추가 드롭다운용)
  const rangeCategories = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const task of tasks) {
      if (!task.category) continue;
      const key = task.category.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(task.category);
    }
    return out.sort((a, b) => a.localeCompare(b));
  }, [tasks]);

  const removeWeekItem = async (id: number) => {
    await api.deleteWeekItem(id);
    setReloadKey((k) => k + 1);
  };

  const loadRecurring = useCallback(() => {
    api.recurring().then(setRecurring).catch(() => setRecurring([]));
  }, []);

  useEffect(() => {
    loadRecurring();
  }, [loadRecurring]);

  const addRecurring = async (title: string, category?: string) => {
    await api.createRecurring(title, category);
    loadRecurring();
    setReloadKey((k) => k + 1); // 이번주 보드에 바로 반영
  };

  const removeRecurring = async (id: number) => {
    await api.deleteRecurring(id);
    loadRecurring();
  };

  const byDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      const list = map.get(t.date) ?? [];
      list.push(t);
      map.set(t.date, list);
    }
    // To Do에서 배정한 순서(position)대로 — 상위 3개가 그날의 Top 3
    for (const list of map.values()) {
      list.sort((a, b) => a.position - b.position || a.id - b.id);
    }
    return map;
  }, [tasks]);

  const monthTab = tab === 'monthly' || tab === 'memo';

  const move = (dir: -1 | 1) => {
    setCursor((c) =>
      monthTab
        ? new Date(c.getFullYear(), c.getMonth() + dir, 1)
        : addDays(c, dir * 7),
    );
  };

  const label = monthTab
    ? `${cursor.getFullYear()}년 ${cursor.getMonth() + 1}월`
    : weekLabel(range.start);

  const tabButtons: { id: Tab; label: string }[] = [
    { id: 'memo', label: 'To dos' },
    { id: 'monthly', label: 'Monthly' },
    { id: 'weekly', label: 'Weekly' },
    { id: 'detailed', label: 'Streak' },
  ];

  return (
    <div className="daily-wrap wide">
      <header className="daily-header">
        <Logo
          onClick={() => {
            setTab('monthly');
            setCursor(new Date());
          }}
        />
        <div className="tabs">
          {tabButtons.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? 'active' : ''}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="header-right">
          <button className="ghost" onClick={onOpenMy}>마이페이지</button>
          <span className="user-name">{user.name}님</span>
          <button className="ghost" onClick={onLogout}>로그아웃</button>
        </div>
      </header>

      <div className="cal-nav">
        <button className="ghost" onClick={() => move(-1)}>◀</button>
        <span className="cal-label">{label}</span>
        <button className="ghost" onClick={() => move(1)}>▶</button>
        {tab === 'memo' ? (
          <button
            className="ghost new-item-btn"
            onClick={() => {
              const name = window.prompt('새 폴더 이름을 입력해줘');
              if (name && name.trim()) setNewFolderCat(name.trim());
            }}
          >
            + 새로운 항목 만들기
          </button>
        ) : (
          <button className="ghost" onClick={() => setCursor(new Date())}>오늘</button>
        )}
      </div>

      {tab === 'memo' && (
        <MemoBoard
          month={month}
          initialFolder={initialFolder}
          openRequest={newFolderCat}
          onOpenRequestConsumed={() => setNewFolderCat(null)}
          categories={rangeCategories}
          items={memoItems}
          topics={mindTopics}
          hidden={hiddenFolders}
          onAddItem={addMemoItem}
          onUpdateItem={updateMemoItem}
          onDeleteItem={deleteMemoItem}
          onReorderItems={reorderMemoItems}
          onAddTopic={addTopic}
          onUpdateTopic={updateTopic}
          onDeleteTopic={deleteTopic}
          onRenameFolder={renameFolder}
          onDeleteFolder={deleteFolder}
          onCopyToNextMonth={copyToNextMonth}
        />
      )}
      {tab === 'monthly' && (
        <>
          <PeriodPanel
            items={periodItems}
            onAdd={addPeriodItem}
            onRemove={removePeriodItem}
          />
          <MonthlyGrid
            cursor={cursor}
            gridStart={range.start}
            byDate={byDate}
            topicsByWeek={weekTopicsByWeek}
            onOpenDaily={onOpenDaily}
          />
        </>
      )}
      {tab === 'weekly' && (
        <>
          <MindPanel
            title="What's on my mind this week"
            topics={weekTopics}
            onAdd={addWeekTopic}
            onUpdate={updateWeekTopic}
            onDelete={deleteWeekTopic}
          />
          <WeekdayPanel
            items={byWeek.get(fmt(range.start)) ?? []}
            categories={rangeCategories}
            onAdd={(title, days, category) =>
              addWeekItem(fmt(range.start), title, category, days)
            }
            onRemove={removeWeekItem}
          />
          {recurring.length > 0 && (
            <RecurringPanel
              label="매일 반복 (기존)"
              items={recurring}
              onAdd={addRecurring}
              onRemove={removeRecurring}
            />
          )}
          <WeeklyBoard
            weekStart={range.start}
            byDate={byDate}
            onOpenDaily={onOpenDaily}
          />
        </>
      )}
      {tab === 'detailed' && (
        <DetailedBoard
          weekStart={range.start}
          byDate={byDate}
          onOpenDaily={onOpenDaily}
        />
      )}
    </div>
  );
}

function RecurringPanel({
  label,
  items,
  onAdd,
  onRemove,
}: {
  label: string;
  items: { id: number; title: string; category: string | null }[];
  onAdd: (title: string, category?: string) => Promise<void>;
  onRemove: (id: number) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await onAdd(title.trim(), category.trim() || undefined);
    setTitle('');
    setCategory('');
  };

  return (
    <div className="recurring-panel">
      <span className="recurring-label">{label}</span>
      {items.map((item) => (
        <span key={item.id} className="recurring-chip">
          {item.title}
          {item.category && <em>{item.category}</em>}
          <button onClick={() => onRemove(item.id)}>✕</button>
        </span>
      ))}
      <form className="recurring-form" onSubmit={submit}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: SQL, Coding"
        />
        <input
          className="category-input"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="분류"
          maxLength={50}
        />
        <button type="submit">+ 추가</button>
      </form>
    </div>
  );
}

function DetailedBoard({
  weekStart,
  byDate,
  onOpenDaily,
}: {
  weekStart: Date;
  byDate: Map<string, Task[]>;
  onOpenDaily: (date: string) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const t = today();

  return (
    <div className="detail-wrap">
      <div className="detail-head-row">
        <div className="detail-corner" />
        {days.map((d, i) => {
          const key = fmt(d);
          return (
            <div
              key={key}
              className={`detail-head ${key === t ? 'today' : ''}`}
              onClick={() => onOpenDaily(key)}
            >
              {WEEKDAYS[i]}{' '}
              <span className="week-date">
                {d.getMonth() + 1}/{pad(d.getDate())}
              </span>
            </div>
          );
        })}
      </div>
      <div className="detail-body">
        <div className="detail-times">
          {HOURS.map((h) => (
            <div key={h} className="detail-time-label">{hh(h)}</div>
          ))}
        </div>
        {days.map((d) => {
          const key = fmt(d);
          const blocks = (byDate.get(key) ?? []).filter(
            (x) => x.startTime && x.endTime,
          );
          return (
            <div
              key={key}
              className={`detail-col ${key === t ? 'today' : ''}`}
              style={{ height: HOURS.length * DROW }}
              onClick={() => onOpenDaily(key)}
            >
              {blocks.map((task) => {
                const sh = parseInt(task.startTime!, 10);
                const eh = parseInt(task.endTime!, 10);
                return (
                  <div
                    key={task.id}
                    className={`detail-block ${task.completed ? 'done' : ''}`}
                    style={{
                      top: (sh - HOURS[0]) * DROW + 1,
                      height: (eh - sh) * DROW - 3,
                    }}
                    title={`${task.title} (${task.startTime}~${task.endTime}${task.category ? ', ' + task.category : ''})`}
                  >
                    {task.category && (
                      <em className="cell-cat">{task.category}</em>
                    )}
                    {task.title}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FolderIcon() {
  return (
    <svg className="folder-icon" viewBox="0 0 44 34" fill="currentColor" aria-hidden="true">
      <path d="M2 6a3 3 0 0 1 3-3h11l4 5h17a3 3 0 0 1 3 3v18a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V6z" />
    </svg>
  );
}

function MindPanel({
  title,
  topics,
  onAdd,
  onUpdate,
  onDelete,
}: {
  title: string;
  topics: MindTopic[];
  onAdd: (name: string) => Promise<void>;
  onUpdate: (id: number, patch: Partial<MindTopic>) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [memoId, setMemoId] = useState<number | null>(null);
  const [memoDraft, setMemoDraft] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    await onAdd(text.trim());
    setText('');
  };

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (editId === null || !editText.trim()) return;
    await onUpdate(editId, { name: editText.trim() });
    setEditId(null);
  };

  // 주제별 메모 열기/저장
  const openMemo = (t: MindTopic) => {
    setMemoId(t.id);
    setMemoDraft(t.content ?? '');
  };

  const saveMemo = async () => {
    if (memoId === null) return;
    await onUpdate(memoId, { content: memoDraft.trim() || null });
    setMemoId(null);
  };

  return (
    <div className="mind-panel pane">
      <h2>{title}</h2>
      <div className="mind-chips">
        {topics.map((t) =>
          editId === t.id ? (
            <form key={t.id} className="mind-edit" onSubmit={saveEdit}>
              <input
                autoFocus
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                maxLength={100}
              />
              <button type="submit">저장</button>
              <button
                type="button"
                className="ghost"
                onClick={() => setEditId(null)}
              >
                취소
              </button>
            </form>
          ) : (
            <span key={t.id} className={`mind-chip ${t.content ? 'has-memo' : ''}`}>
              <span
                className="mind-chip-name"
                title="클릭해서 메모 작성"
                onClick={() => openMemo(t)}
              >
                {t.name}
                {t.content && <span className="memo-dot" />}
              </span>
              <span className="mind-actions">
                <button title="메모 작성" onClick={() => openMemo(t)}>
                  📓
                </button>
                <button
                  title="이름 편집"
                  onClick={() => {
                    setEditId(t.id);
                    setEditText(t.name);
                  }}
                >
                  ✎
                </button>
                <button title="없애기" onClick={() => onDelete(t.id)}>
                  ✕
                </button>
              </span>
            </span>
          ),
        )}
      </div>
      <form className="mind-add" onSubmit={submit}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="주제 추가"
          maxLength={100}
        />
        <button type="submit">+ 추가</button>
      </form>

      {memoId !== null && (
        <div className="modal-overlay" onClick={() => setMemoId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="memo-cat-title">
                {topics.find((t) => t.id === memoId)?.name ?? '메모'}
              </h2>
              <button className="ghost" onClick={() => setMemoId(null)}>
                ✕
              </button>
            </div>
            <textarea
              autoFocus
              value={memoDraft}
              onChange={(e) => setMemoDraft(e.target.value)}
              placeholder="이 주제에 대한 메모를 입력하세요"
            />
            <div className="modal-actions">
              <div className="pw-actions">
                <button className="submit" onClick={saveMemo}>
                  저장
                </button>
                <button className="ghost" onClick={() => setMemoId(null)}>
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MemoBoard({
  month,
  initialFolder,
  openRequest,
  onOpenRequestConsumed,
  categories,
  items,
  topics,
  hidden,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onReorderItems,
  onAddTopic,
  onUpdateTopic,
  onDeleteTopic,
  onRenameFolder,
  onDeleteFolder,
  onCopyToNextMonth,
}: {
  month: string;
  initialFolder?: string;
  openRequest?: string | null;
  onOpenRequestConsumed?: () => void;
  categories: string[];
  items: MemoItem[];
  topics: MindTopic[];
  hidden: string[];
  onAddItem: (category: string, text: string, parentId?: number) => Promise<void>;
  onUpdateItem: (id: number, patch: Partial<MemoItem>) => Promise<void>;
  onDeleteItem: (id: number) => Promise<void>;
  onReorderItems: (idsInOrder: number[]) => Promise<void>;
  onAddTopic: (name: string) => Promise<void>;
  onUpdateTopic: (id: number, patch: Partial<MindTopic>) => Promise<void>;
  onDeleteTopic: (id: number) => Promise<void>;
  onRenameFolder: (from: string, to: string) => Promise<void>;
  onDeleteFolder: (category: string) => Promise<void>;
  onCopyToNextMonth: (opts?: {
    category?: string;
    excludeCompleted?: boolean;
    itemIds?: number[];
  }) => Promise<{ ok: boolean; copied: number; nextMonth: string }>;
}) {
  // Daily의 "폴더 메모로 이동"을 타고 들어온 경우 그 폴더를 메모 모드로 바로 열어줌
  const [openCat, setOpenCat] = useState<string | null>(initialFolder ?? null);
  const [folderOrder, setFolderOrderState] = useState<string[]>(getFolderOrder());
  // 폴더 안에서 할일(체크리스트) / 메모(자유 텍스트) 전환
  const [folderMode, setFolderMode] = useState<'todo' | 'memo'>(
    initialFolder ? 'memo' : 'todo',
  );
  const [folderMemos, setFolderMemos] = useState<MonthMemo[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [openItemId, setOpenItemId] = useState<number | null>(null);
  const [contentDraft, setContentDraft] = useState('');
  // "메모" 모드 — 항목을 목록으로 보여주고 클릭하면 그 항목의 메모를 인라인으로 펼침
  const [notePreviewId, setNotePreviewId] = useState<number | null>(null);
  const [notePreviewDraft, setNotePreviewDraft] = useState('');
  const [renameCat, setRenameCat] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [subAddFor, setSubAddFor] = useState<number | null>(null);
  const [subText, setSubText] = useState('');

  // 상단 "새로운 항목 만들기" 버튼으로 새 폴더 이름을 받으면 바로 그 폴더 페이지를 염
  useEffect(() => {
    if (!openRequest) return;
    setOpenCat(openRequest);
    setFolderMode('todo');
    setOpenItemId(null);
    setNewTitle('');
    onOpenRequestConsumed?.();
  }, [openRequest, onOpenRequestConsumed]);
  const [editItemId, setEditItemId] = useState<number | null>(null);
  const [editItemText, setEditItemText] = useState('');
  // 접힘 상태는 localStorage에 저장 — 페이지를 나갔다 와도 그대로
  const [excludeCompleted, setExcludeCompleted] = useState(true);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const [copyModalCat, setCopyModalCat] = useState<string | null>(null);

  const runCopyAll = async () => {
    const res = await onCopyToNextMonth({ excludeCompleted });
    setCopyMsg(`${res.nextMonth}로 ${res.copied}개 항목을 가져갔어`);
    setTimeout(() => setCopyMsg(null), 3000);
  };

  // 폴더 목록의 → 아이콘: 완료 여부 상관없이 그 폴더 전체를 바로 복사
  const runCopyFolder = async (category: string) => {
    const res = await onCopyToNextMonth({ category });
    setCopyMsg(`"${category}"를 ${res.nextMonth}로 ${res.copied}개 복사했어`);
    setTimeout(() => setCopyMsg(null), 3000);
  };

  // 파일 상세 화면의 버튼: 어떤 항목을 가져갈지 모달에서 고르게 함
  const runCopySelected = async (itemIds: number[]) => {
    const res = await onCopyToNextMonth({ itemIds });
    setCopyModalCat(null);
    setCopyMsg(`${res.nextMonth}로 ${res.copied}개 복사했어`);
    setTimeout(() => setCopyMsg(null), 3000);
  };

  const [collapsed, setCollapsed] = useState<Set<number>>(
    () => new Set(getCollapsedItems()),
  );

  const toggleCollapse = (id: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setCollapsedItems([...next]);
      return next;
    });

  const startItemEdit = (it: MemoItem) => {
    setEditItemId(it.id);
    setEditItemText(it.text);
  };

  const saveItemEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (editItemId === null || !editItemText.trim()) return;
    await onUpdateItem(editItemId, { text: editItemText.trim() });
    setEditItemId(null);
  };

  const allCats = useMemo(() => {
    const seen = new Set(categories.map((c) => c.toLowerCase()));
    const out = [...categories];
    for (const it of items) {
      if (!seen.has(it.category.toLowerCase())) {
        seen.add(it.category.toLowerCase());
        out.push(it.category);
      }
    }
    // Schedule은 기본 파일로 항상 존재
    if (!seen.has('schedule')) {
      seen.add('schedule');
      out.push('Schedule');
    }
    // Daily 빠른 메모 등으로 항목 없이 메모만 있는 폴더도 파일로 뜨게 함
    for (const m of folderMemos) {
      if (m.content.trim() && !seen.has(m.category.toLowerCase())) {
        seen.add(m.category.toLowerCase());
        out.push(m.category);
      }
    }
    // 저장된 폴더 순서 우선(드래그로 수동 정렬), 새 폴더는 뒤에 가나다순
    const idx = (c: string) => {
      const i = folderOrder.findIndex(
        (o) => o.toLowerCase() === c.toLowerCase(),
      );
      return i === -1 ? 9999 : i;
    };
    // 숨김(soft delete) 처리된 폴더 제외
    const hiddenSet = new Set(hidden.map((h) => h.toLowerCase()));
    return out
      .filter((c) => !hiddenSet.has(c.toLowerCase()))
      .sort((a, b) => idx(a) - idx(b) || a.localeCompare(b));
  }, [categories, items, topics, hidden, folderOrder, folderMemos]);

  // 폴더 드래그로 순서 변경
  const dropFolder = (e: React.DragEvent, target: string) => {
    const raw = e.dataTransfer.getData('text/plain');
    if (!raw.startsWith('folder:')) return;
    e.preventDefault();
    const dragged = raw.slice(7);
    if (dragged === target) return;
    const order = allCats.filter((c) => c !== dragged);
    order.splice(order.indexOf(target), 0, dragged);
    setFolderOrder(order);
    setFolderOrderState(order);
  };

  // 항목 드래그로 순서 변경 (파일 안)
  const dropItem = async (e: React.DragEvent, target: MemoItem) => {
    const raw = e.dataTransfer.getData('text/plain');
    if (!raw.startsWith('mi:')) return;
    e.preventDefault();
    const draggedId = Number(raw.slice(3));
    if (draggedId === target.id) return;
    // 최상위 항목끼리만 순서 변경
    const ids = itemsOf(openCat!)
      .filter((it) => !it.parentId)
      .map((it) => it.id)
      .filter((id) => id !== draggedId);
    ids.splice(ids.indexOf(target.id), 0, draggedId);
    await onReorderItems(ids);
  };

  // 하위 항목 순서 변경 (같은 상위 아래 형제끼리)
  const dropSub = async (
    e: React.DragEvent,
    parentId: number,
    target: MemoItem,
  ) => {
    const raw = e.dataTransfer.getData('text/plain');
    if (!raw.startsWith('msub:')) return;
    e.preventDefault();
    e.stopPropagation();
    const draggedId = Number(raw.slice(5));
    if (draggedId === target.id) return;
    const ids = itemsOf(openCat!)
      .filter((it) => it.parentId === parentId)
      .map((it) => it.id)
      .filter((id) => id !== draggedId);
    ids.splice(ids.indexOf(target.id), 0, draggedId);
    await onReorderItems(ids);
  };

  const itemsOf = (c: string) =>
    items.filter((it) => it.category.toLowerCase() === c.toLowerCase());

  const addItem = async (e: FormEvent) => {
    e.preventDefault();
    if (!openCat || !newTitle.trim()) return;
    await onAddItem(openCat, newTitle.trim());
    setNewTitle('');
  };

  const openContent = (it: MemoItem) => {
    if (openItemId === it.id) {
      setOpenItemId(null);
      return;
    }
    setOpenItemId(it.id);
    setContentDraft(it.content ?? '');
  };

  const saveContent = async () => {
    if (openItemId === null) return;
    await onUpdateItem(openItemId, { content: contentDraft });
    setOpenItemId(null);
  };

  // 이 달 폴더별 자유 메모를 항상 불러옴 — 파일 카드 미리보기 + 새 폴더 파생에도 씀
  const loadFolderMemos = useCallback(() => {
    api.monthMemos(month).then(setFolderMemos).catch(() => setFolderMemos([]));
  }, [month]);

  useEffect(() => {
    loadFolderMemos();
  }, [loadFolderMemos]);

  useEffect(() => {
    setNotePreviewId(null);
  }, [openCat]);


  // ---------- 파일 내부: 항목 리스트 (스케치 구조) — 폴더 클릭하면 새 페이지로 전환 ----------
  if (openCat) {
    const catItems = itemsOf(openCat);
    return (
      <div className="memo-editor pane">
        <div className="memo-editor-head">
          <div className="memo-editor-head-row">
            <button className="ghost" onClick={() => setOpenCat(null)}>
              ← 파일 목록
            </button>
          </div>
          <div className="memo-editor-head-row">
            <h2 className="memo-cat-title">
              <FolderIcon /> {openCat}
            </h2>
            <div className="folder-mode-toggle">
              <button
                className={folderMode === 'todo' ? 'active' : ''}
                onClick={() => setFolderMode('todo')}
              >
                할일
              </button>
              <button
                className={folderMode === 'memo' ? 'active' : ''}
                onClick={() => setFolderMode('memo')}
              >
                메모
              </button>
            </div>
            <button
              className="ghost copy-next-btn"
              title="다음달로 가져갈 항목을 골라서 복사 (원본은 그대로 유지)"
              onClick={() => setCopyModalCat(openCat)}
            >
              다음달로 복사하기
            </button>
          </div>
        </div>
        {copyMsg && <p className="copy-msg">{copyMsg}</p>}
        {copyModalCat === openCat && (
          <CopySelectModal
            category={openCat}
            items={catItems}
            onConfirm={runCopySelected}
            onClose={() => setCopyModalCat(null)}
          />
        )}

        {folderMode === 'todo' && (
        <>
        <div className="mi-list">
          {catItems
            .filter((it) => !it.parentId)
            .map((it, idx) => {
              const subs = catItems.filter((s) => s.parentId === it.id);
              return (
                <div key={it.id} className="mi-block">
                  <div
                    className="mi-row"
                    draggable={editItemId !== it.id}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', `mi:${it.id}`);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => dropItem(e, it)}
                  >
                    {subs.length > 0 ? (
                      <button
                        className="mi-collapse"
                        title={collapsed.has(it.id) ? '펼치기' : '접기'}
                        onClick={() => toggleCollapse(it.id)}
                      >
                        {collapsed.has(it.id) ? '▸' : '▾'}
                      </button>
                    ) : (
                      <span className="mi-collapse spacer" />
                    )}
                    <span className="mi-num">{idx + 1}</span>
                    {editItemId === it.id ? (
                      <form className="mi-edit" onSubmit={saveItemEdit}>
                        <input
                          autoFocus
                          value={editItemText}
                          onChange={(e) => setEditItemText(e.target.value)}
                          maxLength={200}
                        />
                        <button type="submit" className="mi-memo-btn">
                          저장
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => setEditItemId(null)}
                        >
                          취소
                        </button>
                      </form>
                    ) : (
                      <>
                        <span
                          className={`mi-title ${it.completed ? 'mi-done' : ''}`}
                        >
                          {it.text}
                        </span>
                        <button
                          className="mi-memo-btn"
                          title="하위 항목 추가"
                          onClick={() => {
                            setSubAddFor(subAddFor === it.id ? null : it.id);
                            setSubText('');
                          }}
                        >
                          +하위
                        </button>
                        <button
                          className={`mi-memo-btn ${it.content ? 'has' : ''}`}
                          onClick={() => openContent(it)}
                        >
                          {it.content ? '메모' : '메모 작성'}
                        </button>
                        <button
                          className="mi-memo-btn"
                          title="이름 수정"
                          onClick={() => startItemEdit(it)}
                        >
                          ✎
                        </button>
                        <button
                          className={`mi-check ${it.completed ? 'done' : ''}`}
                          title={it.completed ? '완료 취소' : '완료 표시'}
                          onClick={() =>
                            onUpdateItem(it.id, { completed: !it.completed })
                          }
                        >
                          {it.completed ? '✓' : ''}
                        </button>
                        <button
                          className="ghost delete"
                          onClick={() => onDeleteItem(it.id)}
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </div>
                  {!collapsed.has(it.id) &&
                    subs.map((sub, sIdx) => (
                      <div
                        key={sub.id}
                        className="mi-row sub"
                        draggable={editItemId !== sub.id}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', `msub:${sub.id}`);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => dropSub(e, it.id, sub)}
                      >
                        <span className="mi-num sub-num">
                          {idx + 1}.{sIdx + 1}
                        </span>
                        {editItemId === sub.id ? (
                          <form className="mi-edit" onSubmit={saveItemEdit}>
                            <input
                              autoFocus
                              value={editItemText}
                              onChange={(e) => setEditItemText(e.target.value)}
                              maxLength={200}
                            />
                            <button type="submit" className="mi-memo-btn">
                              저장
                            </button>
                            <button
                              type="button"
                              className="ghost"
                              onClick={() => setEditItemId(null)}
                            >
                              취소
                            </button>
                          </form>
                        ) : (
                          <>
                            <span
                              className={`mi-title ${sub.completed ? 'mi-done' : ''}`}
                            >
                              {sub.text}
                            </span>
                            <button
                              className={`mi-memo-btn ${sub.content ? 'has' : ''}`}
                              onClick={() => openContent(sub)}
                            >
                              {sub.content ? '메모' : '메모 작성'}
                            </button>
                            <button
                              className="mi-memo-btn"
                              title="이름 수정"
                              onClick={() => startItemEdit(sub)}
                            >
                              ✎
                            </button>
                            <button
                              className={`mi-check ${sub.completed ? 'done' : ''}`}
                              title={sub.completed ? '완료 취소' : '완료 표시'}
                              onClick={() =>
                                onUpdateItem(sub.id, {
                                  completed: !sub.completed,
                                })
                              }
                            >
                              {sub.completed ? '✓' : ''}
                            </button>
                            <button
                              className="ghost delete"
                              onClick={() => onDeleteItem(sub.id)}
                            >
                              ✕
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  {subAddFor === it.id && (
                    <form
                      className="sub-add-form"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (!openCat || !subText.trim()) return;
                        await onAddItem(openCat, subText.trim(), it.id);
                        setSubText('');
                        setSubAddFor(null);
                      }}
                    >
                      <span className="sub-marker">└</span>
                      <input
                        autoFocus
                        value={subText}
                        onChange={(e) => setSubText(e.target.value)}
                        placeholder="하위 항목 — 예: HTTP 1.1/2.0"
                        maxLength={200}
                      />
                    </form>
                  )}
                </div>
              );
            })}
          {catItems.length === 0 && (
            <p className="placeholder">아직 항목이 없어. 아래에서 추가해봐.</p>
          )}
        </div>

        <form className="mi-add" onSubmit={addItem}>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="새 항목 — 예: Case 문"
            maxLength={200}
          />
          <button type="submit">추가</button>
        </form>
        </>
        )}

        {folderMode === 'memo' && (() => {
          const catMemos = folderMemos.filter(
            (m) => m.category.toLowerCase() === openCat.toLowerCase(),
          );
          return (
            <div className="folder-notes">
              {catMemos.length === 0 && (
                <p className="placeholder">
                  아직 메모가 없어. Daily의 "빠른 메모"에서 이 폴더로 적어봐.
                </p>
              )}
              {catMemos.map((m) => {
                const firstLine = m.content
                  .split('\n')
                  .map((l) => l.trim())
                  .find((l) => l.length > 0);
                const isOpen = notePreviewId === m.id;
                return (
                  <div key={m.id} className={`note-row ${isOpen ? 'open' : ''}`}>
                    <div className="note-row-head">
                      <button
                        type="button"
                        className="note-row-toggle"
                        onClick={() => {
                          if (isOpen) {
                            setNotePreviewId(null);
                            return;
                          }
                          setNotePreviewId(m.id);
                          setNotePreviewDraft(m.content);
                        }}
                      >
                        <span className="note-row-title">
                          {m.date.slice(5).replace('-', '/')}{' '}
                          {(() => {
                            const t = new Date(m.createdAt);
                            return `${pad(t.getHours())}:${pad(t.getMinutes())}`;
                          })()}
                        </span>
                        <span className="note-row-preview">
                          {firstLine || '내용 없음'}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="ghost delete note-delete-btn note-row-delete"
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!window.confirm('이 메모를 삭제할까?')) return;
                          await api.deleteMonthMemo(m.id);
                          loadFolderMemos();
                          if (isOpen) setNotePreviewId(null);
                        }}
                      >
                        삭제
                      </button>
                    </div>
                    {isOpen && (
                      <div className="note-row-body">
                        <textarea
                          autoFocus
                          value={notePreviewDraft}
                          onChange={(e) => setNotePreviewDraft(e.target.value)}
                          placeholder="메모를 입력하세요"
                        />
                        <div className="pw-actions">
                          <button
                            className="submit"
                            onClick={async () => {
                              await api.saveMonthMemo(
                                m.date,
                                openCat!,
                                notePreviewDraft,
                                m.id,
                              );
                              loadFolderMemos();
                              setNotePreviewId(null);
                            }}
                          >
                            저장
                          </button>
                          <button
                            className="ghost"
                            onClick={() => setNotePreviewId(null)}
                          >
                            닫기
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {openItemId !== null && (
          <div className="modal-overlay" onClick={() => setOpenItemId(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <h2 className="memo-cat-title">
                  {catItems.find((it) => it.id === openItemId)?.text ?? '메모'}
                </h2>
                <button className="ghost" onClick={() => setOpenItemId(null)}>
                  ✕
                </button>
              </div>
              <textarea
                autoFocus
                value={contentDraft}
                onChange={(e) => setContentDraft(e.target.value)}
                placeholder="항목에 대한 메모를 입력하세요"
              />
              <div className="modal-actions">
                <button
                  className="ghost attach-btn"
                  title="파일 첨부 (기능은 준비 중)"
                  onClick={() => {}}
                >
                  <svg
                    className="clip-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M21 12.5l-8.5 8.5a6 6 0 0 1-8.5-8.5L12.5 4a4 4 0 0 1 5.7 5.7L9.7 18.2a2 2 0 0 1-2.8-2.8l7.8-7.8" />
                  </svg>
                  파일 첨부
                </button>
                <div className="pw-actions">
                  <button className="submit" onClick={saveContent}>저장</button>
                  <button className="ghost" onClick={() => setOpenItemId(null)}>
                    닫기
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------- 파일 목록 ----------
  return (
    <>
      <MindPanel
        title="What's on my mind"
        topics={topics}
        onAdd={onAddTopic}
        onUpdate={onUpdateTopic}
        onDelete={onDeleteTopic}
      />

      <div className="carry-over-panel pane">
        <span>다음달로 가져가기</span>
        <label className="carry-over-check">
          <input
            type="checkbox"
            checked={excludeCompleted}
            onChange={(e) => setExcludeCompleted(e.target.checked)}
          />
          완료된 항목 제외하기
        </label>
        <button className="ghost" onClick={runCopyAll}>
          전체 폴더 가져가기
        </button>
        {copyMsg && <span className="copy-msg">{copyMsg}</span>}
      </div>

      <div className={`memo-files layout-${getMemoLayout()}`}>
      {allCats.length === 0 && (
        <p className="placeholder">
          이번달에 분류가 아직 없어. Daily에서 분류 달린 할일을 만들면 여기 파일로 떠.
        </p>
      )}
      {allCats.map((c) => {
        const isDefault = c.toLowerCase() === 'schedule';
        // 카드 미리보기: 메모 내용 대신 대항목(상위 항목) 개수만
        const parentCount = itemsOf(c).filter((it) => !it.parentId).length;
        return (
          <button
            key={c}
            className="memo-file"
            draggable={renameCat !== c}
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', `folder:${c}`);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => dropFolder(e, c)}
            onClick={() => {
              if (renameCat === c) return;
              setOpenCat(c);
              setFolderMode('todo');
              setOpenItemId(null);
              setNewTitle('');
            }}
          >
            <FolderIcon />
            {renameCat === c ? (
              <span
                className="folder-rename"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  autoFocus
                  value={renameText}
                  maxLength={50}
                  onChange={(e) => setRenameText(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && renameText.trim()) {
                      await onRenameFolder(c, renameText.trim());
                      setRenameCat(null);
                    }
                    if (e.key === 'Escape') setRenameCat(null);
                  }}
                />
                <span className="folder-rename-hint">Enter 저장 · Esc 취소</span>
              </span>
            ) : (
              <>
                <span className="memo-file-name">{c}</span>
                <span className="memo-file-preview">{parentCount}개 항목</span>
              </>
            )}
            {renameCat !== c && (
              <span className="folder-actions">
                <span
                  role="button"
                  title="다음달로 복사"
                  onClick={(e) => {
                    e.stopPropagation();
                    void runCopyFolder(c);
                  }}
                >
                  →
                </span>
                {!isDefault && (
                  <>
                    <span
                      role="button"
                      title="이름 수정"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenameCat(c);
                        setRenameText(c);
                      }}
                    >
                      ✎
                    </span>
                    <span
                      role="button"
                      title="폴더 삭제"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (
                          window.confirm(
                            `"${c}" 폴더를 정말 삭제하시겠습니까?`,
                          )
                        ) {
                          void onDeleteFolder(c);
                        }
                      }}
                    >
                      ✕
                    </span>
                  </>
                )}
              </span>
            )}
          </button>
        );
      })}
      </div>
    </>
  );
}

function CopySelectModal({
  category,
  items,
  onConfirm,
  onClose,
}: {
  category: string;
  items: MemoItem[];
  onConfirm: (itemIds: number[]) => Promise<void>;
  onClose: () => void;
}) {
  const parents = items.filter((it) => !it.parentId);
  const subsOf = (id: number) => items.filter((it) => it.parentId === id);
  // 기본은 전부 선택된 상태 — 필요 없는 것만 해제하는 게 더 빠름
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(items.map((it) => it.id)),
  );
  const [submitting, setSubmitting] = useState(false);

  const toggleParent = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const subs = subsOf(id);
      if (next.has(id)) {
        next.delete(id);
        subs.forEach((s) => next.delete(s.id));
      } else {
        next.add(id);
        subs.forEach((s) => next.add(s.id));
      }
      return next;
    });
  };

  // 하위를 켜면 상위 없이는 복사될 수 없으니 상위도 같이 켜짐
  const toggleSub = (sub: MemoItem) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sub.id)) {
        next.delete(sub.id);
      } else {
        next.add(sub.id);
        if (sub.parentId) next.add(sub.parentId);
      }
      return next;
    });
  };

  const confirm = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    try {
      await onConfirm([...selected]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="memo-cat-title">
            <FolderIcon /> {category} → 다음달로 복사
          </h2>
          <button className="ghost" onClick={onClose}>✕</button>
        </div>

        <div className="copy-select-actions">
          <button
            className="ghost"
            onClick={() => setSelected(new Set(items.map((it) => it.id)))}
          >
            전체 선택
          </button>
          <button className="ghost" onClick={() => setSelected(new Set())}>
            전체 해제
          </button>
          <span className="copy-select-count">{selected.size}개 선택됨</span>
        </div>

        <div className="copy-select-list">
          {parents.map((p) => (
            <div key={p.id} className="copy-select-block">
              <label className="copy-select-row">
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggleParent(p.id)}
                />
                <span className={p.completed ? 'mi-done' : ''}>{p.text}</span>
              </label>
              {subsOf(p.id).map((s) => (
                <label key={s.id} className="copy-select-row sub">
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => toggleSub(s)}
                  />
                  <span className={s.completed ? 'mi-done' : ''}>{s.text}</span>
                </label>
              ))}
            </div>
          ))}
          {parents.length === 0 && (
            <p className="placeholder">복사할 항목이 없어.</p>
          )}
        </div>

        <div className="pw-actions">
          <button
            className="submit"
            onClick={confirm}
            disabled={submitting || selected.size === 0}
          >
            {submitting ? '복사 중…' : `선택한 ${selected.size}개 다음달로 복사`}
          </button>
          <button className="ghost" onClick={onClose}>취소</button>
        </div>
      </div>
    </div>
  );
}

function WeekdayPanel({
  items,
  categories,
  onAdd,
  onRemove,
}: {
  items: WeekItem[];
  categories: string[];
  onAdd: (title: string, days?: string, category?: string) => Promise<void>;
  onRemove: (id: number) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [selected, setSelected] = useState<Set<number>>(() => new Set());

  const toggleDay = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const daysLabel = (days: string | null) => {
    if (!days) return '매일';
    const offsets = days.split(',').map(Number);
    return offsets.length === 7
      ? '매일'
      : offsets.map((i) => WEEKDAYS[i]).join('·');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || selected.size === 0) return;
    const days =
      selected.size === 7
        ? undefined
        : [...selected].sort((a, b) => a - b).join(',');
    await onAdd(title.trim(), days, category || undefined);
    setTitle('');
    setCategory('');
    setSelected(new Set());
  };

  return (
    <div className="recurring-panel">
      <span className="recurring-label">요일별 할일</span>
      {items.map((item) => (
        <span key={item.id} className="recurring-chip">
          {item.title}
          <em>{daysLabel(item.days)}</em>
          {item.category && <em>{item.category}</em>}
          <button onClick={() => onRemove(item.id)}>✕</button>
        </span>
      ))}
      <form className="recurring-form weekday-form" onSubmit={submit}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="할일"
          maxLength={200}
        />
        <select
          className="theme-select"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">분류 없음</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <span className="day-toggles">
          {WEEKDAYS.map((w, i) => (
            <button
              type="button"
              key={w}
              className={`day-toggle ${selected.has(i) ? 'on' : ''}`}
              onClick={() => toggleDay(i)}
            >
              {w}
            </button>
          ))}
        </span>
        <button type="submit">+ 추가</button>
      </form>
    </div>
  );
}

function PeriodPanel({
  items,
  onAdd,
  onRemove,
}: {
  items: PeriodItem[];
  onAdd: (data: {
    startDate: string;
    endDate: string;
    title: string;
    category?: string;
  }) => Promise<void>;
  onRemove: (id: number) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const md = (s: string) => `${s.slice(5, 7)}-${s.slice(8, 10)}`;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !startDate || !endDate || endDate < startDate) return;
    await onAdd({
      startDate,
      endDate,
      title: title.trim(),
      category: category.trim() || undefined,
    });
    setTitle('');
    setCategory('');
  };

  return (
    <div className="recurring-panel">
      <span className="recurring-label">기간 할일</span>
      {items.map((item) => (
        <span key={item.id} className="recurring-chip">
          {item.title}
          <em>
            {md(item.startDate)}~{md(item.endDate)}
          </em>
          {item.category && <em>{item.category}</em>}
          <button onClick={() => onRemove(item.id)}>✕</button>
        </span>
      ))}
      <form className="recurring-form" onSubmit={submit}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="할일"
          maxLength={200}
        />
        <input
          className="category-input"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="분류"
          maxLength={50}
        />
        <input
          type="date"
          value={startDate}
          onChange={(e) => {
            setStartDate(e.target.value);
            if (!endDate || endDate < e.target.value) setEndDate(e.target.value);
          }}
        />
        <input
          type="date"
          value={endDate}
          min={startDate || undefined}
          onChange={(e) => setEndDate(e.target.value)}
        />
        <button type="submit">+ 추가</button>
      </form>
    </div>
  );
}

function MonthlyGrid({
  cursor,
  gridStart,
  byDate,
  topicsByWeek,
  onOpenDaily,
}: {
  cursor: Date;
  gridStart: Date;
  byDate: Map<string, Task[]>;
  topicsByWeek: Map<string, MindTopic[]>;
  onOpenDaily: (date: string) => void;
}) {
  const month = cursor.getMonth();
  const t = today();

  const renderCell = (d: Date) => {
        const key = fmt(d);
        const all = byDate.get(key) ?? [];
        // 우선순위 높은 것 중에서는 Schedule 먼저, 그 다음 To Do.
        // 우선순위 없는 것들 중에서는 To Do 먼저, 그 다음 Schedule (기존 방식 유지)
        const rank = (x: Task) => {
          if (x.highPriority) return x.isChore ? 0 : 1;
          return x.isChore ? 3 : 2;
        };
        const dayTasks = [...all]
          .sort((a, b) => rank(a) - rank(b))
          .slice(0, 3);
        const moreCount = all.length - dayTasks.length;
        return (
          <div
            key={key}
            className={`month-cell ${d.getMonth() !== month ? 'dim' : ''} ${key === t ? 'today' : ''}`}
            onClick={() => onOpenDaily(key)}
          >
            <span className="cell-day">{d.getDate()}</span>
            <div className="cell-tasks">
              {dayTasks.map((task) => (
                <span
                  key={task.id}
                  className={`cell-task ${
                    task.completed
                      ? 'done-fill'
                      : task.highPriority
                        ? 'priority-fill'
                        : ''
                  }`}
                >
                  {task.category && (
                    <em className="cell-cat">{task.category}</em>
                  )}
                  {task.title}
                </span>
              ))}
              {moreCount > 0 && (
                <span className="cell-more">+{moreCount}</span>
              )}
            </div>
          </div>
        );
  };

  return (
    <div className="month-grid">
      <div className="month-head">주간 주제</div>
      {WEEKDAYS.map((w) => (
        <div key={w} className="month-head">{w}</div>
      ))}
      {Array.from({ length: 6 }, (_, w) => {
        const weekStart = fmt(addDays(gridStart, w * 7));
        const topics = (topicsByWeek.get(weekStart) ?? []).slice(0, 3);
        return [
          <div key={`gutter-${weekStart}`} className="week-gutter">
            <div className="gutter-head">
              <span>{weekLabel(addDays(gridStart, w * 7))}</span>
            </div>
            {topics.length > 0 && (
              <div className="gutter-top3">
                {topics.map((topic) => (
                  <span key={topic.id}>
                    <b>★</b> {topic.name}
                  </span>
                ))}
              </div>
            )}
          </div>,
          ...Array.from({ length: 7 }, (_, i) =>
            renderCell(addDays(gridStart, w * 7 + i)),
          ),
        ];
      })}
    </div>
  );
}

function WeeklyBoard({
  weekStart,
  byDate,
  onOpenDaily,
}: {
  weekStart: Date;
  byDate: Map<string, Task[]>;
  onOpenDaily: (date: string) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const t = today();

  return (
    <div className="week-board">
      {days.map((d, i) => {
        const key = fmt(d);
        // Schedule(집안일) 배정분은 To Do가 아니므로 제외
        const dayTasks = (byDate.get(key) ?? []).filter((x) => !x.isChore);
        // 배정 순서 상위 3개가 그날의 Top 3
        const top3 = dayTasks.slice(0, 3);
        // 요일별 할일로 자동 생성된 건 패널에 이미 있으니 보드에선 숨김
        const rest = dayTasks.slice(3).filter((x) => !x.weekItemId);
        return (
          <div
            key={key}
            className={`week-col ${key === t ? 'today' : ''}`}
            onClick={() => onOpenDaily(key)}
          >
            <div className="week-col-head">
              {WEEKDAYS[i]} <span className="week-date">{d.getMonth() + 1}/{pad(d.getDate())}</span>
            </div>
            <div className="week-top3">
              {top3.length > 0 ? (
                top3.map((task, i2) => (
                  <span
                    key={task.id}
                    className={`week-top3-item ${task.completed ? 'done-text' : ''}`}
                  >
                    <b>{i2 + 1}</b>
                    {task.category && (
                      <em className="cell-cat">{task.category}</em>
                    )}
                    {task.title}
                  </span>
                ))
              ) : (
                <span className="placeholder">Top 3 없음</span>
              )}
            </div>
            <div className="week-rest">
              {rest.slice(0, 5).map((task) => (
                <span
                  key={task.id}
                  className={`cell-task ${task.completed ? 'done-text' : ''}`}
                >
                  {task.category && (
                    <em className="cell-cat">{task.category}</em>
                  )}
                  {task.title}
                </span>
              ))}
              {rest.length > 5 && (
                <span className="cell-more">+{rest.length - 5}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
