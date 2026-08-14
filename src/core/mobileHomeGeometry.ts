export type MobileHomeGeometryAuditReason =
  | "hero-not-square"
  | "excessive-content-gap"
  | "dots-outside-viewport"
  | "dock-outside-viewport"
  | "dock-not-visible"
  | "footer-overlap"
  | "canvas-bottom-gap";

export interface MobileHomeRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

export interface MobileHomeGeometryAuditInput {
  heroRects: readonly MobileHomeRect[];
  appRects: readonly MobileHomeRect[];
  dotsRect?: MobileHomeRect | null;
  dockRect?: MobileHomeRect | null;
  footerRect?: MobileHomeRect | null;
  canvasRect?: MobileHomeRect | null;
  visualTop: number;
  visualHeight: number;
  safeAreaBottom?: number;
}

export interface MobileHomeGeometryAudit {
  valid: boolean;
  reasons: MobileHomeGeometryAuditReason[];
  visualBottom: number;
  desktopBottom: number;
  dotsTop: number;
  dotsBottom: number;
  dockTop: number;
  dockBottom: number;
  dockVisibleHeight: number;
  footerTop: number;
  footerBottom: number;
  canvasBottom: number;
}

export interface TrustedMobileHomeViewportInput {
  visualHeight: number;
  visualOffsetTop?: number;
  innerHeight: number;
  clientHeight: number;
  screenHeight?: number;
  screenAvailHeight?: number;
}

const finitePositive = (value: number | undefined) => Number.isFinite(value) && Number(value) > 0 ? Number(value) : undefined;
const round = (value: number) => Math.round(value * 100) / 100;

export function trustedMobileHomeViewportHeight(input: TrustedMobileHomeViewportInput) {
  const visualBottom = finitePositive(input.visualHeight)
    ? Math.max(0, Number(input.visualOffsetTop) || 0) + Number(input.visualHeight)
    : undefined;
  const layoutCandidates = [finitePositive(input.innerHeight), finitePositive(input.clientHeight)].filter((value): value is number => value !== undefined);
  const screenCandidates = [finitePositive(input.screenAvailHeight), finitePositive(input.screenHeight)].filter((value): value is number => value !== undefined);
  const candidates = [visualBottom, ...layoutCandidates];
  const layoutReference = layoutCandidates.length ? Math.min(...layoutCandidates) : visualBottom;
  if (layoutReference && screenCandidates.length) {
    const screenReference = Math.min(...screenCandidates);
    // Only trust screen CSS pixels when they are in the same scale as the layout viewport.
    if (screenReference >= layoutReference * 0.72 && screenReference <= layoutReference * 1.35) candidates.push(screenReference);
  }
  const trusted = candidates.filter((value): value is number => value !== undefined && value > 0);
  return Math.max(1, Math.round(trusted.length ? Math.min(...trusted) : 1));
}

function usableRect(rect: MobileHomeRect | null | undefined) {
  return Boolean(rect && Number.isFinite(rect.top) && Number.isFinite(rect.bottom) && rect.width > 0.5 && rect.height > 0.5);
}

