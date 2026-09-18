/**
 * Process lifecycle state, shared between the HTTP layer and the shutdown
 * sequence so readiness checks can report draining before sockets close.
 */
let shuttingDown = false;

export function isShuttingDown(): boolean {
  return shuttingDown;
}

export function beginShutdown(): void {
  shuttingDown = true;
}
