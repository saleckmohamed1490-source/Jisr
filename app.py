#!/usr/bin/env python3
"""
MINASSA EXCHANGE - دفتر معاملات التحويل وحساب الربح (codename: Jisr)

Workflow: dollars (USDT) are bought on Binance at a price in MRU, the
transfer costs some amount of dollars, and the customer pays in MRU to one
of the payment accounts (Bankily, Sedad, Masrivi, ...).

    cost_mru = usd_amount * usd_rate
    profit   = mru_paid - cost_mru

Some currencies are not bought with dollars but have their own buy price
(cost_type 'direct'); then the cost is the amount the customer received,
valued at that buy price:
    cost_mru = to_amount converted to MRU at cur_buy_rate
"""
import csv
import io
import os
import re
import secrets
import sqlite3
import time
import uuid
from datetime import datetime, timedelta
from functools import wraps
from pathlib import Path

import bcrypt
from flask import Flask, Response, abort, g, jsonify, request, send_from_directory, session
from PIL import Image, UnidentifiedImageError

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

# Storage: Postgres when DATABASE_URL is set (e.g. Supabase, required on Vercel
# where the filesystem is not persistent), otherwise a local SQLite file.
DATABASE_URL = os.environ.get("DATABASE_URL")
USE_PG = bool(DATABASE_URL)
DATA_DIR = Path(os.environ.get("JISR_DATA_DIR", BASE_DIR / "data"))
DB_PATH = Path(os.environ.get("JISR_DB", DATA_DIR / "jisr.db"))
if USE_PG:
    import psycopg
    from psycopg.rows import dict_row
    IntegrityErrors = (psycopg.IntegrityError, sqlite3.IntegrityError)
else:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    IntegrityErrors = (sqlite3.IntegrityError,)


def _load_secret():
    env = os.environ.get("JISR_SECRET")
    if env:
        return env
    if USE_PG:
        raise RuntimeError("Set JISR_SECRET when running with DATABASE_URL")
    key_file = DATA_DIR / ".secret_key"
    if key_file.exists():
        return key_file.read_text().strip()
    key = secrets.token_hex(32)
    key_file.write_text(key)
    return key


app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="/static")
app.secret_key = _load_secret()
app.config.update(
    MAX_CONTENT_LENGTH=3 * 1024 * 1024,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("JISR_SECURE_COOKIES") == "1",
    PERMANENT_SESSION_LIFETIME=timedelta(days=30),
)

_login_attempts = {}

MESSAGES = {
    "unauthorized": "يجب تسجيل الدخول",
    "login_failed": "اسم المستخدم أو كلمة المرور غير صحيحة",
    "too_many": "محاولات كثيرة، انتظر دقيقة",
    "already_setup": "تم إنشاء الحساب مسبقاً",
    "password_short": "كلمة المرور قصيرة (٨ أحرف على الأقل)",
    "password_mismatch": "كلمتا المرور غير متطابقتين",
    "bad_pin": "الرمز يجب أن يكون ٤ أرقام",
    "pin_mismatch": "الرمزان غير متطابقين",
    "wrong_current": "الرمز أو كلمة المرور الحالية غير صحيحة",
    "admin_only": "هذه الصفحة للإدارة فقط",
    "username_taken": "اسم المستخدم مستعمل",
    "last_admin": "لا يمكن: يجب أن يبقى مسؤول واحد على الأقل",
    "not_self": "لا يمكنك حذف حسابك",
    "required": "املأ الحقول المطلوبة",
    "bad_rate": "أدخل سعر الدولار",
    "bad_usd": "أدخل كم كلّف من دولار",
    "bad_mru": "أدخل المبلغ الذي دفعه الزبون",
    "bad_method": "اختر طريقة الدفع",
    "bad_app": "اختر التطبيق",
    "bad_buy": "أدخل سعر الشراء",
    "bad_received": "أدخل المبلغ الذي استلمه الزبون",
    "bad_image": "الملف ليس صورة صالحة",
    "too_large": "الصورة كبيرة جداً (الحد ٣ ميغابايت)",
    "not_found": "غير موجود",
}


def err(key, status=400):
    return jsonify({"ok": False, "error": key, "message": MESSAGES.get(key, key)}), status


def now_local():
    return datetime.now().strftime("%Y-%m-%dT%H:%M")


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
class PgDB:
    """Minimal sqlite3-like wrapper so the queries below work on both engines."""

    def __init__(self):
        self.conn = psycopg.connect(DATABASE_URL, row_factory=dict_row, prepare_threshold=None,
                                    connect_timeout=10)

    def execute(self, sql, params=()):
        return self.conn.execute(sql.replace("?", "%s"), params)

    def commit(self):
        self.conn.commit()

    def close(self):
        self.conn.close()


