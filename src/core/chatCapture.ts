export function captureFileName(title: string, date = new Date()) {
  const safe = (title.trim() || "聊天")
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 60);
  const stamp = date.toISOString().replace(/[:.]/g, "-");
  return `${safe}-聊天截图-${stamp}.png`;
}

export async function waitForCaptureImages(
  root: HTMLElement,
  timeoutMs = 1500,
) {
  const images = [...root.querySelectorAll<HTMLImageElement>("img")];
  await Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          const wrapper = image.closest<HTMLElement>(".capture-image-shell");
          const finish = (failed = false) => {
            clearTimeout(timer);
            image.removeEventListener("load", loaded);
            image.removeEventListener("error", failedLoad);
            if (failed) wrapper?.classList.add("capture-image-unavailable");
            resolve();
          };
          const loaded = () => finish(image.naturalWidth <= 0);
          const failedLoad = () => finish(true);
          const timer = window.setTimeout(() => finish(true), timeoutMs);
          if (image.complete) {
            finish(image.naturalWidth <= 0);
            return;
          }
          image.addEventListener("load", loaded, { once: true });
          image.addEventListener("error", failedLoad, { once: true });
        }),
    ),
  );
}

export async function captureElementAsPng(
  element: HTMLElement,
  backgroundColor: string,
) {
  await waitForCaptureImages(element);
  const { default: html2canvas } = await import("html2canvas"),
    canvas = await html2canvas(element, {
      backgroundColor,
      scale: 2,
      useCORS: true,
      allowTaint: false,
      logging: false,
      imageTimeout: 1500,
    });
  try {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) throw new Error("capture_failed");
    return blob;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function shareOrDownloadCapture(
  blob: Blob,
  fileName: string,
  title: string,
) {
  const file = new File([blob], fileName, { type: "image/png" }),
    nav = navigator as Navigator & {
      canShare?: (data?: ShareData) => boolean;
      share?: (data?: ShareData) => Promise<void>;
    },
    shareData: ShareData = { files: [file], title };
  if (nav.share && nav.canShare?.(shareData)) {
    await nav.share(shareData);
    return "shared" as const;
  }
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    return "downloaded" as const;
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export function preloadChatCapture() {
  return import("html2canvas").then(() => undefined);
}
