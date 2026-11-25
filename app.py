#!/usr/bin/env python3
"""
جسر (Jisr) - خدمة صرف وتحويل الأموال من موريتانيا
Money exchange & transfer service from Mauritania (MRU -> other currencies).

Public side : pick a country, enter an amount in MRU, see what the recipient
              gets, pay to one of our accounts, upload the receipt, track order.
Admin side  : /admin - manage countries & rates, payment accounts, orders.
"""
import csv
import io
import os
import re
import secrets
import sqlite3
import time
import uuid
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

import bcrypt
from flask import Flask, Response, abort, g, jsonify, request, send_file, send_from_directory, session
from PIL import Image, UnidentifiedImageError

# ---------------------------------------------------------------------------
# Paths & config
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
DATA_DIR = Path(os.environ.get("JISR_DATA_DIR", BASE_DIR / "data"))
UPLOAD_DIR = DATA_DIR / "uploads"
DB_PATH = Path(os.environ.get("JISR_DB", DATA_DIR / "jisr.db"))

DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _load_secret():
    """Use JISR_SECRET if set, else a random key persisted in the data dir
    so admin sessions survive restarts."""
    env = os.environ.get("JISR_SECRET")
    if env:
        return env
    key_file = DATA_DIR / ".secret_key"
    if key_file.exists():
        return key_file.read_text().strip()
    key = secrets.token_hex(32)
    key_file.write_text(key)
    try:
        key_file.chmod(0o600)
    except OSError:
        pass
    return key


app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="/static")
app.secret_key = _load_secret()
app.config.update(
    MAX_CONTENT_LENGTH=5 * 1024 * 1024,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("JISR_SECURE_COOKIES") == "1",
)

RATE_LIMIT_WINDOW = 60  # seconds
RATE_LIMIT_MAX = 5      # orders per window per IP
LOGIN_LIMIT_MAX = 10    # login attempts per window per IP
_attempts = {}

STATUSES = ("new", "done", "rejected")
NUMBER_RE = re.compile(r"^\+?\d{7,15}$")
LANGS = ("ar", "fr", "en")

