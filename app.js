const STORAGE_KEY = "kicktracker.kicks";
const SVG_NS = "http://www.w3.org/2000/svg";

// A kick is just a timestamp (ms since epoch).
let kicks = load();

function load() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(parsed) ? parsed.filter(Number.isFinite) : [];
  } catch {
    return [];
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(kicks));
  } catch {
    // storage unavailable; keep working in memory
  }
}

function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function el(name, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

// Generic bar chart: bars = [{label, value}], labelEvery = show every nth label.
function drawBars(svg, bars, labelEvery = 1) {
  svg.replaceChildren();
  const W = 480, H = 220, left = 28, bottom = 24, top = 10;
  const max = Math.max(1, ...bars.map(b => b.value));
  const plotH = H - bottom - top;
  const slot = (W - left) / bars.length;

  for (const frac of [0, 0.5, 1]) {
    const y = top + plotH * (1 - frac);
    svg.append(el("line", { x1: left, x2: W, y1: y, y2: y, class: "grid" }));
    svg.append(el("text", { x: left - 4, y: y + 3, "text-anchor": "end" }, Math.round(max * frac)));
  }

  bars.forEach((b, i) => {
    const h = (b.value / max) * plotH;
    const x = left + i * slot;
    svg.append(el("rect", { x: x + 2, y: top + plotH - h, width: Math.max(1, slot - 4), height: h, rx: 2, class: "bar" }));
    if (i % labelEvery === 0) {
      svg.append(el("text", { x: x + slot / 2, y: H - 8, "text-anchor": "middle" }, b.label));
    }
  });
}

function renderCharts() {
  const byHour = Array.from({ length: 24 }, (_, h) => ({ label: String(h), value: 0 }));
  for (const ts of kicks) byHour[new Date(ts).getHours()].value++;
  drawBars(document.getElementById("hourChart"), byHour, 3);

  // last 14 days, including days with zero kicks
  const counts = new Map();
  for (const ts of kicks) counts.set(dayKey(ts), (counts.get(dayKey(ts)) || 0) + 1);
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, value: counts.get(dayKey(d.getTime())) || 0 });
  }
  drawBars(document.getElementById("dayChart"), days, 2);
}

function renderRecent() {
  const list = document.getElementById("recent");
  list.replaceChildren();
  const recent = kicks.map((ts, i) => ({ ts, i })).sort((a, b) => b.ts - a.ts).slice(0, 15);
  for (const { ts, i } of recent) {
    const li = document.createElement("li");
    const when = document.createElement("span");
    when.textContent = new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "link";
    del.textContent = "delete";
    del.addEventListener("click", () => { kicks.splice(i, 1); save(); render(); });
    li.append(when, del);
    list.append(li);
  }
}

function render() {
  const today = kicks.filter(ts => dayKey(ts) === dayKey(Date.now())).length;
  document.getElementById("today").textContent = `${today} kick${today === 1 ? "" : "s"} today · ${kicks.length} total`;
  renderCharts();
  renderRecent();
}

document.getElementById("kick").addEventListener("click", () => {
  kicks.push(Date.now());
  save();
  render();
  if (navigator.vibrate) navigator.vibrate(20);
});

document.getElementById("undo").addEventListener("click", () => {
  if (!kicks.length) return;
  kicks.splice(kicks.indexOf(Math.max(...kicks)), 1);
  save();
  render();
});

document.getElementById("export").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(kicks)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `kicks-${dayKey(Date.now())}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById("import").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data)) throw new Error("not an array");
    kicks = [...new Set([...kicks, ...data.filter(Number.isFinite)])];
    save();
    render();
  } catch {
    alert("That file doesn't look like a kick export.");
  }
  e.target.value = "";
});

render();
