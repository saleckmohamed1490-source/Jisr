#!/usr/bin/env python3
"""
جسر (Jisr) - دفتر معاملات التحويل وحساب الربح

Workflow: dollars (USDT) are bought on Binance at a price in MRU, the
transfer costs some amount of dollars, and the customer pays in MRU to one
of the payment accounts (Bankily, Sedad, Masrivi, ...).

    cost_mru = usd_amount * usd_rate
    profit   = mru_paid - cost_mru
"""
import csv
import io
import os
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
    "required": "املأ الحقول المطلوبة",
    "bad_rate": "أدخل سعر الدولار",
    "bad_usd": "أدخل كم كلّف من دولار",
    "bad_mru": "أدخل المبلغ الذي دفعه الزبون",
    "bad_method": "اختر طريقة الدفع",
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
        customer TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(tx_date DESC);
    """)
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
        n = float(str(value).replace(",", "").strip())
    except ValueError:
        return None
    return n if n == n and abs(n) != float("inf") else None


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
def login_required(fn):
    @wraps(fn)
    def wrapper(*a, **kw):
        if not session.get("admin"):
            return err("unauthorized", 401)
        if request.method not in ("GET", "HEAD") and request.headers.get("X-Jisr") != "1":
            return err("unauthorized", 403)
        return fn(*a, **kw)
    return wrapper


def too_many_logins():
    ip = request.headers.get("X-Forwarded-For", "").split(",")[0].strip() or request.remote_addr or "?"
    now = time.time()
    hits = [t for t in _login_attempts.get(ip, []) if now - t < 60] + [now]
    _login_attempts[ip] = hits
    return len(hits) > 10


def start_session(username):
    session.clear()
    session.permanent = True
    session["admin"] = True
    session["user"] = username


@app.get("/api/state")
def api_state():
    has_admin = get_db().execute("SELECT 1 FROM admin").fetchone() is not None
    return jsonify({"setup_needed": not has_admin, "logged_in": bool(session.get("admin"))})


@app.post("/api/setup")
def api_setup():
    if request.headers.get("X-Jisr") != "1":
        return err("unauthorized", 403)
    d = request.get_json(silent=True) or {}
    user = str(d.get("username") or "").strip()[:50]
    pw = str(d.get("password") or "")
    if not user or not pw:
        return err("required")
    if len(pw) < 8:
        return err("password_short")
    if pw != d.get("confirm_password"):
        return err("password_mismatch")
    db = get_db()
    try:
        db.execute("INSERT INTO admin (id, username, password_hash, created_at) VALUES (1, ?, ?, ?)",
                   (user, bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode(), now_local()))
        db.commit()
    except IntegrityErrors:
        return err("already_setup", 409)
    start_session(user)
    return jsonify({"ok": True})


@app.post("/api/login")
def api_login():
    if request.headers.get("X-Jisr") != "1":
        return err("unauthorized", 403)
    if too_many_logins():
        return err("too_many", 429)
    d = request.get_json(silent=True) or {}
    user = str(d.get("username") or "").strip()
    pw = str(d.get("password") or "")
    row = get_db().execute("SELECT * FROM admin WHERE id = 1").fetchone()
    if not row or row["username"] != user or not bcrypt.checkpw(pw.encode(), row["password_hash"].encode()):
        return err("login_failed", 401)
    start_session(user)
    return jsonify({"ok": True})


@app.post("/api/logout")
def api_logout():
    session.clear()
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Payment methods (Bankily, Sedad, Masrivi, ...) with logos
# ---------------------------------------------------------------------------
METHOD_COLS = "id, name, color, logo_version, sort_order, is_active"


def method_json(r):
    d = dict(r)
    d["logo_url"] = f"/logos/{r['id']}?v={r['logo_version']}" if r["logo_version"] else None
    return d


@app.get("/api/methods")
@login_required
def api_methods():
    rows = get_db().execute(f"SELECT {METHOD_COLS} FROM payment_methods ORDER BY sort_order, id").fetchall()
    return jsonify([method_json(r) for r in rows])


def method_payload(d):
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


@app.post("/api/methods")
@login_required
def api_method_create():
    p = method_payload(request.get_json(silent=True) or {})
    if not p:
        return err("required")
    db = get_db()
    new_id = db.execute(f"INSERT INTO payment_methods ({', '.join(p)}) VALUES ({', '.join('?' * len(p))}) "
                        f"RETURNING id", list(p.values())).fetchone()["id"]
    db.commit()
    return jsonify({"ok": True, "id": new_id}), 201


@app.put("/api/methods/<int:mid>")
@login_required
def api_method_update(mid):
    p = method_payload(request.get_json(silent=True) or {})
    if not p:
        return err("required")
    db = get_db()
    cur = db.execute(f"UPDATE payment_methods SET {', '.join(f'{k} = ?' for k in p)} WHERE id = ?",
                     list(p.values()) + [mid])
    db.execute("UPDATE transactions SET method_name = ? WHERE method_id = ?", (p["name"], mid))
    db.commit()
    return jsonify({"ok": True}) if cur.rowcount else err("not_found", 404)


@app.delete("/api/methods/<int:mid>")
@login_required
def api_method_delete(mid):
    db = get_db()
    db.execute("DELETE FROM payment_methods WHERE id = ?", (mid,))
    db.commit()
    return jsonify({"ok": True})


@app.post("/api/methods/<int:mid>/logo")
@login_required
def api_method_logo(mid):
    db = get_db()
    if not db.execute("SELECT 1 FROM payment_methods WHERE id = ?", (mid,)).fetchone():
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
    db.execute("UPDATE payment_methods SET logo = ?, logo_version = ? WHERE id = ?",
               (buf.getvalue(), version, mid))
    db.commit()
    return jsonify({"ok": True, "logo_url": f"/logos/{mid}?v={version}"})


@app.delete("/api/methods/<int:mid>/logo")
@login_required
def api_method_logo_delete(mid):
    db = get_db()
    db.execute("UPDATE payment_methods SET logo = NULL, logo_version = NULL WHERE id = ?", (mid,))
    db.commit()
    return jsonify({"ok": True})


@app.get("/logos/<int:mid>")
def logo_file(mid):
    row = get_db().execute("SELECT logo FROM payment_methods WHERE id = ?", (mid,)).fetchone()
    if not row or not row["logo"]:
        abort(404)
    resp = Response(bytes(row["logo"]), mimetype="image/png")
    resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"  # URL carries ?v=
    return resp


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------
def tx_payload(d):
    rate = num(d.get("usd_rate"))
    if not rate or rate <= 0:
        return None, "bad_rate"
    usd = num(d.get("usd_amount"))
    if not usd or usd <= 0:
        return None, "bad_usd"
    paid = num(d.get("mru_paid"))
    if not paid or paid <= 0 or paid > 1e12:
        return None, "bad_mru"
    method = get_db().execute("SELECT * FROM payment_methods WHERE id = ?",
                              (int(num(d.get("method_id")) or 0),)).fetchone()
    if not method:
        return None, "bad_method"
    tx_date = str(d.get("tx_date") or "").strip()[:16]
    try:
        datetime.strptime(tx_date, "%Y-%m-%dT%H:%M")
    except ValueError:
        tx_date = now_local()
    cost = round(usd * rate, 2)
    return {
        "tx_date": tx_date,
        "usd_rate": rate,
        "usd_amount": round(usd, 4),
        "cost_mru": cost,
        "mru_paid": round(paid, 2),
        "profit": round(paid - cost, 2),
        "method_id": method["id"],
        "method_name": method["name"],
        "customer": str(d.get("customer") or "").strip()[:80],
        "note": str(d.get("note") or "").strip()[:300],
    }, None


@app.get("/api/settings")
@login_required
def api_settings():
    return jsonify({"last_usd_rate": num(get_setting("last_usd_rate")),
                    "last_method_id": num(get_setting("last_method_id"))})


@app.post("/api/transactions")
@login_required
def api_tx_create():
    row, e = tx_payload(request.get_json(silent=True) or {})
    if e:
        return err(e)
    row["created_at"] = row["updated_at"] = now_local()
    db = get_db()
    new_id = db.execute(f"INSERT INTO transactions ({', '.join(row)}) VALUES ({', '.join('?' * len(row))}) "
                        f"RETURNING id", list(row.values())).fetchone()["id"]
    set_setting(db, "last_usd_rate", row["usd_rate"])
    set_setting(db, "last_method_id", row["method_id"])
    db.commit()
    return jsonify({"ok": True, "id": new_id, "profit": row["profit"]}), 201


@app.put("/api/transactions/<int:tid>")
@login_required
def api_tx_update(tid):
    row, e = tx_payload(request.get_json(silent=True) or {})
    if e:
        return err(e)
    row["updated_at"] = now_local()
    db = get_db()
    cur = db.execute(f"UPDATE transactions SET {', '.join(f'{k} = ?' for k in row)} WHERE id = ?",
                     list(row.values()) + [tid])
    db.commit()
    return jsonify({"ok": True}) if cur.rowcount else err("not_found", 404)


@app.delete("/api/transactions/<int:tid>")
@login_required
def api_tx_delete(tid):
    db = get_db()
    db.execute("DELETE FROM transactions WHERE id = ?", (tid,))
    db.commit()
    return jsonify({"ok": True})


def tx_filters():
    where, params = [], []
    if request.args.get("from"):
        where.append("tx_date >= ?")
        params.append(request.args["from"][:10])
    if request.args.get("to"):
        where.append("tx_date < ?")
        params.append(request.args["to"][:10] + "T99")  # include the whole 'to' day
    if request.args.get("method_id", "").isdigit():
        where.append("method_id = ?")
        params.append(int(request.args["method_id"]))
    q = request.args.get("q", "").strip()
    if q:
        where.append("(customer LIKE ? OR note LIKE ?)")
        params += [f"%{q}%", f"%{q}%"]
    return (" WHERE " + " AND ".join(where)) if where else "", params


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
    return jsonify([dict(r) for r in rows])


@app.get("/api/summary")
@login_required
def api_summary():
    db = get_db()
    today = datetime.now().strftime("%Y-%m-%d")
    where, params = tx_filters()
    by_method = db.execute(
        f"SELECT method_id, method_name, COUNT(*) n, SUM(mru_paid) mru_paid, SUM(profit) profit "
        f"FROM transactions{where} GROUP BY method_id, method_name ORDER BY mru_paid DESC", params).fetchall()

    start = (datetime.now() - timedelta(days=13)).strftime("%Y-%m-%d")
    per_day = {r["d"]: r["p"] for r in db.execute(
        "SELECT substr(tx_date,1,10) d, SUM(profit) p FROM transactions WHERE tx_date >= ? GROUP BY d", (start,))}
    daily = [{"date": d, "profit": round(per_day.get(d, 0), 2)}
             for d in ((datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(13, -1, -1))]

    return jsonify({
        "today": totals(db.execute(TOTALS_SQL + " WHERE tx_date LIKE ?", (today + "%",)).fetchone()),
        "month": totals(db.execute(TOTALS_SQL + " WHERE tx_date LIKE ?", (today[:7] + "%",)).fetchone()),
        "filtered": totals(db.execute(TOTALS_SQL + where, params).fetchone()),
        "by_method": [dict(r) for r in by_method],
        "daily": daily,
    })


@app.get("/api/transactions.csv")
@login_required
def api_tx_csv():
    where, params = tx_filters()
    rows = get_db().execute(f"SELECT * FROM transactions{where} ORDER BY tx_date", params).fetchall()
    buf = io.StringIO()
    buf.write("﻿")  # so Excel shows Arabic correctly
    w = csv.writer(buf)
    w.writerow(["التاريخ", "سعر الدولار", "الدولار", "التكلفة بالأوقية", "دفع الزبون", "الربح",
                "طريقة الدفع", "الزبون", "ملاحظة"])
    for r in rows:
        w.writerow([r["tx_date"].replace("T", " "), r["usd_rate"], r["usd_amount"], r["cost_mru"],
                    r["mru_paid"], r["profit"], r["method_name"], r["customer"], r["note"]])
    return Response(buf.getvalue(), mimetype="text/csv; charset=utf-8", headers={
        "Content-Disposition": f"attachment; filename=jisr-{datetime.now():%Y%m%d}.csv"})


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
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.route("/healthz")
def healthz():
    return {"ok": True}


init_db()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)),
            debug=os.environ.get("FLASK_DEBUG") == "1")
