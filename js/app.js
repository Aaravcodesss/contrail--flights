import { ORIGINS, DESTINATIONS, AIRLINES, HUBS } from "./data.js";
import { Globe } from "./globe.js";

/* ---------- small helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

function hash(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return h >>> 0;
}
function rng(seed) {
  let a = hash(String(seed));
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function km(a, b) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
const flightMins = (d) => Math.round((d / 820) * 60 + 30);
const hm = (m) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
const baseFare = (d) => 2600 + d * 4.1;
const isoDay = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return isoDay(d); };
const prettyDay = (s, opts = { weekday: "short", day: "numeric", month: "short" }) =>
  new Date(s + "T00:00:00Z").toLocaleDateString("en-IN", { ...opts, timeZone: "UTC" });
const localTime = (tz, at = new Date()) => {
  try { return at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz }); }
  catch { return "—"; }
};
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 2800);
}

/* ---------- state ---------- */
const today = isoDay(new Date());
const state = {
  origin: ORIGINS[0],
  dest: null,
  custom: store.get("aarav-airlines.places", []),
  trips: store.get("aarav-airlines.trips", []),
  flights: [],
  sort: "price",
  flight: null,
  seats: [],
  filter: "All",
};
const allPlaces = () => [...DESTINATIONS, ...state.custom];
const findPlace = (code) => allPlaces().find((p) => p.code === code);

/* ---------- photo loading with a drawn fallback ---------- */
const GRADS = {
  City: "linear-gradient(150deg,#6C4BFF,#FF5E7E)",
  Beach: "linear-gradient(160deg,#21C3E8,#6C4BFF 70%)",
  Mountain: "linear-gradient(170deg,#8EE8FF,#3B2A78 75%)",
  Wonder: "linear-gradient(150deg,#FFB547,#FF5E7E 60%,#6C4BFF)",
};
const photoCache = new Map();
function paintPhoto(el, place) {
  el.dataset.code = place.code;
  el.style.setProperty("--fb", GRADS[place.vibe] || GRADS.City);
  const set = (ok) => {
    el.classList.toggle("fallback", !ok);
    el.style.backgroundImage = ok ? `url("${place.photo}")` : "";
  };
  if (!place.photo) return set(false);
  if (photoCache.has(place.photo)) return set(photoCache.get(place.photo));
  set(false);
  const img = new Image();
  img.onload = () => { photoCache.set(place.photo, true); set(true); };
  img.onerror = () => { photoCache.set(place.photo, false); set(false); };
  img.src = place.photo;
}

/* ---------- search form ---------- */
const fromSel = $("#from"), toSel = $("#to"), dateIn = $("#date");
function fillSelects() {
  fromSel.innerHTML = ORIGINS.map((o) => `<option value="${o.code}">${o.city} (${o.code})</option>`).join("");
  fromSel.value = state.origin.code;
  const groups = ["City", "Beach", "Mountain", "Wonder"];
  toSel.innerHTML = `<option value="">Anywhere…</option>` + groups.map((g) => {
    const opts = allPlaces().filter((p) => p.vibe === g)
      .map((p) => `<option value="${p.code}">${p.city} (${p.code})</option>`).join("");
    return opts ? `<optgroup label="${g === "City" ? "Cities" : g === "Beach" ? "Beaches" : g + "s"}">${opts}</optgroup>` : "";
  }).join("");
  toSel.value = state.dest?.code || "";
}
dateIn.min = today;
dateIn.value = addDays(today, 1);

function updateRouteInfo() {
  const el = $("#routeInfo");
  if (!state.dest) { el.textContent = "Choose a destination to see the distance."; return; }
  const d = km(state.origin, state.dest);
  el.innerHTML = `<b>${Math.round(d).toLocaleString("en-IN")} km</b> · about <b>${hm(flightMins(d))}</b> non-stop · from <b>${inr.format(Math.round(baseFare(d) * 0.82 / 10) * 10)}</b>`;
}

function setDest(place, { fly = true } = {}) {
  state.dest = place;
  toSel.value = place ? place.code : "";
  updateRouteInfo();
  if (fly) globe.select(place);
}

