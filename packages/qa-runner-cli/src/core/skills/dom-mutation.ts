export type DomMutationSnapshot = {
  paths: string[];
};

export type DomMutationDelta = {
  added: string[];
  removed: string[];
};

export const diffDomSnapshots = (before: DomMutationSnapshot, after: DomMutationSnapshot): DomMutationDelta => {
  const beforeSet = new Set(before.paths);
  const afterSet = new Set(after.paths);

  const added = Array.from(afterSet).filter((value) => !beforeSet.has(value));
  const removed = Array.from(beforeSet).filter((value) => !afterSet.has(value));

  return { added, removed };
};

export type DomMutationWatcher = {
  pushSnapshot(snapshot: DomMutationSnapshot): DomMutationDelta | null;
  reset(): void;
};

export const createDomMutationWatcher = (): DomMutationWatcher => {
  let lastSnapshot: DomMutationSnapshot | null = null;

  return {
    pushSnapshot(snapshot: DomMutationSnapshot): DomMutationDelta | null {
      if (!lastSnapshot) {
        lastSnapshot = snapshot;
        return null;
      }
      const delta = diffDomSnapshots(lastSnapshot, snapshot);
      lastSnapshot = snapshot;
      return delta;
    },
    reset() {
      lastSnapshot = null;
    },
  };
};
