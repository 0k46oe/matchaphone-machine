import {beforeEach,describe,expect,it,vi} from "vitest";
const mocked=vi.hoisted(()=>({claim:vi.fn(),process:vi.fn()}));
vi.mock("./chatReplyTasks",()=>({claimNextChatReplyTask:mocked.claim,processChatReplyTask:mocked.process}));
import {pumpChatReplies,wakeChatReplyPump} from "./chatReplyRunner";

describe("chat reply runner",()=>{
 beforeEach(()=>{mocked.claim.mockReset();mocked.process.mockReset()});
 it("shares one active pump and processes each claimed task once",async()=>{
  const task={id:"t",conversationId:"c"} as any;
  mocked.claim.mockResolvedValueOnce(task).mockResolvedValueOnce(undefined);
  let release!:()=>void;mocked.process.mockImplementation(()=>new Promise<void>(resolve=>{release=resolve}));
  const first=pumpChatReplies(),second=pumpChatReplies();
  expect(second).toBe(first);
  await vi.waitFor(()=>expect(mocked.process).toHaveBeenCalledOnce());
  release();await first;
  expect(mocked.claim).toHaveBeenCalledTimes(3);
 });
 it("does not depend on navigator locks",async()=>{
  Object.defineProperty(navigator,"locks",{configurable:true,value:{request:vi.fn(()=>new Promise(()=>{}))}});
  mocked.claim.mockResolvedValue(undefined);
  await expect(pumpChatReplies()).resolves.toBeUndefined();
  expect((navigator as any).locks.request).not.toHaveBeenCalled();
 });
 it("does not lose a wake that arrives while a task is running",async()=>{
  const firstTask={id:"first",conversationId:"c1"} as any,secondTask={id:"second",conversationId:"c2"} as any;
  let releaseFirst!:()=>void;
  mocked.claim.mockResolvedValueOnce(firstTask).mockResolvedValueOnce(undefined).mockResolvedValueOnce(secondTask).mockResolvedValueOnce(undefined);
  mocked.process.mockImplementationOnce(()=>new Promise<void>(resolve=>{releaseFirst=resolve})).mockResolvedValue(undefined);
  const running=wakeChatReplyPump();
  await vi.waitFor(()=>expect(mocked.process).toHaveBeenCalledWith(firstTask));
  expect(wakeChatReplyPump()).toBe(running);
  releaseFirst();
  await running;
  await vi.waitFor(()=>expect(mocked.process).toHaveBeenCalledWith(secondTask));
 });
 it("lets a foreground wake run even when a background gate is false",async()=>{
  const task={id:"foreground",conversationId:"c"} as any;
  mocked.claim.mockResolvedValueOnce(task).mockResolvedValueOnce(undefined);
  mocked.process.mockResolvedValue({state:"completed",conversationId:"c",taskId:"foreground",outputMessageIds:[]});
  const blocked=wakeChatReplyPump({source:"background",canRun:()=>false});
  const foreground=wakeChatReplyPump({source:"foreground"});
  await Promise.all([blocked,foreground]);
  expect(mocked.process).toHaveBeenCalledWith(task);
 });
 it("ignores a failing refresh callback and continues",async()=>{
  const first={id:"first"} as any,second={id:"second"} as any;
  mocked.claim.mockResolvedValueOnce(first).mockResolvedValueOnce(second).mockResolvedValueOnce(undefined);
  mocked.process.mockResolvedValue({state:"completed",conversationId:"c",taskId:"x",outputMessageIds:[]});
  await wakeChatReplyPump({onTaskComplete:()=>Promise.reject(new Error("reload failed"))});
  expect(mocked.process).toHaveBeenCalledTimes(2);
 });
 it("continues after one task throws",async()=>{
  const failed={id:"failed"} as any,next={id:"next"} as any;
  mocked.claim.mockResolvedValueOnce(failed).mockResolvedValueOnce(next).mockResolvedValueOnce(undefined);
  mocked.process.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(undefined);
  await wakeChatReplyPump();
  expect(mocked.process).toHaveBeenNthCalledWith(2,next);
 });
});
