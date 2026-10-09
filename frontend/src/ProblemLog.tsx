import { FormEvent, useEffect, useState } from 'react';
import { api, MemoItemLog } from './api';
import { today } from './dates';

interface Props {
  memoItemId: number;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD (Daily는 from===to===보고있는 날짜, Memo 탭은 그 달 전체)
  grouped?: boolean; // 날짜별로 묶어서 보여줄지 (Memo 탭에서 씀)
  logDate?: string; // 새로 추가하는 기록에 찍을 날짜 — 없으면 오늘
  hideAdd?: boolean; // 추가 입력폼 숨기기 (Daily는 줄에서 이미 추가하니 목록만 보여줌)
}

/** 문제풀이 기록 — Daily(그 날짜만)와 Memo 탭(이번달 전체)에서 같이 씀 */
export default function ProblemLogSection({
  memoItemId,
  from,
  to,
  grouped,
  logDate,
  hideAdd,
}: Props) {
  const [logs, setLogs] = useState<MemoItemLog[]>([]);
  const [labels, setLabels] = useState<string[]>([]);
  const [units, setUnits] = useState<string[]>([]);
  const [label, setLabel] = useState('');
  const [count, setCount] = useState('1');
  const [unit, setUnit] = useState('');

  const reload = () => {
    api.memoItemLogs(memoItemId, from, to).then(setLogs).catch(() => setLogs([]));
  };

  const loadSuggestions = () => {
    api.memoItemLogLabels(memoItemId).then(setLabels).catch(() => setLabels([]));
    api
      .memoItemLogUnits(memoItemId)
      .then((list) => {
        setUnits(list);
        // 이전에 쓴 단위가 있으면 기본값으로 채워둠 (매번 다시 안 치게)
        setUnit((cur) => cur || list[0] || '');
      })
      .catch(() => setUnits([]));
  };

  useEffect(() => {
    reload();
    if (!hideAdd) loadSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoItemId, from, to, hideAdd]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const text = label.trim();
    const u = unit.trim();
    if (!text || !u) return;
    const n = Math.max(1, Number(count) || 1);
    // Daily에서 과거 날짜를 보고 있으면 그 날짜로, 아니면 오늘 날짜로 기록
    await api.createMemoItemLog(memoItemId, logDate ?? today(), text, n, u);
    setLabel('');
    setCount('1');
    reload();
    loadSuggestions();
  };

  const remove = async (id: number) => {
    await api.deleteMemoItemLog(id);
    reload();
  };

  // 단위가 섞여있을 수 있어서(문제/분/시간 등) 단위별로 따로 합산
  const totalsByUnit = new Map<string, number>();
  for (const l of logs) {
    totalsByUnit.set(l.unit, (totalsByUnit.get(l.unit) ?? 0) + l.count);
  }
  const totalText = [...totalsByUnit.entries()]
    .map(([u, n]) => `${n}${u}`)
    .join(' · ');

  const byDate = new Map<string, MemoItemLog[]>();
  for (const l of logs) {
    const list = byDate.get(l.date) ?? [];
    list.push(l);
    byDate.set(l.date, list);
  }

  const chip = (l: MemoItemLog) => (
    <span key={l.id} className="plog-chip">
      {l.label}
      <b>
        {l.count}
        {l.unit}
      </b>
      <button onClick={() => remove(l.id)}>✕</button>
    </span>
  );

  const labelListId = `plog-labels-${memoItemId}`;
  const unitListId = `plog-units-${memoItemId}`;

  return (
    <div className="plog">
      <div className="plog-head">
        <span>기록</span>
        {totalText && <span className="plog-total">{totalText}</span>}
      </div>

      {!hideAdd && (
        <form className="plog-add" onSubmit={add}>
          <input
            list={labelListId}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="이름 — 예: BJ2178, 런닝"
            maxLength={100}
          />
          <datalist id={labelListId}>
            {labels.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
          <input
            type="number"
            min={1}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            className="plog-count"
          />
          <input
            list={unitListId}
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="단위 — 문제/분/시간"
            maxLength={20}
            className="plog-unit-input"
          />
          <datalist id={unitListId}>
            {units.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
          <button type="submit">+ 추가</button>
        </form>
      )}

      <div className="plog-list">
        {grouped
          ? [...byDate.keys()]
              .sort()
              .reverse()
              .map((d) => (
                <div key={d} className="plog-day">
                  <span className="plog-date">{d.slice(5)}</span>
                  <div className="plog-day-items">
                    {byDate.get(d)!.map(chip)}
                  </div>
                </div>
              ))
          : logs.map(chip)}
        {logs.length === 0 && <p className="placeholder">아직 기록이 없어</p>}
      </div>
    </div>
  );
}