def get_db():
    if "db" not in g:
        if USE_PG:
            g.db = PgDB()
        else:
            g.db = sqlite3.connect(str(DB_PATH))
            g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    """SQLite only; the Postgres schema lives in schema.sql."""
    if USE_PG:
        return
    db = sqlite3.connect(str(DB_PATH))
    # An earlier version of the app used a different transactions layout; keep it aside.
    cols = [r[1] for r in db.execute("PRAGMA table_info(transactions)")]
    if cols and "usd_rate" not in cols:
        db.execute("ALTER TABLE transactions RENAME TO transactions_old")
    if cols and "usd_rate" in cols:
        for col, ddl in (("to_currency", "TEXT NOT NULL DEFAULT ''"), ("to_amount", "REAL"),
                         ("cost_type", "TEXT NOT NULL DEFAULT 'usd'"), ("cur_buy_rate", "REAL"),
                         ("rate_unit", "TEXT NOT NULL DEFAULT 'per_unit'"), ("app_id", "INTEGER"),
                         ("app_name", "TEXT NOT NULL DEFAULT ''"), ("package", "TEXT NOT NULL DEFAULT ''"),
                         ("deleted_at", "TEXT"), ("deleted_by_name", "TEXT NOT NULL DEFAULT ''"),
                         ("created_by", "INTEGER"), ("created_by_name", "TEXT NOT NULL DEFAULT ''")):
            if col not in cols:
                db.execute(f"ALTER TABLE transactions ADD COLUMN {col} {ddl}")
    rate_cols = [r[1] for r in db.execute("PRAGMA table_info(rates)")]
    if rate_cols and "mode" not in rate_cols:
        db.execute("ALTER TABLE rates ADD COLUMN mode TEXT NOT NULL DEFAULT 'usd'")
    pm_cols = [r[1] for r in db.execute("PRAGMA table_info(payment_methods)")]
    if pm_cols and "logo_version" not in pm_cols:
        db.execute("ALTER TABLE payment_methods ADD COLUMN logo_version TEXT")
        db.execute("UPDATE payment_methods SET logo = NULL")
    db.executescript("""
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS admin (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        username TEXT NOT NULL UNIQUE,
        secret_hash TEXT NOT NULL,
        auth_type TEXT NOT NULL DEFAULT 'pin',
        role TEXT NOT NULL DEFAULT 'worker',
        is_active INTEGER NOT NULL DEFAULT 1,
        fail_count INTEGER NOT NULL DEFAULT 0,
        locked_until REAL,
        created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    );
    CREATE TABLE IF NOT EXISTS payment_methods (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#00704a',
        logo BLOB,
        logo_version TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tx_date TEXT NOT NULL,            -- local 'YYYY-MM-DDTHH:MM'
        usd_rate REAL NOT NULL,           -- MRU per 1 dollar (Binance price)
        usd_amount REAL NOT NULL,         -- dollars the transfer cost
        cost_mru REAL NOT NULL,           -- usd_amount * usd_rate
        mru_paid REAL NOT NULL,           -- what the customer paid
        profit REAL NOT NULL,             -- mru_paid - cost_mru
        method_id INTEGER,
        method_name TEXT NOT NULL DEFAULT '',
        to_currency TEXT NOT NULL DEFAULT '',
        to_amount REAL,
        cost_type TEXT NOT NULL DEFAULT 'usd',
        cur_buy_rate REAL,
        rate_unit TEXT NOT NULL DEFAULT 'per_unit',
        app_id INTEGER,
        app_name TEXT NOT NULL DEFAULT '',
        package TEXT NOT NULL DEFAULT '',
        deleted_at TEXT,                 -- set when moved to the trash
        deleted_by_name TEXT NOT NULL DEFAULT '',
        created_by INTEGER,
        created_by_name TEXT NOT NULL DEFAULT '',
        customer TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(tx_date DESC);
    CREATE TABLE IF NOT EXISTS logo_library (
        key TEXT PRIMARY KEY,           -- "<kind>:<normalised name>", e.g. "methods:بنكيلي"
        logo BLOB NOT NULL,
        version TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS apps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#00704a',
        logo BLOB,
        logo_version TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS rates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        flag TEXT NOT NULL DEFAULT '',
        unit TEXT NOT NULL DEFAULT 'per_unit',
        mode TEXT NOT NULL DEFAULT 'usd',
        buy_rate REAL,
        sell_rate REAL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
    );
    """)
    if db.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
        old = db.execute("SELECT username, password_hash, created_at FROM admin WHERE id = 1").fetchone()
        if old:
            kind = db.execute("SELECT value FROM settings WHERE key = 'auth_type'").fetchone()
            db.execute("INSERT INTO users (name, username, secret_hash, auth_type, role, created_at) "
                       "VALUES (?, ?, ?, ?, 'admin', ?)",
                       (old[0], old[0], old[1], "pin" if kind and kind[0] == "pin" else "password", old[2]))
    if db.execute("SELECT COUNT(*) FROM rates").fetchone()[0] == 0:
        db.execute("INSERT INTO rates (code, name, flag, unit, updated_at) VALUES ('USD', 'الدولار', '💵', 'per_unit', ?)",
                   (now_local(),))
    if db.execute("SELECT COUNT(*) FROM payment_methods").fetchone()[0] == 0:
        for i, (name, color) in enumerate([("بنكيلي", "#e07a1f"), ("سداد", "#1f6fe0"), ("مصريفي", "#0e9f6e")]):
            db.execute("INSERT INTO payment_methods (name, color, sort_order) VALUES (?, ?, ?)", (name, color, i))
    db.commit()
    db.close()


def get_setting(key):
    row = get_db().execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else None


def set_setting(db, key, value):
    db.execute("INSERT INTO settings (key, value) VALUES (?, ?) "
               "ON CONFLICT(key) DO UPDATE SET value = excluded.value", (key, str(value)))


def num(value):
    if value in (None, ""):
        return None
    try:
        t = "".join(str(value).replace("٫", ",").replace("،", ",").split())
        # A single comma is a decimal mark ("40,2"); several commas, or a comma next to a dot, are thousands.
        t = t.replace(",", "") if ("." in t or t.count(",") > 1) else t.replace(",", ".")
        n = float(t)
    except ValueError:
        return None
    return n if n == n and abs(n) != float("inf") else None


# ---------------------------------------------------------------------------
# Auth: users with roles
#   admin  : everything (reports, settings, trash, workers)
#   worker : records operations, sees rates and only their own operations
# Sign-in is a username (or phone number) + 4-digit PIN. An account created before
# PINs keeps its password (auth_type = "password") until a PIN is set.
# ---------------------------------------------------------------------------
PIN_RE = re.compile(r"^\d{4}$")
LOCK_AFTER = 5            # failed attempts before that account's sign-in is locked
LOCK_BASE_MIN = 15        # first lock length; doubles with each further lock, up to a day
ROLES = ("admin", "worker")
USER_COLS = "id, name, username, role, auth_type, is_active, created_at"


