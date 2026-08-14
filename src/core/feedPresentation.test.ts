import {describe,expect,it} from "vitest";
import {feedGridClass,pendingInteractionLabel} from "./feedPresentation";

describe("feed presentation",()=>{
 it("maps image counts to stable 1–9 grid classes",()=>{
  expect(feedGridClass(1)).toBe("count-1");
  expect(feedGridClass(4)).toBe("count-4");
  expect(feedGridClass(9)).toBe("count-9");
  expect(feedGridClass(20)).toBe("count-9");
  expect(feedGridClass(Number.NaN)).toBe("count-1");
 });
 it("shows a capped pending interaction count",()=>{
  expect(pendingInteractionLabel(0)).toBe("");
  expect(pendingInteractionLabel(3)).toBe("角色正在赶来 · 3");
  expect(pendingInteractionLabel(18)).toBe("角色正在赶来 · 10");
 });
});