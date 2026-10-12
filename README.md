<div align="center">

# ✈️ Aarav Airlines

**Spin the planet. Pick a dot. We'll fly you there.**

An interactive flight booking site with a hand-drawn rotating globe, planes flying live routes, a split-flap departures board and printable boarding passes.

### [▶ Open the live site](https://aaravcodesss.github.io/contrail--flights/)

</div>

---

## What you can do

- **Spin the globe** — drag it around; every destination has a glowing route from your home airport with little planes flying along it and contrails trailing behind.
- **Tap a pin** to pick a destination. The globe swings round to the route and the search card shows distance, flight time and the lowest fare.
- **Browse 19 destinations** with photos — Paris, Tokyo, Santorini, Bali, Machu Picchu, the Taj Mahal and more. Filter by cities, beaches, mountains or wonders. Each card opens a drawer with flight time, the live local time and the best months to go.
- **Search flights** — results with non-stop and one-stop options, sort by cheapest, fastest or earliest, and a 7-day fare strip to find the cheapest day.
- **Pick your seats** on a cabin map (extra-legroom rows cost more) and name each traveller.
- **Get a boarding pass** with booking reference, gate, boarding time and barcode — print it, or find it again later under **My trips**.
- **Watch the departures board** flip through flights leaving your city. Tap a row to book that flight.
- **Add your own place** — drop a pin anywhere on the globe, give it a name and a photo link, and it gets its own route, flights and card.

## How it's built

No framework and no build step — just HTML, CSS and JavaScript modules.

| Piece | How |
|:--|:--|
| Globe | `<canvas>` + d3-geo orthographic projection. Land is sampled into a dot grid from Natural Earth data, shaded by angle to the viewer. |
| Flight arcs | Great-circle interpolation (`d3.geoInterpolate`), lifted off the surface with a sine curve so routes arc over the globe; points behind the planet are hidden. |
| Planes | Drawn on the canvas each frame, rotated to their direction of travel, with a fading dotted contrail. |
| Flights & fares | Generated from the great-circle distance with a seeded random generator, so the same route and date always give the same flights. |
| Arrival times | Departures are in India time; arrivals are converted to the destination's own time zone with `Intl`. |
| Departures board | Each character is its own tile that cycles through random letters before landing — a split-flap effect in CSS + JS. |
| Saved data | Your trips and added places stay in `localStorage`. |

Respects `prefers-reduced-motion`, works with keyboard and screen readers, and is responsive down to phone size.

## Run it locally

```bash
git clone https://github.com/Aaravcodesss/contrail--flights.git
cd contrail--flights
python3 -m http.server 8000
# open http://localhost:8000
```

(It uses JavaScript modules, so open it through a local server rather than double-clicking the file.)

---

<sub>Flights, prices and bookings are simulated — nothing is charged or booked. Destination photos from Unsplash. Land outlines from Natural Earth via world-atlas.</sub>
