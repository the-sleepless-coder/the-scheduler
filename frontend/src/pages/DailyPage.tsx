import {
  DragEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api, MemoItem, MonthMemo, Task, UserInfo } from '../api';
import CategoryPicker from '../CategoryPicker';
import { addDays, fmt, pad } from '../dates';
import { getDayStartHour, getFolderOrder } from '../settings';
import Logo from '../Logo';
import ProblemLogSection from '../ProblemLog';

interface Props {
  user: UserInfo;
  date: string;
  onChangeDate: (date: string) => void;
  onBack: () => void;
  onOpenMy: () => void;
  onOpenFolder: (category: string) => void;
  onLogout: () => void;
}

const ROW_H = 40; // .time-row 높이와 일치해야 함

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

export default function DailyPage({
  user,
  date,
  onChangeDate,
  onBack,
  onOpenMy,
  onOpenFolder,
  onLogout,
}: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [memoId, setMemoId] = useState<number | null>(null);
  const [memoText, setMemoText] = useState('');
  const [memoItems, setMemoItems] = useState<MemoItem[]>([]);
  const [quickMemoCat, setQuickMemoCat] = useState('');
  const [quickMemoText, setQuickMemoText] = useState('');
  const [quickMemoSaved, setQuickMemoSaved] = useState(false);
  const [monthMemos, setMonthMemos] = useState<MonthMemo[]>([]);
  const [hiddenFolders, setHiddenFolders] = useState<string[]>([]);
  useEffect(() => {
    api
      .hiddenFolders(date.slice(0, 7))
      .then(setHiddenFolders)
      .catch(() => setHiddenFolders([]));
  }, [date]);
  // Daily에 tasks로 등록된 분류(categories)뿐 아니라, Projects 탭에서만 있는 항목/메모로만 존재하는
  // 폴더(예: 할일 없이 빠른 메모로만 만든 "사업")도 선택 목록에 뜨게 합침.
  // "해당 월"에 있는 것만, Projects 탭과 완전히 같은 순서로 — 드래그로 정한 순서 + 그 달에서 숨김(삭제) 처리된 폴더는 제외
  const allCategories = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const src of [
      categories,
      memoItems.map((it) => it.category),
      monthMemos.map((m) => m.category),
    ]) {
      for (const c of src) {
        if (!seen.has(c.toLowerCase())) {
          seen.add(c.toLowerCase());
          out.push(c);
        }
      }
    }
    const hiddenSet = new Set(hiddenFolders.map((h) => h.toLowerCase()));
    const order = getFolderOrder();
    const idx = (c: string) => {
      const i = order.findIndex((o) => o.toLowerCase() === c.toLowerCase());
      return i === -1 ? 9999 : i;
    };
    return out
      .filter((c) => !hiddenSet.has(c.toLowerCase()))
      .sort((a, b) => idx(a) - idx(b) || a.localeCompare(b));
  }, [categories, memoItems, monthMemos, hiddenFolders]);
  // 분류 칩 — 하위 항목까지 포함한 이달 전체 개수 많은 순으로 정렬 (자주 쓰는 분류가 앞에 오게)
  // Schedule은 원래 빈도가 높아서 순위에 안 넣고 예외로 항상 맨 끝
  const sortedCategories = useMemo(() => {
    const count = (c: string) =>
      memoItems.filter((it) => it.category.toLowerCase() === c.toLowerCase())
        .length;
    return [...allCategories].sort((a, b) => {
      const aSchedule = a.toLowerCase() === 'schedule';
      const bSchedule = b.toLowerCase() === 'schedule';
      if (aSchedule !== bSchedule) return aSchedule ? 1 : -1;
      return count(b) - count(a) || a.localeCompare(b);
    });
  }, [allCategories, memoItems]);
  // 폴더 밑에 뜨는 기존 메모 중 하나를 골라서 수정 중이면 그 id. 안 고르면 새 메모.
  const [activeMemoId, setActiveMemoId] = useState<number | null>(null);
  // 이 폴더에 이미 있는 메모들 — 최근 작성한 순
  const quickMemoEntries = useMemo(() => {
    const cat = quickMemoCat.trim().toLowerCase();
    if (!cat) return [];
    return monthMemos
      .filter((m) => m.category.toLowerCase() === cat)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }, [monthMemos, quickMemoCat]);
  const [titleOpen, setTitleOpen] = useState(false);
  const titleWrapRef = useRef<HTMLDivElement>(null);
  const [newSubFor, setNewSubFor] = useState<number | null>(null);
  const [newSubText, setNewSubText] = useState('');
  const [quickLogFor, setQuickLogFor] = useState<number | null>(null);
  const [quickLogLabel, setQuickLogLabel] = useState('');
  const [quickLogCount, setQuickLogCount] = useState('1');
  const [quickLogUnit, setQuickLogUnit] = useState('');
  const [quickLogLabels, setQuickLogLabels] = useState<string[]>([]);
  const [quickLogUnits, setQuickLogUnits] = useState<string[]>([]);
  const [editTitle, setEditTitle] = useState('');
  const [editCat, setEditCat] = useState('');
  const [editSubId, setEditSubId] = useState<number | null>(null);
  const [editSubText, setEditSubText] = useState('');
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState<string | null>(null);

  // 하루 시작 시간부터 24시간 (예: 6 → 06,07…23,00…05). 마이페이지에서 설정.
  const dayStart = getDayStartHour();
  const HOURS = Array.from({ length: 24 }, (_, i) => (dayStart + i) % 24);

  const load = useCallback(async (d: string) => {
    try {
      setTasks(await api.tasks(d));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '불러오기 실패');
    }
  }, []);

  useEffect(() => {
    void load(date);
  }, [date, load]);

  const loadCategories = useCallback(async () => {
    try {
      setCategories(await api.categories(date.slice(0, 7)));
    } catch {
      /* 드롭다운은 부가 기능이라 실패해도 무시 */
    }
  }, [date]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  // Memo 탭의 이달 항목들 (체크된 것 → 선택 추가, 메모 있는 것 → 이달의 메모)
  useEffect(() => {
    api
      .memoItems(date.slice(0, 7))
      .then(setMemoItems)
      .catch(() => setMemoItems([]));
  }, [date]);

  // Schedule 밑 빠른 메모용 — 폴더가 이미 가진 메모 목록 (월 전체)
  const loadMonthMemos = useCallback(() => {
    api
      .monthMemos(date.slice(0, 7))
      .then(setMonthMemos)
      .catch(() => setMonthMemos([]));
  }, [date]);

  useEffect(() => {
    loadMonthMemos();
  }, [loadMonthMemos]);

  // 날짜 바뀌면 입력창 초기화
  useEffect(() => {
    setQuickMemoCat('');
    setQuickMemoText('');
    setQuickMemoSaved(false);
    setActiveMemoId(null);
  }, [date]);

  // 폴더명을 직접 입력해도 되고(=새 폴더 생성), 기존 것 골라도 됨 —
  // 폴더를 바꾸면 아래 새 메모 입력칸도 비우고, 고르고 있던 기존 메모 선택도 해제
  useEffect(() => {
    setQuickMemoText('');
    setActiveMemoId(null);
  }, [quickMemoCat]);

  // 밑에 뜬 기존 메모 중 하나를 고르면 그 내용을 불러와서 수정 모드로
  const selectQuickMemoEntry = (m: MonthMemo) => {
    if (activeMemoId === m.id) {
      // 다시 누르면 선택 해제하고 새 메모 쓰기로
      setActiveMemoId(null);
      setQuickMemoText('');
      return;
    }
    setActiveMemoId(m.id);
    setQuickMemoText(m.content);
  };

  const saveQuickMemo = async () => {
    const cat = quickMemoCat.trim();
    if (!cat) return;
    const res = await api.saveMonthMemo(
      date,
      cat,
      quickMemoText,
      activeMemoId ?? undefined,
    );
    if ('id' in res) setActiveMemoId(res.id);
    loadMonthMemos();
    setQuickMemoSaved(true);
    setTimeout(() => setQuickMemoSaved(false), 2000);
  };

  // 스마트 입력 드롭다운: 분류 선택 시 그 분류 항목만, 타이핑하면 필터
  // 상위 항목만 노출 — 하위는 추가 후 subItem select에서 고른다
  const suggestions = memoItems.filter(
    (it) =>
      !it.parentId &&
      (!category.trim() ||
        it.category.toLowerCase() === category.trim().toLowerCase()) &&
      (!title.trim() ||
        it.text.toLowerCase().includes(title.trim().toLowerCase())),
  );

  // 드롭다운 바깥 클릭하면 닫기
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!titleWrapRef.current?.contains(e.target as Node)) {
        setTitleOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);



  const refreshAfterAdd = () => {
    void load(date);
    void loadCategories();
    api
      .memoItems(date.slice(0, 7))
      .then(setMemoItems)
      .catch(() => {});
  };

  // 직접 입력으로 추가
  const addTask = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await api.createTask({
        title: title.trim(),
        date,
        category: category.trim() || undefined,
      });
      setTitle('');
      setTitleOpen(false);
      refreshAfterAdd();
    } catch (err) {
      setError(err instanceof Error ? err.message : '추가 실패');
    }
  };

  // 메모 항목 클릭으로 즉시 추가
  const addFromItem = async (item: MemoItem) => {
    try {
      await api.createTask({ title: item.text, date, category: item.category });
      setTitle('');
      setTitleOpen(false);
      refreshAfterAdd();
    } catch (err) {
      setError(err instanceof Error ? err.message : '추가 실패');
    }
  };


  const patch = async (id: number, body: Partial<Task>) => {
    try {
      await api.updateTask(id, body);
      void load(date);
    } catch (err) {
      setError(err instanceof Error ? err.message : '수정 실패');
    }
  };

  const remove = async (task: Task) => {
    await api.deleteTask(task.id);
    void load(date);
  };

  // 할일 완료 토글 → 연결된 메모 항목 completed 동기화 (체크/해제 양방향)
  const toggleComplete = async (task: Task) => {
    const next = !task.completed;
    await patch(task.id, { completed: next });
    const target = memoTargetOf(task);
    if (target && target.completed !== next) {
      try {
        await api.updateMemoItem(target.id, { completed: next });
        api
          .memoItems(date.slice(0, 7))
          .then(setMemoItems)
          .catch(() => {});
      } catch {
        /* 메모 동기화 실패는 조용히 무시 */
      }
    }
  };

  // 다음날로 미루기: 날짜만 +1 (시간 배치는 해제)
  const pushToNextDay = async (task: Task) => {
    const nd = fmt(addDays(new Date(`${date}T00:00:00`), 1));
    await patch(task.id, {
      date: nd,
      startTime: null,
      endTime: null,
    });
  };

  // 다음날로 복제하기: 원본은 그대로 두고 다음날에 새 할일 생성
  const copyToNextDay = async (task: Task) => {
    const nd = fmt(addDays(new Date(`${date}T00:00:00`), 1));
    try {
      const created = await api.createTask({
        title: task.title,
        date: nd,
        category: task.category ?? undefined,
      });
      // Schedule 항목이었으면 복제본도 Schedule로 유지 (분류만으론 자동 판별 안 되는 경우 대비)
      if (task.isChore) {
        await api.updateTask(created.id, { isChore: true });
      }
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '복제 실패');
    }
  };

  const dateInputRef = useRef<HTMLInputElement>(null);

  // ---------- drag & drop ----------
  const gridRef = useRef<HTMLDivElement>(null);

  const onDragStart = (e: DragEvent, task: Task) => {
    e.dataTransfer.setData('text/plain', `move:${task.id}`);
    e.dataTransfer.effectAllowed = 'move';
  };

  const parseDrag = (e: DragEvent) => {
    const raw = e.dataTransfer.getData('text/plain');
    const [kind, idStr] = raw.includes(':') ? raw.split(':') : ['move', raw];
    return { kind, task: tasks.find((t) => t.id === Number(idStr)) };
  };

  const allowDrop = (e: DragEvent, key: string) => {
    e.preventDefault();
    setDragOver(key);
  };

  // 시간표: 마우스 위치로 몇 시 줄인지 계산 (wrap 그리드라 HOURS 배열에서 조회)
  const hourFromEvent = (e: DragEvent) => {
    const rect = gridRef.current!.getBoundingClientRect();
    const idx = Math.floor((e.clientY - rect.top) / ROW_H);
    return HOURS[Math.min(Math.max(idx, 0), HOURS.length - 1)];
  };

  // 시(clock)의 그리드 내 줄 번호 (0~23) — dayStart 기준 wrap
  const rowIndexOf = (hour: number) => (hour - dayStart + 24) % 24;

  /**
   * 타임박스 블록 복사 — To Do에 똑같은 항목을 또 만들지 않고 블록만 하나 더 찍는다.
   * 복사본은 parentTaskId로 원본에 묶여서 To Do 목록엔 안 보인다.
   */
  const copyBlock = async (task: Task) => {
    const sh = parseInt(task.startTime!, 10);
    const eh = parseInt(task.endTime!, 10);
    let dur = eh - sh;
    if (dur <= 0) dur += 24; // 자정 넘김 블록

    // 이미 블록이 차지한 줄 표시
    const used = new Set<number>();
    for (const t of tasks) {
      if (!t.startTime || !t.endTime) continue;
      const s = rowIndexOf(parseInt(t.startTime, 10));
      let d = parseInt(t.endTime, 10) - parseInt(t.startTime, 10);
      if (d <= 0) d += 24;
      for (let k = s; k < s + d && k < 24; k++) used.add(k);
    }

    // 빈 구간 중 가장 이른 곳에 배치, 없으면 원본 바로 뒤
    let startIdx = -1;
    for (let i = 0; i + dur <= 24; i++) {
      let free = true;
      for (let k = i; k < i + dur; k++) {
        if (used.has(k)) {
          free = false;
          break;
        }
      }
      if (free) {
        startIdx = i;
        break;
      }
    }
    if (startIdx === -1) startIdx = Math.min(rowIndexOf(eh), 24 - dur);

    const startHour = HOURS[startIdx];
    try {
      await api.createTask({
        title: task.title,
        date,
        category: task.category ?? undefined,
        startTime: hh(startHour),
        endTime: hh((startHour + dur) % 24),
        parentTaskId: task.parentTaskId ?? task.id,
      });
      void load(date);
    } catch (err) {
      setError(err instanceof Error ? err.message : '블록 복사 실패');
    }
  };

  // 블록 ✕ — 복사본이면 통째로 삭제, 원본이면 시간만 해제해서 To Do로 되돌림
  const removeBlock = async (task: Task) => {
    if (task.parentTaskId) {
      await api.deleteTask(task.id);
      void load(date);
      return;
    }
    await patch(task.id, { startTime: null, endTime: null });
  };


  const dropToGrid = async (e: DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const { kind, task } = parseDrag(e);
    if (!task) return;
    const hour = hourFromEvent(e);
    if (kind === 'resize' && task.startTime) {
      // 핸들을 끌어내린 줄까지 블록 연장 (최소 1시간) — 줄 번호(index) 기준
      const startIdx = rowIndexOf(parseInt(task.startTime, 10));
      const dropIdx = rowIndexOf(hour);
      const endIdx = Math.min(24, Math.max(startIdx + 1, dropIdx + 1));
      await patch(task.id, { endTime: hh((dayStart + endIdx) % 24) });
    } else {
      // 이동/신규 배치: 기존 길이 유지, 없으면 1시간 (자정 넘김도 처리)
      let dur = 1;
      if (task.startTime && task.endTime) {
        dur = parseInt(task.endTime, 10) - parseInt(task.startTime, 10);
        if (dur <= 0) dur += 24;
      }
      const startIdx = Math.min(rowIndexOf(hour), 24 - dur);
      const startHour = HOURS[startIdx];
      const endHour = (startHour + dur) % 24;
      // 배정 = 완료 처리 (초록 체크 + 메모 반영)
      await patch(task.id, {
        startTime: hh(startHour),
        endTime: hh(endHour),
        completed: true,
      });
      const target = memoTargetOf(task);
      if (target && !target.completed) {
        try {
          await api.updateMemoItem(target.id, { completed: true });
          api
            .memoItems(date.slice(0, 7))
            .then(setMemoItems)
            .catch(() => {});
        } catch {
          /* 메모 동기화 실패는 무시 */
        }
      }
    }
  };

  // 드래그한 할일을 target 앞에 끼워넣고 전체 순서 저장
  const reorder = async (draggedId: number, targetId: number) => {
    const ids = tasks
      .filter((t) => !t.isChore)
      .map((t) => t.id)
      .filter((id) => id !== draggedId);
    ids.splice(ids.indexOf(targetId), 0, draggedId);
    try {
      await Promise.all(
        ids.map((id, i) => {
          const t = tasks.find((x) => x.id === id)!;
          return t.position === i
            ? Promise.resolve(null)
            : api.updateTask(id, { position: i });
        }),
      );
      void load(date);
    } catch (err) {
      setError(err instanceof Error ? err.message : '순서 변경 실패');
    }
  };

  // 우선순위 높음 토글 — 목록 맨 위로 보이고, 다시 누르면 원래 자리로
  const togglePriority = async (task: Task) => {
    try {
      await api.updateTask(task.id, { highPriority: !task.highPriority });
      void load(date);
    } catch (err) {
      setError(err instanceof Error ? err.message : '우선순위 변경 실패');
    }
  };

  // 할일 위에 드롭: 분류 칩이면 분류 부착, 다른 할일이면 순서 변경
  const dropOnTask = async (e: DragEvent, target: Task) => {
    const raw = e.dataTransfer.getData('text/plain');
    if (raw.startsWith('cat:')) {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(null);
      await patch(target.id, { category: raw.slice(4) });
      return;
    }
    const [kind, idStr] = raw.split(':');
    const id = Number(idStr);
    if (kind === 'move' && id && id !== target.id) {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(null);
      await reorder(id, target.id);
    }
  };

  // 할일과 같은 (분류, 제목)의 Memo 탭 항목 — 있으면 메모를 공유
  // 분류 없는 할일은 '미분류' 파일과 연결
  const linkedItem = (task: Task) => {
    const cat = (task.category ?? '미분류').toLowerCase();
    return memoItems.find(
      (it) =>
        it.category.toLowerCase() === cat &&
        it.text.toLowerCase() === task.title.toLowerCase(),
    );
  };

  // 하위 항목을 선택했으면 메모의 대상은 그 하위
  const memoTargetOf = (task: Task) =>
    task.subItemId
      ? memoItems.find((it) => it.id === task.subItemId)
      : linkedItem(task);

  const taskMemoContent = (task: Task) =>
    task.subItemId
      ? memoTargetOf(task)?.content
      : linkedItem(task)?.content ?? task.memo;

  // 문제풀이(혹은 운동 등) 빠른 기록: 모달 없이 To Do 줄에서 바로 입력
  const toggleQuickLog = async (task: Task) => {
    if (quickLogFor === task.id) {
      setQuickLogFor(null);
      return;
    }
    const target = memoTargetOf(task);
    if (!target) return;
    setQuickLogFor(task.id);
    setQuickLogLabel('');
    setQuickLogCount('1');
    setQuickLogUnit('');
    try {
      const [ls, us] = await Promise.all([
        api.memoItemLogLabels(target.id),
        api.memoItemLogUnits(target.id),
      ]);
      setQuickLogLabels(ls);
      setQuickLogUnits(us);
      setQuickLogUnit(us[0] ?? '');
    } catch {
      setQuickLogLabels([]);
      setQuickLogUnits([]);
    }
  };

  const submitQuickLog = async (task: Task, e: FormEvent) => {
    e.preventDefault();
    const target = memoTargetOf(task);
    const text = quickLogLabel.trim();
    const u = quickLogUnit.trim();
    if (!target || !text || !u) return;
    const n = Math.max(1, Number(quickLogCount) || 1);
    try {
      await api.createMemoItemLog(target.id, date, text, n, u);
      setQuickLogFor(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '기록 실패');
    }
  };

  // 메모: 제목 클릭으로 모달 열기
  const toggleMemo = (task: Task) => {
    if (memoId === task.id) {
      setMemoId(null);
      return;
    }
    setMemoId(task.id);
    setMemoText(taskMemoContent(task) ?? '');
  };

  const saveMemo = async () => {
    if (memoId === null) return;
    const task = tasks.find((t) => t.id === memoId);
    if (!task) return;
    const content = memoText.trim() || null;
    try {
      // 하위 항목이 선택돼 있으면 그 하위의 메모를 갱신
      if (task.subItemId) {
        const sub = memoItems.find((it) => it.id === task.subItemId);
        if (sub) {
          await api.updateMemoItem(sub.id, { content });
          api
            .memoItems(date.slice(0, 7))
            .then(setMemoItems)
            .catch(() => {});
          setMemoId(null);
          return;
        }
      }
      const item = linkedItem(task);
      if (item) {
        // 연동된 항목이 있으면 그쪽 메모를 갱신 (Memo 탭에서도 보임)
        await api.updateMemoItem(item.id, { content });
      } else if (content) {
        // 없으면 Memo 탭에 항목을 만들어서 메모 저장
        const created = await api.createMemoItem(
          date.slice(0, 7),
          task.category ?? '미분류',
          task.title,
        );
        await api.updateMemoItem(created.id, { content });
      }
      // 할일 자체의 메모도 함께 갱신 (연동 끊겨도 안 잃게)
      await patch(task.id, { memo: content });
      api
        .memoItems(date.slice(0, 7))
        .then(setMemoItems)
        .catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : '메모 저장 실패');
    }
    setMemoId(null);
  };

  // 수정 모드 — 하위 항목이 선택돼 있으면 그 하위 이름도 함께 수정 (폴더명은 안 건드림)
  const startEdit = (task: Task) => {
    setEditingId(task.id);
    setEditTitle(task.title);
    setEditCat(task.category ?? '');
    const sub = task.subItemId
      ? memoItems.find((it) => it.id === task.subItemId)
      : undefined;
    setEditSubId(sub ? sub.id : null);
    setEditSubText(sub ? sub.text : '');
  };

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingId || !editTitle.trim()) return;
    // 선택된 하위 항목 이름 수정 → 메모 탭에도 반영
    if (editSubId !== null && editSubText.trim()) {
      try {
        await api.updateMemoItem(editSubId, { text: editSubText.trim() });
        api
          .memoItems(date.slice(0, 7))
          .then(setMemoItems)
          .catch(() => {});
      } catch (err) {
        setError(err instanceof Error ? err.message : '하위 항목 수정 실패');
      }
    }
    await patch(editingId, {
      title: editTitle.trim(),
      category: editCat.trim() || null,
    });
    setEditingId(null);
    setEditSubId(null);
  };

  // To Do로 되돌리면 시간/Schedule 배치 해제 + 완료도 해제
  const dropToInbox = async (e: DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const { task } = parseDrag(e);
    if (!task) return;
    await patch(task.id, {
      startTime: null,
      endTime: null,
      isChore: false,
      completed: false,
    });
  };

  // Schedule로 드롭하면 체크리스트 배정 + 완료 처리
  const dropToChores = async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(null);
    const { task } = parseDrag(e);
    if (!task) return;
    await patch(task.id, { isChore: true, completed: true });
  };

  const timeboxed = tasks.filter((t) => t.startTime && t.endTime);
  const chores = tasks.filter((t) => t.isChore && !t.parentTaskId);
  // Schedule에 들어간 건 To Do 목록에서 제외.
  // 타임박스 복사본(parentTaskId)도 To Do엔 안 띄운다 — 원본 한 줄로만 관리
  // 우선순위 높음이 위로, 그 안에서는 원래 순서 유지 (sort는 stable)
  const todos = tasks
    .filter((t) => !t.isChore && !t.parentTaskId)
    .sort((a, b) => Number(b.highPriority) - Number(a.highPriority));

  // 이 할일에 배정된 Time Boxing 블록 수 (복사본까지 합산)
  const blockCount = (task: Task) =>
    (task.startTime ? 1 : 0) +
    tasks.filter((t) => t.parentTaskId === task.id && t.startTime).length;

  // 블록이 하나라도 있으면 배정 표시, 하나도 없으면 해제
  const isAssigned = (task: Task) => task.isChore || blockCount(task) > 0;

  return (
    <div className="daily-wrap wide">
      <header className="daily-header">
        <div className="header-left">
          <button className="ghost" onClick={onBack}>← 캘린더</button>
          <Logo onClick={onBack} />
        </div>
        <div className="header-center">
          <button
            className="ghost"
            onClick={() =>
              onChangeDate(fmt(addDays(new Date(`${date}T00:00:00`), -1)))
            }
          >
            ◀
          </button>
          <span className="date-pick">
            <button
              className="ghost date-btn"
              onClick={() => dateInputRef.current?.showPicker()}
            >
              {date.slice(5, 7)}-{date.slice(8, 10)}(
              {['일', '월', '화', '수', '목', '금', '토'][
                new Date(`${date}T00:00:00`).getDay()
              ]}
              )
            </button>
            <input
              ref={dateInputRef}
              type="date"
              className="date-hidden"
              value={date}
              onChange={(e) => onChangeDate(e.target.value)}
              tabIndex={-1}
            />
          </span>
          <button
            className="ghost"
            onClick={() =>
              onChangeDate(fmt(addDays(new Date(`${date}T00:00:00`), 1)))
            }
          >
            ▶
          </button>
        </div>
        <div className="header-right">
          <button className="ghost" onClick={onOpenMy}>마이페이지</button>
          <span className="user-name">{user.name}님</span>
          <button className="ghost" onClick={onLogout}>로그아웃</button>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      <main className="daily-grid">
        {/* ---------- 왼쪽: To Do + Schedule ---------- */}
        <div className="left-col">
        <section
          className={`pane ${dragOver === 'inbox' ? 'over' : ''}`}
          onDragOver={(e) => allowDrop(e, 'inbox')}
          onDragLeave={() => setDragOver(null)}
          onDrop={dropToInbox}
        >
          <h2>Today's To Do</h2>
          <form className="add-row" onSubmit={addTask}>
            <div className="cat-picker title-combo" ref={titleWrapRef}>
              <input
                className="title-input"
                value={title}
                onFocus={() => setTitleOpen(true)}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setTitleOpen(true);
                }}
                placeholder="할일 추가"
              />
              {titleOpen && (
                <div className="cat-dropdown task-dropdown">
                  {suggestions.map((it) => {
                    const parent = it.parentId
                      ? memoItems.find((p) => p.id === it.parentId)
                      : undefined;
                    return (
                      <button
                        type="button"
                        key={it.id}
                        onClick={() => addFromItem(it)}
                      >
                        <em className="cell-cat">{it.category}</em>
                        {parent && (
                          <span className="sub-parent">{parent.text} ›</span>
                        )}
                        {it.text}
                      </button>
                    );
                  })}
                  {suggestions.length === 0 && (
                    <span className="dd-empty">
                      {category.trim()
                        ? `${category.trim()} 분류의 메모 항목이 없어`
                        : '이번달 메모 항목이 없어'}
                    </span>
                  )}
                  <button
                    type="button"
                    className="dd-direct"
                    onClick={(e) => {
                      if (title.trim()) void addTask(e as unknown as FormEvent);
                    }}
                  >
                    {title.trim()
                      ? `직접 입력: "${title.trim()}" 추가`
                      : '직접 입력 — 타이핑하고 Enter'}
                  </button>
                </div>
              )}
            </div>
            <CategoryPicker
              className="category-input"
              value={category}
              onChange={setCategory}
              options={allCategories}
            />
            <button type="submit">+</button>
          </form>
          {categories.length > 0 && (
            <div className="cat-row">
              {sortedCategories.map((c) => (
                <span
                  key={c}
                  className="chip draggable-chip"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', `cat:${c}`);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => setCategory(c)}
                  title="할일 위로 드래그하면 분류가 붙어요"
                >
                  {c}
                </span>
              ))}
            </div>
          )}
          <ul className="task-list">
            {todos.map((task, idx) => (
              <li
                key={task.id}
                className={task.completed ? 'done' : ''}
                draggable={editingId !== task.id}
                onDragStart={(e) => onDragStart(e, task)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => dropOnTask(e, task)}
              >
                {editingId === task.id ? (
                  <form className="edit-form" onSubmit={saveEdit}>
                    <input
                      autoFocus
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      title="상위 항목"
                    />
                    {editSubId !== null ? (
                      <>
                        <span className="sub-marker">›</span>
                        <input
                          value={editSubText}
                          onChange={(e) => setEditSubText(e.target.value)}
                          placeholder="하위 항목 수정"
                          title="하위 항목 이름"
                        />
                      </>
                    ) : (
                      <CategoryPicker
                        className="category-input"
                        value={editCat}
                        onChange={setEditCat}
                        options={allCategories}
                      />
                    )}
                    <button type="submit">저장</button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setEditingId(null)}
                    >
                      취소
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="task-row">
                      {idx < 3 && (
                        <span className="slot-num small">{idx + 1}</span>
                      )}
                      <button
                        className={`assign-mark as-toggle ${
                          task.completed || isAssigned(task) ? 'on' : ''
                        } ${task.completed ? 'done' : ''}`}
                        title={
                          task.completed
                            ? '완료 취소'
                            : isAssigned(task)
                              ? 'Time Boxing에 배정됨 — 누르면 완료'
                              : '완료'
                        }
                        onClick={() => toggleComplete(task)}
                      >
                        ✓
                      </button>
                      {task.category && (
                        <span className="chip">{task.category}</span>
                      )}
                      <span
                        className="task-title clickable"
                        title={
                          task.category
                            ? '클릭해서 이 폴더 메모로 이동'
                            : '클릭해서 메모 작성'
                        }
                        onClick={() =>
                          task.category
                            ? onOpenFolder(task.category)
                            : toggleMemo(task)
                        }
                      >
                        {task.title}
                        {taskMemoContent(task) && <span className="memo-dot" />}
                      </span>
                      {(() => {
                        const linked = linkedItem(task);
                        const subs = linked
                          ? memoItems.filter((it) => it.parentId === linked.id)
                          : [];
                        if (newSubFor === task.id && linked) {
                          return (
                            <form
                              className="row-sub-form"
                              onSubmit={async (e) => {
                                e.preventDefault();
                                if (!newSubText.trim()) return;
                                const created = await api.createMemoItem(
                                  date.slice(0, 7),
                                  linked.category,
                                  newSubText.trim(),
                                  linked.id,
                                );
                                setNewSubFor(null);
                                setNewSubText('');
                                api
                                  .memoItems(date.slice(0, 7))
                                  .then(setMemoItems)
                                  .catch(() => {});
                                await patch(task.id, { subItemId: created.id });
                              }}
                            >
                              <input
                                autoFocus
                                value={newSubText}
                                onChange={(e) => setNewSubText(e.target.value)}
                                placeholder="새 하위 항목"
                                maxLength={200}
                                onBlur={() => setNewSubFor(null)}
                              />
                            </form>
                          );
                        }
                        if (!linked || subs.length === 0) return null;
                        return (
                          <select
                            className="theme-select sub-select"
                            value={task.subItemId ?? ''}
                            onClick={(e) => e.stopPropagation()}
                            onChange={async (e) => {
                              const v = e.target.value;
                              if (v === '__new__') {
                                setNewSubFor(task.id);
                                setNewSubText('');
                                return;
                              }
                              await patch(task.id, {
                                subItemId: v ? Number(v) : null,
                              });
                            }}
                          >
                            <option value="">상위 분류</option>
                            {subs.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.text}
                              </option>
                            ))}
                            <option value="__new__">+ 직접 입력…</option>
                          </select>
                        );
                      })()}
                      <button
                        className={`ghost edit priority-btn ${task.highPriority ? 'pressed' : ''}`}
                        title={task.highPriority ? '우선순위 해제' : '우선순위 높음 — 맨 위로'}
                        onClick={() => togglePriority(task)}
                      >
                        ★
                      </button>
                      <button
                        className="ghost edit memo-btn"
                        title="메모 작성"
                        onClick={() => toggleMemo(task)}
                      >
                        <svg
                          className="note-icon"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M4 4h16v12l-4 4H4z" />
                          <path d="M16 20v-4h4" />
                          <path d="M8 9h8M8 13h5" />
                        </svg>
                      </button>
                      {memoTargetOf(task) && (
                        <button
                          className="ghost edit"
                          title="문제풀이 빠른 기록"
                          onClick={() => toggleQuickLog(task)}
                        >
                          +
                        </button>
                      )}
                      <button
                        className="ghost edit"
                        title="다음날로 미루기"
                        onClick={() => pushToNextDay(task)}
                      >
                        →
                      </button>
                      <button
                        className="ghost edit"
                        title="다음날로 복제"
                        onClick={() => copyToNextDay(task)}
                      >
                        ⧉
                      </button>
                      <button className="ghost delete" onClick={() => remove(task)}>
                        ✕
                      </button>
                    </div>
                    {quickLogFor === task.id && (
                      <form
                        className="quick-log-form"
                        onSubmit={(e) => submitQuickLog(task, e)}
                      >
                        <input
                          autoFocus
                          list={`qlog-labels-${task.id}`}
                          value={quickLogLabel}
                          onChange={(e) => setQuickLogLabel(e.target.value)}
                          placeholder="이름 — 예: BJ2178, 런닝"
                          maxLength={100}
                        />
                        <datalist id={`qlog-labels-${task.id}`}>
                          {quickLogLabels.map((l) => (
                            <option key={l} value={l} />
                          ))}
                        </datalist>
                        <input
                          type="number"
                          min={1}
                          value={quickLogCount}
                          onChange={(e) => setQuickLogCount(e.target.value)}
                          className="plog-count"
                        />
                        <input
                          list={`qlog-units-${task.id}`}
                          value={quickLogUnit}
                          onChange={(e) => setQuickLogUnit(e.target.value)}
                          placeholder="단위"
                          maxLength={20}
                          size={3}
                          className="plog-unit-input"
                        />
                        <datalist id={`qlog-units-${task.id}`}>
                          {quickLogUnits.map((u) => (
                            <option key={u} value={u} />
                          ))}
                        </datalist>
                        <button type="submit">+ 기록</button>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => setQuickLogFor(null)}
                        >
                          취소
                        </button>
                      </form>
                    )}
                  </>
                )}
              </li>
            ))}
            {todos.length === 0 && (
              <li className="empty">할일을 추가하고 드래그로 배치해봐</li>
            )}
          </ul>
        </section>

        {/* ---------- Schedule 체크리스트 (To Do 아래) ---------- */}
        <section
          className={`pane ${dragOver === 'chores' ? 'over' : ''}`}
          onDragOver={(e) => allowDrop(e, 'chores')}
          onDragLeave={() => setDragOver(null)}
          onDrop={dropToChores}
        >
          <h2>Schedule</h2>
          <ul className="chore-list">
            {chores.map((task) => (
              <li
                key={task.id}
                className={task.completed ? 'done' : ''}
                draggable={editingId !== task.id}
                onDragStart={(e) => onDragStart(e, task)}
              >
                {editingId === task.id ? (
                  <form className="edit-form" onSubmit={saveEdit}>
                    <input
                      autoFocus
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      title="상위 항목"
                    />
                    {editSubId !== null ? (
                      <>
                        <span className="sub-marker">›</span>
                        <input
                          value={editSubText}
                          onChange={(e) => setEditSubText(e.target.value)}
                          placeholder="하위 항목 수정"
                          title="하위 항목 이름"
                        />
                      </>
                    ) : (
                      <CategoryPicker
                        className="category-input"
                        value={editCat}
                        onChange={setEditCat}
                        options={allCategories}
                      />
                    )}
                    <button type="submit">저장</button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setEditingId(null)}
                    >
                      취소
                    </button>
                  </form>
                ) : (
                  <div className="task-row">
                    <input
                      type="checkbox"
                      checked={task.completed}
                      onChange={() => toggleComplete(task)}
                    />
                    <span
                      className={`task-title clickable ${task.completed ? 'done-text' : ''}`}
                      title="클릭해서 메모 작성"
                      onClick={() => toggleMemo(task)}
                    >
                      {task.title}
                      {taskMemoContent(task) && <span className="memo-dot" />}
                    </span>
                    <button
                      className={`ghost edit priority-btn ${task.highPriority ? 'pressed' : ''}`}
                      title={task.highPriority ? '우선순위 해제' : '우선순위 높음'}
                      onClick={() => togglePriority(task)}
                    >
                      ★
                    </button>
                    <button
                      className="ghost edit memo-btn"
                      title="메모 작성"
                      onClick={() => toggleMemo(task)}
                    >
                      <svg
                        className="note-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M4 4h16v12l-4 4H4z" />
                        <path d="M16 20v-4h4" />
                        <path d="M8 9h8M8 13h5" />
                      </svg>
                    </button>
                    <button
                      className="ghost edit"
                      onClick={() => startEdit(task)}
                    >
                      ✎
                    </button>
                    <button
                      className="ghost edit"
                      title="다음날로 미루기"
                      onClick={() => pushToNextDay(task)}
                    >
                      →
                    </button>
                    <button
                      className="ghost edit"
                      title="다음날로 복제"
                      onClick={() => copyToNextDay(task)}
                    >
                      ⧉
                    </button>
                    <button className="ghost delete" onClick={() => remove(task)}>
                      ✕
                    </button>
                  </div>
                )}
              </li>
            ))}
            {chores.length === 0 && (
              <li className="empty">
                To Do에서 드래그하거나, 분류를 Schedule로 추가하면 자동으로 들어와
              </li>
            )}
          </ul>
        </section>

        {/* ---------- Schedule 밑 빠른 메모: 폴더 골라서 바로 적기 ---------- */}
        <section className="pane">
          <h2>빠른 메모</h2>
          <CategoryPicker
            className="quick-memo-select"
            value={quickMemoCat}
            onChange={setQuickMemoCat}
            options={allCategories}
            placeholder="폴더 선택 또는 새로 입력…"
          />
          {quickMemoCat.trim() && (
            <div className="quick-memo-box">
              <button
                type="button"
                className="quick-memo-folder-link"
                title="메모 탭에서 이 폴더 열기"
                onClick={() => onOpenFolder(quickMemoCat.trim())}
              >
                📁 {quickMemoCat.trim()} · 메모 탭에서 보기 →
              </button>
              {quickMemoEntries.length > 0 && (
                <div className="quick-memo-entries">
                  {quickMemoEntries.map((m) => {
                    const firstLine = m.content
                      .split('\n')
                      .map((l) => l.trim())
                      .find((l) => l.length > 0);
                    const t = new Date(m.createdAt);
                    return (
                      <button
                        type="button"
                        key={m.id}
                        className={`quick-memo-entry ${activeMemoId === m.id ? 'active' : ''}`}
                        onClick={() => selectQuickMemoEntry(m)}
                      >
                        <span className="quick-memo-entry-time">
                          {pad(t.getHours())}:{pad(t.getMinutes())}
                        </span>
                        <span className="quick-memo-entry-preview">
                          {firstLine || '(내용 없음)'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              <textarea
                value={quickMemoText}
                onChange={(e) => setQuickMemoText(e.target.value)}
                placeholder={
                  activeMemoId
                    ? '이 메모를 수정하는 중…'
                    : `${quickMemoCat.trim()}에 생각난 걸 바로 적어봐 — 새 메모로 저장돼`
                }
              />
              <div className="quick-memo-actions">
                <button className="submit" onClick={saveQuickMemo}>
                  {activeMemoId ? '수정 저장' : '새 메모 저장'}
                </button>
                {activeMemoId && (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setActiveMemoId(null);
                      setQuickMemoText('');
                    }}
                  >
                    새 메모로
                  </button>
                )}
                {quickMemoSaved && <span className="saved-badge">✓ 저장됨</span>}
              </div>
            </div>
          )}
        </section>
        </div>

        {/* ---------- 오른쪽: 타임박싱 ---------- */}
        <section className="pane">
          <h2>Time Boxing</h2>
          <div
            className="time-grid"
            ref={gridRef}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(`hour-${hourFromEvent(e)}`);
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={dropToGrid}
          >
            {HOURS.map((hour) => (
              <div
                key={hour}
                className={`time-row ${dragOver === `hour-${hour}` ? 'over' : ''}`}
              >
                <span className="time-label">{hh(hour)}</span>
              </div>
            ))}
            {timeboxed.map((task) => {
              const sh = parseInt(task.startTime!, 10);
              const eh = parseInt(task.endTime!, 10);
              const startIdx = rowIndexOf(sh);
              let durH = eh - sh;
              if (durH <= 0) durH += 24; // 자정 넘김 블록
              return (
                <div
                  key={task.id}
                  className="time-block"
                  style={{
                    top: startIdx * ROW_H + 1,
                    height: durH * ROW_H - 3,
                  }}
                  draggable
                  onDragStart={(e) => onDragStart(e, task)}
                >
                  <div className="block-head">
                    {task.category && (
                      <span className="chip small">{task.category}</span>
                    )}
                    <span
                      className={`block-title ${task.completed ? 'done-text' : ''}`}
                    >
                      {task.title}
                    </span>
                    <button
                      className="block-x"
                      title="블록 복사 (To Do는 그대로)"
                      onClick={() => copyBlock(task)}
                    >
                      ⧉
                    </button>
                    <button
                      className="block-x"
                      title={task.parentTaskId ? '이 블록 삭제' : '시간 배정 해제'}
                      onClick={() => removeBlock(task)}
                    >
                      ✕
                    </button>
                  </div>
                  <span className="block-time">
                    {task.startTime}~{task.endTime}
                  </span>
                  <div
                    className="resize-handle"
                    draggable
                    onDragStart={(e) => {
                      e.stopPropagation();
                      e.dataTransfer.setData('text/plain', `resize:${task.id}`);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                  />
                </div>
              );
            })}
          </div>
        </section>
      </main>

      {/* 메모 모달 (Memo 탭과 동일 UI, 연동 항목이면 같은 메모 공유) */}
      {memoId !== null &&
        (() => {
          const task = tasks.find((t) => t.id === memoId);
          if (!task) return null;
          return (
            <div className="modal-overlay" onClick={() => setMemoId(null)}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-head">
                  <h2 className="memo-cat-title">
                    {task.category && (
                      <span className="chip">{task.category}</span>
                    )}
                    {task.title}
                    {(() => {
                      const sub = task.subItemId
                        ? memoItems.find((it) => it.id === task.subItemId)
                        : undefined;
                      return sub ? (
                        <span className="modal-sub">› {sub.text}</span>
                      ) : null;
                    })()}
                  </h2>
                  <button className="ghost" onClick={() => setMemoId(null)}>
                    ✕
                  </button>
                </div>
                <textarea
                  autoFocus
                  value={memoText}
                  onChange={(e) => setMemoText(e.target.value)}
                  placeholder="항목에 대한 메모를 입력하세요"
                />
                {(() => {
                  const target = memoTargetOf(task);
                  if (!target) return null;
                  return (
                    <ProblemLogSection
                      memoItemId={target.id}
                      from={date}
                      to={date}
                      logDate={date}
                      hideAdd
                    />
                  );
                })()}
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
                    <button className="submit" onClick={saveMemo}>저장</button>
                    <button className="ghost" onClick={() => setMemoId(null)}>
                      닫기
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
