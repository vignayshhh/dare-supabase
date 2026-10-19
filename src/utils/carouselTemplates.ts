// ---------------------------------------------------------------------------
// carouselTemplates — aesthetic template compositor for feed carousel posts.
//
// Feed posts store plain image URLs (media_urls), so templates are baked into
// the image pixels client-side with canvas before upload. Every template
// defines two treatments: "cover" (first slide — gets the big title) and
// "slide" (all following slides — gets index/frame accents). All artwork is
// vector-drawn (no external assets) and uses the same system font stacks as
// the story text styles in globals.css.
// ---------------------------------------------------------------------------

export type TemplateRole = "cover" | "slide";

export interface CarouselTemplate {
  id: string;
  name: string;
  tagline: string;
  /** Colors used by the picker chip in the create screen. */
  swatch: { bg: string; fg: string; accent: string };
}

export const CAROUSEL_TEMPLATES: CarouselTemplate[] = [
  {
    id: "polaroid",
    name: "Polaroid",
    tagline: "instant film + tape",
    swatch: { bg: "#f6f1e7", fg: "#2b2b2b", accent: "#e8b4b8" },
  },
  {
    id: "film",
    name: "Film",
    tagline: "35mm frames",
    swatch: { bg: "#0a0a0a", fg: "#fbbf24", accent: "#e8e8e8" },
  },
  {
    id: "y2k",
    name: "Y2K",
    tagline: "gloss + sparkles",
    swatch: { bg: "#b388ff", fg: "#ffffff", accent: "#ff9ecb" },
  },
  {
    id: "zine",
    name: "Zine",
    tagline: "cut + paste punk",
    swatch: { bg: "#f2ede3", fg: "#111111", accent: "#4ade80" },
  },
  {
    id: "soft",
    name: "Minimal",
    tagline: "clean editorial",
    swatch: { bg: "#1c1c1c", fg: "#ffffff", accent: "#9ca3af" },
  },
];

export interface TemplateRenderOptions {
  templateId: string;
  role: TemplateRole;
  /** Cover title. Empty string = skip the title block. */
  title: string;
  username: string;
  /** Pre-formatted date label, e.g. "Jul 7, 2026". */
  date: string;
  /** 0-based slide index. */
  index: number;
  total: number;
}

const OUT_W = 1080;
const OUT_H = 1350; // 4:5 — close to the feed card ratio so crops stay minor

const FONT_DECO = 'Impact, "Arial Black", "Segoe UI", sans-serif';
const FONT_BUBBLE =
  '"Arial Rounded MT Bold", "Trebuchet MS", "Segoe UI", system-ui, sans-serif';
const FONT_MONO =
  'ui-monospace, SFMono-Regular, Menlo, Consolas, "Courier New", monospace';
const FONT_SERIF = 'Georgia, Cambria, "Times New Roman", Times, serif';
const FONT_SCRIPT = '"Segoe Script", "Comic Sans MS", "Comic Sans", cursive';

// Deterministic per-slide jitter so re-renders (preview vs upload) match.
const jitter = (index: number, salt: number) => {
  const x = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x); // 0..1
};

const loadImage = (source: Blob): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to decode image for template."));
    };
    img.src = url;
  });

const roundRectPath = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) => {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
};

/** cover-fit draw of img into rect, optional rounded clip. */
const drawImageCover = (
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  radius = 0,
) => {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.naturalWidth - sw) / 2;
  const sy = (img.naturalHeight - sh) / 2;
  ctx.save();
  if (radius > 0) {
    roundRectPath(ctx, x, y, w, h, radius);
    ctx.clip();
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
};

/** Shrinks font size until text fits maxWidth. Returns the size used. */
const fitText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  fontTemplate: (size: number) => string,
  startSize: number,
  minSize: number,
  maxWidth: number,
) => {
  let size = startSize;
  ctx.font = fontTemplate(size);
  while (size > minSize && ctx.measureText(text).width > maxWidth) {
    size -= 4;
    ctx.font = fontTemplate(size);
  }
  return size;
};

const drawSparkle = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
) => {
  // 4-point star: fat vertical/horizontal spikes with pinched waist.
  const waist = r * 0.18;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.quadraticCurveTo(cx + waist, cy - waist, cx + r, cy);
  ctx.quadraticCurveTo(cx + waist, cy + waist, cx, cy + r);
  ctx.quadraticCurveTo(cx - waist, cy + waist, cx - r, cy);
  ctx.quadraticCurveTo(cx - waist, cy - waist, cx, cy - r);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

const drawTapeStrip = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  angle: number,
) => {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillStyle = "rgba(255,244,214,0.6)";
  ctx.shadowColor = "rgba(0,0,0,0.12)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.restore();
};

