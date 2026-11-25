#!/usr/bin/env python3
"""
جسر (Jisr) - دفتر معاملات الصرف وحساب الربح
Private ledger for a money-exchange business: record each exchange
transaction and see the profit per day / month / currency.

Profit (in MRU) is the difference between the rate given to the customer
and your cost (market) rate, applied to the foreign amount, plus any fee:

  sell (customer pays MRU, receives foreign):
      profit = amount_mru - cost_in_mru(amount_foreign) + fee
  buy  (customer gives foreign, receives MRU):
      profit = cost_in_mru(amount_foreign) - amount_mru + fee
"""
import csv
import io
import os
import secrets
import sqlite3
import time
from datetime import datetime, timedelta
from functools import wraps
from pathlib import Path

import bcrypt
from flask import Flask, Response, g, jsonify, request, send_from_directory, session

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
DATA_DIR = Path(os.environ.get("JISR_DATA_DIR", BASE_DIR / "data"))
DB_PATH = Path(os.environ.get("JISR_DB", DATA_DIR / "jisr.db"))
DATA_DIR.mkdir(parents=True, exist_ok=True)


def _load_secret():
    env = os.environ.get("JISR_SECRET")
    if env:
        return env
    key_file = DATA_DIR / ".secret_key"
    if key_file.exists():
        return key_file.read_text().strip()
    key = secrets.token_hex(32)
    key_file.write_text(key)
    return key


app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="/static")
app.secret_key = _load_secret()
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("JISR_SECURE_COOKIES") == "1",
    PERMANENT_SESSION_LIFETIME=timedelta(days=30),
)

MODES = ("per100", "per_unit")  # per100: foreign per 100 MRU ; per_unit: MRU per 1 foreign
TYPES = ("sell", "buy")
_login_attempts = {}

MESSAGES = {
    "unauthorized": "يجب تسجيل الدخول",
    "login_failed": "اسم المستخدم أو كلمة المرور غير صحيحة",
    "too_many": "محاولات كثيرة، انتظر دقيقة",
    "already_setup": "تم إنشاء الحساب مسبقاً",
    "password_short": "كلمة المرور قصيرة (٨ أحرف على الأقل)",
    "password_mismatch": "كلمتا المرور غير متطابقتين",
    "required": "املأ الحقول المطلوبة",
    "bad_amount": "أدخل مبلغاً صحيحاً أكبر من صفر",
    "bad_rate": "أدخل سعراً صحيحاً أكبر من صفر",
    "bad_currency": "اختر العملة",
    "currency_exists": "هذه العملة موجودة",
    "not_found": "غير موجود",
}


