import {describe,expect,it} from "vitest";
import {currentTimeFactReply,findCurrentTimeReplyContradiction,findLocalTimeContradiction,localDayPeriod,localTimeContext,timezoneOffsetLabel} from "./localTime";

describe("local time context",()=>{
  it("classifies device-local day periods",()=>{
    expect(localDayPeriod(3)).toBe("深夜");
    expect(localDayPeriod(7)).toBe("清晨");
    expect(localDayPeriod(10)).toBe("上午");
    expect(localDayPeriod(12)).toBe("中午");
    expect(localDayPeriod(15)).toBe("下午");
    expect(localDayPeriod(19)).toBe("傍晚");
    expect(localDayPeriod(23)).toBe("深夜");
  });
  it("uses the device timezone instead of a fixed timezone",()=>{
    const date=new Date(2026,7,10,15,58);
    expect(localTimeContext({enabled:true,at:date})).toContain("15:58");
    expect(localTimeContext({enabled:true,at:date})).toContain(timezoneOffsetLabel(date));
    expect(localTimeContext({enabled:true,at:date})).toContain("下午");
  });
  it("prohibits guessing when time awareness is disabled",()=>expect(localTimeContext({enabled:false})).toContain("不要猜测"));
  it("detects a contradictory claimed period",()=>{
    const at=new Date(2026,7,10,15,58);
    expect(findLocalTimeContradiction("凌晨三点半还没睡",at)?.actualPeriod).toBe("下午");
    expect(findLocalTimeContradiction("下午整理了一下桌面",at)).toBeNull();
  });
  it("detects explicit wrong clock, weekday and date answers",()=>{
    const at=new Date(2026,7,12,0,45);
    expect(findCurrentTimeReplyContradiction("现在几点？","19:30",at)).toMatchObject({kind:"clock",expected:"00:45"});
    expect(findCurrentTimeReplyContradiction("今天星期几？","星期二",at)?.kind).toBe("weekday");
    expect(findCurrentTimeReplyContradiction("今天几号？","8月11日",at)?.kind).toBe("date");
    expect(currentTimeFactReply(at)).toContain("00:45");
  });
});
