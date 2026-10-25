const STORAGE_KEY = "kicktracker.kicks";
const UNSYNCED_KEY = "kicktracker.unsynced"; // ids not yet uploaded
const DELETED_KEY = "kicktracker.deleted";   // ids not yet deleted remotely
const SVG_NS = "http://www.w3.org/2000/svg";
const SESSION_GAP = 10 * 60 * 1000; // kicks closer together than this form one session
const PRESET_TAGS = ["Coffee", "Breakfast", "Lunch", "Dinner", "Snack", "Resting", "Walking", "Music"];

// A kick is {id, ts, tag?, note?}: a uuid, ms since epoch, and its session's context.
// Kicks are replaced, never mutated, when edited (sync relies on this).
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(kicks.map(({ id, ts, tag, note }) => ({ id, ts, tag, note, synced: true }))));
    localStorage.setItem(UNSYNCED_KEY, JSON.stringify([...unsynced]));
    localStorage.setItem(DELETED_KEY, JSON.stringify([...deleted]));
  } catch {
    // storage unavailable; keep working in memory
  }
}

const NAME_KEY = "kicktracker.babyName";
const NAME_UNSYNCED_KEY = "kicktracker.babyNameUnsynced"; // "1" while a local edit hasn't been uploaded
let babyName = "";
let nameUnsynced = false;
try {
  babyName = localStorage.getItem(NAME_KEY) || "";
  nameUnsynced = localStorage.getItem(NAME_UNSYNCED_KEY) === "1";
} catch {}

function saveName() {
  try {
    localStorage.setItem(NAME_KEY, babyName);
    localStorage.setItem(NAME_UNSYNCED_KEY, nameUnsynced ? "1" : "");
  } catch {}
}

function setBabyName(name) {
  babyName = name.trim().slice(0, 40);
  nameUnsynced = true;
  saveName();
  render();
  sync();
}

// Last edit wins: a local edit is uploaded, otherwise the server's name is adopted.
// Kept apart from kick sync so a missing profiles table can't block kicks.
async function syncName() {
  try {
    if (nameUnsynced) {
      const sent = babyName;
      const { error } = await sb.from("profiles").upsert(
        { user_id: session.user.id, baby_name: sent || null, updated_at: new Date().toISOString() },
        { onConflict: "user_id" });
      if (error) throw error;
      if (babyName === sent) { nameUnsynced = false; saveName(); }
      return;
    }
    const { data, error } = await sb.from("profiles").select("baby_name").maybeSingle();
    if (error) throw error;
    if (data && !nameUnsynced && (data.baby_name || "") !== babyName) {
      babyName = data.baby_name || "";
      saveName();
      render();
    }
  } catch (e) {
    console.warn("name sync failed, will retry", e);
  }
}

let syncing = false;
let syncAgain = false;

async function sync() {
  if (!sb || !session || !navigator.onLine) return;
  syncName();
  // one run at a time; changes made during a run are sent by a follow-up run
  if (syncing) { syncAgain = true; return; }
  syncing = true;
  try {
    if (deleted.size) {
      const ids = [...deleted];
      const { error } = await sb.from("kicks").delete().in("id", ids);
      if (error) throw error;
      for (const id of ids) deleted.delete(id);
    }
    const pending = kicks.filter(k => unsynced.has(k.id));
    if (pending.length) {
      const rows = pending.map(k => ({ id: k.id, kicked_at: new Date(k.ts).toISOString(), tag: k.tag || null, note: k.note || null }));
      const { error } = await sb.from("kicks").upsert(rows, { onConflict: "id" });
      if (error) throw error;
      // a kick edited meanwhile is a new object, so it stays queued
      const current = new Set(kicks);
      for (const k of pending) if (current.has(k)) unsynced.delete(k.id);
    }
    const { data, error } = await sb.from("kicks").select("id, kicked_at, tag, note").limit(100000);
    if (error) throw error;
    // kicks still queued locally are newer than the server's copy
    const local = kicks.filter(k => unsynced.has(k.id));
    const localIds = new Set(local.map(k => k.id));
    kicks = data
      .filter(r => !localIds.has(r.id) && !deleted.has(r.id))
      .map(r => ({ id: r.id, ts: new Date(r.kicked_at).getTime(), tag: r.tag || undefined, note: r.note || undefined }))
      .concat(local);
    save();
    render();
  } catch (e) {
    console.warn("sync failed, will retry", e);
  } finally {
    syncing = false;
    if (syncAgain) { syncAgain = false; sync(); }
  }
}

