const STORAGE_KEY = "kicktracker.kicks";
const UNSYNCED_KEY = "kicktracker.unsynced"; // ids not yet uploaded
const DELETED_KEY = "kicktracker.deleted";   // ids not yet deleted remotely
const SVG_NS = "http://www.w3.org/2000/svg";

// A kick is {id, ts}: a uuid and ms since epoch.
let kicks = load(STORAGE_KEY).map(k => (typeof k === "number" ? { id: crypto.randomUUID(), ts: k } : k));
let unsynced = new Set(load(UNSYNCED_KEY));
let deleted = new Set(load(DELETED_KEY));
// kicks made before cloud sync existed need uploading once
for (const k of kicks) if (!k.synced) unsynced.add(k.id);

const sb = window.supabase && window.SUPABASE_URL
  ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
  : null;
let session = null;

function load(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(kicks.map(({ id, ts }) => ({ id, ts, synced: true }))));
    localStorage.setItem(UNSYNCED_KEY, JSON.stringify([...unsynced]));
    localStorage.setItem(DELETED_KEY, JSON.stringify([...deleted]));
  } catch {
    // storage unavailable; keep working in memory
  }
}

async function sync() {
  if (!sb || !session || !navigator.onLine) return;
  try {
    if (deleted.size) {
      const { error } = await sb.from("kicks").delete().in("id", [...deleted]);
      if (error) throw error;
      deleted.clear();
    }
    const pending = kicks.filter(k => unsynced.has(k.id));
    if (pending.length) {
      const rows = pending.map(k => ({ id: k.id, kicked_at: new Date(k.ts).toISOString() }));
      const { error } = await sb.from("kicks").upsert(rows, { onConflict: "id" });
      if (error) throw error;
      unsynced.clear();
    }
    const { data, error } = await sb.from("kicks").select("id, kicked_at").limit(100000);
    if (error) throw error;
    kicks = data.map(r => ({ id: r.id, ts: new Date(r.kicked_at).getTime() }));
    save();
    render();
  } catch (e) {
    console.warn("sync failed, will retry", e);
  }
}

function renderAuth() {
  const box = document.getElementById("auth");
  box.replaceChildren();
  if (!sb) return;
  if (session) {
    box.append(`Synced as ${session.user.email} · `);
    const out = document.createElement("button");
    out.type = "button";
    out.className = "link";
    out.textContent = "Sign out";
    out.addEventListener("click", () => sb.auth.signOut());
    box.append(out);
    return;
  }
  const form = document.createElement("form");
  const input = document.createElement("input");
  input.type = "email";
  input.required = true;
  input.placeholder = "Email to sync across devices";
  const btn = document.createElement("button");
  btn.type = "submit";
  btn.textContent = "Send login link";
  form.append(input, btn);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const { error } = await sb.auth.signInWithOtp({
      email: input.value,
      options: { emailRedirectTo: location.origin + location.pathname },
    });
    box.textContent = error ? `Couldn't send link: ${error.message}` : "Check your email for the login link.";
  });
  box.append(form);
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
function drawBars(svg, bars, labelEvery = 1, peakIndex = -1) {
  svg.replaceChildren();
  const defs = el("defs");
  const grad = el("linearGradient", { id: "bar-grad", x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.append(el("stop", { offset: "0%", class: "stop-a" }), el("stop", { offset: "100%", class: "stop-b" }));
  defs.append(grad);
  svg.append(defs);
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
    const cls = `bar${b.value ? " has-data" : ""}${i === peakIndex ? " peak-bar" : ""}`;
    const rect = el("rect", { x: x + 3, y: top + plotH - Math.max(h, 2), width: Math.max(1, slot - 6), height: Math.max(h, 2), rx: Math.min(6, (slot - 6) / 2), class: cls });
    rect.append(el("title", {}, `${b.title || b.label}: ${b.value} kick${b.value === 1 ? "" : "s"}`));
    svg.append(rect);
    if (i % labelEvery === 0) {
      svg.append(el("text", { x: x + slot / 2, y: H - 8, "text-anchor": "middle" }, b.label));
    }
  });
}