// ---------------------------------------------------------------------------
// Template painters
// ---------------------------------------------------------------------------

type Painter = (
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  o: TemplateRenderOptions,
) => void;

const paintPolaroid: Painter = (ctx, img, o) => {
  const isCover = o.role === "cover";

  // warm paper background + soft vignette
  ctx.fillStyle = "#f6f1e7";
  ctx.fillRect(0, 0, OUT_W, OUT_H);
  const vg = ctx.createRadialGradient(
    OUT_W / 2,
    OUT_H / 2,
    OUT_H * 0.35,
    OUT_W / 2,
    OUT_H / 2,
    OUT_H * 0.75,
  );
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(120,100,70,0.10)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, OUT_W, OUT_H);

  // instant-photo card, slightly rotated
  const rot = ((isCover ? -1.2 : o.index % 2 ? 1.5 : -1.5) * Math.PI) / 180;
  const cardW = 880;
  const photoH = 860;
  const capH = isCover ? 260 : 180;
  const cardH = photoH + capH + 64; // 32px photo margin top + sides
  const cardX = (OUT_W - cardW) / 2;
  const cardY = (OUT_H - cardH) / 2 - 20;

  ctx.save();
  ctx.translate(OUT_W / 2, OUT_H / 2);
  ctx.rotate(rot);
  ctx.translate(-OUT_W / 2, -OUT_H / 2);

  ctx.save();
  ctx.shadowColor = "rgba(60,45,25,0.35)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = "#fffdf8";
  ctx.fillRect(cardX, cardY, cardW, cardH);
  ctx.restore();

  drawImageCover(ctx, img, cardX + 32, cardY + 32, cardW - 64, photoH);

  // caption strip text
  const textCX = OUT_W / 2;
  const stripTop = cardY + 32 + photoH;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (isCover) {
    const title = o.title.trim();
    ctx.fillStyle = "#2b2b2b";
    if (title) {
      const size = fitText(
        ctx,
        title,
        (s) => `700 ${s}px ${FONT_SCRIPT}`,
        68,
        36,
        cardW - 120,
      );
      ctx.font = `700 ${size}px ${FONT_SCRIPT}`;
      ctx.fillText(title, textCX, stripTop + capH * 0.42);
    }
    ctx.font = `800 26px ${FONT_MONO}`;
    ctx.fillStyle = "#8a8378";
    ctx.fillText(
      `${o.date}  ·  @${o.username}`,
      textCX,
      stripTop + capH * (title ? 0.78 : 0.5),
    );
  } else {
    ctx.fillStyle = "#3a3a3a";
    ctx.font = `700 46px ${FONT_SCRIPT}`;
    ctx.fillText(`no. ${o.index + 1}`, textCX, stripTop + capH * 0.42);
    ctx.font = `800 22px ${FONT_MONO}`;
    ctx.fillStyle = "#9a9388";
    ctx.fillText(`${o.index + 1} / ${o.total}`, textCX, stripTop + capH * 0.78);
  }
  ctx.restore();

  // tape strips pinning the corners (over everything, unrotated feel)
  const tj = jitter(o.index, 3) * 0.2 - 0.1;
  drawTapeStrip(ctx, cardX + 40, cardY + 8, 220, 64, -0.42 + tj);
  drawTapeStrip(ctx, cardX + cardW - 40, cardY + 12, 220, 64, 0.38 - tj);
};

