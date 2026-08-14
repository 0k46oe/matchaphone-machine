import {describe,expect,it} from "vitest";
import {auditMobileHomeGeometry,sameMobileHomeGeometryAudit,trustedMobileHomeViewportHeight,type MobileHomeRect} from "./mobileHomeGeometry";

const rect=(top:number,bottom:number,left=0,right=390):MobileHomeRect=>({top,bottom,left,right,width:right-left,height:bottom-top});
const validInput=()=>({
  heroRects:[rect(80,180,18,118),rect(80,180,128,228),rect(80,180,238,338)],
  appRects:[rect(250,330,18,90),rect(250,330,100,172),rect(430,510,18,90),rect(430,510,100,172)],
  dotsRect:rect(540,550,170,220),
  dockRect:rect(580,664,18,372),
  canvasRect:rect(0,669),
  visualTop:0,
  visualHeight:669,
  safeAreaBottom:5,
});

describe("conditional mobile home geometry recovery",()=>{
  it("keeps a normal frozen v3 geometry valid",()=>{
    const audit=auditMobileHomeGeometry(validInput());
    expect(audit.valid).toBe(true);
    expect(audit.reasons).toEqual([]);
  });

  it("detects the large App-to-dots gap from the remaining iPhone/Samsung/OPPO samples",()=>{
    const audit=auditMobileHomeGeometry({...validInput(),dotsRect:rect(760,770,170,220),dockRect:rect(800,884,18,372),canvasRect:rect(0,896),visualHeight:896});
    expect(audit.valid).toBe(false);
    expect(audit.reasons).toContain("excessive-content-gap");
  });

  it("detects dots or Dock outside the actually visible viewport",()=>{
    const audit=auditMobileHomeGeometry({...validInput(),dotsRect:rect(740,750,170,220),dockRect:rect(780,864,18,372),canvasRect:rect(0,844),visualHeight:700});
    expect(audit.reasons).toContain("dots-outside-viewport");
    expect(audit.reasons).toContain("dock-outside-viewport");
  });

  it("detects a Dock that exists entirely below the visual viewport",()=>{
    const audit=auditMobileHomeGeometry({...validInput(),dotsRect:rect(910,920,170,220),dockRect:rect(950,1034,18,372),canvasRect:rect(0,1034),visualHeight:844});
    expect(audit.reasons).toEqual(expect.arrayContaining(["dots-outside-viewport","dock-outside-viewport","dock-not-visible"]));
  });

  it("allows a partly visible Dock to report overflow without classifying it as invisible",()=>{
    const audit=auditMobileHomeGeometry({...validInput(),dotsRect:rect(790,800,170,220),dockRect:rect(820,880,18,372),canvasRect:rect(0,880),visualHeight:844});
    expect(audit.reasons).toContain("dock-outside-viewport");
    expect(audit.reasons).not.toContain("dock-not-visible");
  });

  it("detects Hero distortion, footer overlap and uncovered canvas",()=>{
    const audit=auditMobileHomeGeometry({...validInput(),heroRects:[rect(80,170,18,118)],dotsRect:rect(580,600,170,220),dockRect:rect(590,674,18,372),canvasRect:rect(0,650),visualHeight:669});
    expect(audit.reasons).toEqual(expect.arrayContaining(["hero-not-square","footer-overlap","canvas-bottom-gap"]));
  });

  it("uses the smallest trustworthy viewport value without accepting an anomalous tall visual viewport",()=>{
    expect(trustedMobileHomeViewportHeight({visualHeight:1800,innerHeight:915,clientHeight:915,screenHeight:960,screenAvailHeight:960})).toBe(915);
    expect(trustedMobileHomeViewportHeight({visualHeight:700,innerHeight:915,clientHeight:915,screenHeight:960,screenAvailHeight:960})).toBe(700);
  });

  it("requires two stable equivalent audits before callers latch recovery",()=>{
    const first=auditMobileHomeGeometry(validInput());
    const second=auditMobileHomeGeometry({...validInput(),dotsRect:rect(540.4,550.4,170,220)});
    const changed=auditMobileHomeGeometry({...validInput(),dotsRect:rect(545,555,170,220)});
    expect(sameMobileHomeGeometryAudit(first,second)).toBe(true);
    expect(sameMobileHomeGeometryAudit(first,changed)).toBe(false);
  });
  it("recovers the screenshot geometries while keeping the v3 baseline unchanged",()=>{
    const cases=[
      {name:"iPhone 15 Pro gap",visualHeight:852,dotsTop:728,dockTop:760,dockBottom:844,canvasBottom:852},
      {name:"Samsung Edge offscreen footer",visualHeight:800,dotsTop:910,dockTop:942,dockBottom:1026,canvasBottom:1026},
      {name:"OPPO Edge offscreen footer",visualHeight:873,dotsTop:930,dockTop:962,dockBottom:1046,canvasBottom:1046},
      {name:"iPhone 16 Pro wallpaper gap",visualHeight:852,dotsTop:708,dockTop:740,dockBottom:824,canvasBottom:852},
      {name:"Harmony canvas discontinuity",visualHeight:915,dotsTop:690,dockTop:722,dockBottom:806,canvasBottom:880},
    ];
    for(const sample of cases){
      const audit=auditMobileHomeGeometry({...validInput(),dotsRect:rect(sample.dotsTop,sample.dotsTop+10,170,220),dockRect:rect(sample.dockTop,sample.dockBottom,18,372),canvasRect:rect(0,sample.canvasBottom),visualHeight:sample.visualHeight});
      expect(audit.valid,sample.name).toBe(false);
    }
    expect(auditMobileHomeGeometry(validInput()).valid).toBe(true);
  });

});
