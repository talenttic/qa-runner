import http from "node:http";
import { type DaemonConfig, type GenerationOutcome } from "./daemon";
import { type ChangeEvent } from "@talenttic/qa-runner-core";
export type ServerConfig = {
    port: number;
    daemonConfig: DaemonConfig;
};
export type ServerState = {
    lastEvent?: ChangeEvent;
    lastOutcome?: GenerationOutcome;
};
export declare function startDaemonServer(config: ServerConfig): http.Server;
//# sourceMappingURL=server.d.ts.map