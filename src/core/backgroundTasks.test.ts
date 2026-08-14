import {beforeEach,describe,expect,it} from "vitest";
import {claimDueBackgroundTasks,completeBackgroundTask,enqueueBackgroundTask,failBackgroundTask,recoverExpiredBackgroundTasks} from "./backgroundTasks";
import {db} from "./db";

describe("background task queue",()=>{
 beforeEach(async()=>{await db.delete();await db.open()});
 it("deduplicates tasks by event id and completes a claimed task",async()=>{const first=await enqueueBackgroundTask({type:"proactive-check",entityId:"minute",eventId:"same",scheduledAt:1}),second=await enqueueBackgroundTask({type:"proactive-check",entityId:"minute",eventId:"same",scheduledAt:1});expect(second.id).toBe(first.id);const [claimed]=await claimDueBackgroundTasks(5,10,["proactive-check"]);expect(claimed.state).toBe("running");await completeBackgroundTask(claimed.id);expect((await db.backgroundTasks.get(claimed.id))?.state).toBe("completed")});
 it("recovers expired leases",async()=>{const task=await enqueueBackgroundTask({type:"proactive-check",entityId:"x",eventId:"lease",scheduledAt:1});await db.backgroundTasks.update(task.id,{state:"running",leaseExpiresAt:5});await recoverExpiredBackgroundTasks(10);const recovered=await db.backgroundTasks.get(task.id);expect(recovered?.state).toBe("pending");expect(recovered).not.toHaveProperty("leaseExpiresAt")});
 it("keeps failed notification tasks out of proactive claims",async()=>{const notification=await enqueueBackgroundTask({type:"notification",entityId:"n",eventId:"notification:n",scheduledAt:1});await failBackgroundTask(notification.id,new Error("offline"),1);const claimed=await claimDueBackgroundTasks(5,Date.now()+1000,["proactive-check","proactive-call"]);expect(claimed).toHaveLength(0);expect((await db.backgroundTasks.get(notification.id))?.state).toBe("failed")});
});