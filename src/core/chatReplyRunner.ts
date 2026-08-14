import {
  claimNextChatReplyTask,
  processChatReplyTask,
  type ChatReplyProcessOutcome,
} from "./chatReplyTasks";
import type { BackgroundTask } from "./types";

export type ChatReplyPumpOptions = {
  source?: "foreground" | "background";
  canRun?: () => boolean;
  onTaskStart?: (task: BackgroundTask) => void | Promise<void>;
  onTaskComplete?: (task: BackgroundTask, outcome: ChatReplyProcessOutcome) => void | Promise<void>;
  onTaskError?: (task: BackgroundTask, error: unknown) => void | Promise<void>;
  onIdle?: () => void | Promise<void>;
};
type WakeRequest = { options: ChatReplyPumpOptions };
let activePump: Promise<void> | null = null;
let pendingWake = false;
let foregroundPending = false;
let activeListeners: WakeRequest[] = [];
let queuedListeners: WakeRequest[] = [];

function runnable(request: WakeRequest) {
  return request.options.source === "foreground" || (request.options.canRun?.() ?? true);
}
function sameListener(a: WakeRequest, b: WakeRequest) {
  return a.options === b.options || (
    a.options.source === b.options.source &&
    a.options.canRun === b.options.canRun &&
    a.options.onTaskStart === b.options.onTaskStart &&
    a.options.onTaskComplete === b.options.onTaskComplete &&
    a.options.onTaskError === b.options.onTaskError &&
    a.options.onIdle === b.options.onIdle
  );
}
function addUnique(list: WakeRequest[], request: WakeRequest) {
  if (!list.some((current) => sameListener(current, request))) list.push(request);
}
async function safeCallback(callback: (() => void | Promise<void>) | undefined) {
  try { await callback?.(); } catch { /* UI refresh failures must not stop generation. */ }
}
async function notify(
  requests: WakeRequest[],
  select: (options: ChatReplyPumpOptions) => (() => void | Promise<void>) | undefined,
) {
  await Promise.all(requests.map((request) => safeCallback(select(request.options))));
}
async function runPump() {
  try {
    do {
      pendingWake = false;
      const foreground = foregroundPending;
      foregroundPending = false;
      const current = activeListeners.filter(runnable);
      if (!foreground && !current.length) {
        await Promise.resolve();
        activeListeners = queuedListeners;
        queuedListeners = [];
        continue;
      }
      while (foreground || current.some(runnable)) {
        let task: BackgroundTask | undefined;
        try { task = await claimNextChatReplyTask(); }
        catch { pendingWake = true; break; }
        if (!task) break;
        await notify(current.filter(runnable), (options) =>
          options.onTaskStart ? () => options.onTaskStart!(task!) : undefined,
        );
        try {
          const outcome = await processChatReplyTask(task);
          await notify(current.filter(runnable), (options) =>
            options.onTaskComplete ? () => options.onTaskComplete!(task!, outcome) : undefined,
          );
        } catch (error) {
          await notify(current.filter(runnable), (options) =>
            options.onTaskError ? () => options.onTaskError!(task!, error) : undefined,
          );
        }
      }
      await notify(current, (options) => options.onIdle);
      activeListeners = queuedListeners;
      queuedListeners = [];
    } while (pendingWake || foregroundPending || activeListeners.some(runnable));
  } finally {
    activePump = null;
    if (pendingWake || foregroundPending || activeListeners.length || queuedListeners.length)
      queueMicrotask(() => void startPump());
  }
}
function startPump() {
  if (!activePump) activePump = runPump();
  return activePump;
}
export function wakeChatReplyPump(options: ChatReplyPumpOptions = {}) {
  pendingWake = true;
  if (options.source === "foreground") foregroundPending = true;
  addUnique(activePump ? queuedListeners : activeListeners, { options });
  return startPump();
}
export const pumpChatReplies = wakeChatReplyPump;
export function chatReplyPumpActive() { return Boolean(activePump); }