fromSel.addEventListener("change", () => {
  state.origin = ORIGINS.find((o) => o.code === fromSel.value);
  globe.setOrigin(state.origin);
  globe.flyTo([state.origin.lng, state.origin.lat]);
  updateRouteInfo();
  renderGrid();
  buildBoard();
});
toSel.addEventListener("change", () => setDest(findPlace(toSel.value) || null));
$("#swap").addEventListener("click", () => {
  // Origins are home airports, so "swap" picks a random new adventure instead.
  const list = allPlaces().filter((p) => p !== state.dest);
  const pick = list[Math.floor(Math.random() * list.length)];
  setDest(pick);
  toast(`How about ${pick.city}?`);
});
$("#search").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!state.dest) {
    toast("Pick a destination first — tap a pin on the globe.");
    toSel.focus();
    return;
  }
  runSearch(dateIn.value || addDays(today, 1));
});

/* ---------- globe ---------- */
const tip = $("#globeTip");
const globe = new Globe($("#globe"), {
  onHover(place, x, y) {
    if (!place) { tip.hidden = true; return; }
    tip.hidden = false;
    if (tip.dataset.code !== place.code) {
      tip.dataset.code = place.code;
      tip.innerHTML = `<div class="tip-photo"></div><div><strong>${place.city}</strong>${place.country} · from ${inr.format(Math.round(baseFare(km(state.origin, place)) * 0.82 / 10) * 10)}</div>`;
      paintPhoto($(".tip-photo", tip), place);
    }
    const w = tip.parentElement.clientWidth;
    tip.style.left = `${Math.min(x, w - 220)}px`;
    tip.style.top = `${y}px`;
  },
  onPick({ place, lngLat }) {
    if (pickMode && lngLat) return finishPick(lngLat);
    if (place) {
      setDest(place);
      toast(`${place.city} it is — hit “Find flights”`);
    }
  },
});
globe.setOrigin(state.origin);
globe.setPlaces(allPlaces());