function renderAuth() {
  const box = document.getElementById("auth");
  box.replaceChildren();
  if (!sb) return;
  if (session) {
    box.append(t("Synced as {email} · ", { email: session.user.email }));
    const out = document.createElement("button");
    out.type = "button";
    out.className = "link";
    out.textContent = t("Sign out");
    out.addEventListener("click", () => sb.auth.signOut());
    box.append(out);
    return;
  }
  const form = document.createElement("form");
  const input = document.createElement("input");
  input.type = "email";
  input.required = true;
  input.placeholder = t("Email to sync across devices");
  const btn = document.createElement("button");
  btn.type = "submit";
  btn.textContent = t("Send code");
  form.append(input, btn);
  const msg = document.createElement("p");
  msg.className = "muted";
  box.append(form, msg);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = input.value.trim();
    msg.textContent = t("Sending…");
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.origin + location.pathname },
    });
    if (error) { msg.textContent = t("Couldn't send: {error}", { error: error.message }); return; }
    showCodeStep(box, email);
  });
}

// Step 2: type the code from the email (works inside an installed phone app,
// where the emailed link would open in the browser instead).
function showCodeStep(box, email) {
  box.replaceChildren();
  const form = document.createElement("form");
  const code = document.createElement("input");
  code.type = "text";
  code.inputMode = "numeric";
  code.autocomplete = "one-time-code";
  code.required = true;
  code.pattern = "[0-9]{6,10}";
  code.placeholder = t("Code from email");
  const btn = document.createElement("button");
  btn.type = "submit";
  btn.textContent = t("Sign in");
  form.append(code, btn);
  const msg = document.createElement("p");
  msg.className = "muted";
  msg.textContent = t("We emailed {email}. Enter the code, or just tap the link in the email.", { email });
  const back = document.createElement("button");
  back.type = "button";
  back.className = "link";
  back.textContent = t("Use a different email");
  back.addEventListener("click", renderAuth);
  box.append(form, msg, back);
  code.focus();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const { error } = await sb.auth.verifyOtp({ email, token: code.value.trim(), type: "email" });
    if (error) msg.textContent = t("That code didn't work: {error}", { error: error.message });
  });
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
    rect.append(el("title", {}, tPlural(b.value, "{title}: {count} kick", "{title}: {count} kicks", { title: b.title || b.label })));
    svg.append(rect);
    if (i % labelEvery === 0) {
      svg.append(el("text", { x: x + slot / 2, y: H - 8, "text-anchor": "middle" }, b.label));
    }
  });
}

// Text that mentions the baby: by name once one is set, generically before.
function named(withName, generic, vars = {}) {
  return babyName ? t(withName, { ...vars, name: babyName }) : t(generic, vars);
}

function renderName() {
  document.getElementById("subtitle").textContent = named("Every little movement from {name}, remembered.", "Every little movement, remembered.");
  document.getElementById("hourTitle").textContent = named("When does {name} kick most?", "When does the baby kick most?");
  document.getElementById("dayTitle").textContent = named("{name}'s kicks per day", "Kicks per day");

  const box = document.getElementById("baby");
  if (editing(box)) return;
  box.replaceChildren();
  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "link";
  if (babyName) {
    edit.textContent = `${babyName} ✎`;
    edit.setAttribute("aria-label", t("Edit baby's name"));
  } else {
    edit.textContent = t("Add baby's name");
  }
  edit.addEventListener("click", () => showNameEditor(box));
  box.append(edit);
}

function showNameEditor(box) {
  box.replaceChildren();
  const form = document.createElement("form");
  const input = document.createElement("input");
  input.maxLength = 40;
  input.value = babyName;
  input.placeholder = t("Baby's name");
  input.setAttribute("aria-label", t("Baby's name"));
  const btn = document.createElement("button");
  btn.type = "submit";
  btn.textContent = t("Save");
  form.append(input, btn);
  box.append(form);
  input.focus();

  let done = false;
  const finish = (save) => {
    if (done) return;
    done = true;
    input.blur();
    if (save) setBabyName(input.value); else renderName();
  };
  form.addEventListener("submit", (e) => { e.preventDefault(); finish(true); });
  input.addEventListener("keydown", (e) => { if (e.key === "Escape") finish(false); });
  // leaving the field saves (Safari doesn't focus Save on tap, so blur comes first)
  input.addEventListener("blur", () => finish(true));
}

