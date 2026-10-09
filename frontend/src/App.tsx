import { useState } from 'react';
import { clearSession, getToken, getUser, UserInfo } from './api';
import { today } from './dates';
import { getDefaultPage } from './settings';
import DailyPage from './pages/DailyPage';
import LoginPage from './pages/LoginPage';
import MainPage from './pages/MainPage';
import MyPage from './pages/MyPage';

type View = 'main' | 'daily' | 'my';

export default function App() {
  const [user, setUser] = useState<UserInfo | null>(() =>
    getToken() ? getUser() : null,
  );
  const defaultPage = getDefaultPage();
  const [view, setView] = useState<View>(
    defaultPage === 'daily' ? 'daily' : 'main',
  );
  const [date, setDate] = useState(today());
  // Daily에서 "폴더 메모로 이동"을 눌렀을 때만 채워짐 — 소비하면 바로 비움
  const [pendingFolder, setPendingFolder] = useState<string | null>(null);

  const logout = () => {
    clearSession();
    setUser(null);
    setView('main');
  };

  if (!user) {
    return <LoginPage onLogin={setUser} />;
  }

  if (view === 'daily') {
    return (
      <DailyPage
        user={user}
        date={date}
        onChangeDate={setDate}
        onBack={() => {
          setPendingFolder(null);
          setView('main');
        }}
        onOpenMy={() => setView('my')}
        onOpenFolder={(category) => {
          setPendingFolder(category);
          setView('main');
        }}
        onLogout={logout}
      />
    );
  }

  if (view === 'my') {
    return (
      <MyPage user={user} onBack={() => setView('main')} onLogout={logout} />
    );
  }

  return (
    <MainPage
      user={user}
      initialTab={
        pendingFolder ? 'memo' : defaultPage === 'weekly' ? 'weekly' : 'monthly'
      }
      initialFolder={pendingFolder ?? undefined}
      onFolderConsumed={() => setPendingFolder(null)}
      onLogout={logout}
      onOpenMy={() => setView('my')}
      onOpenDaily={(d) => {
        setDate(d);
        setView('daily');
      }}
    />
  );
}
