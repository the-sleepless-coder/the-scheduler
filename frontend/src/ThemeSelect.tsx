import { useState } from 'react';
import { applyTheme, getTheme, THEMES, ThemeId } from './theme';

export default function ThemeSelect() {
  const [theme, setTheme] = useState<ThemeId>(getTheme());

  return (
    <select
      className="theme-select"
      value={theme}
      onChange={(e) => {
        const id = e.target.value as ThemeId;
        applyTheme(id);
        setTheme(id);
      }}
    >
      {THEMES.map((t) => (
        <option key={t.id} value={t.id}>
          {t.label}
        </option>
      ))}
    </select>
  );
}
