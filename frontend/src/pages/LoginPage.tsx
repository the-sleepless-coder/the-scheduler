import { FormEvent, useState } from 'react';
import { api, setSession, UserInfo } from '../api';
import Logo from '../Logo';

interface Props {
  onLogin: (user: UserInfo) => void;
}

export default function LoginPage({ onLogin }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result =
        mode === 'login'
          ? await api.login(email, password)
          : await api.register(email, password, name);
      setSession(result.accessToken, result.user);
      onLogin(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo">
          <Logo />
        </div>
        <p className="tagline">하루를 계획하는 가장 단순한 방법</p>

        <div className="mode-toggle">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            onClick={() => { setMode('login'); setError(''); }}
          >
            로그인
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            onClick={() => { setMode('register'); setError(''); }}
          >
            회원가입
          </button>
        </div>

        {mode === 'register' && (
          <label>
            이름
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="홍길동"
              required
              maxLength={30}
            />
          </label>
        )}

        <label>
          이메일
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
          />
        </label>

        <label>
          비밀번호
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'register' ? '8자 이상' : '••••••••'}
            required
            minLength={mode === 'register' ? 8 : undefined}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </label>

        {error && <p className="error">{error}</p>}

        <button type="submit" className="submit" disabled={loading}>
          {loading ? '처리 중…' : mode === 'login' ? '로그인' : '가입하고 시작하기'}
        </button>
      </form>
    </div>
  );
}