const paintFilm: Painter = (ctx, img, o) => {
  const isCover = o.role === "cover";
  const STRIP_H = 130;

  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, OUT_W, OUT_H);

  drawImageCover(ctx, img, 0, STRIP_H, OUT_W, OUT_H - STRIP_H * 2);

  // sprocket strips
  const drawStrip = (y: number) => {
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, y, OUT_W, STRIP_H);
    ctx.fillStyle = "#e8e8e8";
    const holeW = 52;
    const holeH = 36;
    const gap = 96;
    for (let x = 36; x + holeW < OUT_W - 20; x += gap) {
      roundRectPath(ctx, x, y + (STRIP_H - holeH) / 2, holeW, holeH, 10);
      ctx.fill();
    }
  };
  drawStrip(0);
  drawStrip(OUT_H - STRIP_H);

  // edge markings
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `800 22px ${FONT_MONO}`;
  ctx.fillStyle = "#fbbf24";
  ctx.fillText("DARE FILM 400", 36, OUT_H - STRIP_H - 26);
  ctx.textAlign = "right";
  ctx.fillText(
    `#${String(o.index + 1).padStart(2, "0")}`,
    OUT_W - 36,
    STRIP_H + 34,
  );

  // scrim + text
  const scrim = ctx.createLinearGradient(0, OUT_H - STRIP_H - 360, 0, OUT_H - STRIP_H);
  scrim.addColorStop(0, "rgba(0,0,0,0)");
  scrim.addColorStop(1, "rgba(0,0,0,0.72)");
  ctx.fillStyle = scrim;
  ctx.fillRect(0, OUT_H - STRIP_H - 360, OUT_W, 360);

  ctx.textAlign = "left";
  if (isCover) {
    const title = o.title.trim().toUpperCase();
    if (title) {
      const size = fitText(
        ctx,
        title,
        (s) => `900 ${s}px ${FONT_DECO}`,
        92,
        44,
        OUT_W - 120,
      );
      ctx.font = `900 ${size}px ${FONT_DECO}`;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(title, 60, OUT_H - STRIP_H - 130);
    }
    ctx.font = `800 28px ${FONT_MONO}`;
    ctx.fillStyle = "#fbbf24";
    ctx.fillText(
      `${o.date.toUpperCase()}  ·  @${o.username.toUpperCase()}`,
      60,
      OUT_H - STRIP_H - (title ? 62 : 100),
    );
  } else {
    ctx.font = `800 30px ${FONT_MONO}`;
    ctx.fillStyle = "#fbbf24";
    ctx.fillText(
      `FRAME ${String(o.index + 1).padStart(2, "0")} / ${String(o.total).padStart(2, "0")}`,
      60,
      OUT_H - STRIP_H - 62,
    );
  }
};

const paintY2k: Painter = (ctx, img, o) => {
  const isCover = o.role === "cover";

  // candy gradient frame
  const bg = ctx.createLinearGradient(0, 0, OUT_W, OUT_H);
  bg.addColorStop(0, "#ff9ecb");
  bg.addColorStop(0.5, "#b388ff");
  bg.addColorStop(1, "#7cf5ff");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, OUT_W, OUT_H);

  // inset photo with chunky white border + glow
  const inset = 64;
  ctx.save();
  ctx.shadowColor = "rgba(255,255,255,0.55)";
  ctx.shadowBlur = 46;
  ctx.fillStyle = "#ffffff";
  roundRectPath(
    ctx,
    inset - 12,
    inset - 12,
    OUT_W - (inset - 12) * 2,
    OUT_H - (inset - 12) * 2,
    56,
  );
  ctx.fill();
  ctx.restore();
  drawImageCover(
    ctx,
    img,
    inset,
    inset,
    OUT_W - inset * 2,
    OUT_H - inset * 2,
    44,
  );

  // bottom scrim inside photo for text
  const scrimTop = OUT_H - inset - 320;
  const scrim = ctx.createLinearGradient(0, scrimTop, 0, OUT_H - inset);
  scrim.addColorStop(0, "rgba(60,20,90,0)");
  scrim.addColorStop(1, "rgba(60,20,90,0.66)");
  ctx.save();
  roundRectPath(ctx, inset, inset, OUT_W - inset * 2, OUT_H - inset * 2, 44);
  ctx.clip();
  ctx.fillStyle = scrim;
  ctx.fillRect(inset, scrimTop, OUT_W - inset * 2, 320 + inset);
  ctx.restore();

  // sparkles on the frame (deterministic)
  const sparkleSpots: Array<[number, number, number]> = [
    [inset - 10, inset + 120, 30],
    [OUT_W - inset + 8, inset + 60, 24],
    [OUT_W - inset + 4, OUT_H * 0.55, 34],
    [inset - 6, OUT_H - inset - 140, 26],
    [OUT_W * 0.5, inset - 14, 22],
  ];
  sparkleSpots.forEach(([sx, sy, sr], k) => {
    const wob = jitter(o.index, k) * 10 - 5;
    drawSparkle(ctx, sx + wob, sy + wob, sr, "#ffffff");
  });

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  if (isCover) {
    const title = o.title.trim();
    if (title) {
      const size = fitText(
        ctx,
        title,
        (s) => `900 ${s}px ${FONT_BUBBLE}`,
        88,
        40,
        OUT_W - inset * 2 - 100,
      );
      ctx.font = `900 ${size}px ${FONT_BUBBLE}`;
      ctx.save();
      ctx.shadowColor = "rgba(120,60,200,0.9)";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 6;
      ctx.lineWidth = 10;
      ctx.strokeStyle = "rgba(90,40,160,0.85)";
      ctx.strokeText(title, OUT_W / 2, OUT_H - inset - 120);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(title, OUT_W / 2, OUT_H - inset - 120);
      ctx.restore();
    }
    ctx.font = `900 30px ${FONT_BUBBLE}`;
    ctx.fillStyle = "#ffe3f2";
    ctx.fillText(
      `♡ @${o.username} · ${o.date}`,
      OUT_W / 2,
      OUT_H - inset - (title ? 52 : 90),
    );
  } else {
    // index star badge, top-right on the photo
    const bx = OUT_W - inset - 92;
    const by = inset + 92;
    drawSparkle(ctx, bx, by, 78, "#ffffff");
    ctx.font = `900 44px ${FONT_BUBBLE}`;
    ctx.fillStyle = "#b388ff";
    ctx.textBaseline = "middle";
    ctx.fillText(String(o.index + 1), bx, by + 2);
    ctx.textBaseline = "alphabetic";
    ctx.font = `900 30px ${FONT_BUBBLE}`;
    ctx.fillStyle = "#ffe3f2";
    ctx.fillText(
      `♡ ${o.index + 1} of ${o.total} ♡`,
      OUT_W / 2,
      OUT_H - inset - 60,
    );
  }
};

