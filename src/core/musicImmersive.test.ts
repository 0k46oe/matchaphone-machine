import {describe,expect,it} from "vitest";
import {activeLyricIndex,formatSleepTimerRemaining,isInteractiveSwipeTarget,sleepFadeVolume,sleepTimerRemainingMs} from "./musicImmersive";

describe("immersive music helpers",()=>{
 it("finds the current synchronized lyric line",()=>{
  const lines=[{timeMs:0,text:"第一句"},{timeMs:1200,text:"第二句"},{timeMs:2500,text:"第三句"}];
  expect(activeLyricIndex([],500)).toBe(-1);
  expect(activeLyricIndex(lines,0)).toBe(0);
  expect(activeLyricIndex(lines,1800)).toBe(1);
  expect(activeLyricIndex(lines,9999)).toBe(2);
 });
 it("calculates duration and track-end timer remaining time",()=>{
  expect(sleepTimerRemainingMs({mode:"duration",endsAt:70_000},10_000)).toBe(60_000);
  expect(sleepTimerRemainingMs({mode:"duration",endsAt:5_000},10_000)).toBe(0);
  expect(sleepTimerRemainingMs({mode:"track-end",trackId:"a"},0,"a",25_000,90_000)).toBe(65_000);
  expect(sleepTimerRemainingMs({mode:"track-end",trackId:"a"},0,"b",25_000,90_000)).toBeUndefined();
 });
 it("fades only during the final ten seconds without changing the base setting",()=>{
  expect(sleepFadeVolume(.8,20_000)).toBe(.8);
  expect(sleepFadeVolume(.8,5_000)).toBeCloseTo(.4);
  expect(sleepFadeVolume(.8,0)).toBe(0);
 });
 it("formats countdown and track-end labels",()=>{
  expect(formatSleepTimerRemaining({mode:"duration",endsAt:0},65_000)).toBe("1:05");
  expect(formatSleepTimerRemaining({mode:"duration",endsAt:0},3_665_000)).toBe("1:01:05");
  expect(formatSleepTimerRemaining({mode:"track-end",trackId:"a"})).toBe("本曲播完");
 });
 it("does not start a page swipe from interactive controls",()=>{
  const button=document.createElement("button"),span=document.createElement("span"),plain=document.createElement("div");
  button.append(span);
  expect(isInteractiveSwipeTarget(span)).toBe(true);
  expect(isInteractiveSwipeTarget(plain)).toBe(false);
 });
});