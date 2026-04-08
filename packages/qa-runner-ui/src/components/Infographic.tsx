import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";

interface StatRingCardProps {
  value: number;
  title: string;
  subtitle?: string;
  highlighted?: boolean;
  mode?: "ring" | "gauge" | "pie";
}

const clamp = (value: number) => Math.max(0, Math.min(100, value));

export const StatRingCard = ({
  value,
  title,
  subtitle,
  highlighted = false,
  mode = "ring",
}: StatRingCardProps) => {
  const safeValue = clamp(value);
  const angle = safeValue * 3.6;

  return (
    <article
      className={[
        "inf-card p-6",
        highlighted ? "bg-brand-500 text-white dark:bg-brand-500" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-4">
        <div
          className={[
            "relative h-20 w-20 shrink-0 rounded-full",
            highlighted ? "ring-surface" : "ring-surface-muted",
          ].join(" ")}
          style={{
            background:
              mode === "pie"
                ? `conic-gradient(currentColor 0deg ${angle}deg, transparent ${angle}deg 360deg)`
                : `conic-gradient(currentColor 0deg ${angle}deg, rgba(148, 163, 184, 0.22) ${angle}deg 360deg)`,
          }}
        >
          {mode !== "pie" ? (
            <div
              className={[
                "absolute inset-[10px] rounded-full",
                highlighted
                  ? "bg-brand-500 dark:bg-brand-500"
                  : "bg-white dark:bg-slate-900",
              ].join(" ")}
            />
          ) : null}
          {mode === "gauge" ? (
            <div className="absolute inset-0 overflow-hidden rounded-full">
              <div
                className={[
                  "absolute bottom-0 left-0 right-0 h-1/2",
                  highlighted ? "bg-brand-500" : "bg-white dark:bg-slate-900",
                ].join(" ")}
              />
            </div>
          ) : null}
        </div>
        <div>
          <p
            className={[
              "text-5xl font-bold leading-none",
              highlighted ? "text-white" : "text-ink-900 dark:text-white",
            ].join(" ")}
          >
            {safeValue}%
          </p>
          <p
            className={[
              "mt-2 text-2xl font-semibold",
              highlighted ? "text-white/90" : "text-ink-800 dark:text-slate-200",
            ].join(" ")}
          >
            {title}
          </p>
          {subtitle ? (
            <p
              className={[
                "mt-1 text-base",
                highlighted ? "text-white/70" : "text-ink-400 dark:text-slate-400",
              ].join(" ")}
            >
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
};

export const TinySparkBars = ({
  highlightedIndex,
  dense = false,
}: {
  highlightedIndex?: number;
  dense?: boolean;
}) => {
  const bars = dense
    ? [
        40, 62, 50, 78, 35, 55, 28, 47, 52, 30, 44, 61, 37, 52, 46, 67, 58, 49,
        63, 45, 39, 57, 60, 43,
      ]
    : [38, 23, 47, 71, 43, 18, 63];

  return (
    <div className={["flex items-end gap-2", dense ? "h-36" : "h-28"].join(" ")}>
      {bars.map((height, idx) => (
        <div
          // eslint-disable-next-line react/no-array-index-key
          key={idx}
          className={[
            "rounded-md",
            dense ? "w-2.5" : "w-10",
            highlightedIndex === idx
              ? "bg-brand-500 shadow-[0_10px_24px_rgba(99,114,230,0.28)]"
              : "bg-brand-200/80 dark:bg-brand-300/35",
          ].join(" ")}
          style={{ height: `${height}%` }}
        />
      ))}
    </div>
  );
};

export const SectionHeader = ({
  title,
  subtitle,
  right,
  badges,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  badges?: string[];
}) => (
  <SectionHeaderInner title={title} subtitle={subtitle} right={right} badges={badges} />
);

const SectionHeaderInner = ({
  title,
  subtitle,
  right,
  badges,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  badges?: string[];
}) => {
  const location = useLocation();
  const effectiveBadges = badges && badges.length > 0 ? badges : [location.pathname];

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="w-full">
        <div className="mb-2 flex flex-wrap justify-center gap-2">
          {effectiveBadges.map((badge) => (
            <span
              key={badge}
              className="inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-700 dark:border-brand-700/60 dark:bg-brand-900/30 dark:text-brand-200"
            >
              {badge}
            </span>
          ))}
        </div>
        <h1 className="font-display text-4xl font-bold tracking-tight text-black dark:text-white">
          {title}
        </h1>
        {subtitle ? <p className="mt-2 text-base text-ink-400 dark:text-slate-400">{subtitle}</p> : null}
        <div className="mx-auto mt-5 h-2 w-64 rounded-full bg-brand-500/90" />
      </div>
      {right ? <div className="flex justify-center">{right}</div> : null}
    </div>
  );
};

export const SurfaceCard = ({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) => <section className={["inf-card", className].join(" ")}>{children}</section>;