export function auditMobileHomeGeometry(input: MobileHomeGeometryAuditInput): MobileHomeGeometryAudit {
  const visualTop = Number.isFinite(input.visualTop) ? input.visualTop : 0;
  const visualHeight = Math.max(1, Number.isFinite(input.visualHeight) ? input.visualHeight : 1);
  const visualBottom = visualTop + visualHeight;
  const usableApps = input.appRects.filter(usableRect);
  const desktopBottom = usableApps.length ? Math.max(...usableApps.map((rect) => rect.bottom)) : 0;
  const dotsTop = usableRect(input.dotsRect) ? input.dotsRect!.top : 0;
  const dotsBottom = usableRect(input.dotsRect) ? input.dotsRect!.bottom : 0;
  const dockTop = usableRect(input.dockRect) ? input.dockRect!.top : 0;
  const dockBottom = usableRect(input.dockRect) ? input.dockRect!.bottom : 0;
  const dockVisibleHeight = usableRect(input.dockRect) ? Math.max(0, Math.min(dockBottom, visualBottom) - Math.max(dockTop, visualTop)) : 0;
  const footerTop = usableRect(input.footerRect) ? input.footerRect!.top : 0;
  const footerBottom = usableRect(input.footerRect) ? input.footerRect!.bottom : 0;
  const canvasBottom = usableRect(input.canvasRect) ? input.canvasRect!.bottom : 0;
  const reasons: MobileHomeGeometryAuditReason[] = [];

  if (input.heroRects.filter(usableRect).some((rect) => Math.abs(rect.width - rect.height) > 1)) reasons.push("hero-not-square");

  const dotsReady = usableRect(input.dotsRect);
  const dockReady = usableRect(input.dockRect);
  const footerReady = usableRect(input.footerRect);
  const canvasReady = usableRect(input.canvasRect);
  if (dotsReady && (input.dotsRect!.top < visualTop - 1 || input.dotsRect!.bottom > visualBottom + 1)) reasons.push("dots-outside-viewport");
  if (dockReady && (input.dockRect!.top < visualTop - 1 || input.dockRect!.bottom > visualBottom + 1)) reasons.push("dock-outside-viewport");
  if (dockReady && dockVisibleHeight < Math.min(8, input.dockRect!.height * .1)) reasons.push("dock-not-visible");
  if (footerReady && (input.footerRect!.bottom <= visualTop + 1 || input.footerRect!.top >= visualBottom - 1)) reasons.push("dock-not-visible");
  if (footerReady && input.footerRect!.bottom > visualBottom + 1) reasons.push("dock-outside-viewport");
  if (dotsReady && dockReady && input.dotsRect!.bottom > input.dockRect!.top - 1) reasons.push("footer-overlap");
  if (dotsReady && dockReady && input.dockRect!.top - input.dotsRect!.bottom > Math.max(56, visualHeight * 0.15)) reasons.push("excessive-content-gap");

  if (desktopBottom > 0 && dotsReady) {
    const gap = input.dotsRect!.top - desktopBottom;
    if (gap > Math.max(56, visualHeight * 0.15)) reasons.push("excessive-content-gap");
  }

  const safeAreaBottom = Math.max(0, Number(input.safeAreaBottom) || 0);
  if (dockReady && visualBottom - input.dockRect!.bottom > Math.max(24, safeAreaBottom + 16)) reasons.push("canvas-bottom-gap");
  if (canvasReady && input.canvasRect!.bottom < visualBottom - 1) reasons.push("canvas-bottom-gap");

  return {
    valid: reasons.length === 0,
    reasons: [...new Set(reasons)],
    visualBottom: round(visualBottom),
    desktopBottom: round(desktopBottom),
    dotsTop: round(dotsTop),
    dotsBottom: round(dotsBottom),
    dockTop: round(dockTop),
    dockBottom: round(dockBottom),
    dockVisibleHeight: round(dockVisibleHeight),
    footerTop: round(footerTop),
    footerBottom: round(footerBottom),
    canvasBottom: round(canvasBottom),
  };
}

export function sameMobileHomeGeometryAudit(a: MobileHomeGeometryAudit | null, b: MobileHomeGeometryAudit | null, tolerance = 1) {
  if (!a || !b || a.valid !== b.valid || a.reasons.join("|") !== b.reasons.join("|")) return false;
  return ["visualBottom", "desktopBottom", "dotsTop", "dotsBottom", "dockTop", "dockBottom", "dockVisibleHeight", "footerTop", "footerBottom", "canvasBottom"].every((key) =>
    Math.abs(a[key as keyof Pick<MobileHomeGeometryAudit, "visualBottom" | "desktopBottom" | "dotsTop" | "dotsBottom" | "dockTop" | "dockBottom" | "dockVisibleHeight" | "footerTop" | "footerBottom" | "canvasBottom">] - b[key as keyof Pick<MobileHomeGeometryAudit, "visualBottom" | "desktopBottom" | "dotsTop" | "dockTop" | "dockBottom">]) <= tolerance
  );
}
