import {describe,expect,it} from "vitest";
import {calculateMobileHomeFooterRecovery} from "./mobileHomeFooterRecovery";

describe("mobile home Footer recovery v5",()=>{
  it.each([
    [390,844,0,0],
    [393,800,0,5],
    [412,873,0,12],
    [432,760,20,16],
  ])("anchors Footer inside the trusted viewport for %d x %d",(width,height,safeAreaTop,safeAreaBottom)=>{
    const metrics=calculateMobileHomeFooterRecovery({viewportWidth:width,viewportHeight:height,safeAreaTop,safeAreaBottom});
    expect(metrics.viewportHeight).toBe(height);
    expect(metrics.footerTop+metrics.footerHeight+metrics.bottomPadding).toBeCloseTo(height,2);
    expect(Math.max(0,metrics.contentBottom-metrics.footerTop)).toBeCloseTo(metrics.overlap,2);
    expect(metrics.dockHeight).toBeGreaterThan(70);
    expect(metrics.heroThumbSize).toBeGreaterThan(95);
  });

  it("does not fall back to the taller v3 layout height below its minimum",()=>{
    const metrics=calculateMobileHomeFooterRecovery({viewportWidth:390,viewportHeight:760});
    expect(metrics.viewportHeight).toBe(760);
    expect(metrics.footerTop).toBe(627);
    expect(metrics.overlap).toBe(0);
  });

  it("keeps row, Hero and Dock dimensions while shrinking only extra top and gap space",()=>{
    const tall=calculateMobileHomeFooterRecovery({viewportWidth:390,viewportHeight:915});
    const short=calculateMobileHomeFooterRecovery({viewportWidth:390,viewportHeight:760});
    expect(short.rowHeights).toEqual(tall.rowHeights);
    expect(short.dockHeight).toBe(tall.dockHeight);
    expect(short.heroThumbSize).toBe(tall.heroThumbSize);
    expect(short.topPadding).toBeLessThanOrEqual(tall.topPadding);
    expect(short.rowGaps.reduce((a,b)=>a+b,0)).toBeLessThan(tall.rowGaps.reduce((a,b)=>a+b,0));
  });

  it("reports unavoidable overlap instead of shrinking Apps, Hero or Dock",()=>{
    const metrics=calculateMobileHomeFooterRecovery({viewportWidth:390,viewportHeight:669,safeAreaBottom:5});
    expect(metrics.overlap).toBeGreaterThan(0);
    expect(metrics.rowHeights).toEqual([101.5,101.5,79.2,86.6,79.2,79.2]);
    expect(metrics.dockHeight).toBe(84);
  });
});