/* ---------- flights ---------- */
function makeFlights(origin, dest, day) {
  const r = rng(`${origin.code}-${dest.code}-${day}`);
  const dist = km(origin, dest);
  const n = 5 + Math.floor(r() * 4);
  const out = [];
  for (let i = 0; i < n; i++) {
    const air = AIRLINES[Math.floor(r() * AIRLINES.length)];
    const direct = dist < 6000 ? r() > 0.25 : r() > 0.65;
    const hubs = HUBS.filter((h) => h !== dest.code);
    const via = direct ? null : hubs[Math.floor(r() * hubs.length)];
    const dep = Math.floor(r() * 92) * 15;
    const dur = flightMins(dist * (direct ? 1 : 1.08)) + (direct ? 0 : 70 + Math.floor(r() * 10) * 15);
    const fare = Math.round((baseFare(dist) * (0.82 + r() * 0.55) * (direct ? 1.05 : 0.86)) / 10) * 10;
    out.push({
      id: `${air.code}${100 + Math.floor(r() * 899)}`,
      air, via, dep, dur, fare, day,
      from: origin.code, to: dest.code,
      seatsLeft: 2 + Math.floor(r() * 9),
    });
  }
  return out;
}
// Departure is in India time; arrival shown in the destination's local time.
function arrival(f, dest) {
  const [y, m, d] = f.day.split("-").map(Number);
  const depUTC = Date.UTC(y, m - 1, d, 0, f.dep) - 330 * 60000;
  const at = new Date(depUTC + f.dur * 60000);
  const time = localTime(dest.tz, at);
  let dayDiff = 0;
  try {
    const arrDay = at.toLocaleDateString("en-CA", { timeZone: dest.tz });
    dayDiff = Math.round((new Date(arrDay) - new Date(f.day)) / 86400000);
  } catch { /* unknown zone */ }
  return { time, dayDiff };
}
const clock = (mins) => `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
const cabinFactor = () => Number($("#cabin").value);
const pax = () => Number($("#pax").value);

function runSearch(day) {
  state.day = day;
  dateIn.value = day;
  state.flights = makeFlights(state.origin, state.dest, day);
  $("#resultsTitle").textContent = `${state.origin.city} to ${state.dest.city}`;
  renderFareStrip();
  renderFlights();
  const sec = $("#results");
  sec.hidden = false;
  sec.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
}

function renderFareStrip() {
  const start = state.day <= addDays(today, 3) ? today : addDays(state.day, -3);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const lows = days.map((d) => Math.min(...makeFlights(state.origin, state.dest, d).map((f) => f.fare)));
  const min = Math.min(...lows), max = Math.max(...lows);
  $("#fareStrip").innerHTML = days.map((d, i) => `
    <button class="fare-day ${lows[i] === min ? "low" : ""}" role="radio" aria-checked="${d === state.day}" data-day="${d}">
      <small>${prettyDay(d)}</small><b>${inr.format(lows[i] * cabinFactor())}</b>
      <span class="bar" style="width:${30 + 70 * (1 - (lows[i] - min) / (max - min || 1))}%"></span>
    </button>`).join("");
}
$("#fareStrip").addEventListener("click", (e) => {
  const b = e.target.closest(".fare-day");
  if (b) runSearch(b.dataset.day);
});

function renderFlights() {
  const by = { price: (a, b) => a.fare - b.fare, duration: (a, b) => a.dur - b.dur, depart: (a, b) => a.dep - b.dep }[state.sort];
  const list = [...state.flights].sort(by);
  const cheapest = Math.min(...list.map((f) => f.fare)), fastest = Math.min(...list.map((f) => f.dur));
  $("#flightList").innerHTML = list.map((f, i) => {
    const arr = arrival(f, state.dest);
    const total = f.fare * cabinFactor() * pax();
    return `<li class="flight" style="animation-delay:${i * 60}ms">
      <div class="airline"><i style="background:${f.air.color}">${f.air.code}</i><div><b>${f.air.name}</b><small>${f.id} · ${f.seatsLeft} seats left</small></div></div>
      <div class="leg">
        <div class="t">${clock(f.dep)}<small>${f.from}</small></div>
        <div class="track">${f.via ? `<span class="stop" title="Stop in ${f.via}"></span>` : ""}
          <svg class="mini-plane" viewBox="0 0 48 24" aria-hidden="true"><use href="#jet" width="48" height="24" style="fill:currentColor"/></svg>
          <span class="dur">${hm(f.dur)} · ${f.via ? `1 stop, ${f.via}` : "non-stop"}</span></div>
        <div class="t end">${arr.time}${arr.dayDiff > 0 ? `<sup>+${arr.dayDiff}</sup>` : ""}<small>${f.to}</small></div>
      </div>
      <div class="price"><div><b>${inr.format(total)}</b><small>${pax() > 1 ? `${pax()} travellers` : "per person"}${f.fare === cheapest ? '<span class="tag">Cheapest</span>' : ""}${f.dur === fastest ? '<span class="tag">Fastest</span>' : ""}</small></div>
        <button class="btn-primary" data-flight="${f.id}">Choose seats</button></div>
    </li>`;
  }).join("");
}
$(".sort").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-sort]");
  if (!b) return;
  state.sort = b.dataset.sort;
  $$(".sort button").forEach((x) => x.setAttribute("aria-checked", x === b));
  renderFlights();
});
$("#flightList").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-flight]");
  if (b) openSeats(state.flights.find((f) => f.id === b.dataset.flight));
});
["#pax", "#cabin"].forEach((s) => $(s).addEventListener("change", () => { if (!$("#results").hidden) { renderFareStrip(); renderFlights(); } }));

/* ---------- seats ---------- */
const ROWS = 26, LETTERS = ["A", "B", "C", "D", "E", "F"], EXTRA = new Set([1, 12, 13]);
function openSeats(f) {
  state.flight = f;
  state.seats = [];
  const r = rng(f.id + f.day);
  let html = "";
  for (let row = 1; row <= ROWS; row++) {
    html += `<div class="seat-row ${row === 12 ? "exit" : ""}" role="row">`;
    LETTERS.forEach((L, i) => {
      if (i === 3) html += `<span class="num">${row}</span>`;
      const taken = r() < 0.42;
      html += `<button class="seat ${EXTRA.has(row) ? "extra" : ""}" data-seat="${row}${L}" aria-pressed="false" ${taken ? "disabled" : ""} aria-label="Seat ${row}${L}${taken ? ", taken" : ""}">${L}</button>`;
    });
    html += "</div>";
  }
  $("#cabinMap").innerHTML = html;
  $("#seatsSub").textContent = `${f.air.name} ${f.id} · ${state.origin.code} → ${state.dest.code} · ${prettyDay(f.day, { weekday: "long", day: "numeric", month: "long" })}`;
  $("#paxFields").innerHTML = Array.from({ length: pax() }, (_, i) =>
    `<label class="field"><span>Traveller ${i + 1} name</span><input data-pax="${i}" maxlength="26" placeholder="As on passport" autocomplete="name"></label>`).join("");
  updateSeatTotal();
  $("#seats").showModal();
}
$("#cabinMap").addEventListener("click", (e) => {
  const b = e.target.closest(".seat");
  if (!b || b.disabled) return;
  const id = b.dataset.seat;
  if (state.seats.includes(id)) state.seats = state.seats.filter((s) => s !== id);
  else {
    state.seats.push(id);
    if (state.seats.length > pax()) state.seats.shift();
  }
  $$(".seat", $("#cabinMap")).forEach((s) => s.setAttribute("aria-pressed", state.seats.includes(s.dataset.seat)));
  updateSeatTotal();
});
const seatExtra = () => state.seats.filter((s) => EXTRA.has(parseInt(s))).length * 1200;
function updateSeatTotal() {
  const f = state.flight;
  const total = f.fare * cabinFactor() * pax() + seatExtra();
  const left = pax() - state.seats.length;
  $("#seatTotal").innerHTML = `${inr.format(total)}<small>${left > 0 ? `Pick ${left} more seat${left > 1 ? "s" : ""}` : `Seats ${state.seats.join(", ")}`}</small>`;
  $("#confirmBtn").disabled = left > 0;
}
$("#confirmBtn").addEventListener("click", () => {
  const f = state.flight;
  const names = $$("#paxFields input").map((i, n) => i.value.trim() || `Traveller ${n + 1}`);
  const r = rng(Date.now());
  const pnr = Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(r() * 32)]).join("");
  const trip = {
    pnr, flight: f, seats: [...state.seats], names,
    cabin: $("#cabin").selectedOptions[0].text,
    total: f.fare * cabinFactor() * pax() + seatExtra(),
    dest: { code: state.dest.code, city: state.dest.city, tz: state.dest.tz },
    origin: { code: state.origin.code, city: state.origin.city },
    gate: `${"ABC"[Math.floor(r() * 3)]}${1 + Math.floor(r() * 30)}`,
  };
  state.trips.unshift(trip);
  store.set("aarav-airlines.trips", state.trips);
  updateTripCount();
  $("#seats").close();
  showPass(trip);
  celebrate();
});

/* ---------- boarding pass ---------- */
function barcode(seed) {
  const r = rng(seed);
  let s = "";
  for (let i = 0; i < 46; i++) s += `<i style="width:${1 + Math.floor(r() * 3)}px;margin-right:${1 + Math.floor(r() * 2)}px"></i>`;
  return `<div class="barcode" aria-hidden="true">${s}</div>`;
}
function showPass(trip) {
  const f = trip.flight;
  const arr = arrival(f, trip.dest);
  const board = clock((f.dep - 40 + 1440) % 1440);
  $("#bpHost").innerHTML = trip.names.map((name, i) => `
    <article class="bp" style="${i ? "margin-top:16px" : ""}">
      <div class="bp-main">
        <div class="bp-top"><span>Aarav Airlines${f.air.code === "AR" ? "" : ` · operated by ${f.air.name}`}</span><span>${trip.cabin}</span></div>
        <div class="bp-route">
          <div class="code">${trip.origin.code}<small>${trip.origin.city}</small></div>
          <div class="bp-path"><svg viewBox="0 0 48 24" aria-hidden="true"><use href="#jet" width="48" height="24"/></svg></div>
          <div class="code end">${trip.dest.code}<small>${trip.dest.city}</small></div>
        </div>
        <dl class="bp-grid">
          <div><dt>Passenger</dt><dd>${escapeHTML(name)}</dd></div>
          <div><dt>Flight</dt><dd>${f.id}</dd></div>
          <div><dt>Date</dt><dd>${prettyDay(f.day, { day: "numeric", month: "short" })}</dd></div>
          <div><dt>Seat</dt><dd>${trip.seats[i] || "—"}</dd></div>
          <div><dt>Boards</dt><dd>${board}</dd></div>
          <div><dt>Departs</dt><dd>${clock(f.dep)}</dd></div>
          <div><dt>Arrives</dt><dd>${arr.time}${arr.dayDiff > 0 ? ` +${arr.dayDiff}` : ""}</dd></div>
          <div><dt>Gate</dt><dd>${trip.gate}</dd></div>
        </dl>
      </div>
      <div class="bp-stub">
        <div><dt style="font-size:.74rem;color:#5B5890;font-weight:700">Booking ref</dt><dd style="margin:0;font:800 1.6rem var(--display)">${trip.pnr}</dd></div>
        <div><b>${trip.origin.code} → ${trip.dest.code}</b><br><small>Seat ${trip.seats[i] || "—"} · Gate ${trip.gate}</small></div>
        ${barcode(trip.pnr + i)}
      </div>
    </article>`).join("");
  $("#bp").showModal();
}
function escapeHTML(s) { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
$("#printBtn").addEventListener("click", () => window.print());

/* ---------- trips ---------- */
function updateTripCount() { $("#tripCount").textContent = state.trips.length; }
function renderTrips() {
  $("#tripList").innerHTML = state.trips.length ? state.trips.map((t, i) => `
    <li><div><b>${t.origin.code} → ${t.dest.code}</b><small>${t.dest.city} · ${prettyDay(t.flight.day)} · ${t.flight.id} · ${inr.format(t.total)}</small></div>
      <span><button class="btn-ghost" data-view="${i}">View pass</button> <button class="btn-ghost" data-cancel="${i}" style="color:var(--flare)">Cancel</button></span></li>`).join("")
    : `<li>No trips yet. Spin the globe and book one.</li>`;
}
$("#tripsBtn").addEventListener("click", () => { renderTrips(); $("#trips").showModal(); });
$("#tripList").addEventListener("click", (e) => {
  const v = e.target.closest("[data-view]"), c = e.target.closest("[data-cancel]");
  if (v) { $("#trips").close(); showPass(state.trips[+v.dataset.view]); }
  if (c) {
    const t = state.trips.splice(+c.dataset.cancel, 1)[0];
    store.set("aarav-airlines.trips", state.trips);
    updateTripCount(); renderTrips();
    toast(`Cancelled ${t.pnr}`);
  }
});

/* ---------- dialogs: close buttons and backdrop clicks ---------- */
$$("dialog").forEach((d) => {
  d.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]") || e.target === d) d.close();
  });
});

/* ---------- confetti of tiny paper planes ---------- */
function celebrate() {
  if (reduced) return;
  const c = $("#confetti"), ctx = c.getContext("2d");
  c.width = innerWidth; c.height = innerHeight;
  const colors = ["#FFB547", "#FF5E7E", "#8EE8FF", "#B49BFF", "#F6F4FF"];
  const bits = Array.from({ length: 90 }, () => ({
    x: innerWidth / 2, y: innerHeight * 0.65,
    vx: (Math.random() - 0.5) * 16, vy: -8 - Math.random() * 12,
    a: Math.random() * 6, va: (Math.random() - 0.5) * 0.3,
    s: 6 + Math.random() * 8, c: colors[Math.floor(Math.random() * colors.length)],
  }));
  const start = performance.now();
  (function tick(now) {
    ctx.clearRect(0, 0, c.width, c.height);
    for (const b of bits) {
      b.vy += 0.35; b.vx *= 0.99; b.x += b.vx; b.y += b.vy; b.a += b.va;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a);
      ctx.fillStyle = b.c;
      ctx.beginPath(); ctx.moveTo(b.s, 0); ctx.lineTo(-b.s, -b.s * 0.6); ctx.lineTo(-b.s * 0.4, 0); ctx.lineTo(-b.s, b.s * 0.6); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    if (now - start < 3200) requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, c.width, c.height);
  })(start);
}

/* ---------- departures board ---------- */
const FLAP_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:";
function setFlap(el, text, len) {
  text = text.toUpperCase().padEnd(len).slice(0, len);
  if (el.children.length !== len) el.innerHTML = "<b></b>".repeat(len);
  [...el.children].forEach((b, i) => {
    const target = text[i];
    if (b.textContent === target) return;
    if (reduced) { b.textContent = target; return; }
    let n = 3 + Math.floor(Math.random() * 6);
    const step = () => {
      b.classList.remove("flip"); void b.offsetWidth; b.classList.add("flip");
      if (n-- <= 0) { b.textContent = target === " " ? " " : target; return; }
      b.textContent = FLAP_CHARS[Math.floor(Math.random() * FLAP_CHARS.length)];
      setTimeout(step, 55);
    };
    setTimeout(step, i * 25);
  });
}
const STATUSES = ["ON TIME", "BOARDING", "FINAL CALL", "DELAYED", "DEPARTED"];
let boardData = [], boardTimer;
function buildBoard() {
  $("#boardCity").textContent = state.origin.city;
  const r = rng(state.origin.code + today);
  const now = new Date();
  let t = now.getHours() * 60 + now.getMinutes() + 10;
  boardData = Array.from({ length: 8 }, () => {
    const p = allPlaces()[Math.floor(r() * allPlaces().length)];
    const air = AIRLINES[Math.floor(r() * AIRLINES.length)];
    t += 5 + Math.floor(r() * 4) * 5;
    return { time: clock(t % 1440), id: `${air.code}${100 + Math.floor(r() * 899)}`, dest: p, gate: `${"ABC"[Math.floor(r() * 3)]}${1 + Math.floor(r() * 30)}`, status: 0 };
  });
  boardData[0].status = 1; boardData[1].status = r() > 0.5 ? 3 : 0;
  $("#boardRows").innerHTML = boardData.map((_, i) => `
    <div class="board-row" role="row" tabindex="0" data-i="${i}">
      <span class="flap" role="cell"></span><span class="flap" role="cell"></span><span class="flap" role="cell"></span><span class="flap" role="cell"></span><span class="flap" role="cell"></span>
    </div>`).join("");
  boardData.forEach((_, i) => paintRow(i));
  clearInterval(boardTimer);
  boardTimer = setInterval(tickBoard, 3600);
}
function paintRow(i) {
  const d = boardData[i];
  const row = $(`#boardRows [data-i="${i}"]`);
  const cells = $$(".flap", row);
  row.className = `board-row status-${["ontime", "boarding", "final", "delayed", "departed"][d.status]}`;
  row.setAttribute("aria-label", `${d.time} ${d.id} to ${d.dest.city}, gate ${d.gate}, ${STATUSES[d.status].toLowerCase()}`);
  setFlap(cells[0], d.time, 5);
  setFlap(cells[1], d.id, 5);
  setFlap(cells[2], d.dest.city.normalize("NFD").replace(/[^\w\s]/g, ""), 12);
  setFlap(cells[3], d.gate, 3);
  setFlap(cells[4], STATUSES[d.status], 10);
}
function tickBoard() {
  if (document.hidden) return;
  // advance the first non-departed flight's status, sometimes roll the board
  const i = boardData.findIndex((d) => d.status !== 4);
  const d = boardData[i];
  if (d.status === 0 || d.status === 3) d.status = 1;
  else if (d.status === 1) d.status = 2;
  else if (d.status === 2) d.status = 4;
  paintRow(i);
  if (boardData.filter((x) => x.status === 4).length > 2) {
    const r = Math.random;
    const last = boardData[boardData.length - 1];
    const [h, m] = last.time.split(":").map(Number);
    const p = allPlaces()[Math.floor(r() * allPlaces().length)];
    const air = AIRLINES[Math.floor(r() * AIRLINES.length)];
    boardData.shift();
    boardData.push({ time: clock((h * 60 + m + 10) % 1440), id: `${air.code}${100 + Math.floor(r() * 899)}`, dest: p, gate: `${"ABC"[Math.floor(r() * 3)]}${1 + Math.floor(r() * 30)}`, status: r() > 0.8 ? 3 : 0 });
    boardData.forEach((_, j) => paintRow(j));
  }
}
function boardPick(e) {
  const row = e.target.closest("[data-i]");
  if (!row || (e.type === "keydown" && e.key !== "Enter")) return;
  const d = boardData[+row.dataset.i];
  setDest(d.dest);
  runSearch(today);
}
$("#boardRows").addEventListener("click", boardPick);
$("#boardRows").addEventListener("keydown", boardPick);