function renderCharts() {
  const byHour = Array.from({ length: 24 }, (_, h) => ({ label: String(h), value: 0 }));
  for (const { ts } of kicks) byHour[new Date(ts).getHours()].value++;
  const hourLabel = h => (language === "tr" ? `${String(h).padStart(2, "0")}:00` : `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`);
  byHour.forEach((b, h) => { b.title = hourLabel(h); });
  const peakValue = Math.max(...byHour.map(b => b.value));
  const peakIndex = peakValue ? byHour.findIndex(b => b.value === peakValue) : -1;
  document.getElementById("peak").textContent = peakIndex < 0
    ? t("Tap Kick! to start finding the pattern.")
    : named("{name} is most active around {hour}", "Most active around {hour}", { hour: hourLabel(peakIndex) });
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

// Sessions aren't stored: they're runs of kicks less than SESSION_GAP apart, oldest first.
// Their tag and note live on the kicks; the latest kick that has either speaks for the session.
function sessions() {
  const out = [];
  for (const k of [...kicks].sort((a, b) => a.ts - b.ts)) {
    const last = out[out.length - 1];
    if (last && k.ts - last.end < SESSION_GAP) {
      last.kicks.push(k);
      last.end = k.ts;
    } else {
      out.push({ kicks: [k], start: k.ts, end: k.ts });
    }
  }
  for (const s of out) {
    const tagged = s.kicks.findLast(k => k.tag || k.note);
    s.tag = tagged?.tag || "";
    s.note = tagged?.note || "";
  }
  return out;
}

// changes = {tag} and/or {note}; "" clears. Applies to every kick in the session holding kickId.
function setSessionTag(kickId, changes) {
  const s = sessions().find(s => s.kicks.some(k => k.id === kickId));
  if (!s) return;
  const next = { tag: s.tag, note: s.note, ...changes };
  const ids = new Set(s.kicks.map(k => k.id));
  kicks = kicks.map(k => {
    if (!ids.has(k.id)) return k;
    unsynced.add(k.id);
    return { id: k.id, ts: k.ts, tag: next.tag || undefined, note: next.note || undefined };
  });
  save();
  render();
  sync();
}

// A kick that joins a session picks up its tag and note.
function newKick(ts) {
  let prev = null;
  for (const k of kicks) if (k.ts <= ts && ts - k.ts < SESSION_GAP && (!prev || k.ts > prev.ts)) prev = k;
  return { id: crypto.randomUUID(), ts, tag: prev?.tag, note: prev?.note };
}

// Panels aren't rebuilt while someone is typing in them; committing the edit re-renders.
function editing(box) {
  return box.contains(document.activeElement) && document.activeElement.tagName === "INPUT";
}

function timeLabel(ts) {
  return new Date(ts).toLocaleTimeString(language, { hour: "numeric", minute: "2-digit" });
}

function tagEditor(s) {
  const key = s.kicks[0].id;
  const box = document.createElement("div");
  box.className = "tag-editor";
  const chips = document.createElement("div");
  chips.className = "chips";
  chips.setAttribute("role", "group");
  chips.setAttribute("aria-label", t("Session tag"));
  const custom = [...new Set(kicks.map(k => k.tag).filter(tag => tag && !PRESET_TAGS.includes(tag)))].sort();
  for (const tag of [...PRESET_TAGS, ...custom]) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = t(tag);
    chip.setAttribute("aria-pressed", String(tag === s.tag));
    chip.addEventListener("click", () => setSessionTag(key, { tag: tag === s.tag ? "" : tag }));
    chips.append(chip);
  }
  const add = document.createElement("button");
  add.type = "button";
  add.className = "chip";
  add.textContent = "+";
  add.setAttribute("aria-label", t("Add your own tag"));
  add.addEventListener("click", () => {
    const input = document.createElement("input");
    input.className = "chip-input";
    input.maxLength = 40;
    input.placeholder = t("Your tag");
    input.setAttribute("aria-label", t("Your tag"));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") input.blur();
      if (e.key === "Escape") { input.value = ""; input.blur(); }
    });
    input.addEventListener("blur", () => {
      const tag = input.value.trim();
      if (tag) setSessionTag(key, { tag }); else input.replaceWith(add);
    }, { once: true });
    add.replaceWith(input);
    input.focus();
  });
  chips.append(add);

  const note = document.createElement("input");
  note.className = "note-input";
  note.maxLength = 200;
  note.value = s.note;
  note.placeholder = t("Add a note");
  note.setAttribute("aria-label", t("Note for this session"));
  note.addEventListener("keydown", (e) => { if (e.key === "Enter") note.blur(); });
  note.addEventListener("change", () => setSessionTag(key, { note: note.value.trim() }));
  box.append(chips, note);
  return box;
}

// While the latest session is still open, offer to tag it right under the Kick button.
let liveTimer;
function renderLive() {
  const box = document.getElementById("live");
  if (editing(box)) return;
  clearTimeout(liveTimer);
  box.replaceChildren();
  const s = sessions().at(-1);
  if (!s || Date.now() - s.end >= SESSION_GAP) return;
  liveTimer = setTimeout(renderLive, s.end + SESSION_GAP - Date.now());
  const head = document.createElement("p");
  head.className = "muted";
  head.textContent = tPlural(s.kicks.length, "This session · {count} kick since {time}", "This session · {count} kicks since {time}", { time: timeLabel(s.start) });
  box.append(head, tagEditor(s));
}

