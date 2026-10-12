// A hand-drawn canvas globe: dotted continents, lifted flight arcs and little planes
// flying along them. Uses d3-geo for the orthographic projection.

const LAND_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json";
const TAU = Math.PI * 2;

export class Globe {
  constructor(canvas, { onPick, onHover } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.onPick = onPick || (() => {});
    this.onHover = onHover || (() => {});
    this.origin = null;
    this.places = [];
    this.selected = null;
    this.hovered = null;
    this.pickMode = false;
    this.dots = [];
    this.land = null;
    this.rotation = [-60, -18, 0];
    this.spin = 0.06; // degrees per frame
    this.tween = null;
    this.drag = null;
    this.planes = [];
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.projection = d3.geoOrthographic().clipAngle(90).precision(0.6);
    this.path = d3.geoPath(this.projection, this.ctx);
    this.graticule = d3.geoGraticule10();
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.bindPointer();
    this.loadLand();
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.w = r.width;
    this.h = r.height;
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.radius = Math.min(r.width, r.height) / 2 / 1.2;
    this.projection.scale(this.radius).translate([r.width / 2, r.height / 2]);
  }

  async loadLand() {
    try {
      const topo = await (await fetch(LAND_URL)).json();
      this.land = topojson.feature(topo, topo.objects.land);
      this.buildDots();
    } catch (e) {
      console.warn("Land outline unavailable, drawing an ocean-only globe.", e);
    }
  }

  // Sample a lat/lng grid and keep the points that fall on land, a few rows per frame.
  buildDots() {
    const step = 2.2;
    let lat = -84;
    const work = () => {
      const stop = performance.now() + 8;
      while (lat <= 84 && performance.now() < stop) {
        const ring = Math.cos((lat * Math.PI) / 180);
        const s = step / Math.max(ring, 0.25);
        for (let lng = -180; lng < 180; lng += s) {
          if (d3.geoContains(this.land, [lng, lat])) this.dots.push([lng, lat]);
        }
        lat += step;
      }
      if (lat <= 84) requestAnimationFrame(work);
      else this.dotsReady = true;
    };
    work();
  }

  setOrigin(o) {
    this.origin = o;
    this.resetPlanes();
  }

  setPlaces(list) {
    this.places = list;
    this.resetPlanes();
  }

  resetPlanes() {
    if (!this.origin) return;
    this.planes = this.places.map((p, i) => ({
      to: p,
      t: (i * 0.137) % 1,
      speed: 0.0009 + ((i * 37) % 11) * 0.00007,
      back: i % 3 === 0,
    }));
  }

  select(place) {
    this.selected = place;
    if (place) this.flyTo(this.origin ? d3.geoInterpolate([this.origin.lng, this.origin.lat], [place.lng, place.lat])(0.5) : [place.lng, place.lat]);
  }

  flyTo([lng, lat]) {
    const from = this.rotation.slice();
    const to = [-lng, -lat * 0.7, 0];
    let dl = ((to[0] - from[0] + 540) % 360) - 180;
    this.tween = { from, dl, dp: to[1] - from[1], start: performance.now(), dur: this.reduced ? 1 : 1300 };
  }

  bindPointer() {
    const c = this.canvas;
    c.addEventListener("pointerdown", (e) => {
      c.setPointerCapture(e.pointerId);
      this.drag = { x: e.clientX, y: e.clientY, r: this.rotation.slice(), moved: 0 };
      this.tween = null;
    });
    c.addEventListener("pointermove", (e) => {
      const r = c.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      if (this.drag) {
        const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
        this.drag.moved = Math.max(this.drag.moved, Math.hypot(dx, dy));
        const k = 75 / this.radius;
        this.rotation = [this.drag.r[0] + dx * k, Math.max(-70, Math.min(70, this.drag.r[1] - dy * k)), 0];
        return;
      }
      const hit = this.hitTest(px, py);
      if (hit !== this.hovered) {
        this.hovered = hit;
        c.style.cursor = hit || this.pickMode ? "pointer" : "grab";
        this.onHover(hit, px, py);
      } else if (hit) this.onHover(hit, px, py);
    });
    const end = (e) => {
      if (!this.drag) return;
      const moved = this.drag.moved;
      this.drag = null;
      if (moved > 5) return;
      const r = c.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      const hit = this.hitTest(px, py);
      if (hit) return this.onPick({ place: hit });
      if (Math.hypot(px - this.w / 2, py - this.h / 2) < this.radius) {
        const ll = this.projection.invert([px, py]);
        if (ll) this.onPick({ lngLat: ll });
      }
    };
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", () => (this.drag = null));
    c.addEventListener("pointerleave", () => { if (this.hovered) { this.hovered = null; this.onHover(null); } });
  }