# ---------------------------------------------------------------------------
# Translations
# ---------------------------------------------------------------------------
TRANSLATIONS = {
    "ar": {
        "app_name": "جسر",
        "tagline": "صرف وتحويل الأموال بسهولة",
        "choose_country": "اختر بلد الوجهة",
        "rate_label": "السعر الحالي",
        "rate_format": "{rate} {currency} لكل 100 أوقية",
        "amount_mru": "المبلغ بالأوقية (MRU)",
        "amount_receive": "المبلغ المستلم",
        "mobile_number": "رقم {method}",
        "send": "متابعة",
        "back": "رجوع",
        "payment_step": "خطوة الدفع",
        "summary": "ملخص الطلب",
        "pay_amount": "المبلغ المطلوب دفعه",
        "receive_amount": "المبلغ المستلم",
        "receiving_number": "رقم الاستلام",
        "payment_accounts": "ادفع إلى أحد الحسابات التالية",
        "copy": "نسخ",
        "copied": "تم النسخ",
        "upload_receipt": "رفع إيصال الدفع",
        "receipt_hint": "صورة الإيصال فقط (JPG / PNG)",
        "confirm_order": "تأكيد الطلب",
        "new_order": "طلب جديد",
        "success_title": "تم استلام طلبك",
        "success_msg": "سنتحقق من الإيصال ونحوّل المبلغ إلى رقمك. احتفظ برقم الطلب لتتبعه.",
        "error_required": "هذا الحقل مطلوب",
        "error_amount": "أدخل مبلغاً صحيحاً أكبر من صفر",
        "error_number": "رقم غير صالح (٧–١٥ رقم)",
        "error_receipt": "يرجى رفع صورة الإيصال",
        "error_generic": "حدث خطأ، حاول مرة أخرى",
        "error_country": "البلد غير متاح",
        "no_countries": "لا توجد بلدان متاحة حالياً",
        "loading": "جاري التحميل...",
        "admin": "الإدارة",
        "login": "تسجيل الدخول",
        "password": "كلمة المرور",
        "setup_title": "إعداد حساب المسؤول",
        "setup_hint": "أول شخص يسجّل يصبح المسؤول الوحيد",
        "username": "اسم المستخدم",
        "confirm_password": "تأكيد كلمة المرور",
        "logout": "خروج",
        "dashboard": "لوحة التحكم",
        "countries": "البلدان",
        "rates": "الأسعار",
        "payment_accounts_nav": "حسابات الدفع",
        "orders": "الطلبات",
        "add_country": "إضافة بلد",
        "edit": "تعديل",
        "delete": "حذف",
        "save": "حفظ",
        "cancel": "إلغاء",
        "active": "مفعّل",
        "inactive": "معطّل",
        "name_ar": "الاسم (عربي)",
        "name_fr": "الاسم (فرنسي)",
        "name_en": "الاسم (إنجليزي)",
        "flag": "العلم (إيموجي)",
        "currency": "رمز العملة",
        "payout_method_ar": "طريقة الاستلام (عربي)",
        "payout_method_fr": "طريقة الاستلام (فرنسي)",
        "payout_method_en": "طريقة الاستلام (إنجليزي)",
        "rate_per_100": "السعر لكل 100 أوقية",
        "add_account": "إضافة حساب",
        "account_name_ar": "اسم الحساب (عربي)",
        "account_name_fr": "اسم الحساب (فرنسي)",
        "account_name_en": "اسم الحساب (إنجليزي)",
        "account_number": "رقم الحساب",
        "stats_new": "طلبات جديدة",
        "stats_all": "كل الطلبات",
        "stats_mru": "إجمالي الأوقية المستلمة",
        "stats_transferred": "إجمالي المحوَّل",
        "filter_all": "الكل",
        "filter_new": "جديد",
        "filter_done": "محوَّل",
        "filter_rejected": "مرفوض",
        "filter_country": "حسب البلد",
        "status_new": "قيد المراجعة",
        "status_done": "تم التحويل",
        "status_rejected": "مرفوض",
        "mark_transferred": "تأكيد التحويل",
        "reject": "رفض",
        "back_to_new": "إرجاع إلى جديد",
        "confirm_delete": "اضغط مرة أخرى للتأكيد",
        "export_csv": "تصدير CSV",
        "no_orders": "لا توجد طلبات",
        "date": "التاريخ",
        "country": "البلد",
        "amount": "المبلغ",
        "rate_used": "السعر المستخدم",
        "receipt": "الإيصال",
        "actions": "إجراءات",
        "empty_state": "لا شيء هنا بعد",
        "spam_error": "محاولات كثيرة، انتظر دقيقة ثم حاول مجدداً",
        "invalid_file": "ملف غير صالح، ارفع صورة",
        "file_too_large": "الملف كبير جداً (الحد ٥ ميغابايت)",
        "login_failed": "بيانات الدخول غير صحيحة",
        "setup_done": "تم إعداد الحساب بنجاح",
        "password_mismatch": "كلمتا المرور غير متطابقتين",
        "password_short": "كلمة المرور قصيرة (٨ أحرف على الأقل)",
        "already_setup": "تم إعداد المسؤول مسبقاً",
        "unauthorized": "غير مصرح",
        "order_created": "تم إنشاء الطلب",
        "per_country": "حسب البلد",
        "order_id": "رقم الطلب",
        "track_order": "تتبع طلب",
        "track": "تتبع",
        "status": "الحالة",
        "not_found": "الطلب غير موجود",
        "sort_order": "الترتيب",
        "saved": "تم الحفظ",
        "view_site": "عرض الموقع",
        "step_country": "البلد",
        "step_amount": "المبلغ",
        "step_pay": "الدفع",
        "step_done": "تم",
        "choose_file": "اختر صورة",
    },
    "fr": {
        "app_name": "Jisr",
        "tagline": "Change et transfert d'argent facile",
        "choose_country": "Choisissez le pays de destination",
        "rate_label": "Taux actuel",
        "rate_format": "{rate} {currency} pour 100 MRU",
        "amount_mru": "Montant en MRU",
        "amount_receive": "Montant reçu",
        "mobile_number": "Numéro {method}",
        "send": "Continuer",
        "back": "Retour",
        "payment_step": "Étape de paiement",
        "summary": "Résumé de la commande",
        "pay_amount": "Montant à payer",
        "receive_amount": "Montant reçu",
        "receiving_number": "Numéro de réception",
        "payment_accounts": "Payez sur l'un de ces comptes",
        "copy": "Copier",
        "copied": "Copié",
        "upload_receipt": "Téléverser le reçu",
        "receipt_hint": "Image du reçu uniquement (JPG / PNG)",
        "confirm_order": "Confirmer la commande",
        "new_order": "Nouvelle commande",
        "success_title": "Commande reçue",
        "success_msg": "Nous vérifierons le reçu et transférerons l'argent. Gardez le numéro de commande pour le suivi.",
        "error_required": "Ce champ est requis",
        "error_amount": "Entrez un montant valide",
        "error_number": "Numéro invalide (7-15 chiffres)",
        "error_receipt": "Veuillez téléverser une image",
        "error_generic": "Une erreur s'est produite",
        "error_country": "Pays non disponible",
        "no_countries": "Aucun pays disponible",
        "loading": "Chargement...",
        "admin": "Admin",
        "login": "Connexion",
        "password": "Mot de passe",
        "setup_title": "Configuration du compte admin",
        "setup_hint": "La première personne devient le seul admin",
        "username": "Nom d'utilisateur",
        "confirm_password": "Confirmer le mot de passe",
        "logout": "Déconnexion",
        "dashboard": "Tableau de bord",
        "countries": "Pays",
        "rates": "Taux",
        "payment_accounts_nav": "Comptes de paiement",
        "orders": "Commandes",
        "add_country": "Ajouter un pays",
        "edit": "Modifier",
        "delete": "Supprimer",
        "save": "Enregistrer",
        "cancel": "Annuler",
        "active": "Actif",
        "inactive": "Inactif",
        "name_ar": "Nom (arabe)",
        "name_fr": "Nom (français)",
        "name_en": "Nom (anglais)",
        "flag": "Drapeau (emoji)",
        "currency": "Code devise",
        "payout_method_ar": "Méthode (arabe)",
        "payout_method_fr": "Méthode (français)",
        "payout_method_en": "Méthode (anglais)",
        "rate_per_100": "Taux pour 100 MRU",
        "add_account": "Ajouter un compte",
        "account_name_ar": "Nom du compte (arabe)",
        "account_name_fr": "Nom du compte (français)",
        "account_name_en": "Nom du compte (anglais)",
        "account_number": "Numéro du compte",
        "stats_new": "Nouvelles commandes",
        "stats_all": "Toutes les commandes",
        "stats_mru": "Total MRU reçus",
        "stats_transferred": "Total transféré",
        "filter_all": "Tout",
        "filter_new": "Nouveau",
        "filter_done": "Transféré",
        "filter_rejected": "Rejeté",
        "filter_country": "Par pays",
        "status_new": "En vérification",
        "status_done": "Transféré",
        "status_rejected": "Rejeté",
        "mark_transferred": "Marquer comme transféré",
        "reject": "Rejeter",
        "back_to_new": "Remettre en nouveau",
        "confirm_delete": "Appuyez à nouveau pour confirmer",
        "export_csv": "Exporter CSV",
        "no_orders": "Aucune commande",
        "date": "Date",
        "country": "Pays",
        "amount": "Montant",
        "rate_used": "Taux utilisé",
        "receipt": "Reçu",
        "actions": "Actions",
        "empty_state": "Rien ici pour le moment",
        "spam_error": "Trop de tentatives, réessayez dans une minute",
        "invalid_file": "Fichier invalide, envoyez une image",
        "file_too_large": "Fichier trop volumineux (max 5 Mo)",
        "login_failed": "Échec de la connexion",
        "setup_done": "Compte configuré",
        "password_mismatch": "Mots de passe différents",
        "password_short": "Mot de passe trop court (8 caractères min.)",
        "already_setup": "Admin déjà configuré",
        "unauthorized": "Non autorisé",
        "order_created": "Commande créée",
        "per_country": "Par pays",
        "order_id": "N° de commande",
        "track_order": "Suivre une commande",
        "track": "Suivre",
        "status": "Statut",
        "not_found": "Commande introuvable",
        "sort_order": "Ordre",
        "saved": "Enregistré",
        "view_site": "Voir le site",
        "step_country": "Pays",
        "step_amount": "Montant",
        "step_pay": "Paiement",
        "step_done": "Terminé",
        "choose_file": "Choisir une image",
    },
    "en": {
        "app_name": "Jisr",
        "tagline": "Easy currency exchange & transfer",
        "choose_country": "Choose destination country",
        "rate_label": "Current rate",
        "rate_format": "{rate} {currency} per 100 MRU",
        "amount_mru": "Amount in MRU",
        "amount_receive": "Amount to receive",
        "mobile_number": "{method} number",
        "send": "Continue",
        "back": "Back",
        "payment_step": "Payment step",
        "summary": "Order summary",
        "pay_amount": "Amount to pay",
        "receive_amount": "Amount to receive",
        "receiving_number": "Receiving number",
        "payment_accounts": "Pay to one of these accounts",
        "copy": "Copy",
        "copied": "Copied",
        "upload_receipt": "Upload payment receipt",
        "receipt_hint": "Receipt image only (JPG / PNG)",
        "confirm_order": "Confirm order",
        "new_order": "New order",
        "success_title": "Order received",
        "success_msg": "We will verify the receipt and transfer the money. Keep your order number to track it.",
        "error_required": "This field is required",
        "error_amount": "Enter a valid amount greater than zero",
        "error_number": "Invalid number (7-15 digits)",
        "error_receipt": "Please upload a receipt image",
        "error_generic": "Something went wrong, try again",
        "error_country": "Country not available",
        "no_countries": "No countries available right now",
        "loading": "Loading...",
        "admin": "Admin",
        "login": "Login",
        "password": "Password",
        "setup_title": "Admin account setup",
        "setup_hint": "The first person becomes the only admin",
        "username": "Username",
        "confirm_password": "Confirm password",
        "logout": "Logout",
        "dashboard": "Dashboard",
        "countries": "Countries",
        "rates": "Rates",
        "payment_accounts_nav": "Payment accounts",
        "orders": "Orders",
        "add_country": "Add country",
        "edit": "Edit",
        "delete": "Delete",
        "save": "Save",
        "cancel": "Cancel",
        "active": "Active",
        "inactive": "Inactive",
        "name_ar": "Name (Arabic)",
        "name_fr": "Name (French)",
        "name_en": "Name (English)",
        "flag": "Flag (emoji)",
        "currency": "Currency code",
        "payout_method_ar": "Payout method (Arabic)",
        "payout_method_fr": "Payout method (French)",
        "payout_method_en": "Payout method (English)",
        "rate_per_100": "Rate per 100 MRU",
        "add_account": "Add account",
        "account_name_ar": "Account name (Arabic)",
        "account_name_fr": "Account name (French)",
        "account_name_en": "Account name (English)",
        "account_number": "Account number",
        "stats_new": "New orders",
        "stats_all": "All orders",
        "stats_mru": "Total MRU received",
        "stats_transferred": "Total transferred",
        "filter_all": "All",
        "filter_new": "New",
        "filter_done": "Transferred",
        "filter_rejected": "Rejected",
        "filter_country": "By country",
        "status_new": "Under review",
        "status_done": "Transferred",
        "status_rejected": "Rejected",
        "mark_transferred": "Mark as transferred",
        "reject": "Reject",
        "back_to_new": "Back to new",
        "confirm_delete": "Tap again to confirm",
        "export_csv": "Export CSV",
        "no_orders": "No orders",
        "date": "Date",
        "country": "Country",
        "amount": "Amount",
        "rate_used": "Rate used",
        "receipt": "Receipt",
        "actions": "Actions",
        "empty_state": "Nothing here yet",
        "spam_error": "Too many attempts, wait a minute and try again",
        "invalid_file": "Invalid file, upload an image",
        "file_too_large": "File too large (max 5 MB)",
        "login_failed": "Login failed",
        "setup_done": "Account set up successfully",
        "password_mismatch": "Passwords do not match",
        "password_short": "Password too short (min 8 characters)",
        "already_setup": "Admin already set up",
        "unauthorized": "Unauthorized",
        "order_created": "Order created",
        "per_country": "Per country",
        "order_id": "Order number",
        "track_order": "Track an order",
        "track": "Track",
        "status": "Status",
        "not_found": "Order not found",
        "sort_order": "Sort order",
        "saved": "Saved",
        "view_site": "View site",
        "step_country": "Country",
        "step_amount": "Amount",
        "step_pay": "Payment",
        "step_done": "Done",
        "choose_file": "Choose image",
    },
}


