import { useEffect, useRef, useState } from "react";

// Free pinch zoom and pan on the diagram, done through the svg's viewBox (so it stays crisp):
// the zoomed view is a sub-rectangle of the level's fitted box (`base`).
//  - touch: two fingers pinch around their midpoint and pan; while zoomed one finger pans too
//    (at an edge, the rest of the drag scrolls the frame sideways or the page, so nobody gets
//    stuck). At fit, one finger scrolls the page as before.
//  - desktop: trackpad pinch / Ctrl+scroll (wheel events with ctrlKey) and desktop Safari's
//    gesture events zoom around the pointer; while zoomed, a mouse drag pans.
// A pinch or drag never counts as a tap or click. Nothing starts while `busy()` (the drill-down
// animation owns the viewBox then), and reset() hands the viewBox back to it.

const MAX = 4; // deepest zoom, × the fitted view
const MIN_PINCH = 0.75; // how far a pinch may squeeze below fit before it springs back
const SLOP = 5; // px a press may wander and still be a tap or click
const SPRING_MS = 220;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pt = (e) => ({ clientX: e.clientX, clientY: e.clientY });
const gap = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
const mid = (a, b) => ({ clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2 });
const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function createZoom({ frame, svg, base, busy, onZoomed }) {
  let shown = null; // the box on view, or null for the fitted view
  let zoomed = false; // shown is zoomed in past fit (mirrored to React through onZoomed)
  let spring = 0; // token of the spring-back in flight
  let g = { mode: "none" }; // the gesture in progress: none | pinch | pan | drag
  let safari = null; // a desktop Safari trackpad pinch (gesture events)
  let touching = false;
  let moved = false; // this touch sequence pinched or panned, so it is not a tap
  let swallowUntil = 0; // a click before this time ends a gesture and is dropped
  let endDrag = null;

  const zoomOf = (b) => base()[2] / (b ?? base())[2];
  const write = (b) => svg()?.setAttribute("viewBox", (b ?? base()).join(" "));
  const setZoomed = (z) => {
    if (z === zoomed) return;
    zoomed = z;
    onZoomed(z);
  };
  const show = (b) => {
    shown = b;
    write(b);
    setZoomed(b !== null && zoomOf(b) > 1.001);
  };
  const stopSpring = () => ++spring;

  const rect = () => svg().getBoundingClientRect();
  // The svg point under client point c.
  const toSvg = (c, r = rect()) => {
    const b = shown ?? base();
    return [b[0] + ((c.clientX - r.left) / r.width) * b[2], b[1] + ((c.clientY - r.top) / r.height) * b[3]];
  };
  // Keeps a zoomed box inside the fitted one (a box bigger than it, mid-pinch, is centred).
  const inside = ([x, y, w, h]) => {
    const [bx, by, bw, bh] = base();
    return [
      w >= bw ? bx + (bw - w) / 2 : clamp(x, bx, bx + bw - w),
      h >= bh ? by + (bh - h) / 2 : clamp(y, by, by + bh - h),
      w,
      h,
    ];
  };
  // The box at zoom k that puts svg point p under client point c.
  const boxAt = (k, p, c, r = rect()) => {
    const [w, h] = [base()[2] / k, base()[3] / k];
    return inside([p[0] - ((c.clientX - r.left) / r.width) * w, p[1] - ((c.clientY - r.top) / r.height) * h, w, h]);
  };
  // Zoom to k (1 to MAX) keeping svg point p under client point c; 1 is the fitted view.
  const zoomTo = (k, p, c) => show(k <= 1.001 ? null : boxAt(k, p, c));

  // Pan by (dx, dy) px. chain: what an edge stops scrolls the frame sideways or the page.
  const panBy = (dx, dy, chain) => {
    if (!shown) return;
    const s = shown[2] / rect().width; // svg units per px
    const want = [shown[0] - dx * s, shown[1] - dy * s, shown[2], shown[3]];
    const got = inside(want);
    show(got);
    if (!chain) return;
    const [ox, oy] = [(want[0] - got[0]) / s, (want[1] - got[1]) / s];
    if (Math.abs(ox) > 0.5) frame().scrollLeft += ox;
    if (Math.abs(oy) > 0.5) window.scrollBy(0, oy);
  };

  // Eases the view to `target` (null: the fitted view).
  const springTo = (target) => {
    const token = stopSpring();
    if (!target) setZoomed(false);
    if (reduceMotion()) return show(target);
    const [from, to] = [shown ?? base(), target ?? base()];
    const t0 = performance.now();
    const tick = (now) => {
      if (token !== spring || busy()) return;
      const t = Math.min(1, (now - t0) / SPRING_MS);
      if (t >= 1) return show(target);
      const e = 1 - Math.pow(1 - t, 3);
      shown = from.map((v, i) => v + (to[i] - v) * e);
      write(shown);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  // After a gesture, a view squeezed to fit or below springs back to fit.
  const settle = () => {
    if (shown && zoomOf(shown) <= 1.001) springTo(null);
  };

  // Back to the fitted view (animate: ease there). While the drill-down runs it only forgets
  // the zoom, since the animation is writing the viewBox.
  const reset = (animate = false) => {
    g = { mode: "none" };
    safari = null;
    stopSpring();
    if (busy()) {
      shown = null;
      return setZoomed(false);
    }
    if (animate && shown) springTo(null);
    else show(null);
  };

  // --- touch ---------------------------------------------------------------------------------
  const startPinch = (ts) => {
    stopSpring();
    g = { mode: "pinch", d0: gap(ts[0], ts[1]) || 1, k0: zoomOf(shown), p0: toSvg(mid(ts[0], ts[1])) };
  };
  const startPan = (t) => {
    stopSpring();
    g = { mode: "pan", start: pt(t), last: pt(t) };
  };
  const onTouchStart = (e) => {
    const ts = e.touches;
    touching = true;
    if (ts.length === 1) moved = false;
    if (busy()) g = { mode: "none" };
    else if (ts.length >= 2) {
      moved = true;
      startPinch(ts);
    } else if (zoomed) startPan(ts[0]);
    else g = { mode: "none" }; // at fit, one finger scrolls the page
  };
  const onTouchMove = (e) => {
    const ts = e.touches;
    // Two fingers over the diagram are never the browser's (no page zoom, no tab overview).
    if (ts.length >= 2 && e.cancelable) e.preventDefault();
    if (g.mode === "pinch" && ts.length >= 2) {
      // Below fit the view stays squeezed (centred) until the fingers lift, then springs back.
      const k = clamp((g.k0 * gap(ts[0], ts[1])) / g.d0, MIN_PINCH, MAX);
      show(boxAt(k, g.p0, mid(ts[0], ts[1])));
    } else if (g.mode === "pan" && ts.length === 1) {
      const t = ts[0];
      if (!moved && gap(t, g.start) < SLOP) return;
      moved = true;
      if (e.cancelable) e.preventDefault();
      panBy(t.clientX - g.last.clientX, t.clientY - g.last.clientY, true);
      g.last = pt(t);
    }
  };
  const onTouchEnd = (e) => {
    const ts = e.touches;
    touching = ts.length > 0;
    if (ts.length >= 2) {
      if (g.mode !== "none") startPinch(ts);
    } else if (ts.length === 1 && g.mode !== "none" && zoomed) {
      startPan(ts[0]);
    } else {
      g = { mode: "none" };
      settle();
      if (!ts.length && moved) swallowUntil = performance.now() + 500;
    }
  };

  // --- trackpad pinch, Ctrl+scroll -----------------------------------------------------------
  const onWheel = (e) => {
    if (!e.ctrlKey) return; // plain scrolling stays the page's
    e.preventDefault(); // or the browser zooms the whole page
    if (busy() || safari) return;
    stopSpring();
    const px = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
    const k = Math.max(1, zoomOf(shown)) * Math.exp(-clamp(px, -50, 50) * 0.01);
    zoomTo(clamp(k, 1, MAX), toSvg(e), e);
  };
  // Safari: WebKit's own pinch events. On a touch screen the touch handlers zoom and these are
  // only blocked; desktop Safari's trackpad pinch comes only as these (e.scale).
  const onGestureStart = (e) => {
    e.preventDefault();
    if (touching || busy()) return;
    stopSpring();
    safari = { k0: Math.max(1, zoomOf(shown)), p0: toSvg(e) };
  };
  const onGestureChange = (e) => {
    e.preventDefault();
    if (!safari || busy()) return;
    zoomTo(clamp(safari.k0 * e.scale, 1, MAX), safari.p0, e);
  };
  const onGestureEnd = (e) => {
    e.preventDefault();
    safari = null;
  };

  // --- mouse drag (while zoomed) -------------------------------------------------------------
  const onPointerDown = (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0 || !zoomed || busy()) return;
    endDrag?.();
    stopSpring();
    const mine = { mode: "drag", start: pt(e), last: pt(e), dragging: false };
    g = mine;
    const move = (ev) => {
      if (g !== mine || !(ev.buttons & 1)) return end();
      if (!mine.dragging) {
        if (gap(ev, mine.start) < SLOP) return;
        mine.dragging = true;
      }
      panBy(ev.clientX - mine.last.clientX, ev.clientY - mine.last.clientY, false);
      mine.last = pt(ev);
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      if (mine.dragging) swallowUntil = performance.now() + 400;
      if (g === mine) g = { mode: "none" };
      if (endDrag === end) endDrag = null;
    };
    endDrag = end;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  // The click that ends a pinch, pan or drag doesn't reach the block under it.
  const onClick = (e) => {
    if (performance.now() < swallowUntil) {
      e.stopPropagation();
      e.preventDefault();
    }
    swallowUntil = 0;
  };

  const attach = () => {
    const f = frame();
    const active = { passive: false };
    const on = [
      ["touchstart", onTouchStart, { passive: true }],
      ["touchmove", onTouchMove, active],
      ["touchend", onTouchEnd],
      ["touchcancel", onTouchEnd],
      ["wheel", onWheel, active],
      ["gesturestart", onGestureStart, active],
      ["gesturechange", onGestureChange, active],
      ["gestureend", onGestureEnd, active],
      ["pointerdown", onPointerDown],
      ["click", onClick, true],
    ];
    for (const [type, fn, opts] of on) f.addEventListener(type, fn, opts);
    return () => {
      for (const [type, fn, opts] of on) f.removeEventListener(type, fn, opts);
      endDrag?.();
      stopSpring();
    };
  };

  return { attach, reset, isZoomed: () => zoomed };
}

// frameRef: the element gestures are taken on; svgRef: the svg whose viewBox zooms; base: the
// level's fitted viewBox (a change of level or layout resets the zoom); busyRef: true while the
// drill-down animation runs. Returns { zoomed, reset(animate), isZoomed() } (reset and
// isZoomed are stable).
export function useDiagramZoom({ frameRef, svgRef, base, busyRef }) {
  const [zoomed, setZoomed] = useState(false);
  const baseRef = useRef(base);
  baseRef.current = base;
  const [ctl] = useState(() =>
    createZoom({
      frame: () => frameRef.current,
      svg: () => svgRef.current,
      base: () => baseRef.current,
      busy: () => busyRef.current,
      onZoomed: setZoomed,
    })
  );
  useEffect(() => ctl.attach(), [ctl]);
  const baseKey = base.join(" ");
  useEffect(() => ctl.reset(), [ctl, baseKey]);
  return { zoomed, reset: ctl.reset, isZoomed: ctl.isZoomed };
}
