import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, Task, UserInfo } from '../api';
import { addDays, fmt, mondayOf, weekLabel } from '../dates';
import {
  DEFAULT_PAGES,
  DefaultPage,
  getDayStartHour,
  getDefaultPage,
  getMemoLayout,
  MEMO_LAYOUTS,
  MemoLayout,
  setDayStartHour,
  setDefaultPage,
  setMemoLayout,
} from '../settings';
import Logo from '../Logo';
import ThemeSelect from '../ThemeSelect';

interface Props {
  user: UserInfo;
  onBack: () => void;
  onLogout: () => void;
}

type Mode = 'weekly' | 'monthly';

/** 타임박싱된 할일의 분류별 시간 합계 */
function hoursByCategory(tasks: Task[]) {
  const map = new Map<string, number>();
  for (const t of tasks) {
    if (!t.startTime || !t.endTime) continue;
    const [sh, sm] = t.startTime.split(':').map(Number);
    const [eh, em] = t.endTime.split(':').map(Number);
    const minutes = eh * 60 + em - (sh * 60 + sm);
    if (minutes <= 0) continue;
    const key = t.category ?? '미분류';
    map.set(key, (map.get(key) ?? 0) + minutes);
  }
  return [...map.entries()]
    .map(([category, minutes]) => ({ category, hours: minutes / 60 }))
    .sort((a, b) => b.hours - a.hours);
}

const fmtHours = (h: number) =>
  Number.isInteger(h) ? `${h}시간` : `${h.toFixed(1)}시간`;

export default function MyPage({ user, onBack, onLogout }: Props) {
  const [mode, setMode] = useState<Mode>('weekly');
  const [cursor, setCursor] = useState(() => new Date());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [defaultPage, setDefault] = useState<DefaultPage>(getDefaultPage());
  const [memoLayout, setMemoLayoutState] = useState<MemoLayout>(getMemoLayout());
  const [dayStart, setDayStartState] = useState<number>(getDayStartHour());

  const range = useMemo(() => {
    if (mode === 'weekly') {
      const mon = mondayOf(cursor);
      return {
        from: fmt(mon),
        to: fmt(addDays(mon, 6)),
        label: weekLabel(mon),
      };
    }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    return {
      from: fmt(first),
      to: fmt(last),
      label: `${cursor.getFullYear()}년 ${cursor.getMonth() + 1}월`,
    };
  }, [mode, cursor]);

  useEffect(() => {
    api.tasksRange(range.from, range.to).then(setTasks).catch(() => setTasks([]));
  }, [range]);

  const stats = useMemo(() => hoursByCategory(tasks), [tasks]);
  const total = stats.reduce((sum, s) => sum + s.hours, 0);

  const move = (dir: -1 | 1) => {
    setCursor((c) =>
      mode === 'weekly'
        ? addDays(c, dir * 7)
        : new Date(c.getFullYear(), c.getMonth() + dir, 1),
    );
  };

  return (
    <div className="daily-wrap">
      <header className="daily-header">
        <div className="header-left">
          <button className="ghost" onClick={onBack}>← 캘린더</button>
          <Logo onClick={onBack} />
        </div>
        <div className="header-right">
          <span className="user-name">{user.name}님</span>
          <button className="ghost" onClick={onLogout}>로그아웃</button>
        </div>
      </header>

      <main className="my-main">
        {/* ---------- 시간 통계 ---------- */}
        <section className="pane">
          <h2>분류별 시간</h2>
          <div className="tabs small stat-tabs">
            <button
              className={mode === 'weekly' ? 'active' : ''}
              onClick={() => setMode('weekly')}
            >
              주별
            </button>
            <button
              className={mode === 'monthly' ? 'active' : ''}
              onClick={() => setMode('monthly')}
            >
              월별
            </button>
          </div>
          <div className="cal-nav">
            <button className="ghost" onClick={() => move(-1)}>◀</button>
            <span className="cal-label">{range.label}</span>
            <button className="ghost" onClick={() => move(1)}>▶</button>
            <button className="ghost" onClick={() => setCursor(new Date())}>
              이번{mode === 'weekly' ? '주' : '달'}
            </button>
          </div>

          {stats.length === 0 ? (
            <p className="placeholder">
              이 기간에 타임박싱한 할일이 없어. Daily에서 시간표에 배치하면 여기 집계돼.
            </p>
          ) : (
            <ul className="stat-list">
              {stats.map((s) => (
                <li key={s.category}>
                  <span className="stat-cat">{s.category}</span>
                  <span className="stat-hours">{fmtHours(s.hours)}</span>
                </li>
              ))}
              <li className="stat-total">
                <span className="stat-cat">합계</span>
                <span className="stat-hours">{fmtHours(total)}</span>
              </li>
            </ul>
          )}
        </section>

        {/* ---------- 설정 ---------- */}
        <section className="pane">
          <h2>설정</h2>
          <div className="setting-rows">
            <label className="setting-row">
              테마
              <ThemeSelect />
            </label>
            <label className="setting-row">
              메모 파일 배열 방식
              <select
                className="theme-select"
                value={memoLayout}
                onChange={(e) => {
                  const layout = e.target.value as MemoLayout;
                  setMemoLayout(layout);
                  setMemoLayoutState(layout);
                }}
              >
                {MEMO_LAYOUTS.map((l) => (
                  <option key={l.id} value={l.id}>{l.label}</option>
                ))}
              </select>
            </label>
            <label className="setting-row">
              로그인 후 기본 페이지
              <select
                className="theme-select"
                value={defaultPage}
                onChange={(e) => {
                  const page = e.target.value as DefaultPage;
                  setDefaultPage(page);
                  setDefault(page);
                }}
              >
                {DEFAULT_PAGES.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </label>
            <label className="setting-row">
              하루 시작 시간
              <select
                className="theme-select"
                value={dayStart}
                onChange={(e) => {
                  const h = Number(e.target.value);
                  setDayStartHour(h);
                  setDayStartState(h);
                }}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, '0')}:00
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {/* ---------- 비밀번호 변경 ---------- */}
        <PasswordSection />
      </main>
    </div>
  );
}

function PasswordSection() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const close = () => {
    setOpen(false);
    setCurrent('');
    setNext('');
    setConfirm('');
    setMessage(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (next !== confirm) {
      setMessage({ ok: false, text: '새 비밀번호가 서로 달라.' });
      return;
    }
    try {
      await api.changePassword(current, next);
      setMessage({ ok: true, text: '비밀번호 변경 완료.' });
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setMessage({
        ok: false,
        text: err instanceof Error ? err.message : '변경 실패',
      });
    }
  };

  if (!open) {
    return (
      <section className="pane">
        <h2>비밀번호</h2>
        <button className="ghost" onClick={() => setOpen(true)}>
          비밀번호 변경하기
        </button>
        {message?.ok && <p className="success-msg">{message.text}</p>}
      </section>
    );
  }

  return (
    <section className="pane">
      <h2>비밀번호 변경</h2>
      <form className="pw-form" onSubmit={submit}>
        <input
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          placeholder="현재 비밀번호"
          required
          autoComplete="current-password"
        />
        <input
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          placeholder="새 비밀번호 (8자 이상)"
          required
          minLength={8}
          autoComplete="new-password"
        />
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="새 비밀번호 확인"
          required
          minLength={8}
          autoComplete="new-password"
        />
        <div className="pw-actions">
          <button type="submit" className="submit">변경</button>
          <button type="button" className="ghost" onClick={close}>취소</button>
        </div>
      </form>
      {message && (
        <p className={message.ok ? 'success-msg' : 'error'}>{message.text}</p>
      )}
    </section>
  );
}
