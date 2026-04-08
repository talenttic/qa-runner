export const apiFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const workspaceId = typeof window !== "undefined" ? window.localStorage.getItem("qa_runner_workspace_id") : null;
  const headers = new Headers(init?.headers ?? {});
  if (workspaceId) {
    headers.set("X-QA-Workspace", workspaceId);
  }
  return fetch(input, {
    credentials: "include",
    headers,
    ...init,
  });
};
