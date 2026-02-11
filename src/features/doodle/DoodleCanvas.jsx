/* eslint-disable no-unused-vars */
import { useEffect, useMemo, useRef, useState } from 'react';

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function hexToRgb(hex) {
  const h = String(hex || '')
    .replace('#', '')
    .trim();
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function rgbToHex({ r, g, b }) {
  const to2 = (n) => n.toString(16).padStart(2, '0');
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

// HSV -> RGB (s=1,v=1 for hue slider)
function hueToHex(h) {
  const c = 1;
  const x = 1 - Math.abs(((h / 60) % 2) - 1);
  let rp = 0,
    gp = 0,
    bp = 0;

  if (h < 60) [rp, gp, bp] = [c, x, 0];
  else if (h < 120) [rp, gp, bp] = [x, c, 0];
  else if (h < 180) [rp, gp, bp] = [0, c, x];
  else if (h < 240) [rp, gp, bp] = [0, x, c];
  else if (h < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];

  return rgbToHex({
    r: Math.round(rp * 255),
    g: Math.round(gp * 255),
    b: Math.round(bp * 255),
  });
}

export default function DoodleCanvas({
  width = 640,
  height = 640,
  strokeWidth = 10,
  onChangePngBlob,

  // Optional: allow parent to render submit below canvas
  onSubmit, // () => void
  canSubmit = false,
  submitLabel = 'Submit',
  submitting = false,
}) {
  const canvasRef = useRef(null);

  const drawingRef = useRef(false);
  const lastPointRef = useRef({ x: 0, y: 0 });
  const startPointRef = useRef(null);
  const movedRef = useRef(false);

  const undoRef = useRef([]); // ImageData[]
  const redoRef = useRef([]); // ImageData[]
  const exportTimerRef = useRef(null);

  const dpr = useMemo(() => window.devicePixelRatio || 1, []);
  const TAP_MOVE_THRESHOLD = 4; // css px

  // Tools
  const [tool, setTool] = useState('brush'); // brush | eraser | fill | pick
  const [brushSize, setBrushSize] = useState(strokeWidth);

  const [color, setColor] = useState('#111111');
  const [hue, setHue] = useState(220);

  // Fill tuning
  const [fillTolerance, setFillTolerance] = useState(35);
  const [fillDiagonals, setFillDiagonals] = useState(true);

  useEffect(() => {
    setColor(hueToHex(hue));
  }, [hue]);

  function getCtx() {
    const c = canvasRef.current;
    if (!c) return null;
    return c.getContext('2d');
  }

  function getBackingSize() {
    const c = canvasRef.current;
    if (!c) return { w: 0, h: 0 };
    return { w: c.width, h: c.height };
  }

  function snapshot() {
    const ctx = getCtx();
    const c = canvasRef.current;
    if (!ctx || !c) return;
    const img = ctx.getImageData(0, 0, c.width, c.height);
    undoRef.current.push(img);
    if (undoRef.current.length > 40) undoRef.current.shift();
    redoRef.current = [];
  }

  function restore(img) {
    const ctx = getCtx();
    if (!ctx) return;
    ctx.putImageData(img, 0, 0);
    scheduleExport();
  }

  function scheduleExport() {
    if (!onChangePngBlob) return;
    if (exportTimerRef.current) window.clearTimeout(exportTimerRef.current);
    exportTimerRef.current = window.setTimeout(() => {
      exportTimerRef.current = null;
      emitBlob();
    }, 120);
  }

  function emitBlob() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const octx = out.getContext('2d');

    octx.fillStyle = '#ffffff';
    octx.fillRect(0, 0, out.width, out.height);
    octx.drawImage(canvas, 0, 0);

    out.toBlob((blob) => {
      if (!blob) return;
      onChangePngBlob?.(blob);
    }, 'image/png');
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    snapshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, dpr]);

  useEffect(() => {
    const ctx = getCtx();
    if (!ctx) return;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = brushSize;

    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color;
    }
  }, [tool, color, brushSize]);

  function getPointFromEvent(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    const x = clamp(e.clientX - rect.left, 0, rect.width);
    const y = clamp(e.clientY - rect.top, 0, rect.height);

    const scaleX = width / rect.width;
    const scaleY = height / rect.height;

    return { x: x * scaleX, y: y * scaleY };
  }

  function drawDotAt(p) {
    const ctx = getCtx();
    if (!ctx) return;

    ctx.save();
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = color;
    }

    ctx.beginPath();
    ctx.arc(p.x, p.y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const lastStampRef = useRef({ x: 0, y: 0 });

  function stampCircle(p) {
    const ctx = getCtx();
    if (!ctx) return;

    ctx.save();
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = color;
    }

    ctx.beginPath();
    ctx.arc(p.x, p.y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Draw circles along the path so fast drags stay continuous
  function stampLine(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);

    // smaller spacing = smoother line
    const step = Math.max(1, brushSize * 0.35);
    const steps = Math.max(1, Math.floor(dist / step));

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      stampCircle({ x: a.x + dx * t, y: a.y + dy * t });
    }
  }

  function eyedropperAtCss(xCss, yCss) {
    const ctx = getCtx();
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;

    const { w, h } = getBackingSize();
    const x = clamp(Math.floor(xCss * dpr), 0, w - 1);
    const y = clamp(Math.floor(yCss * dpr), 0, h - 1);

    const img = ctx.getImageData(x, y, 1, 1);
    const [r, g, b] = img.data;
    setColor(rgbToHex({ r, g, b }));
    setTool('brush');
  }

  function bucketFillCss(xCss, yCss) {
    const ctx = getCtx();
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;

    const { w, h } = getBackingSize();
    const x0 = clamp(Math.floor(xCss * dpr), 0, w - 1);
    const y0 = clamp(Math.floor(yCss * dpr), 0, h - 1);

    const img = ctx.getImageData(0, 0, w, h);
    const data = img.data;

    const i0 = (y0 * w + x0) * 4;
    const target = {
      r: data[i0],
      g: data[i0 + 1],
      b: data[i0 + 2],
      a: data[i0 + 3],
    };

    const fillRGB = tool === 'eraser' ? hexToRgb('#ffffff') : hexToRgb(color);
    const fill = { r: fillRGB.r, g: fillRGB.g, b: fillRGB.b, a: 255 };

    const tol = clamp(fillTolerance, 0, 160);
    const tolSq = tol * tol;

    const distSq = (idx, t) => {
      const dr = data[idx] - t.r;
      const dg = data[idx + 1] - t.g;
      const db = data[idx + 2] - t.b;
      const da = data[idx + 3] - t.a;
      return dr * dr + dg * dg + db * db + da * da;
    };

    const isTarget = (idx) => distSq(idx, target) <= tolSq;
    const isAlreadyFill = (idx) =>
      data[idx] === fill.r &&
      data[idx + 1] === fill.g &&
      data[idx + 2] === fill.b &&
      data[idx + 3] === fill.a;

    if (isAlreadyFill(i0) || distSq(i0, fill) <= tolSq) return;

    const setFill = (idx) => {
      data[idx] = fill.r;
      data[idx + 1] = fill.g;
      data[idx + 2] = fill.b;
      data[idx + 3] = fill.a;
    };

    const stack = [[x0, y0]];
    const useDiag = !!fillDiagonals;

    while (stack.length) {
      const [xStart, y] = stack.pop();

      let x = xStart;
      let idx = (y * w + x) * 4;

      while (x >= 0 && isTarget(idx) && !isAlreadyFill(idx)) {
        x--;
        idx -= 4;
      }
      x++;
      idx += 4;

      let spanUp = false;
      let spanDown = false;

      while (x < w && isTarget(idx) && !isAlreadyFill(idx)) {
        setFill(idx);

        if (y > 0) {
          const upIdx = ((y - 1) * w + x) * 4;
          const ok = isTarget(upIdx) && !isAlreadyFill(upIdx);
          if (!spanUp && ok) {
            stack.push([x, y - 1]);
            spanUp = true;
          } else if (spanUp && !ok) spanUp = false;
        }

        if (y < h - 1) {
          const dnIdx = ((y + 1) * w + x) * 4;
          const ok = isTarget(dnIdx) && !isAlreadyFill(dnIdx);
          if (!spanDown && ok) {
            stack.push([x, y + 1]);
            spanDown = true;
          } else if (spanDown && !ok) spanDown = false;
        }

        if (useDiag) {
          if (y > 0 && x > 0) {
            const ul = ((y - 1) * w + (x - 1)) * 4;
            if (isTarget(ul) && !isAlreadyFill(ul)) stack.push([x - 1, y - 1]);
          }
          if (y > 0 && x < w - 1) {
            const ur = ((y - 1) * w + (x + 1)) * 4;
            if (isTarget(ur) && !isAlreadyFill(ur)) stack.push([x + 1, y - 1]);
          }
          if (y < h - 1 && x > 0) {
            const dl = ((y + 1) * w + (x - 1)) * 4;
            if (isTarget(dl) && !isAlreadyFill(dl)) stack.push([x - 1, y + 1]);
          }
          if (y < h - 1 && x < w - 1) {
            const dr = ((y + 1) * w + (x + 1)) * 4;
            if (isTarget(dr) && !isAlreadyFill(dr)) stack.push([x + 1, y + 1]);
          }
        }

        x++;
        idx += 4;
      }
    }

    // Edge-seal pass for tiny anti-alias gaps
    const sealPasses = 2;
    const nearTargetOrTransparent = (idx) => {
      const d = distSq(idx, target);
      return d <= tolSq * 2 || data[idx + 3] < 230;
    };

    for (let pass = 0; pass < sealPasses; pass++) {
      const prev = new Uint8ClampedArray(data);
      const prevIsFill = (idx) =>
        prev[idx] === fill.r &&
        prev[idx + 1] === fill.g &&
        prev[idx + 2] === fill.b &&
        prev[idx + 3] === fill.a;

      for (let yy = 1; yy < h - 1; yy++) {
        const row = yy * w * 4;
        for (let xx = 1; xx < w - 1; xx++) {
          const idx = row + xx * 4;
          if (prevIsFill(idx)) continue;

          const left = idx - 4;
          const right = idx + 4;
          const up = idx - w * 4;
          const down = idx + w * 4;

          if (
            (prevIsFill(left) ||
              prevIsFill(right) ||
              prevIsFill(up) ||
              prevIsFill(down)) &&
            nearTargetOrTransparent(idx)
          ) {
            data[idx] = fill.r;
            data[idx + 1] = fill.g;
            data[idx + 2] = fill.b;
            data[idx + 3] = fill.a;
          }
        }
      }
    }

    ctx.putImageData(img, 0, 0);
  }

  function startDraw(e) {
    e.preventDefault();
    const ctx = getCtx();
    if (!ctx) return;

    const p = getPointFromEvent(e);

    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }

    if (tool === 'pick') {
      eyedropperAtCss(p.x, p.y);
      scheduleExport();
      return;
    }

    if (tool === 'fill') {
      snapshot();
      bucketFillCss(p.x, p.y);
      scheduleExport();
      return;
    }

    drawingRef.current = true;
    startPointRef.current = p;
    lastPointRef.current = p;
    lastStampRef.current = p;
    movedRef.current = false;

    // stamp once so initial contact is solid
    stampCircle(p);

    // (optional) keep a path open, but stamping is doing the real work
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function moveDraw(e) {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = getCtx();
    if (!ctx) return;

    const p = getPointFromEvent(e);
    const last = lastPointRef.current;

    const sp = startPointRef.current;
    if (sp && !movedRef.current) {
      const dx = p.x - sp.x;
      const dy = p.y - sp.y;
      if (Math.hypot(dx, dy) >= TAP_MOVE_THRESHOLD) movedRef.current = true;
    }

    if (movedRef.current) {
      const last = lastStampRef.current;
      stampLine(last, p);
      lastStampRef.current = p;
    }
    lastPointRef.current = p;
  }

  function endDraw(e) {
    if (!drawingRef.current) return;
    e.preventDefault();

    drawingRef.current = false;
    const sp = startPointRef.current;

    snapshot();
    if (sp && !movedRef.current) drawDotAt(sp);
    scheduleExport();

    startPointRef.current = null;
    movedRef.current = false;
  }

  function clear() {
    const ctx = getCtx();
    if (!ctx) return;

    snapshot();

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    scheduleExport();
  }

  function undo() {
    const stack = undoRef.current;
    if (stack.length <= 1) return;
    const cur = stack.pop();
    redoRef.current.push(cur);
    restore(stack[stack.length - 1]);
  }

  function redo() {
    const r = redoRef.current;
    if (r.length === 0) return;
    const img = r.pop();
    undoRef.current.push(img);
    restore(img);
  }

  const toolBtn = (active) => ({
    padding: '10px 12px',
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.18)',
    background: active ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.92)',
    fontWeight: 900,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    width: '100%',
    textAlign: 'left',
  });

  const sideBtn = () => ({
    padding: '10px 12px',
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.18)',
    background: 'rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.92)',
    fontWeight: 900,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    width: '100%',
  });

  const submitBtn = (enabled) => ({
    padding: '12px 16px',
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.18)',
    background: enabled ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.05)',
    color: enabled ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.45)',
    fontWeight: 1000,
    cursor: enabled ? 'pointer' : 'not-allowed',
    minWidth: 220,
  });

  return (
    <div
      style={{
        display: 'grid',
        gap: 14,
        justifyItems: 'center',
        width: '100%',
      }}
    >
      {/* Canvas row: tools left, canvas center, actions right */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(140px, 180px) auto minmax(140px, 180px)',
          gap: 14,
          alignItems: 'start',
          width: 'fit-content',
        }}
      >
        {/* LEFT TOOL PANEL */}
        <div
          style={{
            display: 'grid',
            gap: 10,
            padding: 12,
            borderRadius: 18,
            border: '1px solid rgba(255,255,255,0.14)',
            background: 'rgba(255,255,255,0.04)',
          }}
        >
          <div style={{ fontWeight: 1000, opacity: 0.9 }}>Tools</div>

          <div style={{ display: 'grid', gap: 8 }}>
            <button
              type="button"
              onClick={() => setTool('brush')}
              style={toolBtn(tool === 'brush')}
            >
              ✏️ Brush
            </button>
            <button
              type="button"
              onClick={() => setTool('eraser')}
              style={toolBtn(tool === 'eraser')}
            >
              🧽 Erase
            </button>
            <button
              type="button"
              onClick={() => setTool('fill')}
              style={toolBtn(tool === 'fill')}
            >
              🪣 Fill
            </button>
          </div>

          <div
            style={{
              height: 1,
              background: 'rgba(255,255,255,0.10)',
              margin: '6px 0',
            }}
          />

          {/* Color */}
          <div style={{ display: 'grid', gap: 8 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: 12, opacity: 0.75 }}>Color</span>
              <div
                style={{
                  width: 100,
                  height: 25,
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.18)',
                  background: tool === 'eraser' ? '#ffffff' : color,
                  position: 'relative',
                  overflow: 'hidden',
                }}
                title={tool === 'eraser' ? 'Eraser active' : `Color: ${color}`}
              >
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  disabled={tool === 'eraser'}
                  aria-label="Pick color"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    opacity: 0,
                    cursor: tool === 'eraser' ? 'not-allowed' : 'pointer',
                  }}
                />
              </div>
            </div>

            {/* Hue */}
            <div style={{ display: 'grid', gap: 6 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 12,
                  opacity: 0.75,
                }}
              >
                <span>Hue</span>
                <span>{hue}°</span>
              </div>
              <input
                className="dd-slider dd-hue"
                type="range"
                min={0}
                max={360}
                value={hue}
                onChange={(e) => setHue(Number(e.target.value))}
                disabled={tool === 'eraser'}
                aria-label="Hue"
              />
            </div>

            {/* Size */}
            <div style={{ display: 'grid', gap: 6 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 12,
                  opacity: 0.75,
                }}
              >
                <span>Size</span>
                <span>{brushSize}px</span>
              </div>
              <input
                className="dd-slider"
                type="range"
                min={2}
                max={42}
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                aria-label="Brush size"
              />
            </div>
          </div>
        </div>

        {/* CANVAS */}
        <canvas
          ref={canvasRef}
          onPointerDown={startDraw}
          onPointerMove={moveDraw}
          onPointerUp={endDraw}
          onPointerCancel={endDraw}
          style={{
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: 26,
            touchAction: 'none',
            background: '#fff',
            display: 'block',
          }}
        />

        {/* RIGHT ACTION PANEL */}
        <div
          style={{
            display: 'grid',
            gap: 10,
            padding: 12,
            borderRadius: 18,
            border: '1px solid rgba(255,255,255,0.14)',
            background: 'rgba(255,255,255,0.04)',
          }}
        >
          <div style={{ fontWeight: 1000, opacity: 0.9 }}>Actions</div>

          <button type="button" onClick={undo} style={sideBtn()}>
            ↩ Undo
          </button>
          <button type="button" onClick={redo} style={sideBtn()}>
            ↪ Redo
          </button>
          <button type="button" onClick={clear} style={sideBtn()}>
            🧼 Clear
          </button>
        </div>
      </div>

      {/* SUBMIT UNDER CANVAS */}
      {typeof onSubmit === 'function' && (
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit || submitting}
          style={submitBtn(canSubmit && !submitting)}
        >
          {submitting ? 'Submitting…' : submitLabel}
        </button>
      )}
    </div>
  );
}