def norm_pin(value):
    digits = str(value or "").strip()
    return digits.translate(str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789"))


def hash_secret(secret):
    return bcrypt.hashpw(secret.encode(), bcrypt.gensalt()).decode()


def current_user():
    """The signed-in, active user (cached per request), or None."""
    if "me" in g:
        return g.me
    g.me = None
    uid = session.get("uid")
    if not uid and session.get("admin"):            # session from before user accounts: map by username
        row = get_db().execute("SELECT id FROM users WHERE username = ?", (session.get("user"),)).fetchone()
        if row:
            uid = session["uid"] = row["id"]
    if uid:
        row = get_db().execute(f"SELECT {USER_COLS} FROM users WHERE id = ?", (uid,)).fetchone()
        if row and row["is_active"]:
            g.me = dict(row)
    return g.me


def is_admin():
    me = current_user()
    return bool(me and me["role"] == "admin")


def login_required(fn):
    @wraps(fn)
    def wrapper(*a, **kw):
        if not current_user():
            return err("unauthorized", 401)
        if request.method not in ("GET", "HEAD") and request.headers.get("X-Jisr") != "1":
            return err("unauthorized", 403)
        return fn(*a, **kw)
    return wrapper


def admin_required(fn):
    @wraps(fn)
    @login_required
    def wrapper(*a, **kw):
        if not is_admin():
            return err("admin_only", 403)
        return fn(*a, **kw)
    return wrapper


def too_many_logins():
    ip = request.headers.get("X-Forwarded-For", "").split(",")[0].strip() or request.remote_addr or "?"
    now = time.time()
    hits = [t for t in _login_attempts.get(ip, []) if now - t < 60] + [now]
    _login_attempts[ip] = hits
    return len(hits) > 10


def start_session(user_row):
    session.clear()
    session.permanent = True
    session["uid"] = user_row["id"]


def lock_minutes_left(row):
    left = (num(row["locked_until"]) or 0) - time.time()
    return int(left // 60) + 1 if left > 0 else 0


@app.get("/api/state")
def api_state():
    db = get_db()
    has_users = db.execute("SELECT 1 FROM users").fetchone() is not None
    has_password_user = db.execute("SELECT 1 FROM users WHERE auth_type = 'password' AND is_active = 1").fetchone()
    return jsonify({"setup_needed": not has_users, "logged_in": bool(current_user()),
                    "password_login": bool(has_password_user)})


@app.post("/api/setup")
def api_setup():
    """Creates the first account, which is the admin."""
    if request.headers.get("X-Jisr") != "1":
        return err("unauthorized", 403)
    d = request.get_json(silent=True) or {}
    user = norm_pin(d.get("username"))[:50]
    pin = norm_pin(d.get("pin"))
    if not user or not pin:
        return err("required")
    if not PIN_RE.match(pin):
        return err("bad_pin")
    if pin != norm_pin(d.get("confirm_pin")):
        return err("pin_mismatch")
    db = get_db()
    if db.execute("SELECT 1 FROM users").fetchone():
        return err("already_setup", 409)
    uid = db.execute("INSERT INTO users (name, username, secret_hash, auth_type, role, is_active, created_at) "
                     "VALUES (?, ?, ?, 'pin', 'admin', 1, ?) RETURNING id",
                     (user, user, hash_secret(pin), now_local())).fetchone()["id"]
    db.commit()
    start_session({"id": uid})
    return jsonify({"ok": True})


@app.post("/api/login")
def api_login():
    if request.headers.get("X-Jisr") != "1":
        return err("unauthorized", 403)
    if too_many_logins():
        return err("too_many", 429)
    d = request.get_json(silent=True) or {}
    username = norm_pin(d.get("username"))      # also normalises Arabic digits in a phone-number username
    secret = norm_pin(d.get("pin")) if d.get("pin") not in (None, "") else str(d.get("password") or "")
    db = get_db()
    row = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    if row and lock_minutes_left(row):
        return jsonify({"ok": False, "error": "locked",
                        "message": f"محاولات خاطئة كثيرة، حاول بعد {lock_minutes_left(row)} دقيقة"}), 429
    if not row or not row["is_active"] or not bcrypt.checkpw(secret.encode(), row["secret_hash"].encode()):
        if row:   # count failures per account; lock longer each time
            fails = (row["fail_count"] or 0) + 1
            locked_until = row["locked_until"]
            if fails % LOCK_AFTER == 0:
                locked_until = time.time() + min(LOCK_BASE_MIN * 2 ** (fails // LOCK_AFTER - 1), 24 * 60) * 60
            db.execute("UPDATE users SET fail_count = ?, locked_until = ? WHERE id = ?", (fails, locked_until, row["id"]))
            db.commit()
            remaining = LOCK_AFTER - fails % LOCK_AFTER
            if remaining == LOCK_AFTER:
                minutes = int((locked_until - time.time()) // 60) + 1
                return jsonify({"ok": False, "error": "locked",
                                "message": f"محاولات خاطئة كثيرة، حاول بعد {minutes} دقيقة"}), 429
            hint = f" (بقيت {remaining} محاولات)" if remaining > 1 else " (بقيت محاولة واحدة)"
        else:
            hint = ""
        msg = "اسم المستخدم أو الرمز غير صحيح" if d.get("pin") not in (None, "") else MESSAGES["login_failed"]
        return jsonify({"ok": False, "error": "login_failed", "message": msg + hint}), 401
    db.execute("UPDATE users SET fail_count = 0, locked_until = NULL WHERE id = ?", (row["id"],))
    db.commit()
    start_session(row)
    return jsonify({"ok": True})


@app.get("/api/me")
@login_required
def api_me():
    return jsonify(current_user())


@app.post("/api/pin")
@login_required
def api_set_pin():
    """Change your own PIN; needs your current PIN or password."""
    me = current_user()
    d = request.get_json(silent=True) or {}
    current = norm_pin(d.get("current")) if me["auth_type"] == "pin" else str(d.get("current") or "")
    pin, confirm = norm_pin(d.get("pin")), norm_pin(d.get("confirm_pin"))
    if not PIN_RE.match(pin):
        return err("bad_pin")
    if pin != confirm:
        return err("pin_mismatch")
    db = get_db()
    row = db.execute("SELECT secret_hash FROM users WHERE id = ?", (me["id"],)).fetchone()
    if not bcrypt.checkpw(current.encode(), row["secret_hash"].encode()):
        return err("wrong_current", 403)
    db.execute("UPDATE users SET secret_hash = ?, auth_type = 'pin' WHERE id = ?", (hash_secret(pin), me["id"]))
    db.commit()
    return jsonify({"ok": True, "auth_type": "pin"})


# ---- workers / users (admin only)
@app.get("/api/users")
@admin_required
def api_users():
    rows = get_db().execute(f"SELECT {USER_COLS} FROM users ORDER BY role, id").fetchall()
    return jsonify([dict(r) for r in rows])


@app.post("/api/users")
@admin_required
def api_user_create():
    d = request.get_json(silent=True) or {}
    name = str(d.get("name") or "").strip()[:60]
    username = norm_pin(d.get("username"))[:50]
    pin = norm_pin(d.get("pin"))
    role = d.get("role") if d.get("role") in ROLES else "worker"
    if not name or not username:
        return err("required")
    if not PIN_RE.match(pin):
        return err("bad_pin")
    db = get_db()
    if db.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
        return err("username_taken", 409)
    uid = db.execute("INSERT INTO users (name, username, secret_hash, auth_type, role, is_active, created_at) "
                     "VALUES (?, ?, ?, 'pin', ?, 1, ?) RETURNING id",
                     (name, username, hash_secret(pin), role, now_local())).fetchone()["id"]
    db.commit()
    return jsonify({"ok": True, "id": uid}), 201


def admins_left_without(db, uid):
    return db.execute("SELECT COUNT(*) n FROM users WHERE role = 'admin' AND is_active = 1 AND id <> ?",
                      (uid,)).fetchone()["n"]


@app.put("/api/users/<int:uid>")
@admin_required
def api_user_update(uid):
    d = request.get_json(silent=True) or {}
    db = get_db()
    row = db.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    if not row:
        return err("not_found", 404)
    name = str(d.get("name") or row["name"]).strip()[:60]
    role = d.get("role") if d.get("role") in ROLES else row["role"]
    active = 0 if d.get("is_active") in (False, 0, "0") else 1
    # never leave the app without an active admin
    if (role != "admin" or not active) and row["role"] == "admin" and not admins_left_without(db, uid):
        return err("last_admin", 409)
    db.execute("UPDATE users SET name = ?, role = ?, is_active = ? WHERE id = ?", (name, role, active, uid))
    pin = norm_pin(d.get("pin"))
    if pin:                                   # admin resets the user's PIN
        if not PIN_RE.match(pin):
            return err("bad_pin")
        db.execute("UPDATE users SET secret_hash = ?, auth_type = 'pin', fail_count = 0, locked_until = NULL "
                   "WHERE id = ?", (hash_secret(pin), uid))
    db.execute("UPDATE transactions SET created_by_name = ? WHERE created_by = ?", (name, uid))
    db.commit()
    return jsonify({"ok": True})


@app.delete("/api/users/<int:uid>")
@admin_required
def api_user_delete(uid):
    db = get_db()
    row = db.execute("SELECT role FROM users WHERE id = ?", (uid,)).fetchone()
    if not row:
        return err("not_found", 404)
    if uid == current_user()["id"]:
        return err("not_self", 409)
    if row["role"] == "admin" and not admins_left_without(db, uid):
        return err("last_admin", 409)
    db.execute("DELETE FROM users WHERE id = ?", (uid,))   # their operations keep the saved name
    db.commit()
    return jsonify({"ok": True})


@app.post("/api/logout")
def api_logout():
    session.clear()
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Logo lists: payment methods (Bankily, Sedad, Masrivi, ...) and apps that are
# topped up (added by the user). Both have a name, a fallback color and a logo.
# ---------------------------------------------------------------------------
LIST_COLS = "id, name, color, logo_version, sort_order, is_active"
# kind -> (table, transactions id column, transactions name column)
LISTS = {
    "methods": ("payment_methods", "method_id", "method_name"),
    "apps": ("apps", "app_id", "app_name"),
}


# Permanent logo library: every uploaded logo is also kept here by kind + name, and is
# never cleared by deleting items, accounts or data. An item without its own logo shows
# the library logo for its name, so logos survive resets and re-created items.
def logo_key(kind, name):
    return f"{kind}:{' '.join(str(name).split()).lower()}"


# Logos shipped with the app itself: shown even if the database is wiped.
BUILTIN_LOGOS = {
    "methods:بنكيلي": "bankily.png",
    "methods:سداد": "sedad.png",
    "methods:مصريفي": "masrivi.png",
}
BUILTIN_DIR = STATIC_DIR / "builtin-logos"


def library_versions(kind):
    rows = get_db().execute("SELECT key, version FROM logo_library WHERE key LIKE ?", (kind + ":%",)).fetchall()
    out = {k: "builtin" for k in BUILTIN_LOGOS if k.startswith(kind + ":")}
    out.update({r["key"]: r["version"] for r in rows})
    return out


def list_item_json(kind, r, lib=None):
    d = dict(r)
    if r["logo_version"]:
        d["logo_url"] = f"/logos/{kind}/{r['id']}?v={r['logo_version']}"
    else:
        v = (lib or {}).get(logo_key(kind, r["name"]))
        d["logo_url"] = f"/logos/{kind}/{r['id']}?v=lib-{v}" if v else None
    return d


def list_payload(d):
    name = str(d.get("name") or "").strip()[:40]
    if not name:
        return None
    color = str(d.get("color") or "#00704a").strip()
    if not (len(color) == 7 and color.startswith("#")):
        color = "#00704a"
    return {
        "name": name,
        "color": color,
        "sort_order": int(num(d.get("sort_order")) or 0),
        "is_active": 0 if d.get("is_active") in (False, 0, "0") else 1,
    }


def register_list_routes(kind):
    table, tx_id_col, tx_name_col = LISTS[kind]

    @login_required
    def list_all():
        rows = get_db().execute(f"SELECT {LIST_COLS} FROM {table} ORDER BY sort_order, id").fetchall()
        lib = library_versions(kind)
        return jsonify([list_item_json(kind, r, lib) for r in rows])

    @admin_required
    def create():
        p = list_payload(request.get_json(silent=True) or {})
        if not p:
            return err("required")
        db = get_db()
        new_id = db.execute(f"INSERT INTO {table} ({', '.join(p)}) VALUES ({', '.join('?' * len(p))}) RETURNING id",
                            list(p.values())).fetchone()["id"]
        db.commit()
        return jsonify({"ok": True, "id": new_id}), 201

    @admin_required
    def update(item_id):
        p = list_payload(request.get_json(silent=True) or {})
        if not p:
            return err("required")
        db = get_db()
        cur = db.execute(f"UPDATE {table} SET {', '.join(f'{k} = ?' for k in p)} WHERE id = ?",
                         list(p.values()) + [item_id])
        db.execute(f"UPDATE transactions SET {tx_name_col} = ? WHERE {tx_id_col} = ?", (p["name"], item_id))
        db.commit()
        return jsonify({"ok": True}) if cur.rowcount else err("not_found", 404)

    @admin_required
    def delete(item_id):
        db = get_db()
        db.execute(f"DELETE FROM {table} WHERE id = ?", (item_id,))
        db.commit()
        return jsonify({"ok": True})

    @admin_required
    def upload_logo(item_id):
        db = get_db()
        if not db.execute(f"SELECT 1 FROM {table} WHERE id = ?", (item_id,)).fetchone():
            return err("not_found", 404)
        f = request.files.get("logo")
        if not f:
            return err("bad_image")
        try:
            img = Image.open(f.stream)
            img.load()
        except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError):
            return err("bad_image")
        img = img.convert("RGBA")
        img.thumbnail((256, 256))
        buf = io.BytesIO()
        img.save(buf, "PNG", optimize=True)
        version = uuid.uuid4().hex[:12]
        db.execute(f"UPDATE {table} SET logo = ?, logo_version = ? WHERE id = ?", (buf.getvalue(), version, item_id))
        name = db.execute(f"SELECT name FROM {table} WHERE id = ?", (item_id,)).fetchone()["name"]
        db.execute("INSERT INTO logo_library (key, logo, version) VALUES (?, ?, ?) "
                   "ON CONFLICT(key) DO UPDATE SET logo = excluded.logo, version = excluded.version",
                   (logo_key(kind, name), buf.getvalue(), version))
        db.commit()
        return jsonify({"ok": True, "logo_url": f"/logos/{kind}/{item_id}?v={version}"})

    @admin_required
    def delete_logo(item_id):
        # Explicitly removing a logo also removes it from the permanent library.
        db = get_db()
        row = db.execute(f"SELECT name FROM {table} WHERE id = ?", (item_id,)).fetchone()
        db.execute(f"UPDATE {table} SET logo = NULL, logo_version = NULL WHERE id = ?", (item_id,))
        if row:
            db.execute("DELETE FROM logo_library WHERE key = ?", (logo_key(kind, row["name"]),))
        db.commit()
        return jsonify({"ok": True})

    base = f"/api/{kind}"
    app.add_url_rule(base, f"{kind}_list", list_all, methods=["GET"])
    app.add_url_rule(base, f"{kind}_create", create, methods=["POST"])
    app.add_url_rule(f"{base}/<int:item_id>", f"{kind}_update", update, methods=["PUT"])
    app.add_url_rule(f"{base}/<int:item_id>", f"{kind}_delete", delete, methods=["DELETE"])
    app.add_url_rule(f"{base}/<int:item_id>/logo", f"{kind}_logo", upload_logo, methods=["POST"])
    app.add_url_rule(f"{base}/<int:item_id>/logo", f"{kind}_logo_delete", delete_logo, methods=["DELETE"])


for _kind in LISTS:
    register_list_routes(_kind)


@app.get("/logos/<kind>/<int:item_id>")
def logo_file(kind, item_id):
    if kind not in LISTS:
        abort(404)
    db = get_db()
    row = db.execute(f"SELECT name, logo FROM {LISTS[kind][0]} WHERE id = ?", (item_id,)).fetchone()
    if not row:
        abort(404)
    data = row["logo"]
    if not data:   # fall back to the permanent library logo for this name, then the built-in one
        key = logo_key(kind, row["name"])
        lib = db.execute("SELECT logo FROM logo_library WHERE key = ?", (key,)).fetchone()
        data = lib["logo"] if lib else None
        if not data and key in BUILTIN_LOGOS:
            data = (BUILTIN_DIR / BUILTIN_LOGOS[key]).read_bytes()
    if not data:
        abort(404)
    resp = Response(bytes(data), mimetype="image/png")
    resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"  # URL carries ?v=
    return resp


# ---------------------------------------------------------------------------
# Exchange rates board
#   unit 'per_unit': 1 unit of the currency = X MRU        (e.g. 1 USD = 40.2 MRU)
#   unit 'per100'  : 100 MRU = X units of the currency     (e.g. 100 MRU = 53 SLE)
#   unit 'per5000' : 5000 units of the currency = X MRU    (e.g. 5000 XOF = 375 MRU), used for CFA
# The USD row's buy rate is the default dollar price in the transaction form.
# ---------------------------------------------------------------------------
RATE_UNITS = ("per_unit", "per100", "per5000")
COST_TYPES = ("usd", "direct")  # usd: bought with dollars ; direct: own buy price


@app.get("/api/rates")
@login_required
def api_rates():
    rows = get_db().execute("SELECT * FROM rates ORDER BY sort_order, id").fetchall()
    return jsonify([dict(r) for r in rows])


def rate_payload(d):
    p = {
        "code": str(d.get("code") or "").strip().upper()[:6],
        "name": str(d.get("name") or "").strip()[:40],
        "flag": str(d.get("flag") or "").strip()[:16],
        "unit": d.get("unit") if d.get("unit") in RATE_UNITS else "per_unit",
        "mode": d.get("mode") if d.get("mode") in COST_TYPES else "usd",
        "sort_order": int(num(d.get("sort_order")) or 0),
    }
    if not p["code"] or not p["name"]:
        return None
    for f in ("buy_rate", "sell_rate"):
        v = num(d.get(f))
        p[f] = v if v and v > 0 else None
    p["updated_at"] = now_local()
    return p


@app.post("/api/rates")
@admin_required
def api_rate_create():
    p = rate_payload(request.get_json(silent=True) or {})
    if not p:
        return err("required")
    db = get_db()
    new_id = db.execute(f"INSERT INTO rates ({', '.join(p)}) VALUES ({', '.join('?' * len(p))}) RETURNING id",
                        list(p.values())).fetchone()["id"]
    db.commit()
    return jsonify({"ok": True, "id": new_id}), 201


@app.put("/api/rates/<int:rid>")
@admin_required
def api_rate_update(rid):
    p = rate_payload(request.get_json(silent=True) or {})
    if not p:
        return err("required")
    db = get_db()
    cur = db.execute(f"UPDATE rates SET {', '.join(f'{k} = ?' for k in p)} WHERE id = ?", list(p.values()) + [rid])
    db.commit()
    return jsonify({"ok": True}) if cur.rowcount else err("not_found", 404)


@app.delete("/api/rates/<int:rid>")
@admin_required
def api_rate_delete(rid):
    db = get_db()
    db.execute("DELETE FROM rates WHERE id = ?", (rid,))
    db.commit()
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------
def fx_to_mru(amount, rate, unit):
    if unit == "per100":
        return amount * 100 / rate
    if unit == "per5000":
        return amount * rate / 5000
    return amount * rate


def tx_payload(d):
    paid = num(d.get("mru_paid"))
    if not paid or paid <= 0 or paid > 1e12:
        return None, "bad_mru"
    method = get_db().execute("SELECT id, name FROM payment_methods WHERE id = ?",
                              (int(num(d.get("method_id")) or 0),)).fetchone()
    if not method:
        return None, "bad_method"
    app_row = None
    if d.get("app_id") not in (None, ""):
        app_row = get_db().execute("SELECT id, name FROM apps WHERE id = ?",
                                   (int(num(d.get("app_id")) or 0),)).fetchone()
        if not app_row:
            return None, "bad_app"
    elif d.get("require_app"):
        return None, "bad_app"
    to_amount = num(d.get("to_amount"))
    to_amount = to_amount if to_amount and to_amount > 0 else None
    to_currency = str(d.get("to_currency") or "").strip().upper()[:6]
    cost_type = d.get("cost_type") if d.get("cost_type") in COST_TYPES else "usd"
    unit = d.get("rate_unit") if d.get("rate_unit") in RATE_UNITS else "per_unit"

    rate = usd = buy = None
    if cost_type == "usd":
        rate = num(d.get("usd_rate"))
        if not rate or rate <= 0:
            return None, "bad_rate"
        usd = num(d.get("usd_amount"))
        if not usd or usd <= 0:
            return None, "bad_usd"
        cost = usd * rate
    else:
        buy = num(d.get("cur_buy_rate"))
        if not buy or buy <= 0:
            return None, "bad_buy"
        if not to_amount or not to_currency:
            return None, "bad_received"
        cost = fx_to_mru(to_amount, buy, unit)

    tx_date = str(d.get("tx_date") or "").strip()[:16]
    try:
        datetime.strptime(tx_date, "%Y-%m-%dT%H:%M")
    except ValueError:
        tx_date = now_local()
    cost = round(cost, 2)
    return {
        "tx_date": tx_date,
        "usd_rate": rate or 0,
        "usd_amount": round(usd, 4) if usd else 0,
        "cost_mru": cost,
        "mru_paid": round(paid, 2),
        "profit": round(paid - cost, 2),
        "method_id": method["id"],
        "method_name": method["name"],
        "to_currency": to_currency if to_amount else "",
        "to_amount": round(to_amount, 2) if to_amount else None,
        "cost_type": cost_type,
        "cur_buy_rate": buy,
        "rate_unit": unit,
        "app_id": app_row["id"] if app_row else None,
        "app_name": app_row["name"] if app_row else "",
        "package": str(d.get("package") or "").strip()[:60],
        "customer": str(d.get("customer") or "").strip()[:80],
        "note": str(d.get("note") or "").strip()[:300],
    }, None


@app.get("/api/settings")
@login_required
def api_settings():
    usd = get_db().execute("SELECT buy_rate FROM rates WHERE code = 'USD' AND buy_rate IS NOT NULL "
                           "ORDER BY id LIMIT 1").fetchone()
    return jsonify({"usd_rate": usd["buy_rate"] if usd else num(get_setting("last_usd_rate")),
                    "last_method_id": num(get_setting("last_method_id")),
                    "auth_type": current_user()["auth_type"], "me": current_user(),
                    "workers_see_profit": workers_see_profit()})


def workers_see_profit():
    return get_setting("workers_see_profit") == "1"


def can_see_profit():
    """Admins always; workers only when the admin allows it."""
    return is_admin() or workers_see_profit()


def strip_profit(d):
    """Remove profit figures from an operation sent to a worker who may not see them."""
    if not can_see_profit():
        for k in ("profit", "cost_mru"):
            d.pop(k, None)
    return d


@app.post("/api/settings/workers-profit")
@admin_required
def api_workers_profit():
    on = bool((request.get_json(silent=True) or {}).get("on"))
    db = get_db()
    set_setting(db, "workers_see_profit", "1" if on else "0")
    db.commit()
    return jsonify({"ok": True, "workers_see_profit": on})


@app.post("/api/transactions")
@login_required
def api_tx_create():
    row, e = tx_payload(request.get_json(silent=True) or {})
    if e:
        return err(e)
    row["created_at"] = row["updated_at"] = now_local()
    row["created_by"] = current_user()["id"]
    row["created_by_name"] = current_user()["name"]
    db = get_db()
    new_id = db.execute(f"INSERT INTO transactions ({', '.join(row)}) VALUES ({', '.join('?' * len(row))}) "
                        f"RETURNING id", list(row.values())).fetchone()["id"]
    if row["cost_type"] == "usd":
        set_setting(db, "last_usd_rate", row["usd_rate"])
    set_setting(db, "last_method_id", row["method_id"])
    db.commit()
    return jsonify(strip_profit({"ok": True, "id": new_id, "profit": row["profit"]})), 201


@app.put("/api/transactions/<int:tid>")
@login_required
def api_tx_update(tid):
    row, e = tx_payload(request.get_json(silent=True) or {})
    if e:
        return err(e)
    row["updated_at"] = now_local()
    db = get_db()
    scope, scope_params = own_scope()
    cur = db.execute(f"UPDATE transactions SET {', '.join(f'{k} = ?' for k in row)} WHERE id = ?{scope}",
                     list(row.values()) + [tid] + scope_params)
    db.commit()
    return jsonify({"ok": True}) if cur.rowcount else err("not_found", 404)


@app.delete("/api/transactions/<int:tid>")
@login_required
def api_tx_delete(tid):
    """Deleting moves the operation to the trash; it can be restored or removed for good."""
    db = get_db()
    scope, scope_params = own_scope()
    cur = db.execute(f"UPDATE transactions SET deleted_at = ?, deleted_by_name = ? WHERE id = ? AND deleted_at IS NULL{scope}",
                     [now_local(), current_user()["name"], tid] + scope_params)
    db.commit()
    return jsonify({"ok": True}) if cur.rowcount else err("not_found", 404)


@app.get("/api/trash")
@admin_required
def api_trash():
    rows = get_db().execute("SELECT * FROM transactions WHERE deleted_at IS NOT NULL "
                            "ORDER BY deleted_at DESC, id DESC LIMIT 1000").fetchall()
    return jsonify([dict(r) for r in rows])


@app.post("/api/trash/<int:tid>/restore")
@admin_required
def api_trash_restore(tid):
    db = get_db()
    cur = db.execute("UPDATE transactions SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL", (tid,))
    db.commit()
    return jsonify({"ok": True}) if cur.rowcount else err("not_found", 404)


@app.delete("/api/trash/<int:tid>")
@admin_required
def api_trash_purge(tid):
    db = get_db()
    db.execute("DELETE FROM transactions WHERE id = ? AND deleted_at IS NOT NULL", (tid,))
    db.commit()
    return jsonify({"ok": True})


@app.delete("/api/trash")
@admin_required
def api_trash_empty():
    db = get_db()
    db.execute("DELETE FROM transactions WHERE deleted_at IS NOT NULL")
    db.commit()
    return jsonify({"ok": True})


KIND_SQL = {"exchange": "app_id IS NULL", "topup": "app_id IS NOT NULL"}  # exchange ops vs app top-ups


def own_scope():
    """Workers may only see and change their own operations."""
    return ("", []) if is_admin() else (" AND created_by = ?", [current_user()["id"]])


def tx_filters():
    where, params = ["deleted_at IS NULL"], []
    if not is_admin():
        where.append("created_by = ?")
        params.append(current_user()["id"])
    elif request.args.get("user_id", "").isdigit():
        where.append("created_by = ?")
        params.append(int(request.args["user_id"]))
    if request.args.get("kind") in KIND_SQL:
        where.append(KIND_SQL[request.args["kind"]])
    if request.args.get("from"):
        where.append("tx_date >= ?")
        params.append(request.args["from"][:10])
    if request.args.get("to"):
        where.append("tx_date < ?")
        params.append(request.args["to"][:10] + "T99")  # include the whole 'to' day
    if request.args.get("method_id", "").isdigit():
        where.append("method_id = ?")
        params.append(int(request.args["method_id"]))
    if request.args.get("app_id", "").isdigit():
        where.append("app_id = ?")
        params.append(int(request.args["app_id"]))
    q = request.args.get("q", "").strip()
    if q:
        where.append("(customer LIKE ? OR note LIKE ? OR package LIKE ? OR created_by_name LIKE ?)")
        params += [f"%{q}%", f"%{q}%", f"%{q}%", f"%{q}%"]
    return (" WHERE " + " AND ".join(where)) if where else "", params


def period_totals(db, prefix):
    """Totals for a day/month prefix, overall and per kind (exchange / top-up)."""
    out = totals(db.execute(TOTALS_SQL + " WHERE tx_date LIKE ? AND deleted_at IS NULL", (prefix + "%",)).fetchone())
    for kind, cond in KIND_SQL.items():
        out[kind] = totals(db.execute(f"{TOTALS_SQL} WHERE tx_date LIKE ? AND deleted_at IS NULL AND {cond}",
                                      (prefix + "%",)).fetchone())
    return out


TOTALS_SQL = ("SELECT COUNT(*) n, COALESCE(SUM(profit),0) profit, COALESCE(SUM(mru_paid),0) mru, "
              "COALESCE(SUM(usd_amount),0) usd, COALESCE(SUM(cost_mru),0) cost FROM transactions")


def totals(row):
    return {"count": row["n"], "profit": round(row["profit"], 2), "mru_paid": round(row["mru"], 2),
            "usd": round(row["usd"], 2), "cost_mru": round(row["cost"], 2)}


@app.get("/api/transactions")
@login_required
def api_tx_list():
    where, params = tx_filters()
    limit = min(int(num(request.args.get("limit")) or 500), 5000)
    rows = get_db().execute(f"SELECT * FROM transactions{where} ORDER BY tx_date DESC, id DESC LIMIT ?",
                            params + [limit]).fetchall()
    return jsonify([strip_profit(dict(r)) for r in rows])


@app.get("/api/summary")
@admin_required
def api_summary():
    db = get_db()
    today = datetime.now().strftime("%Y-%m-%d")
    where, params = tx_filters()
    by_method = db.execute(
        f"SELECT method_id, method_name, COUNT(*) n, SUM(mru_paid) mru_paid, SUM(profit) profit "
        f"FROM transactions{where} GROUP BY method_id, method_name ORDER BY mru_paid DESC", params).fetchall()

    by_app = db.execute(
        f"SELECT app_id, app_name, COUNT(*) n, SUM(mru_paid) mru_paid, SUM(usd_amount) usd, SUM(profit) profit "
        f"FROM transactions{where} GROUP BY app_id, app_name ORDER BY profit DESC", params).fetchall()

    by_user = db.execute(
        f"SELECT created_by, created_by_name, COUNT(*) n, SUM(mru_paid) mru_paid, SUM(profit) profit "
        f"FROM transactions{where} GROUP BY created_by, created_by_name ORDER BY profit DESC", params).fetchall()

    start = (datetime.now() - timedelta(days=13)).strftime("%Y-%m-%d")
    per_day = {r["d"]: r["p"] for r in db.execute(
        "SELECT substr(tx_date,1,10) d, SUM(profit) p FROM transactions WHERE tx_date >= ? AND deleted_at IS NULL GROUP BY d", (start,))}
    daily = [{"date": d, "profit": round(per_day.get(d, 0), 2)}
             for d in ((datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(13, -1, -1))]

    return jsonify({
        "today": period_totals(db, today),
        "month": period_totals(db, today[:7]),
        "filtered": totals(db.execute(TOTALS_SQL + where, params).fetchone()),
        "by_method": [dict(r) for r in by_method],
        "by_app": [dict(r) for r in by_app],
        "by_user": [dict(r) for r in by_user],
        "daily": daily,
    })


@app.get("/api/transactions.csv")
@admin_required
def api_tx_csv():
    where, params = tx_filters()
    rows = get_db().execute(f"SELECT * FROM transactions{where} ORDER BY tx_date", params).fetchall()
    buf = io.StringIO()
    buf.write("﻿")  # so Excel shows Arabic correctly
    w = csv.writer(buf)
    w.writerow(["التاريخ", "التطبيق", "الباقة", "سعر الدولار", "الدولار", "التكلفة بالأوقية", "دفع الزبون", "الربح",
                "طريقة الدفع", "استلم", "العملة", "نوع التكلفة", "سعر الشراء", "الزبون", "ملاحظة"])
    for r in rows:
        w.writerow([r["tx_date"].replace("T", " "), r["app_name"], r["package"], r["usd_rate"], r["usd_amount"], r["cost_mru"],
                    r["mru_paid"], r["profit"], r["method_name"], r["to_amount"] or "", r["to_currency"],
                    "عبر الدولار" if r["cost_type"] == "usd" else "سعر شراء", r["cur_buy_rate"] or "",
                    r["customer"], r["note"]])
    return Response(buf.getvalue(), mimetype="text/csv; charset=utf-8", headers={
        "Content-Disposition": f"attachment; filename=minassa-exchange-{datetime.now():%Y%m%d}.csv"})


@app.errorhandler(413)
def too_large(_e):
    return err("too_large", 413)


# ---------------------------------------------------------------------------
@app.after_request
def headers(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    if request.path.startswith("/api/"):
        resp.headers["Cache-Control"] = "no-store"
    return resp


@app.route("/")
@app.route("/admin")          # same app; opens straight on the settings / admin page
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.route("/manifest.webmanifest")
def manifest():
    """Web app manifest: lets the site be installed and open full-screen (no browser bars)."""
    resp = send_from_directory(STATIC_DIR, "manifest.webmanifest", mimetype="application/manifest+json")
    resp.headers["Cache-Control"] = "public, max-age=3600"
    return resp


@app.route("/healthz")
def healthz():
    return {"ok": True}


init_db()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)),
            debug=os.environ.get("FLASK_DEBUG") == "1")