const paintZine: Painter = (ctx, img, o) => {
  const isCover = o.role === "cover";

  ctx.fillStyle = "#f2ede3";
  ctx.fillRect(0, 0, OUT_W, OUT_H);

  // thick punk border
  ctx.strokeStyle = "#111111";
  ctx.lineWidth = 16;
  ctx.strokeRect(34, 34, OUT_W - 68, OUT_H - 68);
  ctx.lineWidth = 3;
  ctx.strokeRect(58, 58, OUT_W - 116, OUT_H - 116);

  // pasted photo, slight alternating tilt, hard black frame
  const rot = ((o.index % 2 ? 1.6 : -1.6) * Math.PI) / 180;
  const pw = 840;
  const ph = isCover ? 760 : 920;
  const px = (OUT_W - pw) / 2;
  const py = isCover ? 300 : 190;
  ctx.save();
  ctx.translate(px + pw / 2, py + ph / 2);
  ctx.rotate(rot);
  ctx.translate(-(px + pw / 2), -(py + ph / 2));
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.28)";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 14;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = "#111111";
  ctx.fillRect(px - 8, py - 8, pw + 16, ph + 16);
  ctx.restore();
  drawImageCover(ctx, img, px, py, pw, ph);
  ctx.restore();

  ctx.textBaseline = "alphabetic";
  if (isCover) {
    // marker highlight + giant masthead title
    const title = o.title.trim().toUpperCase();
    if (title) {
      const size = fitText(
        ctx,
        title,
        (s) => `900 ${s}px ${FONT_DECO}`,
        120,
        54,
        OUT_W - 180,
      );
      ctx.font = `900 ${size}px ${FONT_DECO}`;
      const tw = ctx.measureText(title).width;
      ctx.fillStyle = "#4ade80";
      ctx.fillRect(OUT_W / 2 - tw / 2 - 18, 130, tw + 36, size * 0.82);
      ctx.fillStyle = "#111111";
      ctx.textAlign = "center";
      ctx.fillText(title, OUT_W / 2, 130 + size * 0.72);
    } else {
      ctx.font = `900 64px ${FONT_DECO}`;
      ctx.textAlign = "center";
      ctx.fillStyle = "#111111";
      ctx.fillText(`VOL. ${o.total}`, OUT_W / 2, 210);
    }

    // issue line + barcode
    ctx.font = `800 26px ${FONT_MONO}`;
    ctx.textAlign = "left";
    ctx.fillText(`ISSUE · ${o.date.toUpperCase()}`, 76, OUT_H - 96);
    ctx.fillText(`BY @${o.username.toUpperCase()}`, 76, OUT_H - 130);
    let bx = OUT_W - 96;
    for (let k = 0; k < 26; k++) {
      const bw = 3 + jitter(k, 7) * 8;
      bx -= bw + 5;
      ctx.fillRect(bx, OUT_H - 156, bw, 72);
    }
  } else {
    // giant outlined page number bleeding off the corner
    ctx.font = `900 340px ${FONT_DECO}`;
    ctx.textAlign = "right";
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = 5;
    ctx.strokeText(String(o.index + 1), OUT_W - 52, OUT_H - 64);
    ctx.font = `800 26px ${FONT_MONO}`;
    ctx.textAlign = "left";
    ctx.fillStyle = "#111111";
    ctx.fillText(
      `PAGE ${o.index + 1} / ${o.total}`,
      76,
      OUT_H - 96,
    );
  }
};