def err(key, status=400):
    return jsonify({"ok": False, "error": key, "message": MESSAGES.get(key, key)}), status


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(str(DB_PATH))
        g.db.row_factory = sqlite3.Row
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
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS currencies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        flag TEXT NOT NULL DEFAULT '',
        rate_mode TEXT NOT NULL DEFAULT 'per100',
        sell_rate REAL,      -- default rate given to a customer who buys this currency
        buy_rate REAL,       -- default rate given to a customer who sells this currency
        cost_rate REAL,      -- your cost / market rate
        sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tx_date TEXT NOT NULL,           -- local 'YYYY-MM-DDTHH:MM'
        type TEXT NOT NULL,              -- sell | buy
        currency_code TEXT NOT NULL,
        rate_mode TEXT NOT NULL,
        amount_mru REAL NOT NULL,
        amount_foreign REAL NOT NULL,
        rate_customer REAL NOT NULL,
        rate_cost REAL NOT NULL,
        fee REAL NOT NULL DEFAULT 0,
        profit REAL NOT NULL,
        customer TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(tx_date DESC);
    """)
    if db.execute("SELECT COUNT(*) FROM currencies").fetchone()[0] == 0:
        db.execute(
            "INSERT INTO currencies (code, name, flag, rate_mode, sell_rate) VALUES (?, ?, ?, ?, ?)",
            ("SLE", "ليون سيراليون", "🇸🇱", "per100", 53.0),
        )
    db.commit()
    db.close()


def now_local():
    return datetime.now().strftime("%Y-%m-%dT%H:%M")


# ---------------------------------------------------------------------------
# Money math
# ---------------------------------------------------------------------------
def foreign_to_mru(foreign, rate, mode):
    return foreign * 100 / rate if mode == "per100" else foreign * rate


def mru_to_foreign(mru, rate, mode):
    return mru * rate / 100 if mode == "per100" else mru / rate


def compute(tx_type, mode, rate_customer, rate_cost, fee, amount_mru=None, amount_foreign=None):
    """Fill in the missing amount using the customer rate, then compute profit."""
    if amount_mru is None:
        amount_mru = foreign_to_mru(amount_foreign, rate_customer, mode)
    if amount_foreign is None:
        amount_foreign = mru_to_foreign(amount_mru, rate_customer, mode)
    cost_mru = foreign_to_mru(amount_foreign, rate_cost, mode)
    profit = (amount_mru - cost_mru) if tx_type == "sell" else (cost_mru - amount_mru)
    profit += fee
    return round(amount_mru, 2), round(amount_foreign, 2), round(profit, 2)


def num(value, positive=False, allow_none=False):
    if value in (None, ""):
        return None if allow_none else (None if positive else 0.0)
    try:
        n = float(str(value).replace(",", "").strip())
    except ValueError:
        return None
    if n != n or abs(n) == float("inf"):
        return None
    if positive and n <= 0:
        return None
    return n


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
    ip = (request.headers.get("X-Forwarded-For", "").split(",")[0].strip() or request.remote_addr or "?")
    now = time.time()
    hits = [t for t in _login_attempts.get(ip, []) if now - t < 60]
    hits.append(now)
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
    return jsonify({"setup_needed": not has_admin, "logged_in": bool(session.get("admin")),
                    "user": session.get("user")})


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
    except sqlite3.IntegrityError:
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
# Currencies
# ---------------------------------------------------------------------------
@app.get("/api/currencies")
@login_required
def api_currencies():
    rows = get_db().execute("SELECT * FROM currencies ORDER BY sort_order, id").fetchall()
    return jsonify([dict(r) for r in rows])


def currency_payload(d):
    p = {
        "code": str(d.get("code") or "").strip().upper()[:6],
        "name": str(d.get("name") or "").strip()[:60],
        "flag": str(d.get("flag") or "").strip()[:16],
        "rate_mode": d.get("rate_mode") if d.get("rate_mode") in MODES else "per100",
        "sort_order": int(num(d.get("sort_order")) or 0),
    }
    for f in ("sell_rate", "buy_rate", "cost_rate"):
        v = num(d.get(f), allow_none=True)
        p[f] = v if v and v > 0 else None
    return p if p["code"] and p["name"] else None


@app.post("/api/currencies")
@login_required
def api_currency_create():
    p = currency_payload(request.get_json(silent=True) or {})
    if not p:
        return err("required")
    db = get_db()
    try:
        db.execute(f"INSERT INTO currencies ({', '.join(p)}) VALUES ({', '.join('?' * len(p))})", list(p.values()))
        db.commit()
    except sqlite3.IntegrityError:
        return err("currency_exists", 409)
    return jsonify({"ok": True}), 201


@app.put("/api/currencies/<int:cid>")
@login_required
def api_currency_update(cid):
    p = currency_payload(request.get_json(silent=True) or {})
    if not p:
        return err("required")
    db = get_db()
    try:
        cur = db.execute(f"UPDATE currencies SET {', '.join(f'{k} = ?' for k in p)} WHERE id = ?",
                         list(p.values()) + [cid])
        db.commit()
    except sqlite3.IntegrityError:
        return err("currency_exists", 409)
    return jsonify({"ok": True}) if cur.rowcount else err("not_found", 404)


@app.delete("/api/currencies/<int:cid>")
@login_required
def api_currency_delete(cid):
    db = get_db()
    db.execute("DELETE FROM currencies WHERE id = ?", (cid,))
    db.commit()
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------
def tx_payload(d):
    """Validate input and return (row_dict, error_key)."""
    tx_type = d.get("type") if d.get("type") in TYPES else "sell"
    cur = get_db().execute("SELECT * FROM currencies WHERE code = ?",
                           (str(d.get("currency_code") or "").upper(),)).fetchone()
    if not cur:
        return None, "bad_currency"
    rate_c = num(d.get("rate_customer"), positive=True)
    rate_k = num(d.get("rate_cost"), positive=True)
    if rate_c is None or rate_k is None:
        return None, "bad_rate"
    fee = num(d.get("fee")) or 0.0
    basis = d.get("basis") if d.get("basis") in ("mru", "foreign") else "mru"
    amount = num(d.get("amount_mru" if basis == "mru" else "amount_foreign"), positive=True)
    if amount is None or amount > 1e12:
        return None, "bad_amount"
    mru, foreign, profit = compute(
        tx_type, cur["rate_mode"], rate_c, rate_k, fee,
        amount_mru=amount if basis == "mru" else None,
        amount_foreign=amount if basis == "foreign" else None,
    )
    tx_date = str(d.get("tx_date") or "").strip()[:16]
    try:
        datetime.strptime(tx_date, "%Y-%m-%dT%H:%M")
    except ValueError:
        tx_date = now_local()
    return {
        "tx_date": tx_date, "type": tx_type, "currency_code": cur["code"], "rate_mode": cur["rate_mode"],
        "amount_mru": mru, "amount_foreign": foreign, "rate_customer": rate_c, "rate_cost": rate_k,
        "fee": fee, "profit": profit,
        "customer": str(d.get("customer") or "").strip()[:80],
        "note": str(d.get("note") or "").strip()[:300],
    }, None


def remember_rates(db, row):
    """The rates of the latest transaction become that currency's defaults."""
    field = "sell_rate" if row["type"] == "sell" else "buy_rate"
    db.execute(f"UPDATE currencies SET {field} = ?, cost_rate = ? WHERE code = ?",
               (row["rate_customer"], row["rate_cost"], row["currency_code"]))