def get_lang():
    lang = request.args.get("lang") or request.headers.get("X-Lang") or "ar"
    return lang if lang in LANGS else "ar"


def t(key, lang=None, **kwargs):
    lang = lang or get_lang()
    text = TRANSLATIONS.get(lang, {}).get(key) or TRANSLATIONS["ar"].get(key) or key
    if kwargs:
        try:
            return text.format(**kwargs)
        except (KeyError, IndexError):
            return text
    return text


def err(key, status=400, **extra):
    return jsonify({"ok": False, "error": key, "message": t(key), **extra}), status


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(str(DB_PATH))
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = sqlite3.connect(str(DB_PATH))
    db.executescript("""
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS admin (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS countries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name_ar TEXT NOT NULL,
        name_fr TEXT DEFAULT '',
        name_en TEXT DEFAULT '',
        flag TEXT DEFAULT '🏳️',
        currency_code TEXT NOT NULL,
        payout_method_ar TEXT NOT NULL,
        payout_method_fr TEXT DEFAULT '',
        payout_method_en TEXT DEFAULT '',
        rate_per_100 REAL NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS payment_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name_ar TEXT NOT NULL,
        name_fr TEXT DEFAULT '',
        name_en TEXT DEFAULT '',
        number TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        public_id TEXT NOT NULL UNIQUE,
        country_id INTEGER,
        country_name TEXT NOT NULL DEFAULT '',
        amount_mru REAL NOT NULL,
        amount_receive REAL NOT NULL,
        rate_used REAL NOT NULL,
        currency_code TEXT NOT NULL,
        mobile_number TEXT NOT NULL,
        receipt_path TEXT,
        status TEXT NOT NULL DEFAULT 'new',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
    """)
    if db.execute("SELECT COUNT(*) FROM countries").fetchone()[0] == 0:
        db.execute(
            """INSERT INTO countries
            (name_ar, name_fr, name_en, flag, currency_code,
             payout_method_ar, payout_method_fr, payout_method_en,
             rate_per_100, is_active, sort_order, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?)""",
            ("سيراليون", "Sierra Leone", "Sierra Leone", "🇸🇱", "SLE",
             "أورانج موني", "Orange Money", "Orange Money", 53.0, now_iso()),
        )
    if db.execute("SELECT COUNT(*) FROM payment_accounts").fetchone()[0] == 0:
        accounts = [
            ("بنكيلي", "Bankily", "Bankily", "24162122", 0),
            ("سداد", "Sedad", "Sedad", "24162122", 1),
            ("مصريفي", "Masrivi", "Masrivi", "37202223", 2),
        ]
        for name_ar, name_fr, name_en, number, order in accounts:
            db.execute(
                """INSERT INTO payment_accounts
                (name_ar, name_fr, name_en, number, is_active, sort_order, created_at)
                VALUES (?, ?, ?, ?, 1, ?, ?)""",
                (name_ar, name_fr, name_en, number, order, now_iso()),
            )
    db.commit()
    db.close()