const paintSoft: Painter = (ctx, img, o) => {
  const isCover = o.role === "cover";

  drawImageCover(ctx, img, 0, 0, OUT_W, OUT_H);

  // editorial hairline frame
  ctx.strokeStyle = "rgba(255,255,255,0.65)";
  ctx.lineWidth = 2;
  ctx.strokeRect(40, 40, OUT_W - 80, OUT_H - 80);

  // bottom scrim
  const scrim = ctx.createLinearGradient(0, OUT_H - 460, 0, OUT_H);
  scrim.addColorStop(0, "rgba(0,0,0,0)");
  scrim.addColorStop(1, "rgba(0,0,0,0.72)");
  ctx.fillStyle = scrim;
  ctx.fillRect(0, OUT_H - 460, OUT_W, 460);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  if (isCover) {
    ctx.font = `800 26px ${FONT_MONO}`;
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    const overline = `@${o.username.toUpperCase()}  ·  ${o.date.toUpperCase()}`;
    // manual letterspacing for the overline
    let ox = 76;
    for (const ch of overline) {
      ctx.fillText(ch, ox, OUT_H - 190);
      ox += ctx.measureText(ch).width + 4;
    }
    const title = o.title.trim();
    if (title) {
      const size = fitText(
        ctx,
        title,
        (s) => `italic 800 ${s}px ${FONT_SERIF}`,
        88,
        42,
        OUT_W - 152,
      );
      ctx.font = `italic 800 ${size}px ${FONT_SERIF}`;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(title, 72, OUT_H - 92);
    }
  } else {
    ctx.font = `800 28px ${FONT_MONO}`;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(`${o.index + 1} — ${o.total}`, 76, OUT_H - 96);
    // slide progress ticks
    const tickW = 34;
    for (let k = 0; k < o.total; k++) {
      ctx.fillStyle =
        k === o.index ? "#ffffff" : "rgba(255,255,255,0.35)";
      ctx.fillRect(76 + k * (tickW + 10), OUT_H - 74, tickW, 4);
    }
  }
};

const PAINTERS: Record<string, Painter> = {
  polaroid: paintPolaroid,
  film: paintFilm,
  y2k: paintY2k,
  zine: paintZine,
  soft: paintSoft,
};

// ---------------------------------------------------------------------------
// Public renderers
// ---------------------------------------------------------------------------

const renderToCanvas = async (
  source: Blob,
  opts: TemplateRenderOptions,
): Promise<HTMLCanvasElement> => {
  const painter = PAINTERS[opts.templateId];
  if (!painter) throw new Error(`Unknown carousel template: ${opts.templateId}`);
  const img = await loadImage(source);
  const canvas = document.createElement("canvas");
  canvas.width = OUT_W;
  canvas.height = OUT_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  painter(ctx, img, opts);
  return canvas;
};

/** Full-res composited image for upload. */
export const renderTemplateImage = async (
  source: Blob,
  opts: TemplateRenderOptions,
): Promise<Blob> => {
  const canvas = await renderToCanvas(source, opts);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Template render failed.")),
      "image/jpeg",
      0.92,
    );
  });
};

/** Half-res object URL for the create-screen live preview. Caller revokes. */
export const renderTemplatePreviewUrl = async (
  source: Blob,
  opts: TemplateRenderOptions,
): Promise<string> => {
  const full = await renderToCanvas(source, opts);
  const half = document.createElement("canvas");
  half.width = OUT_W / 2;
  half.height = OUT_H / 2;
  const ctx = half.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(full, 0, 0, half.width, half.height);
  return new Promise((resolve, reject) => {
    half.toBlob(
      (blob) =>
        blob
          ? resolve(URL.createObjectURL(blob))
          : reject(new Error("Template preview failed.")),
      "image/jpeg",
      0.85,
    );
  });
};

export const formatTemplateDate = (d = new Date()) =>
  d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