/* ---------- destination grid ---------- */
const VIBES = ["All", "City", "Beach", "Mountain", "Wonder", "Yours"];
$("#chips").innerHTML = VIBES.map((v) => `<button class="chip" role="radio" aria-checked="${v === state.filter}" data-v="${v}">${{ City: "Cities", Beach: "Beaches", Mountain: "Mountains", Wonder: "Wonders", Yours: "Added by you" }[v] || v}</button>`).join("");
$("#chips").addEventListener("click", (e) => {
  const b = e.target.closest(".chip");
  if (!b) return;
  state.filter = b.dataset.v;
  $$(".chip").forEach((c) => c.setAttribute("aria-checked", c === b));
  renderGrid();
});
function renderGrid() {
  const list = allPlaces().filter((p) => state.filter === "All" || (state.filter === "Yours" ? p.custom : p.vibe === state.filter));
  const grid = $("#destGrid");
  grid.innerHTML = list.length ? list.map((p, i) => {
    const fare = Math.round(baseFare(km(state.origin, p)) * 0.82 / 10) * 10;
    return `<button class="dest ${i % 7 === 0 && list.length > 3 ? "wide" : ""}" data-code="${p.code}" aria-label="${p.city}, ${p.country}. Flights from ${inr.format(fare)}">
      <div class="photo"></div>
      <span class="vibe-tag ${p.custom ? "mine-tag" : ""}">${p.custom ? "Added by you" : p.vibe}</span>
      <div class="dest-info"><h3>${escapeHTML(p.city)}</h3><p><span>${escapeHTML(p.country)}</span><span class="fare">from ${inr.format(fare)}</span></p></div>
    </button>`;
  }).join("") : `<p class="empty">Nothing here yet. Add your own place below and it shows up in this tab.</p>`;
  $$(".dest", grid).forEach((card) => paintPhoto($(".photo", card), findPlace(card.dataset.code)));
}
const grid = $("#destGrid");
grid.addEventListener("click", (e) => {
  const c = e.target.closest(".dest");
  if (c) openDrawer(findPlace(c.dataset.code));
});
if (!reduced) {
  grid.addEventListener("pointermove", (e) => {
    const c = e.target.closest(".dest");
    if (!c || e.pointerType !== "mouse") return;
    const r = c.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    c.style.transform = `perspective(800px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg) translateY(-4px)`;
  });
  grid.addEventListener("pointerout", (e) => {
    const c = e.target.closest(".dest");
    if (c && !c.contains(e.relatedTarget)) c.style.transform = "";
  });
}