def row_to_dict(row):
    return {k: row[k] for k in row.keys()} if row else None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def client_ip():
    fwd = request.headers.get("X-Forwarded-For", "")
    return (fwd.split(",")[0].strip() if fwd else request.remote_addr) or "unknown"


def rate_limited(bucket, limit):
    """Sliding-window limiter, in-memory per process."""
    key = (bucket, client_ip())
    now = time.time()
    hits = [ts for ts in _attempts.get(key, []) if now - ts < RATE_LIMIT_WINDOW]
    if len(hits) >= limit:
        _attempts[key] = hits
        return True
    hits.append(now)
    _attempts[key] = hits
    if len(_attempts) > 10000:  # keep memory bounded
        for k in list(_attempts)[:5000]:
            _attempts.pop(k, None)
    return False


def admin_exists():
    return get_db().execute("SELECT 1 FROM admin WHERE id = 1").fetchone() is not None


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("admin"):
            return err("unauthorized", 401)
        # CSRF guard: state-changing admin calls must come from our JS
        if request.method not in ("GET", "HEAD") and request.headers.get("X-Jisr") != "1":
            return err("unauthorized", 403)
        return fn(*args, **kwargs)
    return wrapper


def parse_number(value, minimum=None):
    try:
        num = float(str(value).replace(",", ".").strip())
    except (TypeError, ValueError):
        return None
    if num != num or num in (float("inf"), float("-inf")):
        return None
    if minimum is not None and num < minimum:
        return None
    return num


