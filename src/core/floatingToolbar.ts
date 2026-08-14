export interface FloatingToolbarPlacementInput {
  viewportWidth: number;
  viewportHeight: number;
  anchorX: number;
  anchorTop: number;
  anchorBottom: number;
  toolbarWidth: number;
  toolbarHeight: number;
  margin?: number;
  gap?: number;
  minimumHeight?: number;
}

export interface FloatingToolbarPlacement {
  x: number;
  y: number;
  placement: "above" | "below";
  arrowX: number;
  maxHeight: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function placeFloatingToolbar(input: FloatingToolbarPlacementInput): FloatingToolbarPlacement {
  const margin = input.margin ?? 8, gap = input.gap ?? 8, minimumHeight = input.minimumHeight ?? 44;
  const width = Math.min(Math.max(0, input.toolbarWidth), Math.max(0, input.viewportWidth - margin * 2));
  const naturalHeight = Math.max(minimumHeight, input.toolbarHeight);
  const aboveSpace = Math.max(0, input.anchorTop - margin - gap), belowSpace = Math.max(0, input.viewportHeight - input.anchorBottom - margin - gap);
  const placement: FloatingToolbarPlacement["placement"] = naturalHeight <= aboveSpace || aboveSpace >= belowSpace ? "above" : "below";
  const available = placement === "above" ? aboveSpace : belowSpace;
  const maxHeight = Math.max(minimumHeight, Math.min(naturalHeight, available || minimumHeight));
  const visibleHeight = Math.min(naturalHeight, maxHeight);
  const x = clamp(input.anchorX - width / 2, margin, Math.max(margin, input.viewportWidth - width - margin));
  const y = placement === "above"
    ? Math.max(margin, input.anchorTop - gap - visibleHeight)
    : Math.max(margin, Math.min(input.viewportHeight - margin - visibleHeight, input.anchorBottom + gap));
  return { x, y, placement, maxHeight, arrowX: clamp(input.anchorX - x, 14, Math.max(14, width - 14)) };
}
