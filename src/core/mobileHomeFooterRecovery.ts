export const MOBILE_HOME_RECOVERY_LAYOUT_VERSION = 5 as const;

export interface MobileHomeFooterRecoveryInput {
  viewportWidth: number;
  viewportHeight: number;
  safeAreaTop?: number;
  safeAreaBottom?: number;
}

export interface MobileHomeFooterRecoveryMetrics {
  version: typeof MOBILE_HOME_RECOVERY_LAYOUT_VERSION;
  viewportHeight: number;
  topPadding: number;
  bottomPadding: number;
  rowHeights: readonly [number,number,number,number,number,number];
  rowGaps: readonly [number,number,number,number,number];
  desktopHeight: number;
  heroHeight: number;
  heroThumbSize: number;
  dockHeight: number;
  pageDotsHeight: number;
  dotsToDockGap: number;
  contentToDotsGap: number;
  footerHeight: number;
  contentBottom: number;
  footerTop: number;
  overlap: number;
}

const REFERENCE_WIDTH=390;
const MIN_SCALE=360/REFERENCE_WIDTH;
const MAX_SCALE=414/REFERENCE_WIDTH;
const ROW_HEIGHTS=[101.5,101.5,79.2,86.6,79.2,79.2] as const;
const ROW_GAPS=[24,24,24,24,24] as const;
const TOP_PADDING=48;
const DOCK_HEIGHT=84;
const DOTS_HEIGHT=10;
const DOTS_TO_DOCK=22;
const CONTENT_TO_DOTS=12;
const MIN_BOTTOM_PADDING=5;
const finite=(value:number|undefined)=>Number.isFinite(value)?Math.max(0,Number(value)):0;
const round=(value:number)=>Math.round(value*100)/100;
const sum=(values:readonly number[])=>values.reduce((total,value)=>total+value,0);
const scaleFor=(width:number)=>Math.max(MIN_SCALE,Math.min(MAX_SCALE,width/REFERENCE_WIDTH));
const scaled=(value:number,scale:number)=>round(value*scale);

export function calculateMobileHomeFooterRecovery(input:MobileHomeFooterRecoveryInput):MobileHomeFooterRecoveryMetrics{
  const viewportWidth=Math.max(1,Math.round(finite(input.viewportWidth)));
  const viewportHeight=Math.max(1,Math.round(finite(input.viewportHeight)));
  const safeAreaTop=Math.round(finite(input.safeAreaTop)),safeAreaBottom=Math.round(finite(input.safeAreaBottom));
  const scale=scaleFor(viewportWidth);
  const rowHeights=ROW_HEIGHTS.map(value=>scaled(value,scale)) as unknown as MobileHomeFooterRecoveryMetrics["rowHeights"];
  const baseGaps=ROW_GAPS.map(value=>scaled(value,scale));
  const dockHeight=scaled(DOCK_HEIGHT,scale),pageDotsHeight=DOTS_HEIGHT,dotsToDockGap=scaled(DOTS_TO_DOCK,scale),contentToDotsGap=scaled(CONTENT_TO_DOTS,scale);
  const bottomPadding=Math.max(MIN_BOTTOM_PADDING,safeAreaBottom),minimumTopPadding=Math.max(safeAreaTop+1,8),baseTopPadding=Math.max(scaled(TOP_PADDING,scale),safeAreaTop+1);
  const footerHeight=round(contentToDotsGap+pageDotsHeight+dotsToDockGap+dockHeight);
  const rowHeightTotal=sum(rowHeights),baseGapTotal=sum(baseGaps);
  const availableForTopAndGaps=viewportHeight-bottomPadding-footerHeight-rowHeightTotal;
  const shrinkNeeded=Math.max(0,baseTopPadding+baseGapTotal-Math.max(0,availableForTopAndGaps));
  let topPadding=baseTopPadding,remainingShrink=shrinkNeeded;
  const shrinkTop=Math.min(Math.max(0,topPadding-minimumTopPadding),remainingShrink);topPadding-=shrinkTop;remainingShrink-=shrinkTop;
  const gapMinimums=[12,8,12,8,12].map(value=>scaled(value,scale));
  const rowGaps=baseGaps.slice();
  for(const index of [1,3,0,2,4]){if(remainingShrink<=0)break;const capacity=Math.max(0,rowGaps[index]-gapMinimums[index]);const amount=Math.min(capacity,remainingShrink);rowGaps[index]-=amount;remainingShrink-=amount}
  topPadding=round(topPadding);
  const normalizedGaps=rowGaps.map(round) as unknown as MobileHomeFooterRecoveryMetrics["rowGaps"];
  const desktopHeight=round(rowHeightTotal+sum(normalizedGaps)),contentBottom=round(topPadding+desktopHeight),footerTop=round(viewportHeight-bottomPadding-footerHeight),overlap=round(Math.max(0,contentBottom-footerTop));
  const heroHeight=round(rowHeights[0]+normalizedGaps[0]+rowHeights[1]);
  const heroWidth=Math.max(1,viewportWidth-36),heroThumbSize=round(heroWidth*(1-.0395*2-.0226*2)/3);
  return{version:MOBILE_HOME_RECOVERY_LAYOUT_VERSION,viewportHeight,topPadding,bottomPadding,rowHeights,rowGaps:normalizedGaps,desktopHeight,heroHeight,heroThumbSize,dockHeight,pageDotsHeight,dotsToDockGap,contentToDotsGap,footerHeight,contentBottom,footerTop,overlap};
}
