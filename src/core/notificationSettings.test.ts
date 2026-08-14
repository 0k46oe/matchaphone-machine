import {describe,expect,it} from "vitest";
import {backgroundExecutionAllowed} from "./notificationSettings";

describe("background execution policy",()=>{
 it("runs in the foreground even when keepalive is disabled",()=>{expect(backgroundExecutionAllowed({backgroundActivity:{enabled:false,mode:"oscillator"}},"visible")).toBe(true)});
 it("does not run while hidden when keepalive is disabled or off",()=>{expect(backgroundExecutionAllowed({backgroundActivity:{enabled:false,mode:"oscillator"}},"hidden")).toBe(false);expect(backgroundExecutionAllowed({backgroundActivity:{enabled:true,mode:"off"}},"hidden")).toBe(false)});
 it("allows hidden execution only for an enabled keepalive mode",()=>{expect(backgroundExecutionAllowed({backgroundActivity:{enabled:true,mode:"oscillator"}},"hidden")).toBe(true);expect(backgroundExecutionAllowed({backgroundActivity:{enabled:true,mode:"silent-audio"}},"hidden")).toBe(true)});
 it("supports oscillator and silent audio at the same time",()=>{expect(backgroundExecutionAllowed({backgroundActivity:{enabled:true,mode:"oscillator",modes:["oscillator","silent-audio"]}},"hidden")).toBe(true)});
});
