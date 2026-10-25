// The English text is the key: t("Send code"). tr has the Turkish for every key; English needs no entry.
// Static text in index.html is marked data-i18n="key" (or data-i18n-aria-label / -placeholder / -title).
const LANG_KEY = "kicktracker.lang";
const LANGUAGES = ["en", "tr"];

const tr = {
  "Kick Tracker": "Tekme Takibi",
  "Every little movement, remembered.": "Her küçük hareket hatırlanır.",
  // Turkish name strings avoid suffixes on {name}: they follow vowel harmony (Ela'nın, Deniz'in).
  "Every little movement from {name}, remembered.": "{name} — her küçük hareket hatırlanır.",
  "When does {name} kick most?": "{name} en çok ne zaman tekmeliyor?",
  "{name} is most active around {hour}": "{name} için en hareketli saat: {hour}",
  "{name}'s kicks per day": "{name} — günlük tekme sayısı",
  "Add baby's name": "Bebeğin adını ekle",
  "Edit baby's name": "Bebeğin adını düzenle",
  "Baby's name": "Bebeğin adı",
  "Save": "Kaydet",
  "Toggle light and dark theme": "Açık ve koyu temayı değiştir",
  "Switch to Turkish": "Türkçe’ye geç",
  "Switch to English": "Switch to English",
  "Log a kick": "Tekme kaydet",
  "Kick!": "Tekme!",
  "Undo last kick": "Son tekmeyi geri al",
  "Log a past kick": "Geçmiş bir tekmeyi kaydet",
  "Date": "Tarih",
  "Time": "Saat",
  "Number of kicks": "Tekme sayısı",
  "Add": "Ekle",
  "When does the baby kick most?": "Bebek en çok ne zaman tekmeliyor?",
  "Kicks by hour of day, all days combined.": "Günün saatine göre tekmeler, tüm günler birlikte.",
  "Kicks by hour of day": "Günün saatine göre tekmeler",
  "Kicks per day": "Günlük tekme sayısı",
  "The last 14 days.": "Son 14 gün.",
  "Recent kicks": "Son tekmeler",
  "Export JSON": "JSON dışa aktar",
  "Import JSON": "JSON içe aktar",
  "Synced as {email} · ": "{email} olarak eşitlendi · ",
  "Sign out": "Çıkış yap",
  "Email to sync across devices": "Cihazlar arasında eşitlemek için e-posta",
  "Send code": "Kod gönder",
  "Sending…": "Gönderiliyor…",
  "Couldn't send: {error}": "Gönderilemedi: {error}",
  "Code from email": "E-postadaki kod",
  "Sign in": "Giriş yap",
  "We emailed {email}. Enter the code, or just tap the link in the email.":
    "{email} adresine e-posta gönderdik. Kodu girin ya da e-postadaki bağlantıya dokunun.",
  "Use a different email": "Başka bir e-posta kullan",
  "That code didn't work: {error}": "Bu kod çalışmadı: {error}",
  "{count} kick": "{count} tekme",
  "{count} kicks": "{count} tekme",
  "{title}: {count} kick": "{title}: {count} tekme",
  "{title}: {count} kicks": "{title}: {count} tekme",
  "kick today · {total} total": "tekme bugün · toplam {total}",
  "kicks today · {total} total": "tekme bugün · toplam {total}",
  "Tap Kick! to start finding the pattern.": "Düzeni bulmaya başlamak için Tekme!’ye dokunun.",
  "Most active around {hour}": "En hareketli saat: {hour}",
  "delete": "sil",
  "That file doesn't look like a kick export.": "Bu dosya bir tekme dışa aktarımına benzemiyor.",
};
const dictionaries = { en: {}, tr };

function detect() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (LANGUAGES.includes(saved)) return saved;
  } catch {}
  return (navigator.language || "en").toLowerCase().startsWith("tr") ? "tr" : "en";
}

let language = detect();

function currentLanguage() { return language; }

function t(key, vars = {}) {
  const text = dictionaries[language][key] ?? key;
  return text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? vars[name] : m));
}

// Singular/plural pair: t(n === 1 ? "{count} kick" : "{count} kicks", { count: n }) in short.
function tPlural(n, one, many, vars = {}) {
  return t(n === 1 ? one : many, { ...vars, count: n });
}

function applyStatic() {
  document.documentElement.lang = language;
  for (const node of document.querySelectorAll("[data-i18n]")) node.textContent = t(node.dataset.i18n);
  for (const attr of ["aria-label", "placeholder", "title"]) {
    for (const node of document.querySelectorAll(`[data-i18n-${attr}]`)) {
      node.setAttribute(attr, t(node.getAttribute(`data-i18n-${attr}`)));
    }
  }
  const toggle = document.getElementById("lang");
  if (toggle) {
    const turkish = language === "tr";
    toggle.textContent = turkish ? "TR" : "EN";
    // Named in the language it switches to, so it's findable by someone who can't read the current one.
    toggle.setAttribute("aria-label", turkish ? "Switch to English" : "Türkçe’ye geç");
  }
}

function setLanguage(next) {
  language = next;
  try { localStorage.setItem(LANG_KEY, next); } catch {}
  applyStatic();
  window.dispatchEvent(new Event("languagechange-app"));
}