def clean_text(value, max_len=100):
    return str(value or "").strip()[:max_len]


def localized(row, field, lang):
    return row[f"{field}_{lang}"] or row[f"{field}_ar"]


def public_country(row, lang):
    return {
        "id": row["id"],
        "name": localized(row, "name", lang),
        "flag": row["flag"],
        "currency_code": row["currency_code"],
        "payout_method": localized(row, "payout_method", lang),
        "rate_per_100": row["rate_per_100"],
    }


def new_public_id():
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "J" + "".join(secrets.choice(alphabet) for _ in range(7))


# ---------------------------------------------------------------------------
# Pages
# ---------------------------------------------------------------------------
@app.after_request
def security_headers(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Referrer-Policy", "same-origin")
    return resp


@app.route("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.route("/admin")
def admin_page():
    return send_from_directory(STATIC_DIR, "admin.html")


@app.route("/healthz")
def healthz():
    return {"ok": True}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
@app.get("/api/i18n/<lang>")
def api_i18n(lang):
    if lang not in TRANSLATIONS:
        abort(404)
    return jsonify(TRANSLATIONS[lang])


@app.get("/api/countries")
def api_countries():
    lang = get_lang()
    rows = get_db().execute(
        "SELECT * FROM countries WHERE is_active = 1 ORDER BY sort_order, id"
    ).fetchall()
    return jsonify([public_country(r, lang) for r in rows])


@app.get("/api/accounts")
def api_accounts():
    lang = get_lang()
    rows = get_db().execute(
        "SELECT * FROM payment_accounts WHERE is_active = 1 ORDER BY sort_order, id"
    ).fetchall()
    return jsonify([{"id": r["id"], "name": localized(r, "name", lang), "number": r["number"]} for r in rows])


@app.post("/api/orders")
def api_create_order():
    if rate_limited("order", RATE_LIMIT_MAX):
        return err("spam_error", 429)

    db = get_db()
    lang = get_lang()
    form = request.form

    country_id = parse_number(form.get("country_id"))
    country = None
    if country_id is not None:
        country = db.execute(
            "SELECT * FROM countries WHERE id = ? AND is_active = 1", (int(country_id),)
        ).fetchone()
    if country is None:
        return err("error_country", field="country_id")

    amount = parse_number(form.get("amount_mru"))
    if amount is None or amount <= 0 or amount > 10_000_000:
        return err("error_amount", field="amount_mru")
    amount = round(amount, 2)

    number = re.sub(r"[\s\-()]", "", form.get("mobile_number", ""))
    if not NUMBER_RE.match(number):
        return err("error_number", field="mobile_number")

    file = request.files.get("receipt")
    if not file or not file.filename:
        return err("error_receipt", field="receipt")
    try:
        img = Image.open(file.stream)
        img.verify()
        file.stream.seek(0)
        img = Image.open(file.stream)
        img.load()
    except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError):
        return err("invalid_file", field="receipt")

    # Re-encode: strips metadata and anything that isn't pixel data.
    img = img.convert("RGB")
    img.thumbnail((2000, 2000))
    receipt_name = f"{uuid.uuid4().hex}.jpg"
    img.save(UPLOAD_DIR / receipt_name, "JPEG", quality=85)

    rate = country["rate_per_100"]
    receive = round(amount * rate / 100, 2)
    ts = now_iso()
    for _ in range(5):
        public_id = new_public_id()
        try:
            db.execute(
                """INSERT INTO orders
                (public_id, country_id, country_name, amount_mru, amount_receive, rate_used,
                 currency_code, mobile_number, receipt_path, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)""",
                (public_id, country["id"], localized(country, "name", "ar"), amount, receive, rate,
                 country["currency_code"], number, receipt_name, ts, ts),
            )
            db.commit()
            break
        except sqlite3.IntegrityError:
            continue
    else:
        return err("error_generic", 500)

    return jsonify({
        "ok": True,
        "message": t("order_created", lang),
        "order": {
            "public_id": public_id,
            "amount_mru": amount,
            "amount_receive": receive,
            "currency_code": country["currency_code"],
            "status": "new",
        },
    }), 201


@app.get("/api/orders/<public_id>")
def api_track_order(public_id):
    if rate_limited("track", 30):
        return err("spam_error", 429)
    row = get_db().execute(
        "SELECT public_id, amount_mru, amount_receive, currency_code, status, created_at, updated_at "
        "FROM orders WHERE public_id = ?",
        (public_id.strip().upper(),),
    ).fetchone()
    if not row:
        return err("not_found", 404)
    data = row_to_dict(row)
    data["status_label"] = t(f"status_{data['status']}")
    return jsonify({"ok": True, "order": data})


@app.errorhandler(413)
def too_large(_e):
    return err("file_too_large", 413)


# ---------------------------------------------------------------------------
# Admin: auth
# ---------------------------------------------------------------------------
@app.get("/api/admin/state")
def api_admin_state():
    return jsonify({
        "setup_needed": not admin_exists(),
        "logged_in": bool(session.get("admin")),
        "username": session.get("admin_user"),
    })


@app.post("/api/admin/setup")
def api_admin_setup():
    if request.headers.get("X-Jisr") != "1":
        return err("unauthorized", 403)
    data = request.get_json(silent=True) or {}
    username = clean_text(data.get("username"), 50)
    password = str(data.get("password") or "")
    if not username or not password:
        return err("error_required")
    if len(password) < 8:
        return err("password_short")
    if password != data.get("confirm_password"):
        return err("password_mismatch")
    db = get_db()
    pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    try:
        # id is fixed to 1, so a second setup attempt fails at the DB level too.
        db.execute(
            "INSERT INTO admin (id, username, password_hash, created_at) VALUES (1, ?, ?, ?)",
            (username, pw_hash, now_iso()),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return err("already_setup", 409)
    session.clear()
    session["admin"] = True
    session["admin_user"] = username
    session.permanent = True
    return jsonify({"ok": True, "message": t("setup_done")})


@app.post("/api/admin/login")
def api_admin_login():
    if request.headers.get("X-Jisr") != "1":
        return err("unauthorized", 403)
    if rate_limited("login", LOGIN_LIMIT_MAX):
        return err("spam_error", 429)
    data = request.get_json(silent=True) or {}
    username = clean_text(data.get("username"), 50)
    password = str(data.get("password") or "")
    row = get_db().execute("SELECT * FROM admin WHERE id = 1").fetchone()
    if not row or row["username"] != username or not bcrypt.checkpw(password.encode(), row["password_hash"].encode()):
        return err("login_failed", 401)
    session.clear()
    session["admin"] = True
    session["admin_user"] = username
    session.permanent = True
    return jsonify({"ok": True})


@app.post("/api/admin/logout")
def api_admin_logout():
    session.clear()
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Admin: countries
# ---------------------------------------------------------------------------
COUNTRY_TEXT_FIELDS = ("name_ar", "name_fr", "name_en", "flag", "currency_code",
                       "payout_method_ar", "payout_method_fr", "payout_method_en")


def country_payload(data):
    out = {f: clean_text(data.get(f)) for f in COUNTRY_TEXT_FIELDS}
    out["currency_code"] = out["currency_code"].upper()[:5]
    out["flag"] = out["flag"][:16] or "🏳️"
    rate = parse_number(data.get("rate_per_100"), minimum=0)
    sort = parse_number(data.get("sort_order", 0)) or 0
    if not out["name_ar"] or not out["currency_code"] or not out["payout_method_ar"] or rate is None:
        return None
    out["rate_per_100"] = rate
    out["sort_order"] = int(sort)
    out["is_active"] = 1 if data.get("is_active", True) not in (False, 0, "0", "false") else 0
    return out


@app.get("/api/admin/countries")
@admin_required
def api_admin_countries():
    rows = get_db().execute("SELECT * FROM countries ORDER BY sort_order, id").fetchall()
    return jsonify([row_to_dict(r) for r in rows])


@app.post("/api/admin/countries")
@admin_required
def api_admin_country_create():
    p = country_payload(request.get_json(silent=True) or {})
    if not p:
        return err("error_required")
    db = get_db()
    cols = list(p.keys())
    db.execute(
        f"INSERT INTO countries ({', '.join(cols)}, created_at) VALUES ({', '.join('?' * len(cols))}, ?)",
        [p[c] for c in cols] + [now_iso()],
    )
    db.commit()
    return jsonify({"ok": True}), 201


@app.put("/api/admin/countries/<int:cid>")
@admin_required
def api_admin_country_update(cid):
    p = country_payload(request.get_json(silent=True) or {})
    if not p:
        return err("error_required")
    db = get_db()
    cur = db.execute(
        f"UPDATE countries SET {', '.join(f'{c} = ?' for c in p)} WHERE id = ?",
        list(p.values()) + [cid],
    )
    db.commit()
    if cur.rowcount == 0:
        abort(404)
    return jsonify({"ok": True})


@app.delete("/api/admin/countries/<int:cid>")
@admin_required
def api_admin_country_delete(cid):
    db = get_db()
    db.execute("DELETE FROM countries WHERE id = ?", (cid,))
    db.commit()
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Admin: payment accounts
# ---------------------------------------------------------------------------
def account_payload(data):
    out = {f: clean_text(data.get(f)) for f in ("name_ar", "name_fr", "name_en", "number")}
    if not out["name_ar"] or not out["number"]:
        return None
    out["sort_order"] = int(parse_number(data.get("sort_order", 0)) or 0)
    out["is_active"] = 1 if data.get("is_active", True) not in (False, 0, "0", "false") else 0
    return out


@app.get("/api/admin/accounts")
@admin_required
def api_admin_accounts():
    rows = get_db().execute("SELECT * FROM payment_accounts ORDER BY sort_order, id").fetchall()
    return jsonify([row_to_dict(r) for r in rows])


@app.post("/api/admin/accounts")
@admin_required
def api_admin_account_create():
    p = account_payload(request.get_json(silent=True) or {})
    if not p:
        return err("error_required")
    db = get_db()
    cols = list(p.keys())
    db.execute(
        f"INSERT INTO payment_accounts ({', '.join(cols)}, created_at) VALUES ({', '.join('?' * len(cols))}, ?)",
        [p[c] for c in cols] + [now_iso()],
    )
    db.commit()
    return jsonify({"ok": True}), 201


@app.put("/api/admin/accounts/<int:aid>")
@admin_required
def api_admin_account_update(aid):
    p = account_payload(request.get_json(silent=True) or {})
    if not p:
        return err("error_required")
    db = get_db()
    cur = db.execute(
        f"UPDATE payment_accounts SET {', '.join(f'{c} = ?' for c in p)} WHERE id = ?",
        list(p.values()) + [aid],
    )
    db.commit()
    if cur.rowcount == 0:
        abort(404)
    return jsonify({"ok": True})


@app.delete("/api/admin/accounts/<int:aid>")
@admin_required
def api_admin_account_delete(aid):
    db = get_db()
    db.execute("DELETE FROM payment_accounts WHERE id = ?", (aid,))
    db.commit()
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Admin: orders
# ---------------------------------------------------------------------------
def order_filters():
    where, params = [], []
    status = request.args.get("status")
    if status in STATUSES:
        where.append("status = ?")
        params.append(status)
    cid = request.args.get("country_id")
    if cid and cid.isdigit():
        where.append("country_id = ?")
        params.append(int(cid))
    q = request.args.get("q", "").strip()
    if q:
        where.append("(public_id LIKE ? OR mobile_number LIKE ?)")
        params += [f"%{q}%", f"%{q}%"]
    return (" WHERE " + " AND ".join(where)) if where else "", params


@app.get("/api/admin/stats")
@admin_required
def api_admin_stats():
    db = get_db()
    totals = db.execute("""
        SELECT COUNT(*) AS all_count,
               SUM(status = 'new') AS new_count,
               COALESCE(SUM(CASE WHEN status = 'done' THEN amount_mru END), 0) AS mru_done
        FROM orders""").fetchone()
    per_currency = db.execute("""
        SELECT currency_code, COUNT(*) AS n, SUM(amount_receive) AS total
        FROM orders WHERE status = 'done' GROUP BY currency_code ORDER BY total DESC""").fetchall()
    return jsonify({
        "all": totals["all_count"] or 0,
        "new": totals["new_count"] or 0,
        "mru_done": totals["mru_done"] or 0,
        "transferred": [row_to_dict(r) for r in per_currency],
    })


@app.get("/api/admin/orders")
@admin_required
def api_admin_orders():
    where, params = order_filters()
    limit = min(int(parse_number(request.args.get("limit", 200)) or 200), 1000)
    rows = get_db().execute(
        f"SELECT * FROM orders{where} ORDER BY created_at DESC, id DESC LIMIT ?", params + [limit]
    ).fetchall()
    return jsonify([row_to_dict(r) for r in rows])


@app.patch("/api/admin/orders/<int:oid>")
@admin_required
def api_admin_order_status(oid):
    status = (request.get_json(silent=True) or {}).get("status")
    if status not in STATUSES:
        return err("error_generic")
    db = get_db()
    cur = db.execute("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?", (status, now_iso(), oid))
    db.commit()
    if cur.rowcount == 0:
        abort(404)
    return jsonify({"ok": True})


@app.delete("/api/admin/orders/<int:oid>")
@admin_required
def api_admin_order_delete(oid):
    db = get_db()
    row = db.execute("SELECT receipt_path FROM orders WHERE id = ?", (oid,)).fetchone()
    if not row:
        abort(404)
    db.execute("DELETE FROM orders WHERE id = ?", (oid,))
    db.commit()
    if row["receipt_path"]:
        (UPLOAD_DIR / row["receipt_path"]).unlink(missing_ok=True)
    return jsonify({"ok": True})


@app.get("/api/admin/receipts/<int:oid>")
@admin_required
def api_admin_receipt(oid):
    row = get_db().execute("SELECT receipt_path FROM orders WHERE id = ?", (oid,)).fetchone()
    if not row or not row["receipt_path"]:
        abort(404)
    path = UPLOAD_DIR / Path(row["receipt_path"]).name
    if not path.exists():
        abort(404)
    return send_file(path, mimetype="image/jpeg")


@app.get("/api/admin/orders.csv")
@admin_required
def api_admin_orders_csv():
    where, params = order_filters()
    rows = get_db().execute(f"SELECT * FROM orders{where} ORDER BY created_at DESC", params).fetchall()
    buf = io.StringIO()
    buf.write("﻿")  # BOM so Excel opens Arabic correctly
    w = csv.writer(buf)
    w.writerow(["order_id", "created_at", "country", "amount_mru", "rate_per_100",
                "amount_receive", "currency", "mobile_number", "status"])
    for r in rows:
        w.writerow([r["public_id"], r["created_at"], r["country_name"], r["amount_mru"], r["rate_used"],
                    r["amount_receive"], r["currency_code"], r["mobile_number"], r["status"]])
    stamp = datetime.now().strftime("%Y%m%d-%H%M")
    return Response(
        buf.getvalue(),
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename=jisr-orders-{stamp}.csv"},
    )


# ---------------------------------------------------------------------------
init_db()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG") == "1"
    app.run(host="0.0.0.0", port=port, debug=debug)