  visible([lng, lat]) {
    const r = this.projection.rotate();
    return d3.geoDistance([lng, lat], [-r[0], -r[1]]) < Math.PI / 2 - 0.02;
  }

  hitTest(px, py) {
    let best = null, bd = 16;
    for (const p of this.places) {
      if (!this.visible([p.lng, p.lat])) continue;
      const [x, y] = this.projection([p.lng, p.lat]);
      const d = Math.hypot(x - px, y - py);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  // Project a point on a great circle, lifted off the surface into an arc.
  lifted(interp, t, height) {
    const ll = interp(t);
    const r = this.projection.rotate();
    const angle = d3.geoDistance(ll, [-r[0], -r[1]]);
    const lift = 1 + Math.sin(Math.PI * t) * height;
    if (angle > Math.PI / 2 && Math.sin(angle) * lift < 1) return null; // hidden behind the globe
    const [x, y] = this.projection(ll) || [];
    if (x === undefined) return null;
    // orthographic hides the back side; for lifted points use the forward-facing projection manually
    const cx = this.w / 2, cy = this.h / 2;
    return [cx + (x - cx) * lift, cy + (y - cy) * lift];
  }

  frame(now) {
    const dt = Math.min(now - this.last, 50) / 16.67;
    this.last = now;
    if (this.tween) {
      const k = Math.min(1, (now - this.tween.start) / this.tween.dur);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      this.rotation = [this.tween.from[0] + this.tween.dl * e, this.tween.from[1] + this.tween.dp * e, 0];
      if (k === 1) this.tween = null;
    } else if (!this.drag && !this.reduced && !this.hovered) {
      this.rotation[0] += this.spin * dt;
    }
    this.projection.rotate(this.rotation);
    if (!this.reduced || this.tween) for (const p of this.planes) p.t = (p.t + p.speed * dt) % 1;
    this.draw(now);
    requestAnimationFrame((t) => this.frame(t));
  }

  draw(now) {
    const { ctx, w, h, radius } = this;
    const cx = w / 2, cy = h / 2;
    ctx.clearRect(0, 0, w, h);

    // atmosphere halo
    const halo = ctx.createRadialGradient(cx, cy, radius * 0.92, cx, cy, radius * 1.2);
    halo.addColorStop(0, "rgba(142,232,255,0.45)");
    halo.addColorStop(0.35, "rgba(108,75,255,0.18)");
    halo.addColorStop(1, "rgba(108,75,255,0)");
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(cx, cy, radius * 1.2, 0, TAU); ctx.fill();

    // ocean
    const sea = ctx.createRadialGradient(cx - radius * 0.35, cy - radius * 0.4, radius * 0.1, cx, cy, radius);
    sea.addColorStop(0, "#3a2f8f");
    sea.addColorStop(0.6, "#1d1859");
    sea.addColorStop(1, "#0d0b33");
    ctx.fillStyle = sea;
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, TAU); ctx.fill();

    // graticule
    ctx.beginPath(); this.path(this.graticule);
    ctx.strokeStyle = "rgba(180,170,255,0.09)"; ctx.lineWidth = 1; ctx.stroke();

    // land
    if (this.dots.length) {
      const r = this.projection.rotate();
      const centre = [-r[0], -r[1]];
      for (const d of this.dots) {
        const dist = d3.geoDistance(d, centre);
        if (dist > 1.53) continue;
        const [x, y] = this.projection(d);
        const shade = Math.cos(dist);
        ctx.fillStyle = `rgba(${Math.round(255 - 60 * (1 - shade))},${Math.round(181 + 30 * shade)},${Math.round(120 + 80 * shade)},${0.35 + 0.6 * shade})`;
        const s = 1.1 + 1.3 * shade;
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
      }
    } else if (this.land) {
      ctx.beginPath(); this.path(this.land);
      ctx.fillStyle = "rgba(255,181,71,0.25)"; ctx.fill();
    }

    // terminator-ish shading for depth
    const shade = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.35, radius * 0.2, cx, cy, radius * 1.02);
    shade.addColorStop(0, "rgba(255,255,255,0.06)");
    shade.addColorStop(0.7, "rgba(0,0,0,0)");
    shade.addColorStop(1, "rgba(5,3,30,0.55)");
    ctx.fillStyle = shade;
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, TAU); ctx.fill();

    if (!this.origin) return;
    const o = [this.origin.lng, this.origin.lat];

