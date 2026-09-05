export type WorkspaceStatus = "idle" | "loading" | "ready" | "empty" | "error";

export type StartupSurface = "loading" | "connection-error" | "auth" | "workspace-error" | "onboarding" | "app";

type StartupState = {
  authChecking: boolean;
  hasClient: boolean;
  hasUser: boolean;
  hasWorkspace: boolean;
  hasError: boolean;
  workspaceStatus: WorkspaceStatus;
};

export function resolveStartupSurface(state: StartupState): StartupSurface {
  if (state.authChecking) return "loading";
  if (state.hasError && !state.hasClient) return "connection-error";
  if (!state.hasClient || !state.hasUser) return "auth";
  if (state.hasWorkspace) return "app";
  if (state.workspaceStatus === "error") return "workspace-error";
  if (state.workspaceStatus === "empty") return "onboarding";
  return "loading";
}