/* ---------- destination drawer ---------- */
let drawerClock;
function openDrawer(p) {
  const d = km(state.origin, p);
  paintPhoto($("#drawerPhoto"), p);
  $("#drawerTitle").textContent = p.city;
  $("#drawerCountry").textContent = p.country;
  $("#drawerBlurb").textContent = p.blurb || "A place you added to the map. Pack light, bring a camera.";
  const facts = () => [
    ["From " + state.origin.code, `${Math.round(d).toLocaleString("en-IN")} km`],
    ["Flight time", `~${hm(flightMins(d))}`],
    ["Local time now", localTime(p.tz)],
    ["Best months", p.season || "Any time"],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  $("#drawerFacts").innerHTML = facts();
  clearInterval(drawerClock);
  drawerClock = setInterval(() => ($("#drawerFacts").innerHTML = facts()), 15000);
  $("#drawerRemove").hidden = !p.custom;
  $("#drawer").dataset.code = p.code;
  $("#drawer").showModal();
}
$("#drawer").addEventListener("close", () => clearInterval(drawerClock));
$("#drawerFly").addEventListener("click", () => {
  const p = findPlace($("#drawer").dataset.code);
  $("#drawer").close();
  setDest(p);
  $("#top").scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
  toast(`Route to ${p.city} is on the globe`);
});
$("#drawerRemove").addEventListener("click", () => {
  const code = $("#drawer").dataset.code;
  state.custom = state.custom.filter((p) => p.code !== code);
  store.set("aarav-airlines.places", state.custom);
  if (state.dest?.code === code) setDest(null, { fly: false });
  $("#drawer").close();
  refreshPlaces();
  toast("Place removed");
});

/* ---------- add a place ---------- */
const addForm = $("#addForm");
let pickMode = false;
$("#pickOnGlobe").addEventListener("click", () => {
  pickMode = true;
  globe.pickMode = true;
  $(".globe-wrap").classList.add("picking");
  $(".globe-wrap").scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
});
function finishPick([lng, lat]) {
  pickMode = false;
  globe.pickMode = false;
  $(".globe-wrap").classList.remove("picking");
  addForm.lat.value = lat.toFixed(3);
  addForm.lng.value = lng.toFixed(3);
  $("#add").scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
  $("#addMsg").textContent = `Pin dropped at ${lat.toFixed(2)}°, ${lng.toFixed(2)}°. Now give it a name.`;
  addForm.city.focus({ preventScroll: true });
}
function previewAdd() {
  const f = new FormData(addForm);
  $(".pc-meta strong", $("#addPreview")).textContent = f.get("city") || "Your place";
  $(".pc-meta span", $("#addPreview")).textContent = f.get("country") || "Somewhere wonderful";
  paintPhoto($(".pc-photo"), { code: (f.get("city") || "NEW").slice(0, 3).toUpperCase(), vibe: f.get("vibe"), photo: f.get("photo") });
}
addForm.addEventListener("input", previewAdd);
addForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const f = new FormData(addForm);
  const lat = +f.get("lat"), lng = +f.get("lng");
  const base = f.get("city").trim().normalize("NFD").replace(/[^A-Za-z]/g, "").toUpperCase().padEnd(3, "X").slice(0, 3);
  let code = base, n = 1;
  while (findPlace(code) || ORIGINS.some((o) => o.code === code)) code = base.slice(0, 2) + n++;
  const off = Math.round(lng / 15);
  const place = {
    code, city: f.get("city").trim(), country: f.get("country").trim(), lat, lng,
    tz: `Etc/GMT${off <= 0 ? "+" : "-"}${Math.abs(off)}`, vibe: f.get("vibe"),
    photo: f.get("photo").trim() || null, custom: true,
  };
  state.custom.push(place);
  store.set("aarav-airlines.places", state.custom);
  refreshPlaces();
  addForm.reset();
  previewAdd();
  $("#addMsg").textContent = `${place.city} is on the map with code ${code}.`;
  setDest(place);
  toast(`${place.city} added — look for the new pin`);
});
function refreshPlaces() {
  globe.setPlaces(allPlaces());
  fillSelects();
  renderGrid();
}

/* ---------- misc ---------- */
addEventListener("scroll", () => $(".nav").classList.toggle("scrolled", scrollY > 40), { passive: true });

fillSelects();
renderGrid();
buildBoard();
updateTripCount();
previewAdd();
// open on a random featured route so the globe has something to show off
setTimeout(() => setDest(DESTINATIONS[Math.floor(Math.random() * 8)]), 900);