    // arcs
    for (const p of this.places) {
      const sel = p === this.selected;
      const hov = p === this.hovered;
      const interp = d3.geoInterpolate(o, [p.lng, p.lat]);
      const height = 0.06 + Math.min(d3.geoDistance(o, [p.lng, p.lat]), 2.4) * 0.075;
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i <= 64; i++) {
        const pt = this.lifted(interp, i / 64, height);
        if (!pt) { pen = false; continue; }
        pen ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1]);
        pen = true;
      }
      if (sel) {
        ctx.setLineDash([10, 8]);
        ctx.lineDashOffset = -now / 40;
        ctx.strokeStyle = "#FFB547"; ctx.lineWidth = 2.6;
        ctx.shadowColor = "#FFB547"; ctx.shadowBlur = 14;
      } else {
        ctx.setLineDash([]);
        ctx.strokeStyle = hov ? "rgba(255,94,126,0.9)" : "rgba(142,232,255,0.28)";
        ctx.lineWidth = hov ? 2 : 1.1;
        ctx.shadowBlur = 0;
      }
      ctx.stroke();
      ctx.setLineDash([]); ctx.shadowBlur = 0;
      p._height = height;
    }

    // planes with fading contrails
    for (const pl of this.planes) {
      const p = pl.to;
      const a = pl.back ? [p.lng, p.lat] : o, b = pl.back ? o : [p.lng, p.lat];
      const interp = d3.geoInterpolate(a, b);
      const height = p._height || 0.15;
      const head = this.lifted(interp, pl.t, height);
      const ahead = this.lifted(interp, Math.min(pl.t + 0.01, 1), height);
      if (!head || !ahead) continue;
      for (let i = 1; i <= 14; i++) {
        const t0 = pl.t - i * 0.012;
        if (t0 < 0) break;
        const q = this.lifted(interp, t0, height);
        if (!q) break;
        ctx.fillStyle = `rgba(255,255,255,${0.5 * (1 - i / 14)})`;
        ctx.beginPath(); ctx.arc(q[0], q[1], 1.6 * (1 - i / 18), 0, TAU); ctx.fill();
      }
      const ang = Math.atan2(ahead[1] - head[1], ahead[0] - head[0]);
      const isSel = p === this.selected;
      this.drawPlane(head[0], head[1], ang, isSel ? 1.25 : 0.85, isSel ? "#FFB547" : "#ffffff");
    }

    // origin + destination pins
    const pin = (ll, color, r, glow) => {
      if (!this.visible(ll)) return null;
      const [x, y] = this.projection(ll);
      if (glow) {
        const pulse = 1 + 0.5 * Math.sin(now / 300);
        ctx.fillStyle = color.replace("1)", `${0.25 / pulse})`);
        ctx.beginPath(); ctx.arc(x, y, r * 2.6 * pulse, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      return [x, y];
    };
    for (const p of this.places) {
      const s = p === this.selected || p === this.hovered;
      const xy = pin([p.lng, p.lat], s ? "rgba(255,181,71,1)" : "rgba(255,94,126,1)", s ? 4.5 : 3, s);
      if (xy && s) this.label(xy, `${p.city} · ${p.code}`);
    }
    const oxy = pin(o, "rgba(142,232,255,1)", 4.5, true);
    if (oxy) this.label(oxy, `${this.origin.city} · ${this.origin.code}`, true);
  }

  label([x, y], text, left) {
    const { ctx } = this;
    ctx.font = "600 12px 'DM Sans', system-ui, sans-serif";
    const tw = ctx.measureText(text).width + 16;
    const bx = left ? x - tw / 2 : x + 10, by = left ? y + 10 : y - 26;
    ctx.fillStyle = "rgba(15,19,51,0.85)";
    ctx.beginPath(); ctx.roundRect(bx, by, tw, 22, 11); ctx.fill();
    ctx.fillStyle = "#F6F4FF";
    ctx.fillText(text, bx + 8, by + 15);
  }

  drawPlane(x, y, ang, s, color) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang); ctx.scale(s, s);
    ctx.fillStyle = color;
    ctx.shadowColor = color; ctx.shadowBlur = 8;
    ctx.beginPath();
    // nose → tail, top-down silhouette pointing along +x
    ctx.moveTo(9, 0);
    ctx.quadraticCurveTo(8, -1.3, 5, -1.3);
    ctx.lineTo(1.5, -1.3); ctx.lineTo(-2.5, -8); ctx.lineTo(-4.5, -8); ctx.lineTo(-2.2, -1.3);
    ctx.lineTo(-6, -1.2); ctx.lineTo(-8, -4); ctx.lineTo(-9.2, -4); ctx.lineTo(-8.2, 0);
    ctx.lineTo(-9.2, 4); ctx.lineTo(-8, 4); ctx.lineTo(-6, 1.2); ctx.lineTo(-2.2, 1.3);
    ctx.lineTo(-4.5, 8); ctx.lineTo(-2.5, 8); ctx.lineTo(1.5, 1.3); ctx.lineTo(5, 1.3);
    ctx.quadraticCurveTo(8, 1.3, 9, 0);
    ctx.fill();
    ctx.restore();
  }
}