@app.post("/api/transactions")
@login_required
def api_tx_create():
    row, e = tx_payload(request.get_json(silent=True) or {})
    if e:
        return err(e)
    ts = now_local()
    row.update(created_at=ts, updated_at=ts)
    db = get_db()
    cur = db.execute(f"INSERT INTO transactions ({', '.join(row)}) VALUES ({', '.join('?' * len(row))})",
                     list(row.values()))
    remember_rates(db, row)
    db.commit()
    return jsonify({"ok": True, "id": cur.lastrowid, "profit": row["profit"]}), 201


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
    if request.args.get("currency"):
        where.append("currency_code = ?")
        params.append(request.args["currency"].upper())
    if request.args.get("type") in TYPES:
        where.append("type = ?")
        params.append(request.args["type"])
    q = request.args.get("q", "").strip()
    if q:
        where.append("(customer LIKE ? OR note LIKE ?)")
        params += [f"%{q}%", f"%{q}%"]
    return (" WHERE " + " AND ".join(where)) if where else "", params


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
    month = today[:7]

    def period(prefix):
        r = db.execute("SELECT COUNT(*) n, COALESCE(SUM(profit),0) p, COALESCE(SUM(amount_mru),0) v "
                       "FROM transactions WHERE tx_date LIKE ?", (prefix + "%",)).fetchone()
        return {"count": r["n"], "profit": round(r["p"], 2), "volume_mru": round(r["v"], 2)}

    where, params = tx_filters()
    total = db.execute(f"SELECT COUNT(*) n, COALESCE(SUM(profit),0) p, COALESCE(SUM(amount_mru),0) v "
                       f"FROM transactions{where}", params).fetchone()
    by_currency = db.execute(
        f"SELECT currency_code, COUNT(*) n, SUM(profit) profit, SUM(amount_mru) volume_mru, "
        f"SUM(CASE WHEN type='sell' THEN amount_foreign ELSE 0 END) foreign_out, "
        f"SUM(CASE WHEN type='buy' THEN amount_foreign ELSE 0 END) foreign_in "
        f"FROM transactions{where} GROUP BY currency_code ORDER BY profit DESC", params).fetchall()

    start = (datetime.now() - timedelta(days=13)).strftime("%Y-%m-%d")
    daily_rows = {r["d"]: r["p"] for r in db.execute(
        "SELECT substr(tx_date,1,10) d, SUM(profit) p FROM transactions WHERE tx_date >= ? GROUP BY d",
        (start,))}
    daily = []
    for i in range(13, -1, -1):
        d = (datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d")
        daily.append({"date": d, "profit": round(daily_rows.get(d, 0), 2)})

    return jsonify({
        "today": period(today),
        "month": period(month),
        "filtered": {"count": total["n"], "profit": round(total["p"], 2), "volume_mru": round(total["v"], 2)},
        "by_currency": [dict(r) for r in by_currency],
        "daily": daily,
    })


@app.get("/api/transactions.csv")
@login_required
def api_tx_csv():
    where, params = tx_filters()
    rows = get_db().execute(f"SELECT * FROM transactions{where} ORDER BY tx_date", params).fetchall()
    buf = io.StringIO()
    buf.write("﻿")
    w = csv.writer(buf)
    w.writerow(["التاريخ", "النوع", "العملة", "المبلغ بالأوقية", "المبلغ بالعملة", "سعر الزبون",
                "سعر التكلفة", "عمولة", "الربح", "الزبون", "ملاحظة"])
    for r in rows:
        w.writerow([r["tx_date"].replace("T", " "), "بيع" if r["type"] == "sell" else "شراء", r["currency_code"],
                    r["amount_mru"], r["amount_foreign"], r["rate_customer"], r["rate_cost"], r["fee"],
                    r["profit"], r["customer"], r["note"]])
    return Response(buf.getvalue(), mimetype="text/csv; charset=utf-8", headers={
        "Content-Disposition": f"attachment; filename=jisr-{datetime.now():%Y%m%d}.csv"})


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
