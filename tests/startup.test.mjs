import test from "node:test";
import assert from "node:assert/strict";
import { resolveStartupSurface } from "../lib/startup.ts";

const authenticated = {
  authChecking: false,
  hasClient: true,
  hasUser: true,
  hasWorkspace: false,
  hasError: false,
};

test("startup never treats an unresolved authenticated workspace as empty", () => {
  for (const workspaceStatus of ["idle", "loading", "ready"]) {
    assert.equal(resolveStartupSurface({ ...authenticated, workspaceStatus }), "loading", workspaceStatus);
  }
  assert.equal(resolveStartupSurface({ ...authenticated, workspaceStatus: "empty" }), "onboarding");
});

test("startup keeps authentication, errors and an existing workspace distinct", () => {
  assert.equal(resolveStartupSurface({ ...authenticated, authChecking: true, workspaceStatus: "empty" }), "loading");
  assert.equal(resolveStartupSurface({ ...authenticated, hasClient: false, hasError: true, workspaceStatus: "idle" }), "connection-error");
  assert.equal(resolveStartupSurface({ ...authenticated, hasUser: false, workspaceStatus: "idle" }), "auth");
  assert.equal(resolveStartupSurface({ ...authenticated, hasError: true, workspaceStatus: "error" }), "workspace-error");
  assert.equal(resolveStartupSurface({ ...authenticated, hasWorkspace: true, hasError: true, workspaceStatus: "error" }), "app");
});
