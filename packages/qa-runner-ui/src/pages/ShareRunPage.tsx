import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { SectionHeader, SurfaceCard } from "../components/Infographic";
import { Skeleton } from "../components/Skeleton";
import { fetchRunShare } from "../qa/api";
import type { QaRunSharePayload } from "../qa/types";

export const ShareRunPage = () => {
  const { shareId } = useParams();
  const [payload, setPayload] = useState<QaRunSharePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!shareId) {
      setError("Share link is missing or invalid.");
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchRunShare(shareId)
      .then((data) => {
        setPayload(data);
        setError("");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load share link");
      })
      .finally(() => setLoading(false));
  }, [shareId]);

  const commentMap = useMemo(() => {
    const map = new Map<string, QaRunSharePayload["comments"]>();
    if (!payload) {
      return map;
    }
    for (const comment of payload.comments) {
      const existing = map.get(comment.caseId) ?? [];
      existing.push(comment);
      map.set(comment.caseId, existing);
    }
    return map;
  }, [payload]);

  if (loading) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Shared QA Run" subtitle="Loading shared run summary." badges={["Shared"]} />
        <SurfaceCard className="space-y-3 p-6">
          <Skeleton height="1.4rem" width="50%" />
          <Skeleton height="1rem" width="80%" />
          <Skeleton height="1rem" width="60%" />
        </SurfaceCard>
        <SurfaceCard className="space-y-3 p-6">
          <Skeleton height="1.2rem" width="40%" />
          <Skeleton height="1rem" width="100%" />
          <Skeleton height="1rem" width="90%" />
        </SurfaceCard>
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Shared QA Run" subtitle="Unable to load this link." badges={["Shared"]} />
        <SurfaceCard className="p-6">
          <p className="text-sm text-rose-700 dark:text-rose-300">{error || "Share not found."}</p>
        </SurfaceCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title={payload.suite.name}
        subtitle={`Shared run ${payload.run.id}`}
        badges={["Shared", payload.run.status]}
      />

      <SurfaceCard className="space-y-2 p-6">
        <p className="text-sm text-ink-700 dark:text-slate-200">
          Status: <span className="font-semibold">{payload.run.status}</span>
        </p>
        <p className="text-sm text-ink-700 dark:text-slate-200">
          Created: <span className="font-semibold">{new Date(payload.createdAt).toLocaleString()}</span>
        </p>
        <p className="text-sm text-ink-700 dark:text-slate-200">
          Notes: <span className="font-semibold">{payload.run.notes || "None"}</span>
        </p>
      </SurfaceCard>

      <SurfaceCard className="space-y-3 p-6">
        <p className="text-sm font-semibold text-ink-900 dark:text-white">Collaborators</p>
        {payload.collaborators.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {payload.collaborators.map((collaborator) => (
              <span
                key={collaborator.id}
                className="inline-flex items-center rounded-full border border-surface-200 bg-white px-2.5 py-1 text-xs font-semibold text-ink-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              >
                {collaborator.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-ink-500 dark:text-slate-400">No collaborators listed.</p>
        )}
      </SurfaceCard>

      <SurfaceCard className="space-y-4 p-6">
        <p className="text-sm font-semibold text-ink-900 dark:text-white">Case Summary</p>
        <div className="space-y-3">
          {payload.cases.map((caseItem) => (
            <div
              key={caseItem.id}
              className="rounded-lg border border-surface-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-ink-800 dark:text-slate-100">{caseItem.title}</p>
                <span className="rounded-full border border-surface-200 px-2 py-0.5 text-xs font-semibold text-ink-600 dark:border-slate-700 dark:text-slate-300">
                  {caseItem.status}
                </span>
              </div>
              {caseItem.notes ? (
                <p className="mt-2 text-xs text-ink-600 dark:text-slate-300">Notes: {caseItem.notes}</p>
              ) : null}
              {caseItem.evidence.length > 0 ? (
                <p className="mt-1 text-xs text-ink-600 dark:text-slate-300">
                  Evidence entries: {caseItem.evidence.length}
                </p>
              ) : null}
              {commentMap.get(caseItem.id)?.length ? (
                <div className="mt-2 space-y-2">
                  {commentMap.get(caseItem.id)?.map((comment) => (
                    <div
                      key={comment.id}
                      className="rounded border border-surface-200 bg-surface-50 px-2 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                    >
                      <p className="font-semibold text-ink-700 dark:text-slate-200">{comment.author}</p>
                      <p className="text-ink-600 dark:text-slate-300">{comment.message}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </SurfaceCard>
    </div>
  );
};
