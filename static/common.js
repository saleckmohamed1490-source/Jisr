// Shared helpers for the public page and the admin panel.
const Jisr = (() => {
  const LANGS = ["ar", "fr", "en"];
  let lang = "ar";
  let dict = {};

  try {
    const saved = localStorage.getItem("jisr_lang");
    if (LANGS.includes(saved)) lang = saved;
  } catch (_) {}

  const t = (key, vars) => {
    let s = dict[key] || key;
    if (vars) for (const k in vars) s = s.replaceAll("{" + k + "}", vars[k]);
    return s;
  };

  async function loadLang(next) {
    if (next) lang = next;
    try { localStorage.setItem("jisr_lang", lang); } catch (_) {}
    const res = await fetch(`/api/i18n/${lang}`);
    dict = await res.json();
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll("[data-i18n-ph]").forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
    document.querySelectorAll(".lang-switch button").forEach(b => b.classList.toggle("on", b.dataset.lang === lang));
  }

  async function api(path, opts = {}) {
    const headers = { "X-Lang": lang, "X-Jisr": "1", ...(opts.headers || {}) };
    let body = opts.body;
    if (body && !(body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(body);
    }
    const sep = path.includes("?") ? "&" : "?";
    const res = await fetch(`${path}${sep}lang=${lang}`, { ...opts, headers, body, credentials: "same-origin" });
    let data = null;
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) {
      const e = new Error((data && data.message) || t("error_generic"));
      e.status = res.status; e.data = data;
      throw e;
    }
    return data;
  }

  let toastTimer;
  function toast(msg) {
    let el = document.querySelector(".toast");
    if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), 2200);
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); }
    catch (_) {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); ta.remove();
    }
    toast(t("copied"));
  }

  const fmt = (n, digits = 2) =>
    Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 });

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Accept Arabic-Indic digits too (٠١٢…) — common on Arabic phone keyboards.
  const normDigits = s => String(s || "")
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    .replace(/٫/g, ".");

  function bindLangSwitch(onChange) {
    document.querySelectorAll(".lang-switch button").forEach(b => {
      b.addEventListener("click", async () => { await loadLang(b.dataset.lang); onChange && onChange(); });
    });
  }

  return { t, loadLang, api, toast, copy, fmt, esc, normDigits, bindLangSwitch, get lang() { return lang; } };
})();