const openSessions = new Set(); // first-kick ids of sessions expanded in the list

function renderRecent() {
  const list = document.getElementById("recent");
  if (editing(list)) return;
  list.replaceChildren();
  for (const s of sessions().reverse().slice(0, 10)) {
    const key = s.kicks[0].id;
    const li = document.createElement("li");
    const details = document.createElement("details");
    details.open = openSessions.has(key);
    details.addEventListener("toggle", () => {
      if (details.open) openSessions.add(key); else openSessions.delete(key);
    });

    const summary = document.createElement("summary");
    const tag = document.createElement("span");
    tag.className = s.tag ? "s-tag" : "s-tag untagged";
    tag.textContent = s.tag ? t(s.tag) : t("untagged");
    const count = document.createElement("span");
    count.className = "s-count";
    count.textContent = tPlural(s.kicks.length, "{count} kick", "{count} kicks");
    const when = document.createElement("span");
    when.className = "s-when";
    const day = new Date(s.start).toLocaleDateString(language, { month: "short", day: "numeric" });
    const from = timeLabel(s.start), to = timeLabel(s.end);
    when.textContent = from === to ? `${day} · ${from}` : `${day} · ${from}–${to}`;
    summary.append(tag, count, when);
    if (s.note) {
      const note = document.createElement("span");
      note.className = "s-note";
      note.textContent = s.note;
      summary.append(note);
    }

    const each = document.createElement("ul");
    each.className = "kick-list";
    for (const { id, ts } of [...s.kicks].reverse()) {
      const row = document.createElement("li");
      const at = document.createElement("span");
      at.textContent = new Date(ts).toLocaleTimeString(language, { hour: "numeric", minute: "2-digit", second: "2-digit" });
      const del = document.createElement("button");
      del.type = "button";
      del.className = "link";
      del.textContent = t("delete");
      del.addEventListener("click", () => removeKick(id));
      row.append(at, del);
      each.append(row);
    }
    details.append(summary, tagEditor(s), each);
    li.append(details);
    list.append(li);
  }
}

function render() {
  const today = kicks.filter(({ ts }) => dayKey(ts) === dayKey(Date.now())).length;
  document.getElementById("today").innerHTML = `<b>${today}</b>${t(today === 1 ? "kick today · {total} total" : "kicks today · {total} total", { total: kicks.length })}`;
  renderName();
  renderLive();
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
  const k = newKick(Date.now());
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
    const k = newKick(ts + i * 1000); // 1s apart so they stay distinct
    kicks.push(k);
    unsynced.add(k.id);
  }
  save();
  render();
  sync();
  document.getElementById("pastCount").value = 1;
  // move the form on by a minute, ready for the next remembered kick
  const next = new Date(ts + 60 * 1000);
  pastDate.value = dayKey(next.getTime());
  pastTime.value = `${String(next.getHours()).padStart(2, "0")}:${String(next.getMinutes()).padStart(2, "0")}`;
});

document.getElementById("undo").addEventListener("click", () => {
  if (!kicks.length) return;
  removeKick(kicks.reduce((a, b) => (b.ts > a.ts ? b : a)).id);
});

document.getElementById("export").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(kicks.map(({ ts, tag, note }) => ({ ts, tag, note })))], { type: "application/json" });
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
    // older exports are plain timestamps; newer ones are {ts, tag?, note?}
    for (const item of data) {
      const { ts, tag, note } = typeof item === "number" ? { ts: item } : (item || {});
      if (!Number.isFinite(ts) || have.has(ts)) continue;
      const k = {
        id: crypto.randomUUID(),
        ts,
        tag: typeof tag === "string" && tag ? tag : undefined,
        note: typeof note === "string" && note ? note : undefined,
      };
      kicks.push(k);
      unsynced.add(k.id);
    }
    save();
    render();
    sync();
  } catch {
    alert(t("That file doesn't look like a kick export."));
  }
  e.target.value = "";
});

applyStatic();
render();
renderAuth();
window.addEventListener("languagechange-app", () => { render(); renderAuth(); });
document.getElementById("lang").addEventListener("click", () => setLanguage(language === "tr" ? "en" : "tr"));
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

// Home-screen shortcut "Log a kick" opens ./?kick=1
if (new URLSearchParams(location.search).has("kick")) {
  history.replaceState(null, "", location.pathname);
  document.getElementById("kick").click();
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