function renderCharts() {
  const byHour = Array.from({ length: 24 }, (_, h) => ({ label: String(h), value: 0 }));
  for (const { ts } of kicks) byHour[new Date(ts).getHours()].value++;
  const hourLabel = h => `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
  byHour.forEach((b, h) => { b.title = hourLabel(h); });
  const peakValue = Math.max(...byHour.map(b => b.value));
  const peakIndex = peakValue ? byHour.findIndex(b => b.value === peakValue) : -1;
  document.getElementById("peak").textContent = peakIndex < 0
    ? "Tap Kick! to start finding the pattern."
    : `Most active around ${hourLabel(peakIndex)}`;
  drawBars(document.getElementById("hourChart"), byHour, 3, peakIndex);

  // last 14 days, including days with zero kicks
  const counts = new Map();
  for (const { ts } of kicks) counts.set(dayKey(ts), (counts.get(dayKey(ts)) || 0) + 1);
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
  const recent = [...kicks].sort((a, b) => b.ts - a.ts).slice(0, 15);
  for (const { id, ts } of recent) {
    const li = document.createElement("li");
    const when = document.createElement("span");
    when.textContent = new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "link";
    del.textContent = "delete";
    del.addEventListener("click", () => removeKick(id));
    li.append(when, del);
    list.append(li);
  }
}

function render() {
  const today = kicks.filter(({ ts }) => dayKey(ts) === dayKey(Date.now())).length;
  document.getElementById("today").innerHTML = `<b>${today}</b>kick${today === 1 ? "" : "s"} today · ${kicks.length} total`;
  renderCharts();
  renderRecent();
}

function removeKick(id) {
  kicks = kicks.filter(k => k.id !== id);
  if (unsynced.has(id)) unsynced.delete(id); else deleted.add(id);
  save();
  render();
  sync();
}

document.getElementById("kick").addEventListener("click", () => {
  const k = { id: crypto.randomUUID(), ts: Date.now() };
  kicks.push(k);
  unsynced.add(k.id);
  save();
  render();
  sync();
  const btn = document.getElementById("kick");
  btn.classList.remove("pressed");
  void btn.offsetWidth;
  btn.classList.add("pressed");
  if (navigator.vibrate) navigator.vibrate(20);
});

const pastDate = document.getElementById("pastDate");
const pastTime = document.getElementById("pastTime");
{
  const d = new Date();
  pastDate.value = dayKey(d.getTime());
  pastTime.value = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

document.getElementById("past").addEventListener("submit", (e) => {
  e.preventDefault();
  const ts = new Date(`${pastDate.value}T${pastTime.value}`).getTime();
  const count = Math.max(1, Math.min(100, parseInt(document.getElementById("pastCount").value, 10) || 1));
  if (!Number.isFinite(ts)) return;
  for (let i = 0; i < count; i++) {
    const k = { id: crypto.randomUUID(), ts: ts + i * 1000 }; // 1s apart so they stay distinct
    kicks.push(k);
    unsynced.add(k.id);
  }
  save();
  render();
  sync();
  document.getElementById("pastCount").value = 1;
});

document.getElementById("undo").addEventListener("click", () => {
  if (!kicks.length) return;
  removeKick(kicks.reduce((a, b) => (b.ts > a.ts ? b : a)).id);
});

document.getElementById("export").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(kicks.map(k => k.ts))], { type: "application/json" });
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
    const have = new Set(kicks.map(k => k.ts));
    for (const ts of data.filter(Number.isFinite)) {
      if (have.has(ts)) continue;
      const k = { id: crypto.randomUUID(), ts };
      kicks.push(k);
      unsynced.add(k.id);
    }
    save();
    render();
    sync();
  } catch {
    alert("That file doesn't look like a kick export.");
  }
  e.target.value = "";
});

render();
renderAuth();
if (sb) {
  sb.auth.onAuthStateChange((_event, s) => { session = s; renderAuth(); sync(); });
  window.addEventListener("online", sync);
}

document.getElementById("theme").addEventListener("click", () => {
  const root = document.documentElement;
  const dark = root.dataset.theme
    ? root.dataset.theme === "dark"
    : matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = dark ? "light" : "dark";
  try { localStorage.setItem("kicktracker.theme", root.dataset.theme); } catch {}
});
