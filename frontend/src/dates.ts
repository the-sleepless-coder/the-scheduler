export const pad = (n: number) => String(n).padStart(2, '0');

export const fmt = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const today = () => fmt(new Date());

export const addDays = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** 그 주의 월요일 */
export const mondayOf = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));

export const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];

/** 주의 월요일 기준 "7월 2주차" 라벨 */
export const weekLabel = (monday: Date) =>
  `${monday.getMonth() + 1}월 ${Math.ceil(monday.getDate() / 7)}주차`;
