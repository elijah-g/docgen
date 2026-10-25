// Shows when a page's walkthrough was last replayed against the real app, and
// whether it passed. Pages with `passed: false` never reach a production
// build (filtered in app/(site)/[[...slug]]/page.tsx) — this badge only ever
// shows a passing or not-yet-captured state there, but also renders the
// failing state so it's visible in dev/Studio.
export interface LastCheckedBadgeProps {
  lastChecked?: string;
  passed: boolean;
}

export function LastCheckedBadge({ lastChecked, passed }: LastCheckedBadgeProps) {
  const date = lastChecked ? lastChecked.slice(0, 10) : "not yet checked";
  const tone = passed ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400" : "border-amber-500/40 text-amber-700 dark:text-amber-400";
  return (
    <span className={`print:hidden inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${tone}`}>
      {passed ? "Last checked" : "Not fully verified"} · {date}
    </span>
  );
}
