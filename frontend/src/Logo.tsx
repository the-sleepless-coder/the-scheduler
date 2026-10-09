interface Props {
  onClick?: () => void;
}

/** 책 더미 + THE-SCHEDULER 로고 (클릭하면 메인으로) */
export default function Logo({ onClick }: Props) {
  return (
    <div
      className={`brand ${onClick ? 'clickable' : ''}`}
      onClick={onClick}
      title="The Scheduler"
    >
      <svg
        className="brand-books"
        viewBox="0 0 52 34"
        fill="currentColor"
        aria-hidden="true"
      >
        {/* 아래에서 위로 쌓인 책들 */}
        <rect x="2" y="27" width="42" height="5.5" rx="1.2" />
        <rect x="7" y="20.5" width="34" height="5" rx="1.2" transform="rotate(-2 24 23)" />
        <rect x="5" y="14" width="37" height="5" rx="1.2" transform="rotate(1.5 23 16.5)" />
        <rect x="10" y="8" width="28" height="4.6" rx="1.2" transform="rotate(-3 24 10)" />
        <rect x="14" y="2.5" width="20" height="4.2" rx="1.2" transform="rotate(2 24 4.5)" />
        {/* 책등 라인 */}
        <rect x="36" y="28.2" width="2" height="3" fill="var(--bg)" opacity="0.6" />
        <rect x="33" y="15.2" width="2" height="2.6" fill="var(--bg)" opacity="0.6" />
      </svg>
      <div className="brand-text">
        <span className="brand-name">THE-SCHEDULER</span>
        <span className="brand-sub">PLAN THINGS</span>
      </div>
    </div>
  );
}
