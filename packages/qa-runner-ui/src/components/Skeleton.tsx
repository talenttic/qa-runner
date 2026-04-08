import React from "react";

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  variant?: "text" | "circle" | "rectangular";
  className?: string;
  count?: number;
}

/**
 * Skeleton Loader Component
 * Displays a placeholder while content is loading
 */
export const Skeleton: React.FC<SkeletonProps> = ({
  width = "100%",
  height = "1rem",
  variant = "rectangular",
  className = "",
  count = 1,
}) => {
  const baseClasses =
    "animate-pulse bg-surface-200 dark:bg-slate-700 rounded";

  const variantClasses = {
    text: "h-4",
    circle: "rounded-full",
    rectangular: "rounded",
  };

  const skeletons = Array.from({ length: count }, (_, i) => (
    <div
      key={i}
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
      }}
      aria-busy="true"
      role="status"
    />
  ));

  if (count > 1) {
    return <div className="space-y-2">{skeletons}</div>;
  }

  return skeletons[0];
};

/**
 * Table Skeleton - Shows a skeleton of a table structure
 */
export const TableSkeleton: React.FC<{ rows?: number; cols?: number }> = ({
  rows = 5,
  cols = 4,
}) => {
  return (
    <div className="overflow-hidden rounded-lg border border-surface-200 dark:border-slate-700">
      <table className="w-full">
        <thead>
          <tr className="border-b border-surface-200 bg-surface-50 dark:border-slate-700 dark:bg-slate-900">
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} className="px-4 py-3">
                <Skeleton height="1rem" width="80%" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, rowIdx) => (
            <tr
              key={rowIdx}
              className="border-b border-surface-100 dark:border-slate-800"
            >
              {Array.from({ length: cols }).map((_, colIdx) => (
                <td key={colIdx} className="px-4 py-3">
                  <Skeleton height="1rem" width={Math.random() > 0.5 ? "90%" : "70%"} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/**
 * Card Skeleton - Shows a skeleton of a card structure
 */
export const CardSkeleton: React.FC<{ count?: number }> = ({ count = 1 }) => {
  const cards = Array.from({ length: count }, (_, i) => (
    <div
      key={i}
      className="rounded-lg border border-surface-200 p-4 dark:border-slate-700"
    >
      <Skeleton height="1.5rem" width="70%" className="mb-3" />
      <Skeleton height="1rem" width="100%" className="mb-2" />
      <Skeleton height="1rem" width="95%" className="mb-4" />
      <div className="flex gap-2">
        <Skeleton height="2rem" width="80px" />
        <Skeleton height="2rem" width="80px" />
      </div>
    </div>
  ));

  if (count > 1) {
    return (
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {cards}
      </div>
    );
  }

  return cards[0];
};
