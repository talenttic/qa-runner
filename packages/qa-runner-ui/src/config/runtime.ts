const resolveApiUrl = (): string => {
  const fromEnv = import.meta.env.VITE_API_URL;
  if (fromEnv && typeof fromEnv === "string" && fromEnv.trim()) {
    return fromEnv.trim();
  }
  if (typeof window === "undefined") {
    return "http://localhost:4545";
  }
  const { protocol, hostname, port, origin } = window.location;
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";
  // Dev UI commonly runs on these ports while daemon runs on 4545.
  if (isLocalHost && (port === "2173" || port === "5173" || port === "4173")) {
    return `${protocol}//${hostname}:4545`;
  }
  return origin;
};

export const API_URL = resolveApiUrl();
