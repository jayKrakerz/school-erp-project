import json
import os
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse
import mimetypes
import time
import urllib.request
import urllib.parse
import uuid
import re
import html
import copy
import calendar
import math
import contextlib
from datetime import date, datetime, timedelta, timezone
try:
    import fcntl
except ImportError:  # pragma: no cover - Windows development fallback
    fcntl = None

# --- CONFIGURATION & SECURITY ---
# This persists SESSION_SECRET across restarts without manual export commands.
def _load_dotenv():
    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
    if not os.path.exists(env_path):
        return
    with open(env_path, 'r') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, _, val = line.partition('=')
            key = key.strip()
            val = val.strip()
            if key and key not in os.environ:  # Don't override real env vars
                os.environ[key] = val
_load_dotenv()

_default_host_user = os.environ.get('USER', '').strip()
_default_domains = 'localhost,127.0.0.1' + (f',{_default_host_user}.pythonanywhere.com' if _default_host_user else '')
ALLOWED_DOMAINS = os.environ.get('ALLOWED_DOMAINS', _default_domains).split(',')
ALLOWED_ORIGINS = os.environ.get('ALLOWED_ORIGINS', 'http://localhost:3001,http://localhost:3002').split(',')
PASSWORD_RESET_TIMEOUT = 1800  # 30 minutes

def log_event(level, event_type, details=None):
    """Structured JSON logging with multi-level severity."""
    log_entry = {
        "timestamp": time.strftime('%Y-%m-%d %H:%M:%S'),
        "level": level.upper(),
        "type": event_type,
        "details": details or {}
    }
    log_line = json.dumps(log_entry) + "\n"
    
    # Generic system log
    with open(os.path.join(os.path.dirname(__file__), 'system_audit.log'), 'a') as f:
        f.write(log_line)
    
    # Critical alerts log
    if level.upper() == 'CRITICAL':
        print(f"!!! ALERT: {event_type} - {details}")
        with open(os.path.join(os.path.dirname(__file__), 'alerts.log'), 'a') as f:
            f.write(log_line)

def send_reset_email(to_email, reset_link):
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart

    # Check if SMTP is configured
    smtp_host = os.environ.get('SMTP_HOST')
    smtp_port = os.environ.get('SMTP_PORT')
    smtp_user = os.environ.get('SMTP_USER')
    smtp_password = os.environ.get('SMTP_PASSWORD')
    
    if not (smtp_host and smtp_port and smtp_user and smtp_password):
        print("SMTP not fully configured in environment (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD). Skipping SMTP email sending.")
        return False
        
    try:
        port = int(smtp_port)
        msg = MIMEMultipart('alternative')
        msg['Subject'] = 'True Star School ERP - Password Reset'
        msg['From'] = os.environ.get('SMTP_SENDER', smtp_user)
        msg['To'] = to_email
        
        text = f"Hello,\n\nYou requested a password reset for your True Star School ERP account.\nClick the link below to set a new password:\n{reset_link}\n\nThis link will expire in 30 minutes.\nIf you did not request this, please ignore this email."
        html = f"""
        <html>
          <body>
            <h2>Password Reset Request</h2>
            <p>Hello,</p>
            <p>You requested a password reset for your True Star School ERP account.</p>
            <p>Click the link below to set a new password:</p>
            <p><a href="{reset_link}" style="padding:10px 20px; color:white; background:#4f46e5; text-decoration:none; border-radius:5px; display:inline-block;">Reset Password</a></p>
            <p>Or copy and paste this URL into your browser:</p>
            <p>{reset_link}</p>
            <br/>
            <p>This link will expire in 30 minutes.</p>
            <p>If you did not request this, you can safely ignore this email.</p>
          </body>
        </html>
        """
        msg.attach(MIMEText(text, 'plain', 'utf-8'))
        msg.attach(MIMEText(html, 'html', 'utf-8'))
        
        if port == 465:
            server = smtplib.SMTP_SSL(smtp_host, port)
        else:
            server = smtplib.SMTP(smtp_host, port)
            server.ehlo()
            server.starttls()
            server.ehlo()
            
        server.login(smtp_user, smtp_password)
        server.sendmail(msg['From'], to_email, msg.as_string())
        server.quit()
        print(f"Reset email successfully sent to {to_email} via SMTP.")
        return True
    except Exception as e:
        print(f"SMTP error sending password reset email to {to_email}: {e}")
        return False

DATA_FILE = os.path.join(os.path.dirname(__file__), 'data.json')
DIST_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'frontend', 'dist')
UPLOADS_DIR = os.path.join(os.path.dirname(__file__), 'uploads')

DEFAULT_DATA = {
    "students": [
        { "id": "1", "sid": "2026-STU001", "name": "ALICE JOHNSON", "class": "BASIC 6 A", "contact": "123-456-7890", "gender": "F", "prevArrears": 0 },
        { "id": "2", "sid": "2027-STU002", "name": "BOB SMITH", "class": "BASIC 8", "contact": "098-765-4321", "gender": "M", "prevArrears": 500 }
    ],
    "payments": [],
    "deleted": [],
    "reports": [],
    "users": [{ "email": "admin@school.com", "password": "password123", "name": "Admin User" }],
    "currency": "GH₵",
    "feeConfig": {
      "CRECHE": 680, "NURSERY": 680, "KINDERGARTEN": 680,
      "BASIC 1": 700, "BASIC 2": 700, "BASIC 3": 700,
      "BASIC 4": 720, "BASIC 5": 720, "BASIC 6": 720,
      "BASIC 7": 900, "BASIC 8": 900, "BASIC 9": 900, "JHS": 900
    },
    "schoolInfo": {
      "schoolName": "TRUE STAR MONTESSORI",
      "termFee": 1000,
      "academicYear": "2024/2025",
      "term": "TERM 1",
      "backendUrl": "http://172.20.10.5:8080/api/data"
    }
}

def sanitize_input(val):
    """Deeply sanitize input to prevent XSS and other injection attacks."""
    if isinstance(val, dict):
        return {k: sanitize_input(v) for k, v in val.items()}
    if isinstance(val, list):
        return [sanitize_input(v) for v in val]
    if isinstance(val, str):
        # Strip script tags and escape HTML.
        s = re.sub(r'<script\b[^>]*>([\s\S]*?)<\/script>', '', val, flags=re.IGNORECASE)
        return html.escape(s)
    return val

import threading
DATA_LOCK = threading.Lock()
RATE_LIMIT_LOCK = threading.Lock()
RATE_LIMIT_BUCKETS = {}
_DATA_CACHE = None
_DATA_TIMESTAMP = 0

@contextlib.contextmanager
def process_data_lock():
    lock_handle = open(f'{DATA_FILE}.lock', 'a+', encoding='utf-8')
    try:
        if fcntl is not None:
            fcntl.flock(lock_handle.fileno(), fcntl.LOCK_EX)
        yield
    finally:
        if fcntl is not None:
            fcntl.flock(lock_handle.fileno(), fcntl.LOCK_UN)
        lock_handle.close()

def allow_rate_limited_action(key, limit, window_seconds):
    now = time.time()
    with RATE_LIMIT_LOCK:
        attempts = [stamp for stamp in RATE_LIMIT_BUCKETS.get(key, []) if now - stamp < window_seconds]
        if len(attempts) >= limit:
            RATE_LIMIT_BUCKETS[key] = attempts
            return False
        attempts.append(now)
        RATE_LIMIT_BUCKETS[key] = attempts
        return True

# --- Multi-tenancy model --------------------------------------------------
# Tenancy is field-based in a single data.json: every record carries a
# `schoolId`, and per-school configuration lives under data['schools'][sid].
# A user's school is read from their server-side record, never the client.

# Top-level arrays whose items each carry a `schoolId` and are filtered per school.
RECORD_COLLECTIONS = (
    'students', 'payments', 'reports', 'staff',
    'expenditures', 'deleted', 'activity_log', 'studentReports',
    'staffPerformance', 'staffPerformanceHistory', 'staffAttendance', 'staffQuestions', 'lessonNotes',
    'staffAwards', 'staffDisciplinary', 'staffTasks', 'staffEnquiries',
    'transportRoutes', 'buses', 'drivers', 'studentTransport', 'transportInvoices',
    'feedingRecords', 'auditEvents', 'recurringExpenseRules', 'reportVersions',
    'transportMaintenance', 'invitations', 'syncReceipts',
    'payrollApprovals',
)
# Configuration namespaced under data['schools'][sid][<key>] (one copy per school).
SCHOOL_CONFIG_KEYS = (
    'schoolInfo', 'feeConfig', 'settings', 'currency', 'allClasses',
    'departments', 'feedingConfig', 'reportTemplates', 'attendance',
    'branding', 'retentionPolicy', 'syncState',
)
SCHEMA_VERSION = 2
REQUIRED_ARRAYS = (
    'auditEvents', 'recurringExpenseRules', 'reportVersions',
    'transportMaintenance', 'invitations', 'syncReceipts', 'feedingRecords',
    'studentTransport',
)
LIFECYCLE_COLLECTIONS = {
    'auditEvents', 'reportVersions', 'syncReceipts', 'invitations',
    'recurringExpenseRules', 'transportMaintenance', 'transportInvoices',
    'reports', 'deleted',
    'payrollApprovals',
}
MUTABLE_COLLECTIONS = set(RECORD_COLLECTIONS) - LIFECYCLE_COLLECTIONS
RECYCLABLE_COLLECTIONS = MUTABLE_COLLECTIONS | {
    'reports', 'transportMaintenance', 'transportInvoices', 'expenditures',
}
STAFF_WORKFLOW_COLLECTIONS = {
    'lessonNotes', 'staffQuestions', 'staffTasks', 'staffEnquiries',
    'staffAwards', 'staffDisciplinary',
}
STAFF_SELF_SERVICE_COLLECTIONS = {
    'lessonNotes', 'staffQuestions', 'staffTasks', 'staffEnquiries',
}
TRANSPORT_COLLECTIONS = {
    'transportRoutes', 'buses', 'drivers', 'studentTransport',
    'transportInvoices', 'transportMaintenance',
}
# Default class list for a freshly-created school (mirrors Login.jsx DEFAULT_CLASSES).
DEFAULT_CLASSES = [
    'CRECHE', 'NURSERY 1A', 'NURSERY 1B', 'NURSERY 2A', 'NURSERY 2B',
    'KG1A', 'KG1B', 'KG2A', 'KG2B',
    'BASIC 1', 'BASIC 2', 'BASIC 3',
    'BASIC 4', 'BASIC 5', 'BASIC 6', 'BASIC 6 A', 'BASIC 6 B',
    'BASIC 7', 'BASIC 8', 'BASIC 9',
]

# Cap request bodies. Reports embed base64 images, so keep this generous but
# bounded to avoid a single request exhausting memory. Override via env.
MAX_REQUEST_BYTES = int(os.environ.get('MAX_REQUEST_BYTES', 25 * 1024 * 1024))  # 25 MB
MAX_REPORT_BYTES = int(os.environ.get('MAX_REPORT_BYTES', 10 * 1024 * 1024))
MAX_REPORT_VERSIONS = int(os.environ.get('MAX_REPORT_VERSIONS', 20))
MAX_MONEY_AMOUNT = 1_000_000_000
MAX_RECURRING_OCCURRENCES = 1000

def _load_data_unlocked():
    """Read and parse data.json. Caller must hold DATA_LOCK."""
    if not os.path.exists(DATA_FILE):
        sentinel = f'{DATA_FILE}.corrupt-state'
        if os.path.exists(sentinel):
            raise RuntimeError(f'data.json is unavailable after corruption; restore it and remove {sentinel}')
        # First run only: materialize defaults.
        _save_data_unlocked(DEFAULT_DATA)
        return DEFAULT_DATA
    try:
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        # The file exists but is unreadable/corrupt. Do NOT fall back to
        # DEFAULT_DATA here — a subsequent save would overwrite the real
        # database with the 2-student defaults and lose everything. Preserve
        # the bad file for recovery and refuse rather than destroy data.
        corrupt_path = f"{DATA_FILE}.corrupt-{time.strftime('%Y%m%d-%H%M%S')}"
        try:
            os.replace(DATA_FILE, corrupt_path)
            with open(f'{DATA_FILE}.corrupt-state', 'w', encoding='utf-8') as marker:
                marker.write(corrupt_path)
            print(f"ERROR: data.json failed to parse ({e}); preserved as {corrupt_path}")
        except OSError as move_err:
            print(f"ERROR: data.json failed to parse ({e}); could not preserve it ({move_err})")
        raise RuntimeError(f"data.json is corrupt; refusing to overwrite. See {corrupt_path}") from e

def _save_data_unlocked(data):
    """Atomically write data.json via temp file + os.replace. Caller must hold DATA_LOCK."""
    tmp_path = f"{DATA_FILE}.tmp-{os.getpid()}"
    with open(tmp_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.flush()
        try:
            os.fsync(f.fileno())  # Force the temp file's bytes to disk before swap
        except OSError:
            pass
    # Atomic on POSIX: readers see either the old file or the fully-written new one,
    # never a truncated half-write (e.g. from a crash or full disk mid-write).
    os.replace(tmp_path, DATA_FILE)

def initialize_schema(data):
    """Add missing foundation fields without replacing or reshaping existing data."""
    changed = False
    schema = data.setdefault('_schema', {})
    previous_version = int(schema.get('version', 0) or 0)
    if previous_version < SCHEMA_VERSION:
        schema['version'] = SCHEMA_VERSION
        changed = True
    if previous_version < 2 and isinstance(data.get('reset_tokens'), dict):
        data['reset_tokens'] = {
            hashlib.sha256(str(token).encode('utf-8')).hexdigest(): entry
            for token, entry in data['reset_tokens'].items()
        }
        changed = True
    for key in REQUIRED_ARRAYS:
        if key not in data:
            data[key] = []
            changed = True
    for user in data.get('users', []):
        if not isinstance(user, dict):
            continue
        if 'authVersion' not in user:
            user['authVersion'] = 0
            changed = True
        password = user.get('password')
        if isinstance(password, str) and not password.startswith(('scrypt$', 'pbkdf2$')):
            user['password'] = hash_password(password)
            changed = True
    for cfg in data.setdefault('schools', {}).values():
        if not isinstance(cfg, dict):
            continue
        if 'retentionPolicy' not in cfg:
            cfg['retentionPolicy'] = {'recycleDays': 30}
            changed = True
        if 'syncState' not in cfg:
            cfg['syncState'] = {'revision': 0}
            changed = True
    return changed

_INDEX_BY_SCHOOL = {}

def _build_indexes(data):
    """Build in-memory indexes for optimized filtering of high-traffic fields."""
    global _INDEX_BY_SCHOOL
    _INDEX_BY_SCHOOL = {}
    for coll in RECORD_COLLECTIONS:
        _INDEX_BY_SCHOOL[coll] = {}
        items = data.get(coll, [])
        if isinstance(items, list):
            for item in items:
                if isinstance(item, dict):
                    sid = item.get('schoolId', 'default')
                    _INDEX_BY_SCHOOL[coll].setdefault(sid, []).append(item)

def load_data():
    """Read and cache data.json with basic indexing for high-traffic fields."""
    global _DATA_CACHE, _DATA_TIMESTAMP
    with DATA_LOCK:
        current_time = time.time()
        # Cache for 1 second to reduce disk IO on concurrent requests
        if _DATA_CACHE and (current_time - _DATA_TIMESTAMP < 1):
            return _DATA_CACHE
        _DATA_CACHE = _load_data_unlocked()
        _build_indexes(_DATA_CACHE)
        _DATA_TIMESTAMP = current_time
        return _DATA_CACHE

def save_data(data):
    global _DATA_CACHE, _DATA_TIMESTAMP
    with DATA_LOCK:
        with process_data_lock():
            _save_data_unlocked(data)
            _DATA_CACHE = data
            _build_indexes(data)
            _DATA_TIMESTAMP = time.time()

def get_records_by_school(data, collection, school_id):
    """Optimized record retrieval via in-memory index."""
    if _INDEX_BY_SCHOOL.get(collection) and school_id in _INDEX_BY_SCHOOL[collection]:
        return _INDEX_BY_SCHOOL[collection][school_id]
    return [i for i in data.get(collection, []) if isinstance(i, dict) and i.get('schoolId') == school_id]

class SkipSave(Exception):
    """Raise inside a mutate_data() block to exit without writing (e.g. a
    validation failure or not-found, where nothing actually changed)."""

@contextlib.contextmanager
def mutate_data():
    """Atomic read-modify-write: holds DATA_LOCK across load AND save so two
    concurrent writers can't clobber each other's changes (the ThreadingMixIn
    TOCTOU). Usage:
        with mutate_data() as data:
            data['users'].append(...)
    The save happens automatically on clean exit. Raise SkipSave to bail out
    without writing; any other exception also propagates and skips the save."""
    global _DATA_CACHE, _DATA_TIMESTAMP
    with DATA_LOCK:
        with process_data_lock():
            data = _load_data_unlocked()
            try:
                yield data
            except SkipSave:
                return
            _save_data_unlocked(data)
            _DATA_CACHE = data
            _build_indexes(data)
            _DATA_TIMESTAMP = time.time()

def _iso_now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')

def append_audit(data, sid, user, action, collection=None, target_id=None, details=None):
    event = {
        'id': str(uuid.uuid4()), 'schoolId': sid, 'action': action,
        'actor': (user or {}).get('email'), 'actorRole': (user or {}).get('role'),
        'collection': collection, 'targetId': str(target_id) if target_id is not None else None,
        'details': details or {}, 'createdAt': _iso_now(),
    }
    data.setdefault('auditEvents', []).append(event)
    return event

def append_report_version(data, sid, report, reason, user):
    collection = data.setdefault('reportVersions', [])
    matching = [item for item in collection if item.get('schoolId') == sid and str(item.get('reportId')) == str(report['id'])]
    version = max((int(item.get('version', 0) or 0) for item in matching), default=0) + 1
    entry = {'id': str(uuid.uuid4()), 'schoolId': sid, 'reportId': report['id'], 'version': version,
             'reason': reason, 'snapshot': copy.deepcopy(report), 'createdAt': _iso_now(),
             'createdBy': (user or {}).get('email')}
    collection.append(entry)
    matching.append(entry)
    for stale in matching[:-max(MAX_REPORT_VERSIONS, 1)]:
        if stale in collection:
            collection.remove(stale)
    return entry

def bump_revision(data, sid):
    state = data.setdefault('schools', {}).setdefault(sid, {}).setdefault('syncState', {'revision': 0})
    state['revision'] = int(state.get('revision', 0) or 0) + 1
    state['serverTime'] = _iso_now()
    return state['revision']

def _parse_date(value):
    try:
        return date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None

def _valid_money(value, allow_zero=False):
    """Return a finite, bounded monetary value, or None when invalid."""
    if isinstance(value, bool):
        return None
    try:
        amount = float(value)
    except (TypeError, ValueError):
        return None
    minimum = 0 if allow_zero else 0.0000001
    return amount if math.isfinite(amount) and minimum <= amount <= MAX_MONEY_AMOUNT else None

def _normal_class(value):
    return str(value or '').upper().replace(' ', '')

def _record_owner(item):
    return str(item.get('createdBy') or item.get('email') or item.get('ownerEmail') or '').lower().strip()

def _validate_record_item(collection, item):
    if not isinstance(item, dict):
        return 'Record must be a JSON object'
    if collection in ('payments', 'expenditures', 'transportInvoices') and 'amount' in item:
        amount = _valid_money(item.get('amount'), allow_zero=False)
        if amount is None:
            return 'amount must be positive, finite and within bounds'
        item['amount'] = amount
    return None

def _validate_references(data, sid, collection, item):
    def exists(name, value):
        return any(record.get('schoolId') == sid and str(value) in (str(record.get('id')), str(record.get('sid')))
                   for record in data.get(name, []) if isinstance(record, dict))
    if collection == 'payments' and item.get('studentSid') and not exists('students', item['studentSid']):
        return 'Referenced student does not exist'
    if collection == 'studentTransport':
        if not exists('students', item.get('studentId')): return 'Referenced student does not exist'
        if not exists('transportRoutes', item.get('routeId')): return 'Referenced route does not exist'
    if collection == 'buses' and item.get('routeId') and not exists('transportRoutes', item['routeId']):
        return 'Referenced route does not exist'
    if collection == 'transportMaintenance' and item.get('busId') and not exists('buses', item['busId']):
        return 'Referenced bus does not exist'
    if collection == 'transportInvoices' and item.get('studentId') and not exists('students', item['studentId']):
        return 'Referenced student does not exist'
    return None

def _can_access_report(data, user, report):
    """Report access is tenant checked by callers; this enforces role/class."""
    role = str(user.get('role', 'TEACHER')).upper().strip()
    if role in ('ADMIN', 'HEAD TEACHER'):
        return True
    if role == 'ACCOUNTANT':
        return False
    assigned = _normal_class(user.get('assignedClass'))
    report_class = _normal_class(report.get('studentClass') or report.get('class'))
    if not report_class:
        student_ref = str(report.get('studentId') or report.get('studentSid') or '')
        student = next((s for s in data.get('students', [])
                        if s.get('schoolId') == user.get('schoolId', 'default')
                        and student_ref in (str(s.get('id', '')), str(s.get('sid', '')))), None)
        report_class = _normal_class((student or {}).get('class'))
    return bool(assigned and report_class and assigned == report_class)

def _next_occurrence(day, frequency):
    if frequency == 'weekly':
        return day + timedelta(days=7)
    if frequency == 'yearly':
        try:
            return day.replace(year=day.year + 1)
        except ValueError:
            return day.replace(year=day.year + 1, day=28)
    month = day.month + 1
    year = day.year + (month > 12)
    month = 1 if month > 12 else month
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))

import hmac
import hashlib
import base64
import secrets

# --- Session tokens -------------------------------------------------------
# Tokens are HMAC-signed, stateless, and carry an expiry. The client treats
# them as opaque. Identity and role are derived ONLY from the signed payload
# and the server-side user record — never from client-supplied headers — so a
# caller cannot forge a token or escalate its own role.
SESSION_SECRET = os.environ.get('SESSION_SECRET')
if not SESSION_SECRET:
    # Ephemeral per-process secret: secure, but existing tokens become invalid
    # on restart (everyone must log in again). Set SESSION_SECRET in the
    # environment to keep sessions valid across restarts.
    SESSION_SECRET = secrets.token_hex(32)
    print("WARNING: SESSION_SECRET not set — using an ephemeral secret; logins will not survive a restart.")
SESSION_SECRET_BYTES = SESSION_SECRET.encode('utf-8')
TOKEN_TTL_SECONDS = int(os.environ.get('TOKEN_TTL_SECONDS', 7 * 24 * 3600))  # default 7 days

def _b64u_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode('ascii').rstrip('=')

def _b64u_decode(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + '=' * (-len(s) % 4))

def make_token(email, uuid_val=None, auth_version=0):
    payload = _b64u_encode(json.dumps(
        {"email": email, "uuid": uuid_val, "av": int(auth_version or 0), "exp": int(time.time()) + TOKEN_TTL_SECONDS},
        separators=(',', ':')
    ).encode('utf-8'))
    sig = _b64u_encode(hmac.new(SESSION_SECRET_BYTES, payload.encode('ascii'), hashlib.sha256).digest())
    return f"{payload}.{sig}"

def verify_token(token):
    """Return the payload if the token is validly signed and unexpired, else None."""
    try:
        payload_b64, sig = token.split('.', 1)
        expected = _b64u_encode(hmac.new(SESSION_SECRET_BYTES, payload_b64.encode('ascii'), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected):
            return None
        payload = json.loads(_b64u_decode(payload_b64))
        if int(payload.get('exp', 0)) < int(time.time()):
            return None
        return payload
    except Exception:
        return None

# --- Password hashing -----------------------------------------------------
# Preferred: scrypt ("scrypt$<salt>$<hash>").
# Fallback:  PBKDF2-SHA256 ("pbkdf2$<salt>$<hash>") for environments where
#            OpenSSL was compiled without scrypt support (e.g. macOS system Python 3.9).
# Legacy:    plaintext fallback for pre-hashed accounts — constant-time compare.
_SCRYPT = dict(n=16384, r=8, p=1, dklen=32)
_SCRYPT_AVAILABLE = hasattr(hashlib, 'scrypt')
_PBKDF2_ITERS = 260000  # OWASP 2023 minimum for PBKDF2-SHA256

def hash_password(plaintext):
    plaintext = plaintext or ''
    salt = secrets.token_bytes(16)
    if _SCRYPT_AVAILABLE:
        dk = hashlib.scrypt(plaintext.encode('utf-8'), salt=salt, **_SCRYPT)
        return f"scrypt${base64.b64encode(salt).decode()}${base64.b64encode(dk).decode()}"
    else:
        dk = hashlib.pbkdf2_hmac('sha256', plaintext.encode('utf-8'), salt, _PBKDF2_ITERS)
        return f"pbkdf2${base64.b64encode(salt).decode()}${base64.b64encode(dk).decode()}"

def valid_password(password):
    return isinstance(password, str) and len(password) >= 8 and len(password) <= 256

def verify_password(plaintext, user):
    stored = user.get('password') if isinstance(user, dict) else user
    if not isinstance(stored, str) or plaintext is None:
        return False
    plaintext_bytes = plaintext.encode('utf-8')
    if stored.startswith('scrypt$'):
        if not _SCRYPT_AVAILABLE:
            return False  # Can't verify scrypt hash without scrypt support
        try:
            _, salt_b64, dk_b64 = stored.split('$')
            salt = base64.b64decode(salt_b64)
            expected = base64.b64decode(dk_b64)
            dk = hashlib.scrypt(plaintext_bytes, salt=salt, **_SCRYPT)
            return hmac.compare_digest(dk, expected)
        except Exception:
            return False
    if stored.startswith('pbkdf2$'):
        try:
            _, salt_b64, dk_b64 = stored.split('$')
            salt = base64.b64decode(salt_b64)
            expected = base64.b64decode(dk_b64)
            dk = hashlib.pbkdf2_hmac('sha256', plaintext_bytes, salt, _PBKDF2_ITERS)
            return hmac.compare_digest(dk, expected)
        except Exception:
            return False
    # Legacy plaintext (pre-migration) — constant-time compare.
    return hmac.compare_digest(stored, plaintext)

def _public_user(user):
    """A copy of a user record safe to return to clients — never includes the password."""
    if not isinstance(user, dict):
        return user
    return {k: v for k, v in user.items() if k != 'password'}

def _safe_join(base, untrusted_rel):
    """Join base + a client-supplied relative path, returning the absolute path
    only if it stays inside base. Returns None on any traversal attempt
    (e.g. '../../etc/passwd'). Defends against path traversal in file serving."""
    base_real = os.path.realpath(base)
    target = os.path.realpath(os.path.join(base_real, untrusted_rel))
    if target == base_real or target.startswith(base_real + os.sep):
        return target
    return None

# --- School (tenant) helpers ----------------------------------------------
import string as _string

def _gen_school_code(data):
    """A short, human-shareable, collision-free code (e.g. 'K7Q4ZB')."""
    existing = {s.get('schoolCode') for s in data.get('schools', {}).values()}
    alphabet = _string.ascii_uppercase + _string.digits
    for _ in range(200):
        code = ''.join(secrets.choice(alphabet) for _ in range(6))
        if code not in existing:
            return code
    return secrets.token_hex(4).upper()

def _gen_school_id(data):
    schools = data.get('schools', {})
    for _ in range(200):
        sid = secrets.token_hex(8)
        if sid not in schools:
            return sid
    return secrets.token_hex(12)

def new_school_config(name, code):
    """Fresh per-school config for a newly registered institution."""
    return {
        "schoolName": name,
        "schoolCode": code,
        "schoolInfo": {"schoolName": name, "academicYear": "", "term": "TERM 1", "termFee": 0},
        "feeConfig": dict(DEFAULT_DATA.get("feeConfig", {})),
        "settings": {},
        "currency": "GH₵",
        "allClasses": list(DEFAULT_CLASSES),
        "departments": {},
        "feedingConfig": {},
        "reportTemplates": [],
        "attendance": {},
        "retentionPolicy": {"recycleDays": 30},
        "syncState": {"revision": 0},
        "branding": {
            "primaryColor": "#6366f1",
            "accentColor": "#10b981",
            "customDomain": "",
            "metaTitle": name,
            "metaDescription": f"Official Educational Resource Planning (ERP) for {name}.",
            "faviconUrl": ""
        }
    }

def find_school_by_domain(data, host):
    """
    Adapter to resolve school context via Host/Origin for white-labeling.
    Returns (school_id, branding_data) if matched, else (None, None).
    """
    host = (host or '').lower().strip().split(':')[0]
    if not host or host in ('localhost', '127.0.0.1'):
        return None, None
        
    for sid, cfg in data.get('schools', {}).items():
        branding = cfg.get('branding', {})
        if branding.get('customDomain') == host:
            return sid, branding
    return None, None

# --- BRANDING UTILITIES (/modules/branding equivalent) ---

def get_branding(data, sid):
    """Deep fetch of branding settings for a tenant."""
    cfg = data.get('schools', {}).get(sid, {})
    # Merge basic school info with branding config
    brand = dict(cfg.get('branding', {}))
    brand['schoolName'] = cfg.get('schoolName') or cfg.get('schoolInfo', {}).get('schoolName')
    brand['logoUrl'] = cfg.get('settings', {}).get('logoUrl')
    return brand

def update_branding(data, sid, updates):
    """Update branding settings for a tenant."""
    cfg = data.setdefault('schools', {}).setdefault(sid, {})
    brand = cfg.setdefault('branding', {})
    brand.update(updates)
    # Mirror schoolName if changed
    if 'schoolName' in updates:
        cfg['schoolName'] = updates['schoolName']
        cfg.setdefault('schoolInfo', {})['schoolName'] = updates['schoolName']
    return brand

def reset_branding(data, sid):
    """Restore default branding for a tenant."""
    name = data.get('schools', {}).get(sid, {}).get('schoolName', 'School ERP')
    default_brand = {
        "primaryColor": "#6366f1",
        "accentColor": "#10b981",
        "customDomain": "",
        "metaTitle": name,
        "metaDescription": f"Official Educational Resource Planning (ERP) for {name}.",
        "faviconUrl": ""
    }
    data['schools'][sid]['branding'] = default_brand
    return default_brand

def find_school_by_code(data, code):
    """Return (school_id, config) for a school code, or (None, None)."""
    code = (code or '').strip().upper()
    if not code:
        return None, None
    for sid, cfg in data.get('schools', {}).items():
        if (cfg.get('schoolCode') or '').upper() == code:
            return sid, cfg
    return None, None

def migrate_schools(data):
    """Idempotently convert flat single-tenant data into the schoolId model:
    move flat config into data['schools']['default'] and tag every existing
    record + user with schoolId='default'. Returns True if it changed data."""
    if data.get('schools'):
        return False
    code = _gen_school_code(data)
    default_cfg = {
        "schoolName": (data.get('schoolInfo') or {}).get('schoolName', 'Default School'),
        "schoolCode": code,
    }
    for key in SCHOOL_CONFIG_KEYS:
        if key in data:
            default_cfg[key] = data.pop(key)  # move flat config under the school
    default_cfg.setdefault('schoolInfo', {"schoolName": default_cfg["schoolName"]})
    data['schools'] = {'default': default_cfg}
    # Tag existing records and users with the default school.
    for key in RECORD_COLLECTIONS:
        if isinstance(data.get(key), list):
            for item in data[key]:
                if isinstance(item, dict):
                    item.setdefault('schoolId', 'default')
    for u in data.get('users', []):
        if isinstance(u, dict):
            u.setdefault('schoolId', 'default')
    print(f"MIGRATION: created 'default' school (code {code}); tagged existing records/users with schoolId and UUIDs.")
    return True

def calculate_staff_performance(data, staff_member, sid):
    """
    Computes advanced weighted performance scores.
    Teaching Staff: Attendance(15%), Stud-Att(10%), LessonNotes(10%), Exams(10%), 
                    Reports(10%), Academic(20%), Admin-Eval(25%).
    Non-Teaching: Attendance(30%), Tasks(30%), Admin-Eval(40%).
    """
    staff_id = staff_member.get('id')
    role = (staff_member.get('role') or 'TEACHER').upper()
    is_teaching = any(x in role for x in ['TEACHER', 'HEAD', 'INSTRUCTOR', 'MASTER'])
    assigned_class = (staff_member.get('assignedClass') or '').upper().replace(' ', '')
    staff_subjects_str = staff_member.get('subject') or ''
    staff_subjects = [s.strip().upper() for s in staff_subjects_str.split(',') if s.strip()]
    
    # 1. Staff Attendance & Punctuality
    att_records = data.get('staffAttendance', [])
    staff_att = [r for r in att_records if r.get('staffId') == staff_id and r.get('schoolId') == sid]
    att_score = 100
    if staff_att:
        present_recs = [r for r in staff_att if r.get('status') == 'present']
        if present_recs:
            ratio = (len(present_recs) / len(staff_att)) * 100
            late_recs = [r for r in staff_att if r.get('status') == 'late']
            punctuality = (1 - (len(late_recs) / len(staff_att))) * 100
            att_score = (ratio * 0.6) + (punctuality * 0.4)
        else:
            att_score = 0

    # 2. Admin Evaluation (Confidential)
    # Professionalism, Management, Ethics, Communication, Leadership (5 metrics)
    manual = data.get('manualStaffRatings', {}).get(sid, {}).get(staff_id, {})
    admin_eval = manual.get('adminRating', 80) # Default to 80 if not set

    if is_teaching:
        # 3. Lesson Notes (10%)
        notes = [n for n in data.get('lessonNotes', []) if n.get('staffId') == staff_id and n.get('schoolId') == sid]
        note_score = (len([n for n in notes if n.get('approvalStatus') == 'approved']) / len(notes) * 100) if notes else 80

        # 4. Question Submissions (10%)
        questions = [q for q in data.get('staffQuestions', []) if q.get('staffId') == staff_id and q.get('schoolId') == sid]
        q_score = (len([q for q in questions if q.get('approvalStatus') == 'approved']) / len(questions) * 100) if questions else 80

        # 5. Report Submission (10%) - Based on assigned class
        reports = [r for r in data.get('reports', []) if r.get('schoolId') == sid]
        students = [s for s in data.get('students', []) if s.get('schoolId') == sid]
        class_students = [s for s in students if (s.get('class') or '').upper().replace(' ', '') == assigned_class]
        report_score = 100
        if class_students:
            target_reps = [r for r in reports if (r.get('studentClass') or '').upper().replace(' ', '') == assigned_class]
            students_with_reps = len({r.get('studentId') for r in target_reps})
            report_score = (students_with_reps / len(class_students)) * 100

        # 6. Student Attendance (10%)
        cfg = data.get('schools', {}).get(sid, {})
        stud_att = cfg.get('attendance', {})
        total_p = 0
        total_d = 0
        for day, day_data in stud_att.items():
            if not isinstance(day_data, dict):
                continue
            recs = day_data.get('records', day_data)
            if not isinstance(recs, dict):
                continue
            ids = [s.get('sid') for s in class_students]
            for s_id, status in recs.items():
                if s_id in ids:
                    total_d += 1
                    if status == 'present': total_p += 1
        student_att_score = (total_p / total_d * 100) if total_d > 0 else 85

        # 7. Student Academic Perf (20%) - Subject based tracking for floating teachers
        total_val = 0
        score_count = 0
        for r in reports:
            is_rel_class = (r.get('studentClass') or '').upper().replace(' ', '') == assigned_class
            scores = r.get('scores', {})
            for subj, vals in scores.items():
                is_rel_subj = subj.upper() in staff_subjects or not staff_subjects
                if is_rel_subj and (is_rel_class or staff_subjects):
                    val = vals.get('combinedScore') or vals.get('examScore') or vals.get('classScore')
                    if val and str(val).isdigit():
                        total_val += int(val)
                        score_count += 1
        academic_score = (total_val / score_count) if score_count > 0 else 75

        final_score = (
            (att_score * 0.15) + 
            (student_att_score * 0.10) + 
            (note_score * 0.10) + 
            (q_score * 0.10) + 
            (report_score * 0.10) + 
            (academic_score * 0.20) + 
            (admin_eval * 0.25)
        )
    else:
        # Non-teaching metrics
        tasks = [t for t in data.get('staffTasks', []) if t.get('staffId') == staff_id and t.get('schoolId') == sid]
        task_score = (len([t for t in tasks if t.get('status') == 'completed']) / len(tasks) * 100) if tasks else 90
        
        final_score = (
            (att_score * 0.30) +
            (task_score * 0.30) +
            (admin_eval * 0.40)
        )

    # Disciplinary adjustment
    disc = [d for d in data.get('staffDisciplinary', []) if d.get('staffId') == staff_id and d.get('schoolId') == sid]
    final_score = max(0, final_score - (len(disc) * 5))

    rating = "Poor Performance"
    if final_score >= 90: rating = "Excellent"
    elif final_score >= 80: rating = "Very Good"
    elif final_score >= 70: rating = "Good"
    elif final_score >= 60: rating = "Needs Improvement"

    insights = []
    if att_score < 80: insights.append("Punctuality requires immediate attention.")
    if is_teaching and academic_score < 70: insights.append("Coordinate subject-specific improvement plans for students.")
    if len(disc) > 0: insights.append(f"Contains {len(disc)} active disciplinary records.")
    if not insights: insights.append("Exceeding standard professional benchmarks.")

    return {
        "staffId": staff_id,
        "staffName": staff_member.get('name'),
        "role": role,
        "schoolId": sid,
        "attendanceScore": round(att_score, 1),
        "adminRating": round(admin_eval, 1),
        "finalScore": round(final_score, 1),
        "rating": rating,
        "aiInsights": " | ".join(insights),
        "lastUpdated": time.strftime('%Y-%m-%d %H:%M:%S')
    }

def update_all_staff_performance(data, sid):
    """Recalculate performance for all staff in a school."""
    staff_list = [s for s in data.get('staff', []) if s.get('schoolId') == sid]
    new_perf = []
    for s in staff_list:
        new_perf.append(calculate_staff_performance(data, s, sid))
    
    # Replace existing performance records for this school
    old_perf = data.get('staffPerformance', [])
    data['staffPerformance'] = [p for p in old_perf if p.get('schoolId') != sid] + new_perf
    
    # Append to history
    history = data.get('staffPerformanceHistory', [])
    for p in new_perf:
        history.append({**p, "timestamp": time.time()})
    data['staffPerformanceHistory'] = history[-1000:] # Keep last 1000 records

def build_school_view(data, sid, role, assigned_class, user_email=''):
    """Assemble the /api/data response for one school: record arrays filtered
    to `sid`, per-school config spread at top level, users scoped + stripped,
    then role/class filtering for non-admins."""
    cfg = data.get('schools', {}).get(sid, {})
    resp = {}
    for key in RECORD_COLLECTIONS:
        resp[key] = get_records_by_school(data, key, sid)
    
    # Users remain filtered manually for now as they are global but school-tagged
    resp['users'] = [_public_user(u) for u in data.get('users', []) if u.get('schoolId') == sid]
    for key in SCHOOL_CONFIG_KEYS:
        if key in cfg:
            resp[key] = cfg[key]
    resp['schoolId'] = sid
    resp['schoolName'] = cfg.get('schoolName')
    resp['schoolCode'] = cfg.get('schoolCode')

    role = (role or 'TEACHER').upper().strip()
    if role != 'ADMIN':
        for config_key in ('schoolInfo', 'settings', 'branding'):
            if isinstance(resp.get(config_key), dict):
                resp[config_key] = {
                    key: value for key, value in resp[config_key].items()
                    if not any(marker in key.lower() for marker in ('password', 'secret', 'token', 'apikey', 'api_key', 'credential'))
                }
        # Credentials, private staff processes, audit data and deletion history
        # are never part of a non-admin aggregate response.
        for key in ('users', 'deleted', 'activity_log', 'auditEvents', 'invitations',
                    'syncReceipts', 'staffPerformanceHistory', 'staffDisciplinary',
                    'staffAwards'):
            resp[key] = []
    if role == 'ACCOUNTANT':
        for key in ('staff', 'staffAttendance', 'staffPerformance', 'lessonNotes',
                    'staffQuestions', 'staffTasks', 'staffEnquiries', 'reports',
                    'studentReports', 'reportVersions'):
            resp[key] = []
    elif role == 'TRANSPORT_MANAGER':
        for key in ('payments', 'expenditures', 'recurringExpenseRules', 'reports',
                    'studentReports', 'reportVersions', 'payrollApprovals', 'staff', 'staffAttendance',
                    'staffPerformance', 'lessonNotes', 'staffQuestions', 'staffTasks',
                    'staffEnquiries'):
            resp[key] = []
    elif role not in ('ADMIN', 'HEAD TEACHER'):
        ac = assigned_class.replace(' ', '') if assigned_class else ''
        if ac:
            resp['students'] = [s for s in resp['students'] if (s.get('class') or '').upper().replace(' ', '') == ac]
        else:
            resp['students'] = []
        class_ids = {s.get('sid') for s in resp['students'] if s.get('sid')}
        resp['payments'] = []
        resp['reports'] = [r for r in resp['reports'] if (r.get('studentClass') or '').upper().replace(' ', '') == ac] if ac else []
        resp['studentReports'] = [r for r in resp['studentReports'] if _normal_class(r.get('studentClass') or r.get('class')) == ac] if ac else []
        resp['reportVersions'] = []
        resp['staff'] = []
        email = (user_email or '').lower().strip()
        for key in ('staffAttendance', 'lessonNotes', 'staffQuestions', 'staffTasks', 'staffEnquiries'):
            resp[key] = [item for item in resp[key] if _record_owner(item) == email]
        resp['staffPerformance'] = []
    if role not in ('ADMIN', 'ACCOUNTANT', 'TRANSPORT_MANAGER'):
        for key in ('payments', 'expenditures', 'recurringExpenseRules', 'payrollApprovals',
                    'transportRoutes', 'buses', 'drivers', 'studentTransport',
                    'transportInvoices', 'transportMaintenance'):
            resp[key] = []
    return resp

class APIHandler(BaseHTTPRequestHandler):
    def check_host(self):
        host = (self.headers.get('Host') or '').split(':', 1)[0].lower().strip()
        allowed = {domain.lower().strip() for domain in ALLOWED_DOMAINS if domain.strip()}
        if '*' in allowed or host in allowed:
            return True
        self.send_json(421, {'error': 'Host is not allowed'})
        return False

    def end_headers(self):
        origin = self.headers.get('Origin')
        if origin in ALLOWED_ORIGINS:
            self.send_header('Access-Control-Allow-Origin', origin)
        elif '*' in ALLOWED_ORIGINS:
            self.send_header('Access-Control-Allow-Origin', '*')
        
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Tenant-ID, X-Request-ID, X-Sync-ID')
        if self.path.startswith('/api/') and self.headers.get('Authorization', '').startswith('Bearer '):
            self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Content-Security-Policy', "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https:;")
        super().end_headers()

    def do_OPTIONS(self):
        if not self.check_host(): return
        self.send_response(200)
        self.end_headers()

    def enforce_rate_limit(self, action, subject='', limit=10, window_seconds=300):
        client_ip = self.client_address[0] if self.client_address else 'unknown'
        key = f'{action}:{client_ip}:{str(subject).lower().strip()}'
        if allow_rate_limited_action(key, limit, window_seconds):
            return True
        self.send_json(429, {'error': 'Too many requests. Please try again later.'})
        return False

    def _authed_payload(self):
        """Full payload from a validly-signed token, or None. Cached per request."""
        if not hasattr(self, '_auth_payload_cache'):
            auth_header = self.headers.get('Authorization', '')
            token = auth_header[7:].strip() if auth_header.startswith('Bearer ') else ''
            self._auth_payload_cache = verify_token(token) if token else None
        return self._auth_payload_cache

    def _authed_email(self):
        payload = self._authed_payload()
        return (payload.get('email') or '').lower().strip() if payload else None

    def _authed_uuid(self):
        payload = self._authed_payload()
        return payload.get('uuid') if payload else None

    def check_auth(self):
        user = self._authed_user(load_data()) if self._authed_payload() else None
        if (user and user.get('status', 'active') == 'active'
                and user.get('password_recovery_requested') is not True):
            return True
        self.send_json(401, {"error": "Unauthorized"})
        return False

    def send_json(self, status, payload, sid=None, revision=None):
        body = payload
        if sid is not None and isinstance(payload, dict):
            body = dict(payload)
            tenant_revision = revision if revision is not None else int(
                load_data().get('schools', {}).get(sid, {}).get('syncState', {}).get('revision', 0) or 0
            )
            server_time = _iso_now()
            body['tenantRevision'] = tenant_revision
            body['serverTime'] = server_time
            body['_meta'] = {'tenantRevision': tenant_revision, 'serverTime': server_time}
        encoded = json.dumps(body, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def read_json(self, body):
        try:
            value = json.loads(body) if body else {}
            return sanitize_input(value)
        except (TypeError, ValueError, json.JSONDecodeError):
            return {}

    def require_roles(self, data, *roles):
        if self.get_request_role(data) in roles:
            return True
        self.send_json(403, {'error': 'Forbidden: insufficient role'})
        return False

    def sync_id(self):
        return self.headers.get('X-Request-ID') or self.headers.get('X-Sync-ID')

    def _authed_user(self, data):
        payload = self._authed_payload()
        if not payload:
            return None
        email = payload.get('email', '').lower().strip()
        uid = payload.get('uuid')
        user = next((u for u in data.get('users', []) if u.get('email', '').lower().strip() == email), None)
        # Strict UUID match if present in both
        if user and uid and user.get('uuid') != uid:
            log_event('CRITICAL', 'UUID_MISMATCH', {"email": email, "expected": user.get('uuid'), "got": uid})
            return None
        if user and int(payload.get('av', 0) or 0) != int(user.get('authVersion', 0) or 0):
            return None
        return user

    def get_request_role(self, data):
        # Role comes ONLY from the server-side user record for the authenticated
        # token — client headers are not trusted.
        user = self._authed_user(data)
        return (user.get('role', 'TEACHER') if user else 'TEACHER').upper().strip()

    def get_assigned_class(self, data):
        # Assigned class also comes from the server-side record, not a header,
        # so a teacher cannot read another class by spoofing X-Assigned-Class.
        user = self._authed_user(data)
        return (user.get('assignedClass', '') if user else '').upper().strip()

    def _authed_school_id(self, data):
        # The tenant a request operates on — derived from the authenticated
        # user's server-side record, never from the token or a client header.
        user = self._authed_user(data)
        return (user.get('schoolId', 'default') if user else 'default')

    def do_GET(self):
        if not self.check_host(): return
        path = urlparse(self.path).path
        query = urllib.parse.parse_qs(urlparse(self.path).query)

        if path in ('/api/audit', '/api/audit-events'):
            if not self.check_auth(): return
            data = load_data()
            if not self.require_roles(data, 'ADMIN'): return
            sid = self._authed_school_id(data)
            events = [e for e in data.get('auditEvents', []) if e.get('schoolId') == sid]
            filters = {'action': 'action', 'actor': 'actor', 'collection': 'collection', 'targetId': 'targetId'}
            for param, field in filters.items():
                if query.get(param):
                    expected = query[param][0].lower()
                    events = [e for e in events if str(e.get(field, '')).lower() == expected]
            if query.get('from'):
                events = [e for e in events if e.get('createdAt', '') >= query['from'][0]]
            if query.get('to'):
                events = [e for e in events if e.get('createdAt', '') <= query['to'][0]]
            self.send_json(200, {'items': list(reversed(events)), 'count': len(events)}, sid)
            return

        if path == '/api/auth/check':
            if not self.check_auth(): return
            data = load_data(); sid = self._authed_school_id(data)
            school_info = data.get('schools', {}).get(sid, {}).get('schoolInfo', {})
            sms_enabled = bool((os.environ.get('AT_API_KEY') or school_info.get('atApiKey'))
                               and (os.environ.get('AT_USERNAME') or school_info.get('atUsername')))
            self.send_json(200, {'success': True, 'smsEnabled': sms_enabled}, sid); return

        if path == '/api/payroll/approval':
            if not self.check_auth(): return
            data = load_data()
            if not self.require_roles(data, 'ADMIN', 'ACCOUNTANT'): return
            sid = self._authed_school_id(data); period = (query.get('period') or [date.today().strftime('%Y-%m')])[0]
            item = next((entry for entry in data.get('payrollApprovals', [])
                         if entry.get('schoolId') == sid and entry.get('period') == period), None)
            self.send_json(200, {'item': item or {'period': period, 'status': 'draft'}}, sid); return

        versions_match = re.fullmatch(r'/api/reports/([^/]+)/versions', path)
        if versions_match:
            if not self.check_auth(): return
            data = load_data(); sid = self._authed_school_id(data)
            report_id = urllib.parse.unquote(versions_match.group(1))
            report = next((r for r in data.get('reports', [])
                           if r.get('schoolId') == sid and str(r.get('id')) == report_id), None)
            if not report:
                self.send_json(404, {'error': 'Report not found'}); return
            if not _can_access_report(data, self._authed_user(data), report):
                self.send_json(403, {'error': 'Forbidden: report class is not assigned to this user'}); return
            items = [v for v in data.get('reportVersions', [])
                     if v.get('schoolId') == sid and str(v.get('reportId')) == report_id]
            self.send_json(200, {'items': items, 'count': len(items)}, sid)
            return

        if path == '/api/recurring-expense-rules':
            if not self.check_auth(): return
            data = load_data()
            if not self.require_roles(data, 'ADMIN', 'ACCOUNTANT'): return
            sid = self._authed_school_id(data)
            items = [r for r in data.get('recurringExpenseRules', []) if r.get('schoolId') == sid]
            self.send_json(200, {'items': items}, sid)
            return

        if path == '/api/invitations':
            if not self.check_auth(): return
            data = load_data()
            if not self.require_roles(data, 'ADMIN'): return
            sid = self._authed_school_id(data)
            items = [{k: v for k, v in i.items() if k != 'tokenHash'} for i in data.get('invitations', []) if i.get('schoolId') == sid]
            self.send_json(200, {'items': items}, sid)
            return

        transport_get = {'/api/transport/invoices': 'transportInvoices',
                         '/api/transport/maintenance': 'transportMaintenance'}
        if path in transport_get:
            if not self.check_auth(): return
            data = load_data()
            if not self.require_roles(data, 'ADMIN', 'TRANSPORT_MANAGER'): return
            sid = self._authed_school_id(data)
            items = [i for i in data.get(transport_get[path], []) if i.get('schoolId') == sid]
            self.send_json(200, {'items': items}, sid)
            return

        if path == '/api/recycle':
            if not self.check_auth(): return
            data = load_data()
            if not self.require_roles(data, 'ADMIN'): return
            sid = self._authed_school_id(data)
            items = [i for i in data.get('deleted', []) if i.get('schoolId') == sid]
            self.send_json(200, {'items': items}, sid)
            return
        
        # API Route — full dataset, scoped to the caller's school.
        if path == '/api/data':
            if not self.check_auth(): return
            data = load_data()
            sid = self._authed_school_id(data)
            role = self.get_request_role(data)
            assigned_class = self.get_assigned_class(data)
            resp = build_school_view(data, sid, role, assigned_class, self._authed_email())

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(resp).encode('utf-8'))
            return

        # Get reports for a specific student by their ID or SID
        elif path.startswith('/api/student-report/'):
            if not self.check_auth(): return
            student_id = path.split('/')[-1]
            data = load_data()
            sid = self._authed_school_id(data)
            # Match by studentId, studentSid, or legacy id field — within this school only.
            matched = [
                r for r in data.get('reports', [])
                if r.get('schoolId') == sid
                and (str(r.get('studentId', '')) == student_id or
                    str(r.get('studentSid', '')) == student_id or
                    str(r.get('id', '')) == student_id)
                and (r.get('type') == 'manual' or r.get('type') is None)
            ]
            user = self._authed_user(data); all_matched = matched
            if self.get_request_role(data) == 'ACCOUNTANT':
                self.send_json(403, {'error': 'Forbidden: reports are not available to accountants'}); return
            matched = [r for r in matched if _can_access_report(data, user, r)]
            if all_matched and not matched:
                self.send_json(403, {'error': 'Forbidden: report class is not assigned to this user'}); return
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(matched).encode('utf-8'))
            return

        elif path == '/api/public/branding':
            data = load_data()
            host = self.headers.get('Host', '')
            sid, brand = find_school_by_domain(data, host)
            
            # Fallback to code query param if domain not matched
            if not sid:
                query = urllib.parse.parse_qs(urlparse(self.path).query)
                code = query.get('code', [None])[0]
                sid, _ = find_school_by_code(data, code)
                if sid:
                    brand = get_branding(data, sid)
            
            if sid and brand:
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(brand).encode('utf-8'))
                return
            else:
                self.send_response(404); self.end_headers(); return

        elif path == '/api/payments':
            if not self.check_auth(): return
            data = load_data()
            if not self.require_roles(data, 'ADMIN', 'ACCOUNTANT'): return
            sid = self._authed_school_id(data)
            role = self.get_request_role(data)
            payments = [p for p in data.get('payments', []) if p.get('schoolId') == sid]
            if role not in ['ADMIN', 'ACCOUNTANT']:
                assigned_class = self.get_assigned_class(data)
                if assigned_class:
                    class_student_ids = {
                        s.get('sid') for s in data.get('students', [])
                        if s.get('schoolId') == sid
                        and (s.get('class') or '').upper().replace(' ', '') == assigned_class.replace(' ', '')
                    }
                    payments = [p for p in payments if p.get('studentSid') in class_student_ids]
                else:
                    payments = []

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(payments).encode('utf-8'))
            return

        elif path == '/api/staff-performance':
            if not self.check_auth(): return
            data = load_data()
            sid = self._authed_school_id(data)
            role = self.get_request_role(data)
            if role not in ('ADMIN', 'HEAD TEACHER', 'TEACHER'):
                self.send_json(403, {'error': 'Forbidden: performance access denied'}); return
            
            perf = [p for p in data.get('staffPerformance', []) if p.get('schoolId') == sid]
            
            if role == 'TEACHER':
                email = self._authed_email()
                staff = next((s for s in data.get('staff', []) if s.get('email', '').lower() == email), None)
                if staff:
                    perf = [p for p in perf if p.get('staffId') == staff.get('id')]
                else:
                    perf = []
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(perf).encode('utf-8'))
            return

        elif path == '/api/staff-performance/recalculate':
            self.send_json(405, {'error': 'Use POST for performance recalculation'}); return

        elif path == '/api/staff-performance/rate':
            self.send_json(405, {'error': 'Use POST to rate staff'}); return

        elif path == '/api/transport/routes':
            if not self.check_auth(): return
            data = load_data()
            if not self.require_roles(data, 'ADMIN', 'TRANSPORT_MANAGER'): return
            sid = self._authed_school_id(data)
            routes = [r for r in data.get('transportRoutes', []) if r.get('schoolId') == sid]
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(routes).encode('utf-8'))
            return

        elif path == '/api/transport/buses':
            if not self.check_auth(): return
            data = load_data()
            if not self.require_roles(data, 'ADMIN', 'TRANSPORT_MANAGER'): return
            sid = self._authed_school_id(data)
            buses = [b for b in data.get('buses', []) if b.get('schoolId') == sid]
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(buses).encode('utf-8'))
            return

        elif path == '/api/students':
            if not self.check_auth(): return
            data = load_data()
            sid = self._authed_school_id(data)
            role = self.get_request_role(data)
            students = [s for s in data.get('students', []) if s.get('schoolId') == sid]
            if role not in ['ADMIN', 'ACCOUNTANT']:
                assigned_class = self.get_assigned_class(data)
                if assigned_class:
                    students = [
                        s for s in students
                        if (s.get('class') or '').upper().replace(' ', '') == assigned_class.replace(' ', '')
                    ]
                else:
                    students = []

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(students).encode('utf-8'))
            return

        # Per-school config reads (ported from Flask).
        elif path == '/api/report-templates':
            if not self.check_auth(): return
            data = load_data()
            cfg = data.get('schools', {}).get(self._authed_school_id(data), {})
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(cfg.get('reportTemplates', [])).encode('utf-8'))
            return

        elif path == '/api/departments':
            if not self.check_auth(): return
            data = load_data()
            cfg = data.get('schools', {}).get(self._authed_school_id(data), {})
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(cfg.get('departments', {})).encode('utf-8'))
            return

        elif path == '/api/expenditure':
            if not self.check_auth(): return
            data = load_data()
            if not self.require_roles(data, 'ADMIN', 'ACCOUNTANT'): return
            sid = self._authed_school_id(data)
            items = [e for e in data.get('expenditures', []) if e.get('schoolId') == sid]
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(items).encode('utf-8'))
            return

        elif path == '/api/activity-log':
            if not self.check_auth(): return
            data = load_data()
            sid = self._authed_school_id(data)
            log = [a for a in data.get('activity_log', []) if a.get('schoolId') == sid]
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(list(reversed(log[-200:]))).encode('utf-8'))
            return

        elif path == '/api/auth/verify':
            if not self.check_auth(): return
            data = load_data()
            user = self._authed_user(data)
            if not user:
                # Token is validly signed but no longer maps to a real account
                # (e.g. the user was deleted). Do NOT fall back to users[0].
                self.send_response(401)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Unauthorized"}).encode('utf-8'))
                return
            sid = self._authed_school_id(data)
            cfg = data.get('schools', {}).get(sid, {})
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                "success": True, 
                "user": _public_user(user),
                "schoolInfo": cfg.get('schoolInfo', {}),
                "branding": cfg.get('branding', {})
            }).encode('utf-8'))
            return

        # Static Files (Frontend)
        file_path = path.lstrip('/')

        if file_path.startswith('uploads/'):
            full_path = _safe_join(UPLOADS_DIR, file_path[len('uploads/'):])
            if full_path and os.path.isfile(full_path):
                self.send_response(200)
                mime_type, _ = mimetypes.guess_type(full_path)
                self.send_header('Content-Type', mime_type or 'application/octet-stream')
                self.end_headers()
                with open(full_path, 'rb') as f:
                    self.wfile.write(f.read())
                return
            else:
                self.send_response(404)
                self.end_headers()
                return

        if not file_path: file_path = 'index.html'

        full_path = _safe_join(DIST_DIR, file_path)

        # SPA Routing: if the path escapes DIST_DIR or the file doesn't exist,
        # serve index.html.
        if not full_path or not os.path.isfile(full_path):
            full_path = os.path.join(DIST_DIR, 'index.html')

        if os.path.isfile(full_path):
            self.send_response(200)
            mime_type, _ = mimetypes.guess_type(full_path)
            self.send_header('Content-Type', mime_type or 'application/octet-stream')
            self.end_headers()
            with open(full_path, 'rb') as f:
                self.wfile.write(f.read())
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if not self.check_host(): return
        path = urlparse(self.path).path
        try:
            content_length = int(self.headers.get('Content-Length', 0) or 0)
        except (TypeError, ValueError):
            self.send_response(400)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Invalid Content-Length"}).encode('utf-8'))
            return
        if content_length < 0 or content_length > MAX_REQUEST_BYTES:
            self.send_response(413)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Payload too large"}).encode('utf-8'))
            return
        body = self.rfile.read(content_length) if content_length > 0 else b''

        def get_json():
            try:
                raw = json.loads(body) if body else {}
                return sanitize_input(raw)
            except:
                return {}

        if path in ('/api/staff-performance/recalculate', '/api/staff-performance/rate'):
            if not self.check_auth(): return
            result = {}
            request = get_json()
            with mutate_data() as data:
                if not self.require_roles(data, 'ADMIN', 'HEAD TEACHER'): raise SkipSave
                sid = self._authed_school_id(data)
                if path.endswith('/rate'):
                    staff_id = request.get('staffId')
                    ratings = request.get('ratings', {})
                    if not staff_id or not isinstance(ratings, dict):
                        self.send_json(400, {'error': 'staffId and ratings are required'}); raise SkipSave
                    staff = next((item for item in data.get('staff', [])
                                  if item.get('schoolId') == sid and str(item.get('id')) == str(staff_id)), None)
                    if not staff:
                        self.send_json(404, {'error': 'Staff member not found'}); raise SkipSave
                    data.setdefault('manualStaffRatings', {}).setdefault(sid, {})[str(staff_id)] = ratings
                update_all_staff_performance(data, sid)
                revision = bump_revision(data, sid)
                result = {'items': [item for item in data.get('staffPerformance', []) if item.get('schoolId') == sid],
                          'sid': sid, 'revision': revision}
            if not result: return
            self.send_json(200, {'success': True, 'items': result['items']}, result['sid'], result['revision']); return

        if path == '/api/payroll/approval':
            if not self.check_auth(): return
            request = get_json(); action = request.get('action'); result = {}
            transitions = {'submit': ('submitted', {'draft', 'reopened'}),
                           'approve': ('approved', {'submitted'}),
                           'reopen': ('reopened', {'submitted', 'approved'})}
            if action not in transitions:
                self.send_json(400, {'error': 'Invalid payroll action'}); return
            with mutate_data() as data:
                if not self.require_roles(data, 'ADMIN', 'ACCOUNTANT'): raise SkipSave
                role = self.get_request_role(data)
                if action in ('approve', 'reopen') and role != 'ADMIN':
                    self.send_json(403, {'error': 'Only administrators can approve or reopen payroll'}); raise SkipSave
                sid = self._authed_school_id(data); user = self._authed_user(data)
                period = request.get('period') or date.today().strftime('%Y-%m')
                collection = data.setdefault('payrollApprovals', [])
                item = next((entry for entry in collection if entry.get('schoolId') == sid and entry.get('period') == period), None)
                if not item:
                    item = {'id': str(uuid.uuid4()), 'schoolId': sid, 'period': period, 'status': 'draft'}; collection.append(item)
                desired, allowed = transitions[action]
                if item.get('status', 'draft') not in allowed:
                    self.send_json(409, {'error': 'Invalid payroll approval transition'}); raise SkipSave
                item.update({'status': desired, 'updatedAt': _iso_now(), 'updatedBy': user.get('email'),
                             'grossTotal': request.get('grossTotal'), 'netTotal': request.get('netTotal')})
                revision = bump_revision(data, sid); append_audit(data, sid, user, 'payroll.' + action, 'payrollApprovals', item['id'])
                result = {'item': item, 'sid': sid, 'revision': revision}
            if not result: return
            self.send_json(200, {'success': True, 'item': result['item']}, result['sid'], result['revision']); return

        # Invitation acceptance uses a one-time bearer secret, not a user session.
        if path == '/api/invitations/accept':
            bearer = self.headers.get('Authorization', '')
            raw_token = bearer[7:].strip() if bearer.startswith('Bearer ') else ''
            request = get_json()
            if not self.enforce_rate_limit('invitation-accept', limit=10, window_seconds=900): return
            if not raw_token or not valid_password(request.get('password')):
                self.send_json(400, {'error': 'Invitation token and a password of at least 8 characters are required'}); return
            token_hash = hashlib.sha256(raw_token.encode('utf-8')).hexdigest()
            response = {}
            with mutate_data() as data:
                invitation = next((i for i in data.get('invitations', [])
                                   if hmac.compare_digest(i.get('tokenHash', ''), token_hash)), None)
                if not invitation or invitation.get('status') != 'pending' or invitation.get('expiresAt', '') < _iso_now():
                    self.send_json(400, {'error': 'Invalid or expired invitation'}); raise SkipSave
                email = invitation.get('email', '').lower().strip()
                if any(u.get('email', '').lower().strip() == email for u in data.get('users', [])):
                    self.send_json(409, {'error': 'Email already exists'}); raise SkipSave
                user = {'uuid': str(uuid.uuid4()), 'email': email,
                        'name': request.get('name') or invitation.get('name') or email,
                        'password': hash_password(request['password']), 'role': invitation.get('role', 'TEACHER'),
                        'assignedClass': invitation.get('assignedClass', ''), 'status': 'active',
                        'schoolId': invitation['schoolId'], 'password_recovery_requested': False}
                data.setdefault('users', []).append(user)
                invitation['status'] = 'accepted'; invitation['acceptedAt'] = _iso_now()
                revision = bump_revision(data, invitation['schoolId'])
                append_audit(data, invitation['schoolId'], user, 'invitation.accept', 'invitations', invitation['id'])
                response = {'success': True, 'user': _public_user(user), 'sid': invitation['schoolId'], 'revision': revision}
            if not response: return
            self.send_json(200, {'success': True, 'user': response['user']}, response['sid'], response['revision']); return

        report_action = re.fullmatch(r'/api/reports/([^/]+)/(finalize|revise)', path)
        if report_action:
            if not self.check_auth(): return
            report_id, action = urllib.parse.unquote(report_action.group(1)), report_action.group(2)
            result = {}
            with mutate_data() as data:
                sid = self._authed_school_id(data); user = self._authed_user(data)
                if action == 'finalize' and self.get_request_role(data) not in ('ADMIN', 'HEAD TEACHER'):
                    self.send_json(403, {'error': 'Only administrators can finalize reports'}); raise SkipSave
                report = next((r for r in data.get('reports', []) if str(r.get('id')) == report_id and r.get('schoolId') == sid), None)
                if not report:
                    self.send_json(404, {'error': 'Report not found'}); raise SkipSave
                if not _can_access_report(data, user, report):
                    self.send_json(403, {'error': 'Forbidden: report class is not assigned to this user'}); raise SkipSave
                if action == 'finalize':
                    if report.get('status') == 'finalized':
                        self.send_json(409, {'error': 'Report is already finalized'}); raise SkipSave
                    report['status'] = 'finalized'; report['finalizedAt'] = _iso_now(); report['finalizedBy'] = user.get('email')
                else:
                    if report.get('status') != 'finalized':
                        self.send_json(409, {'error': 'Only finalized reports can be revised'}); raise SkipSave
                    revised = copy.deepcopy(report)
                    revised.update({'id': str(uuid.uuid4()), 'status': 'draft', 'revisedFrom': report_id,
                                    'createdAt': _iso_now(), 'updatedAt': _iso_now()})
                    for key in ('finalizedAt', 'finalizedBy'):
                        revised.pop(key, None)
                    data['reports'].append(revised); report = revised
                append_report_version(data, sid, report, action, user)
                revision = bump_revision(data, sid)
                append_audit(data, sid, user, 'report.' + action, 'reports', report['id'], {'sourceReportId': report_id})
                result = {'report': report, 'sid': sid, 'revision': revision}
            if not result: return
            self.send_json(200 if action == 'finalize' else 201, {'success': True, 'report': result['report']}, result['sid'], result['revision']); return

        workflow = re.fullmatch(r'/api/workflows/([^/]+)/([^/]+)/(submit|approve|reject)', path)
        if workflow:
            if not self.check_auth(): return
            collection, item_id, action = map(urllib.parse.unquote, workflow.groups())
            if collection not in STAFF_SELF_SERVICE_COLLECTIONS:
                self.send_json(400, {'error': 'Collection does not support workflows'}); return
            desired = {'submit': 'submitted', 'approve': 'approved', 'reject': 'rejected'}[action]
            allowed_from = {'submit': {'draft', 'rejected', None}, 'approve': {'submitted'}, 'reject': {'submitted'}}[action]
            result = {}
            with mutate_data() as data:
                sid = self._authed_school_id(data); user = self._authed_user(data); role = self.get_request_role(data)
                if action in ('approve', 'reject') and role not in ('ADMIN', 'HEAD TEACHER'):
                    self.send_json(403, {'error': 'Only administrators can review submissions'}); raise SkipSave
                if action == 'submit' and role not in ('ADMIN', 'HEAD TEACHER', 'TEACHER'):
                    self.send_json(403, {'error': 'This role cannot submit staff workflows'}); raise SkipSave
                item = next((i for i in data.get(collection, []) if str(i.get('id')) == item_id and i.get('schoolId') == sid), None)
                if not item:
                    self.send_json(404, {'error': 'Workflow item not found'}); raise SkipSave
                if item.get('approvalStatus') not in allowed_from:
                    self.send_json(409, {'error': 'Invalid workflow transition'}); raise SkipSave
                if action == 'submit' and role not in ('ADMIN', 'HEAD TEACHER'):
                    owner = _record_owner(item)
                    if not owner or owner != user.get('email', '').lower().strip():
                        self.send_json(403, {'error': 'Cannot submit another user\'s item'}); raise SkipSave
                item['approvalStatus'] = desired; item[action + 'At'] = _iso_now(); item[action + 'By'] = user.get('email')
                revision = bump_revision(data, sid); append_audit(data, sid, user, 'workflow.' + action, collection, item_id)
                result = {'item': item, 'sid': sid, 'revision': revision}
            if not result: return
            self.send_json(200, {'success': True, 'item': result['item']}, result['sid'], result['revision']); return

        expenditure_action = re.fullmatch(r'/api/expenditure/([^/]+)/(update|cancel|approval|attachments)', path)
        if expenditure_action:
            if not self.check_auth(): return
            expense_id, action = map(urllib.parse.unquote, expenditure_action.groups())
            request = get_json(); result = {}
            with mutate_data() as data:
                if not self.require_roles(data, 'ADMIN', 'ACCOUNTANT'): raise SkipSave
                sid = self._authed_school_id(data); user = self._authed_user(data)
                expense = next((e for e in data.get('expenditures', []) if str(e.get('id')) == expense_id and e.get('schoolId') == sid), None)
                if not expense: self.send_json(404, {'error': 'Expenditure not found'}); raise SkipSave
                if action == 'update':
                    if 'amount' in request:
                        amount = _valid_money(request.get('amount'))
                        if amount is None:
                            self.send_json(400, {'error': 'amount must be positive, finite and within bounds'}); raise SkipSave
                        request['amount'] = amount
                    for key in ('date', 'description', 'category', 'amount', 'approvedBy'):
                        if key in request: expense[key] = request[key]
                    expense['updatedAt'] = _iso_now(); expense['updatedBy'] = user.get('email')
                elif action == 'cancel':
                    expense.update({'status': 'cancelled', 'cancelReason': request.get('reason', ''), 'cancelledAt': _iso_now(), 'cancelledBy': user.get('email')})
                elif action == 'approval':
                    status = request.get('approvalStatus')
                    if status not in ('pending', 'approved', 'rejected'):
                        self.send_json(400, {'error': 'Invalid approval status'}); raise SkipSave
                    expense.update({'approvalStatus': status, 'approvalComment': request.get('comment', ''), 'reviewedAt': _iso_now(), 'reviewedBy': user.get('email')})
                else:
                    attachment = request.get('attachment') or request
                    expense.setdefault('attachments', []).append({**attachment, 'id': str(uuid.uuid4()), 'uploadedAt': _iso_now(), 'uploadedBy': user.get('email')})
                revision = bump_revision(data, sid); append_audit(data, sid, user, 'expenditure.' + action, 'expenditures', expense_id)
                result = {'expense': expense, 'sid': sid, 'revision': revision}
            if not result: return
            self.send_json(200, {'success': True, 'expenditure': result['expense']}, result['sid'], result['revision']); return

        if path == '/api/recurring-expense-rules':
            if not self.check_auth(): return
            rule = get_json(); result = {}
            if not rule.get('description') or not _parse_date(rule.get('startDate')) or rule.get('frequency', 'monthly') not in ('weekly', 'monthly', 'yearly'):
                self.send_json(400, {'error': 'description, valid startDate and frequency are required'}); return
            amount = _valid_money(rule.get('amount'))
            if amount is None: self.send_json(400, {'error': 'amount must be positive, finite and within bounds'}); return
            start = _parse_date(rule.get('startDate')); end = _parse_date(rule.get('endDate'))
            if rule.get('endDate') and not end:
                self.send_json(400, {'error': 'Invalid endDate'}); return
            if end and end < start:
                self.send_json(400, {'error': 'endDate cannot be before startDate'}); return
            with mutate_data() as data:
                if not self.require_roles(data, 'ADMIN', 'ACCOUNTANT'): raise SkipSave
                sid = self._authed_school_id(data); user = self._authed_user(data)
                rule.update({'id': rule.get('id') or str(uuid.uuid4()), 'schoolId': sid, 'amount': amount,
                             'frequency': rule.get('frequency', 'monthly'), 'active': rule.get('active', True), 'createdAt': _iso_now()})
                data.setdefault('recurringExpenseRules', []).append(rule)
                revision = bump_revision(data, sid); append_audit(data, sid, user, 'recurring_rule.create', 'recurringExpenseRules', rule['id'])
                result = {'sid': sid, 'revision': revision}
            if not result: return
            self.send_json(201, {'success': True, 'rule': rule}, result['sid'], result['revision']); return

        if path == '/api/recurring-expense-rules/materialize':
            if not self.check_auth(): return
            request = get_json(); through = _parse_date(request.get('throughDate') or request.get('date') or date.today().isoformat())
            if not through: self.send_json(400, {'error': 'Invalid throughDate'}); return
            result = {}
            with mutate_data() as data:
                if not self.require_roles(data, 'ADMIN', 'ACCOUNTANT'): raise SkipSave
                sid = self._authed_school_id(data); user = self._authed_user(data); created = []
                expenses = data.setdefault('expenditures', []); existing = {e.get('occurrenceKey') for e in expenses if e.get('schoolId') == sid}
                for rule in data.get('recurringExpenseRules', []):
                    if rule.get('schoolId') != sid or not rule.get('active', True): continue
                    current = _parse_date(rule.get('startDate')); end = _parse_date(rule.get('endDate'))
                    occurrences = 0
                    while current and current <= through and (not end or current <= end):
                        occurrences += 1
                        if occurrences > MAX_RECURRING_OCCURRENCES:
                            self.send_json(400, {'error': 'Recurring date range is too large'}); raise SkipSave
                        key = '%s:%s' % (rule['id'], current.isoformat())
                        if key not in existing:
                            expense = {'id': str(uuid.uuid4()), 'schoolId': sid, 'ruleId': rule['id'], 'occurrenceKey': key,
                                'date': current.isoformat(), 'description': rule.get('description'), 'category': rule.get('category'),
                                'amount': float(rule.get('amount', 0)), 'createdAt': _iso_now()}
                            expenses.append(expense); created.append(expense); existing.add(key)
                        current = _next_occurrence(current, rule.get('frequency', 'monthly'))
                revision = bump_revision(data, sid); append_audit(data, sid, user, 'recurring_rule.materialize', 'expenditures', details={'created': len(created)})
                result = {'items': created, 'sid': sid, 'revision': revision}
            if not result: return
            self.send_json(200, {'success': True, 'created': len(result['items']), 'items': result['items']}, result['sid'], result['revision']); return

        if path == '/api/invitations':
            if not self.check_auth(): return
            request = get_json(); email = (request.get('email') or '').lower().strip()
            if not email: self.send_json(400, {'error': 'Email is required'}); return
            try:
                expiry_days = min(max(int(request.get('expiresInDays', 7)), 1), 30)
            except (TypeError, ValueError):
                self.send_json(400, {'error': 'expiresInDays must be an integer'}); return
            result = {}; raw_token = secrets.token_urlsafe(32)
            with mutate_data() as data:
                if not self.require_roles(data, 'ADMIN'): raise SkipSave
                sid = self._authed_school_id(data); user = self._authed_user(data)
                if any(i.get('schoolId') == sid and i.get('email') == email and i.get('status') == 'pending' for i in data.get('invitations', [])):
                    self.send_json(409, {'error': 'A pending invitation already exists'}); raise SkipSave
                invitation = {'id': str(uuid.uuid4()), 'schoolId': sid, 'email': email, 'name': request.get('name'),
                    'role': request.get('role', 'TEACHER').upper(), 'assignedClass': request.get('assignedClass', ''),
                    'tokenHash': hashlib.sha256(raw_token.encode()).hexdigest(), 'status': 'pending', 'createdAt': _iso_now(),
                    'expiresAt': (datetime.now(timezone.utc) + timedelta(days=expiry_days)).replace(microsecond=0).isoformat().replace('+00:00', 'Z')}
                if invitation['role'] not in ('TEACHER', 'ACCOUNTANT'): invitation['role'] = 'TEACHER'
                data.setdefault('invitations', []).append(invitation)
                revision = bump_revision(data, sid); append_audit(data, sid, user, 'invitation.create', 'invitations', invitation['id'])
                result = {'invitation': {k: v for k, v in invitation.items() if k != 'tokenHash'}, 'sid': sid, 'revision': revision}
            if not result: return
            self.send_json(201, {'success': True, 'invitation': result['invitation'], 'token': raw_token}, result['sid'], result['revision']); return

        if path == '/api/deploy-template':
            if not self.check_auth(): return
            request = get_json(); result = {}
            with mutate_data() as data:
                if not self.require_roles(data, 'ADMIN'): raise SkipSave
                sid = self._authed_school_id(data); user = self._authed_user(data); cfg = data.setdefault('schools', {}).setdefault(sid, {})
                template = next((t for t in cfg.setdefault('reportTemplates', []) if str(t.get('id')) == str(request.get('templateId'))), None)
                if not template: self.send_json(404, {'error': 'Template not found'}); raise SkipSave
                current_version = int(template.get('version', 1) or 1)
                versions = template.setdefault('versions', [])
                if not any(int(entry.get('version', 0) or 0) == current_version for entry in versions):
                    snapshot = {key: copy.deepcopy(value) for key, value in template.items() if key not in ('versions', 'deploymentHistory')}
                    versions.append({'version': current_version, 'createdAt': _iso_now(), 'snapshot': snapshot})
                event = {'id': str(uuid.uuid4()), 'target': request.get('target'), 'status': 'deployed', 'createdAt': _iso_now(), 'version': template.get('version', 1)}
                template.update({'assignedTo': request.get('target'), 'deploymentStatus': 'deployed', 'lastDeployedAt': event['createdAt']})
                template.setdefault('deploymentHistory', []).insert(0, event)
                revision = bump_revision(data, sid); append_audit(data, sid, user, 'report_template.deploy', 'reportTemplates', template['id'], {'target': request.get('target')})
                result = {'event': event, 'sid': sid, 'revision': revision}
            if not result: return
            self.send_json(200, {'success': True, 'deploymentId': result['event']['id'], 'message': 'Template deployed successfully.'}, result['sid'], result['revision']); return

        template_action = re.fullmatch(r'/api/report-template/([^/]+)/(duplicate|rollback)', path)
        if template_action:
            if not self.check_auth(): return
            template_id, action = map(urllib.parse.unquote, template_action.groups()); request = get_json(); result = {}
            with mutate_data() as data:
                if not self.require_roles(data, 'ADMIN'): raise SkipSave
                sid = self._authed_school_id(data); user = self._authed_user(data); templates = data.setdefault('schools', {}).setdefault(sid, {}).setdefault('reportTemplates', [])
                template = next((t for t in templates if str(t.get('id')) == template_id), None)
                if not template: self.send_json(404, {'error': 'Template not found'}); raise SkipSave
                if action == 'duplicate':
                    updated = copy.deepcopy(template); updated.update({'id': str(uuid.uuid4()), 'name': request.get('name') or template.get('name', 'Template') + ' Copy', 'deploymentStatus': 'draft', 'deploymentHistory': [], 'version': 1, 'createdAt': _iso_now()}); templates.append(updated)
                else:
                    version = int(request.get('version', 1))
                    version_entry = next((entry for entry in template.get('versions', []) if int(entry.get('version', 0) or 0) == version), None)
                    if not version_entry or not isinstance(version_entry.get('snapshot'), dict):
                        self.send_json(409, {'error': 'This template version has no restorable snapshot'}); raise SkipSave
                    history = copy.deepcopy(template.get('versions', [])); deployments = copy.deepcopy(template.get('deploymentHistory', [])); template_id_value = template.get('id')
                    template.clear(); template.update(copy.deepcopy(version_entry['snapshot']))
                    template.update({'id': template_id_value, 'version': version, 'versions': history, 'deploymentHistory': deployments,
                                     'deploymentStatus': 'draft', 'updatedAt': _iso_now()}); updated = template
                revision = bump_revision(data, sid); append_audit(data, sid, user, 'report_template.' + action, 'reportTemplates', updated['id'])
                result = {'template': updated, 'sid': sid, 'revision': revision}
            if not result: return
            self.send_json(201 if action == 'duplicate' else 200, {'success': True, 'template': result['template']}, result['sid'], result['revision']); return

        revoke = re.fullmatch(r'/api/invitations/([^/]+)/revoke', path)
        if revoke:
            if not self.check_auth(): return
            invitation_id = urllib.parse.unquote(revoke.group(1)); result = {}
            with mutate_data() as data:
                if not self.require_roles(data, 'ADMIN'): raise SkipSave
                sid = self._authed_school_id(data); user = self._authed_user(data)
                invitation = next((i for i in data.get('invitations', []) if str(i.get('id')) == invitation_id and i.get('schoolId') == sid), None)
                if not invitation: self.send_json(404, {'error': 'Invitation not found'}); raise SkipSave
                if invitation.get('status') != 'pending': self.send_json(409, {'error': 'Invitation is not pending'}); raise SkipSave
                invitation['status'] = 'revoked'; invitation['revokedAt'] = _iso_now()
                revision = bump_revision(data, sid); append_audit(data, sid, user, 'invitation.revoke', 'invitations', invitation_id)
                result = {'sid': sid, 'revision': revision}
            if not result: return
            self.send_json(200, {'success': True}, result['sid'], result['revision']); return

        transport_create = {'/api/transport/invoices': 'transportInvoices', '/api/transport/maintenance': 'transportMaintenance'}
        if path in transport_create:
            if not self.check_auth(): return
            item = get_json(); result = {}; collection = transport_create[path]
            error = _validate_record_item(collection, item)
            if error:
                self.send_json(400, {'error': error}); return
            with mutate_data() as data:
                if not self.require_roles(data, 'ADMIN', 'TRANSPORT_MANAGER'): raise SkipSave
                sid = self._authed_school_id(data); user = self._authed_user(data)
                reference_error = _validate_references(data, sid, collection, item)
                if reference_error:
                    self.send_json(400, {'error': reference_error}); raise SkipSave
                item.update({'id': item.get('id') or str(uuid.uuid4()), 'schoolId': sid,
                             'status': item.get('status', 'pending'), 'createdAt': _iso_now()})
                data.setdefault(collection, []).append(item); revision = bump_revision(data, sid)
                append_audit(data, sid, user, 'transport.create', collection, item['id']); result = {'sid': sid, 'revision': revision}
            if not result: return
            self.send_json(201, {'success': True, 'item': item}, result['sid'], result['revision']); return

        transport_status = re.fullmatch(r'/api/transport/(invoices|maintenance)/([^/]+)/(?:status|update-status)', path)
        if transport_status:
            if not self.check_auth(): return
            kind, item_id = transport_status.groups(); collection = 'transportInvoices' if kind == 'invoices' else 'transportMaintenance'
            request = get_json(); result = {}
            if not request.get('status'): self.send_json(400, {'error': 'status is required'}); return
            with mutate_data() as data:
                if not self.require_roles(data, 'ADMIN', 'TRANSPORT_MANAGER'): raise SkipSave
                sid = self._authed_school_id(data); user = self._authed_user(data)
                item = next((i for i in data.get(collection, []) if str(i.get('id')) == item_id and i.get('schoolId') == sid), None)
                if not item: self.send_json(404, {'error': 'Transport record not found'}); raise SkipSave
                item['status'] = request['status']; item['updatedAt'] = _iso_now(); revision = bump_revision(data, sid)
                append_audit(data, sid, user, 'transport.status', collection, item_id, {'status': request['status']})
                result = {'item': item, 'sid': sid, 'revision': revision}
            if not result: return
            self.send_json(200, {'success': True, 'item': result['item']}, result['sid'], result['revision']); return

        recycle_move = (re.fullmatch(r'/api/recycle/([^/]+)/([^/]+)', path) or
                        re.fullmatch(r'/api/recycle/([^/]+)/([^/]+)/move', path))
        recycle_restore = (re.fullmatch(r'/api/recycle/([^/]+)/restore', path) or
                           re.fullmatch(r'/api/recycle/restore/([^/]+)', path))
        if recycle_restore or (recycle_move and recycle_move.group(1) != 'purge-expired'):
            if not self.check_auth(): return
            request = get_json(); result = {}
            with mutate_data() as data:
                if not self.require_roles(data, 'ADMIN'): raise SkipSave
                sid = self._authed_school_id(data); user = self._authed_user(data)
                if recycle_restore:
                    deleted_id = urllib.parse.unquote(recycle_restore.group(1))
                    entry = next((d for d in data.get('deleted', []) if str(d.get('id')) == deleted_id and d.get('schoolId') == sid), None)
                    if not entry: self.send_json(404, {'error': 'Recycle item not found'}); raise SkipSave
                    collection = entry.get('originalCollection')
                    if collection not in RECYCLABLE_COLLECTIONS: self.send_json(400, {'error': 'Invalid original collection'}); raise SkipSave
                    restored = copy.deepcopy(entry.get('record', {})); restored['schoolId'] = sid
                    original_id = restored.get('id') or restored.get('sid') or entry.get('originalId')
                    if any(i.get('schoolId') == sid and original_id in (i.get('id'), i.get('sid'))
                           for i in data.get(collection, []) if isinstance(i, dict)):
                        self.send_json(409, {'error': 'A record with the original ID already exists'}); raise SkipSave
                    data.setdefault(collection, []).append(restored); data['deleted'].remove(entry); action = 'restore'
                else:
                    collection, item_id = map(urllib.parse.unquote, recycle_move.groups())
                    if collection not in RECYCLABLE_COLLECTIONS: self.send_json(400, {'error': 'Collection cannot be recycled'}); raise SkipSave
                    record = next((i for i in data.get(collection, []) if (str(i.get('id')) == item_id or str(i.get('sid')) == item_id) and i.get('schoolId') == sid), None)
                    if not record: self.send_json(404, {'error': 'Record not found'}); raise SkipSave
                    data[collection].remove(record); entry = {**copy.deepcopy(record), 'id': str(uuid.uuid4()), 'type': collection.rstrip('s').upper(), 'schoolId': sid, 'originalCollection': collection,
                        'originalId': record.get('id') or record.get('sid'), 'record': copy.deepcopy(record), 'deletedAt': _iso_now(),
                        'deletedBy': user.get('email'), 'reason': request.get('reason')}
                    data.setdefault('deleted', []).append(entry); action = 'move'
                revision = bump_revision(data, sid); append_audit(data, sid, user, 'recycle.' + action, collection, entry['id'])
                result = {'entry': restored if recycle_restore else entry, 'sid': sid, 'revision': revision}
            if not result: return
            self.send_json(200, {'success': True, 'item': result['entry']}, result['sid'], result['revision']); return

        if path == '/api/recycle/purge-expired':
            if not self.check_auth(): return
            result = {}
            with mutate_data() as data:
                if not self.require_roles(data, 'ADMIN'): raise SkipSave
                sid = self._authed_school_id(data); user = self._authed_user(data)
                days = int(data.get('schools', {}).get(sid, {}).get('retentionPolicy', {}).get('recycleDays', 30) or 30)
                cutoff = (datetime.now(timezone.utc) - timedelta(days=max(days, 0))).replace(microsecond=0).isoformat().replace('+00:00', 'Z')
                before = len(data.get('deleted', [])); data['deleted'] = [d for d in data.get('deleted', []) if d.get('schoolId') != sid or d.get('deletedAt', _iso_now()) > cutoff]
                count = before - len(data['deleted']); revision = bump_revision(data, sid)
                append_audit(data, sid, user, 'recycle.purge_expired', 'deleted', details={'purged': count})
                result = {'count': count, 'sid': sid, 'revision': revision}
            if not result: return
            self.send_json(200, {'success': True, 'purged': result['count']}, result['sid'], result['revision']); return

        # Register a brand-new institution (public, open self-service).
        # Creates the school + its first ADMIN pending activation/KYC.
        if path == '/api/auth/register-institution':
            reg = get_json()
            institution_name = (reg.get('institutionName') or '').strip()
            admin_name = (reg.get('adminName') or '').strip()
            email = (reg.get('adminEmail') or reg.get('email') or '').lower().strip()
            password = reg.get('password') or ''
            if not self.enforce_rate_limit('institution-register', email, 5, 3600): return
            if not institution_name or not email or not valid_password(password):
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Institution name, admin email and password are required"}).encode('utf-8'))
                return

            result = {}
            with mutate_data() as data:
                # Global email uniqueness across all schools.
                if any(u.get('email', '').lower().strip() == email for u in data.get('users', [])):
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "Email already exists"}).encode('utf-8'))
                    raise SkipSave

                sid = _gen_school_id(data)
                code = _gen_school_code(data)
                data.setdefault('schools', {})[sid] = new_school_config(institution_name, code)
                admin = {
                    "uuid": str(uuid.uuid4()),
                    "name": admin_name or "Admin",
                    "email": email,
                    "password": hash_password(password),
                    "role": "ADMIN",
                    "assignedClass": "",
                    "status": "pending",
                    "password_recovery_requested": False,
                    "schoolId": sid,
                }
                data.setdefault('users', []).append(admin)
                data.setdefault('activity_log', []).append({
                    'type': 'INSTITUTION_REGISTERED', 'email': email, 'name': admin['name'],
                    'schoolId': sid, 'time': time.strftime('%Y-%m-%d %H:%M:%S')
                })
                result = {"user": _public_user(admin), "schoolCode": code, "schoolId": sid}

            self.send_response(201)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, **result}).encode('utf-8'))
            return

        # NEW: Password Reset Token Generation (Public)
        if path == '/api/auth/request-password-reset':
            req = get_json()
            email = (req.get('email') or '').lower().strip()
            if not self.enforce_rate_limit('password-reset-request', email, 5, 3600): return
            with mutate_data() as data:
                user = next((u for u in data.get('users', []) if u.get('email', '').lower().strip() == email), None)
                if user:
                    token = secrets.token_hex(32)
                    token_hash = hashlib.sha256(token.encode('utf-8')).hexdigest()
                    data.setdefault('reset_tokens', {})[token_hash] = {
                        "email": email,
                        "expires_at": int(time.time()) + PASSWORD_RESET_TIMEOUT
                    }
                    
                    # Never place an attacker-controlled Origin/Referer in email.
                    base_url = os.environ.get('PASSWORD_RESET_BASE_URL', ALLOWED_ORIGINS[0]).rstrip('/')
                    reset_link = f"{base_url}/?token={token}"
                    send_reset_email(email, reset_link)
            
            # Anti-enumeration: always return success
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "message": "If this email is registered, a reset link has been generated."}).encode('utf-8'))
            return

        # NEW: Execute Password Reset (Public)
        if path == '/api/auth/execute-password-reset':
            req = get_json()
            token = req.get('token')
            new_password = req.get('password')
            if not token or not valid_password(new_password):
                self.send_response(400); self.end_headers(); return

            with mutate_data() as data:
                tokens = data.get('reset_tokens', {})
                token_hash = hashlib.sha256(token.encode('utf-8')).hexdigest()
                stored_key = token_hash if token_hash in tokens else token
                entry = tokens.get(stored_key)
                if not entry or entry['expires_at'] < time.time():
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "Expired or invalid token"}).encode('utf-8'))
                    raise SkipSave
                
                email = entry['email']
                user = next((u for u in data.get('users', []) if u.get('email', '').lower().strip() == email), None)
                if user:
                    user['password'] = hash_password(new_password)
                    user['authVersion'] = int(user.get('authVersion', 0) or 0) + 1
                    user['password_recovery_requested'] = False
                    # Password reset must not bypass activation/KYC.
                    if user.get('status') not in ('pending', 'pending_activation', 'disabled'):
                        user['status'] = 'active'
                
                del tokens[stored_key]
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": True}).encode('utf-8'))
            return

        # Staff signup (public): join an EXISTING institution via its school code.
        if path == '/api/auth/signup':
            user_data = get_json()
            email = user_data.get('email', '').lower().strip()
            school_code = (user_data.get('schoolCode') or '').strip().upper()
            # Only non-admin roles can self-register; ADMINs come from register-institution.
            role = user_data.get('role', 'TEACHER').upper().strip()
            if not self.enforce_rate_limit('signup', email, 10, 3600): return
            if role not in ('TEACHER', 'ACCOUNTANT'):
                role = 'TEACHER'
            if not email or not valid_password(user_data.get('password')):
                self.send_json(400, {'error': 'A valid email and password of at least 8 characters are required'}); return

            with mutate_data() as data:
                sid, _cfg = find_school_by_code(data, school_code)
                if not sid:
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "Invalid school code. Ask your administrator for your institution's code."}).encode('utf-8'))
                    raise SkipSave

                # Global email uniqueness.
                if any(u.get('email', '').lower().strip() == email for u in data.get('users', [])):
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "Email already exists"}).encode('utf-8'))
                    raise SkipSave

                new_user = {
                    "uuid": str(uuid.uuid4()),
                    "name": user_data.get('name', 'New User'),
                    "email": email,
                    "password": hash_password(user_data.get('password') or ''),
                    "role": role,
                    "assignedClass": user_data.get('assignedClass', ''),
                    "status": "pending_activation",
                    "password_recovery_requested": False,
                    "schoolId": sid,
                }
                data.setdefault('users', []).append(new_user)
                data.setdefault('activity_log', []).append({
                    'type': 'SIGNUP', 'email': email, 'name': new_user['name'],
                    'schoolId': sid, 'time': time.strftime('%Y-%m-%d %H:%M:%S')
                })

            self.send_response(201)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": True}).encode('utf-8'))
            return

        # Login Endpoint (Public)
        if path == '/api/auth/login':
            credentials = get_json()
            email = credentials.get('email', '').lower().strip()
            password = credentials.get('password')
            if not self.enforce_rate_limit('login', email, 10, 300): return
            
            data = load_data()
            
            # Find user by email first to check lock status
            user_by_email = next((u for u in data.get('users', []) if u.get('email', '').lower().strip() == email), None)
            if user_by_email:
                if user_by_email.get('password_recovery_requested') == True:
                    self.send_response(403)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "Account is locked. A password recovery request is pending. Please contact your Administrator to reset your password."}).encode('utf-8'))
                    return
                if user_by_email.get('status') in ('pending', 'pending_activation', 'disabled'):
                    self.send_response(403)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "Your account is pending activation/KYC. Please contact your Administrator."}).encode('utf-8'))
                    return

            user = next((u for u in data.get('users', []) if u.get('email', '').lower().strip() == email and verify_password(password, u)), None)
            if user:
                if isinstance(user.get('password'), str) and not user['password'].startswith(('scrypt$', 'pbkdf2$')):
                    with mutate_data() as current:
                        stored_user = next((u for u in current.get('users', []) if u.get('email', '').lower().strip() == email), None)
                        if stored_user:
                            stored_user['password'] = hash_password(password)
                            user = stored_user
                token = make_token(user['email'], user.get('uuid'), user.get('authVersion', 0))
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"success": True, "token": token, "user": _public_user(user)}).encode('utf-8'))
            else:
                self.send_response(401)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Invalid credentials"}).encode('utf-8'))
            return

        # Forgot Password Endpoint (Public)
        if path == '/api/auth/forgot-password':
            body_data = get_json()
            email = body_data.get('email', '').lower().strip()
            if not self.enforce_rate_limit('forgot-password', email, 5, 3600): return
            if not email:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Email is required"}).encode('utf-8'))
                return
                
            # Public knowledge of an email address must not disable its account.
            # The token-based reset endpoint is the only public recovery flow.
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "message": "If that email exists, recovery instructions are available through the password reset flow."}).encode('utf-8'))
            return

        # Activate User Endpoint (Protected - Admin only)
        if path == '/api/users/activate':
            if not self.check_auth(): return
            
            data = load_data()
            role = self.get_request_role(data)
            if role != 'ADMIN':
                self.send_response(403)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Forbidden: Only ADMIN can activate users"}).encode('utf-8'))
                return
                
            body_data = get_json()
            email = body_data.get('email', '').lower().strip()
            new_password = body_data.get('newPassword', '').strip()

            if not email or not valid_password(new_password):
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Email and newPassword are required"}).encode('utf-8'))
                return

            with mutate_data() as data:
                admin_sid = self._authed_school_id(data)
                found = False
                for u in data.get('users', []):
                    # Only act on a user in the admin's OWN school.
                    if u.get('email', '').lower().strip() == email and u.get('schoolId') == admin_sid:
                        u['password'] = hash_password(new_password)
                        u['authVersion'] = int(u.get('authVersion', 0) or 0) + 1
                        u['password_recovery_requested'] = False
                        u['status'] = 'active'
                        found = True
                        break

                if not found:
                    self.send_response(404)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "User not found"}).encode('utf-8'))
                    raise SkipSave

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": True}).encode('utf-8'))
            return

        # Save Report Endpoint
        if path == '/api/save-report':
            if not self.check_auth(): return
            if content_length > MAX_REPORT_BYTES:
                self.send_json(413, {'error': 'Report payload is too large'}); return
            report_data = get_json()
            result = {}
            with mutate_data() as data:
                sid = self._authed_school_id(data)
                user = self._authed_user(data)
                if not isinstance(report_data, dict):
                    self.send_json(400, {'error': 'Report must be a JSON object'}); raise SkipSave
                report_data['schoolId'] = sid
                reports = data.setdefault('reports', [])
                # Update existing (same school) or add new
                existing_idx = next((i for i, r in enumerate(reports)
                                     if r.get('id') == report_data.get('id') and r.get('schoolId') == sid), -1)
                authorization_record = ({**reports[existing_idx], **report_data}
                                        if existing_idx > -1 else report_data)
                student_ref = authorization_record.get('studentId') or authorization_record.get('studentSid')
                student = next((record for record in data.get('students', []) if record.get('schoolId') == sid
                                and str(student_ref) in (str(record.get('id')), str(record.get('sid')))), None)
                if not student:
                    self.send_json(400, {'error': 'Report must reference a student in this school'}); raise SkipSave
                report_data.setdefault('studentId', student.get('id'))
                report_data.setdefault('studentSid', student.get('sid'))
                report_data.setdefault('studentClass', student.get('class'))
                if not _can_access_report(data, user, authorization_record):
                    self.send_json(403, {'error': 'Forbidden: report class is not assigned to this user'}); raise SkipSave
                if existing_idx > -1:
                    if reports[existing_idx].get('status') == 'finalized':
                        self.send_json(409, {'error': 'Finalized reports are immutable; revise the report first'})
                        raise SkipSave
                    report_data.setdefault('status', reports[existing_idx].get('status', 'draft'))
                    report_data['updatedAt'] = _iso_now()
                    reports[existing_idx] = report_data
                else:
                    if not report_data.get('id'): report_data['id'] = str(uuid.uuid4())
                    report_data.setdefault('status', 'draft')
                    report_data.setdefault('createdAt', _iso_now())
                    reports.append(report_data)
                version_entry = append_report_version(data, sid, report_data, 'save', user)
                revision = bump_revision(data, sid)
                append_audit(data, sid, user, 'report.save', 'reports', report_data['id'], {'version': version_entry['version']})
                result = {'sid': sid, 'revision': revision}
            if not result: return
            self.send_json(200, {"success": True, "report": report_data}, result['sid'], result['revision'])
            return

        # Tenant-scoped single-record mutation. Unlike collection replacement,
        # this preserves unrelated records and is safe for routine edits.
        record_update = re.fullmatch(r'/api/data/([^/]+)/(upsert|update)(?:/([^/]+))?', path)
        if record_update:
            if not self.check_auth(): return
            collection, action, path_id = record_update.groups()
            item = get_json(); result = {}
            if collection not in MUTABLE_COLLECTIONS:
                self.send_json(400, {'error': 'Collection is not mutable'}); return
            error = _validate_record_item(collection, item)
            if error:
                self.send_json(400, {'error': error}); return
            with mutate_data() as data:
                sid = self._authed_school_id(data); user = self._authed_user(data)
                role = self.get_request_role(data); email = user.get('email', '').lower().strip()
                is_workflow = collection in STAFF_SELF_SERVICE_COLLECTIONS or collection == 'staffAttendance'
                is_restricted_staff = collection in STAFF_WORKFLOW_COLLECTIONS and not is_workflow
                is_transport = collection in TRANSPORT_COLLECTIONS
                if is_restricted_staff:
                    if role not in ('ADMIN', 'HEAD TEACHER'):
                        self.send_json(403, {'error': 'Forbidden: restricted staff records'}); raise SkipSave
                elif is_workflow:
                    if role not in ('ADMIN', 'HEAD TEACHER', 'TEACHER'):
                        self.send_json(403, {'error': 'Forbidden: staff workflow access denied'}); raise SkipSave
                elif is_transport:
                    if role not in ('ADMIN', 'TRANSPORT_MANAGER'):
                        self.send_json(403, {'error': 'Forbidden: transport access denied'}); raise SkipSave
                elif role not in ('ADMIN', 'ACCOUNTANT'):
                    self.send_json(403, {'error': 'Forbidden: insufficient role'}); raise SkipSave
                reference_error = _validate_references(data, sid, collection, item)
                if reference_error:
                    self.send_json(400, {'error': reference_error}); raise SkipSave
                record_id = urllib.parse.unquote(path_id) if path_id else (item.get('id') or item.get('sid'))
                if not record_id:
                    if action == 'update':
                        self.send_json(400, {'error': 'Record ID is required'}); raise SkipSave
                    record_id = str(uuid.uuid4()); item['id'] = record_id
                coll = data.setdefault(collection, [])
                if not isinstance(coll, list):
                    self.send_json(400, {'error': 'Not a record collection'}); raise SkipSave
                existing = next((i for i in coll if isinstance(i, dict) and i.get('schoolId') == sid
                                 and str(record_id) in (str(i.get('id')), str(i.get('sid')))), None)
                if action == 'update' and not existing:
                    self.send_json(404, {'error': 'Record not found'}); raise SkipSave
                if is_workflow and role not in ('ADMIN', 'HEAD TEACHER'):
                    if existing and _record_owner(existing) != email:
                        self.send_json(403, {'error': 'Cannot modify another user\'s workflow record'}); raise SkipSave
                    item['createdBy'] = email
                if existing:
                    protected = {'schoolId', 'id', 'sid', 'createdBy'}
                    existing.update({k: v for k, v in item.items() if k not in protected})
                    existing['updatedAt'] = _iso_now(); saved = existing
                else:
                    item['schoolId'] = sid; item.setdefault('createdAt', _iso_now())
                    coll.append(item); saved = item
                revision = bump_revision(data, sid)
                append_audit(data, sid, user, 'collection.' + action, collection, record_id)
                result = {'item': saved, 'sid': sid, 'revision': revision}
            if not result: return
            self.send_json(200 if existing else 201, {'success': True, 'item': result['item']}, result['sid'], result['revision'])
            return

        # Append a single item to a record collection (e.g. POST /api/data/students/add
        # or /api/<collection>/add). Tagged with the caller's school. Idempotent via X-Request-ID.
        add_match = None
        if path.endswith('/add'):
            seg = [p for p in path.split('/') if p]            # e.g. ['api','data','students','add'] or ['api','students','add']
            if len(seg) >= 3 and seg[0] == 'api':
                add_match = seg[-2]                            # the collection name
        if add_match is not None:
            if not self.check_auth(): return
            item = get_json()
            collection = add_match
            request_id = self.sync_id()
            mutation = {}
            with mutate_data() as data:
                role = self.get_request_role(data)
                is_workflow = collection in STAFF_SELF_SERVICE_COLLECTIONS or collection == 'staffAttendance'
                is_restricted_staff = collection in STAFF_WORKFLOW_COLLECTIONS and not is_workflow
                is_transport = collection in TRANSPORT_COLLECTIONS
                if is_restricted_staff:
                    allowed = role in ('ADMIN', 'HEAD TEACHER')
                elif is_workflow:
                    allowed = role in ('ADMIN', 'HEAD TEACHER', 'TEACHER')
                elif is_transport:
                    allowed = role in ('ADMIN', 'TRANSPORT_MANAGER')
                else:
                    allowed = role in ('ADMIN', 'ACCOUNTANT')
                if not allowed:
                    self.send_response(403)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "Forbidden: insufficient role"}).encode('utf-8'))
                    raise SkipSave
                sid = self._authed_school_id(data)
                if collection not in MUTABLE_COLLECTIONS:
                    self.send_json(400, {"error": "Collection is not mutable"}); raise SkipSave
                if is_workflow and role not in ('ADMIN', 'HEAD TEACHER', 'TEACHER'):
                    self.send_json(403, {'error': 'Forbidden: staff workflow access denied'}); raise SkipSave
                error = _validate_record_item(collection, item)
                if error:
                    self.send_json(400, {'error': error}); raise SkipSave
                reference_error = _validate_references(data, sid, collection, item)
                if reference_error:
                    self.send_json(400, {'error': reference_error}); raise SkipSave
                coll = data.setdefault(collection, [])
                if not isinstance(coll, list):
                    self.send_response(400); self.send_header('Content-Type', 'application/json'); self.end_headers()
                    self.wfile.write(json.dumps({"error": "Not an addable collection"}).encode('utf-8')); raise SkipSave
                # Idempotency: a retried request with the same X-Request-ID is a no-op success.
                if request_id and any(i.get('requestId') == request_id and i.get('schoolId') == sid for i in coll if isinstance(i, dict)):
                    current_revision = int(data.get('schools', {}).get(sid, {}).get('syncState', {}).get('revision', 0) or 0)
                    self.send_json(200, {"success": True, "duplicate": True}, sid, current_revision); raise SkipSave
                if not item.get('id'):
                    item['id'] = str(uuid.uuid4())
                if any(isinstance(existing, dict) and existing.get('schoolId') == sid
                       and str(item.get('id')) in (str(existing.get('id')), str(existing.get('sid')))
                       for existing in coll):
                    self.send_json(409, {'error': 'A record with this ID already exists'}); raise SkipSave
                item['schoolId'] = sid
                if is_workflow and role not in ('ADMIN', 'HEAD TEACHER'):
                    item['createdBy'] = self._authed_user(data).get('email', '').lower().strip()
                if request_id:
                    item['requestId'] = request_id
                coll.append(item)
                revision = bump_revision(data, sid)
                append_audit(data, sid, self._authed_user(data), 'collection.add', collection, item['id'], {'syncId': request_id})
                mutation = {'sid': sid, 'revision': revision}
            if not mutation: return
            self.send_json(201, {"success": True, "item": item}, mutation['sid'], mutation['revision'])
            return

        # Data Update Endpoints (Protected) — config keys route per-school;
        # record collections replace only THIS school's items (other schools untouched).
        if path.startswith('/api/data/'):
            if not self.check_auth(): return
            collection = path.split('/')[-1]
            new_data = get_json()
            mutation = {}
            with mutate_data() as data:
                role = self.get_request_role(data)
                if collection in RECORD_COLLECTIONS and not isinstance(new_data, list):
                    self.send_json(400, {'error': 'Record collection replacement requires a JSON list'}); raise SkipSave
                if collection in STAFF_WORKFLOW_COLLECTIONS or collection == 'staffAttendance':
                    allowed = role in ('ADMIN', 'HEAD TEACHER')
                elif collection in TRANSPORT_COLLECTIONS:
                    allowed = role in ('ADMIN', 'TRANSPORT_MANAGER')
                else:
                    allowed = role in ('ADMIN', 'ACCOUNTANT')
                if not allowed:
                    self.send_response(403)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "Forbidden: insufficient role"}).encode('utf-8'))
                    raise SkipSave
                if collection == 'users':
                    self.send_response(403)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "Forbidden: 'users' cannot be modified via this endpoint"}).encode('utf-8'))
                    raise SkipSave

                if collection not in MUTABLE_COLLECTIONS and collection not in SCHOOL_CONFIG_KEYS:
                    self.send_json(400, {"error": "Collection is not mutable"})
                    raise SkipSave

                sid = self._authed_school_id(data)
                if collection in SCHOOL_CONFIG_KEYS or (collection not in RECORD_COLLECTIONS and isinstance(new_data, dict)):
                    # Per-school configuration.
                    cfg = data.setdefault('schools', {}).setdefault(sid, {})
                    if isinstance(cfg.get(collection), dict) and isinstance(new_data, dict):
                        cfg[collection].update(new_data)
                    else:
                        cfg[collection] = new_data
                elif isinstance(new_data, list):
                    # Record collection: keep other schools' items, replace this school's.
                    for item in new_data:
                        error = _validate_record_item(collection, item)
                        if error:
                            self.send_json(400, {'error': error}); raise SkipSave
                    others = [i for i in data.get(collection, [])
                              if not (isinstance(i, dict) and i.get('schoolId') == sid)]
                    mine = []
                    for i in new_data:
                        if isinstance(i, dict):
                            i['schoolId'] = sid
                        mine.append(i)
                    data[collection] = others + mine
                else:
                    self.send_json(400, {'error': 'Invalid collection payload'}); raise SkipSave
                
                # Auto-recalculate staff performance if relevant data changed
                if collection in ('staffAttendance', 'reports', 'staff', 'attendance', 'staffQuestions', 'lessonNotes', 'staffTasks', 'staffEnquiries'):
                    update_all_staff_performance(data, sid)
                revision = bump_revision(data, sid)
                append_audit(data, sid, self._authed_user(data), 'collection.replace', collection, details={'syncId': self.sync_id()})
                mutation = {'sid': sid, 'revision': revision}

            if not mutation: return
            self.send_json(200, {"success": True}, mutation['sid'], mutation['revision'])
            return

        # Log a logout event (per school).
        if path == '/api/auth/logout-log':
            if not self.check_auth(): return
            body_data = get_json()
            with mutate_data() as data:
                sid = self._authed_school_id(data)
                data.setdefault('activity_log', []).append({
                    'type': 'LOGOUT',
                    'email': body_data.get('email', 'unknown'),
                    'name': body_data.get('name', 'Unknown'),
                    'schoolId': sid,
                    'time': time.strftime('%Y-%m-%d %H:%M:%S'),
                })
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": True}).encode('utf-8'))
            return

        # Create an expenditure (per school).
        if path == '/api/expenditure':
            if not self.check_auth(): return
            exp = get_json()
            amount = _valid_money(exp.get('amount')) if isinstance(exp, dict) else None
            if amount is None:
                self.send_json(400, {'error': 'amount must be positive, finite and within bounds'}); return
            request_id = self.sync_id()
            with mutate_data() as data:
                if self.get_request_role(data) not in ('ADMIN', 'ACCOUNTANT'):
                    self.send_response(403); self.send_header('Content-Type', 'application/json'); self.end_headers()
                    self.wfile.write(json.dumps({"error": "Forbidden: insufficient role"}).encode('utf-8')); raise SkipSave
                sid = self._authed_school_id(data)
                coll = data.setdefault('expenditures', [])
                if request_id and any(e.get('requestId') == request_id and e.get('schoolId') == sid for e in coll):
                    self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers()
                    self.wfile.write(json.dumps({"success": True, "duplicate": True}).encode('utf-8')); raise SkipSave
                new_exp = {
                    "id": str(uuid.uuid4()),
                    "date": exp.get('date'),
                    "description": exp.get('description'),
                    "category": exp.get('category'),
                    "amount": amount,
                    "approvedBy": exp.get('approvedBy'),
                    "schoolId": sid,
                    "requestId": request_id,
                    "createdAt": time.strftime('%Y-%m-%d %H:%M:%S'),
                }
                coll.append(new_exp)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "expenditure": new_exp}).encode('utf-8'))
            return

        elif path.startswith('/api/upload-'):
            if not self.check_auth(): return
            _data0 = load_data()
            if self.get_request_role(_data0) not in ('ADMIN', 'ACCOUNTANT'):
                self.send_response(403)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Forbidden: insufficient role"}).encode('utf-8'))
                return
            sid = self._authed_school_id(_data0)
            asset = path.split('-')[-1]
            try:
                boundary = self.headers.get('Content-Type').split('boundary=')[-1].encode()
                parts = body.split(boundary)
                for part in parts:
                    if b'filename=' in part:
                        file_content = part.split(b'\r\n\r\n')[1].rsplit(b'\r\n', 1)[0]
                        filename = f"uploaded_{asset}.png"
                        # Per-school upload dir so schools don't overwrite each other's assets.
                        dest = _safe_join(UPLOADS_DIR, os.path.join(sid, filename))
                        if not dest:
                            self.send_response(400); self.end_headers(); return
                        os.makedirs(os.path.dirname(dest), exist_ok=True)
                        with open(dest, 'wb') as f:
                            f.write(file_content)
                        url = f"/uploads/{sid}/{filename}"
                        with mutate_data() as data:
                            cfg = data.setdefault('schools', {}).setdefault(sid, {})
                            cfg.setdefault('settings', {})[f"{asset}Url"] = url
                        self.send_response(200)
                        self.send_header('Content-Type', 'application/json')
                        self.end_headers()
                        self.wfile.write(json.dumps({"success": True, "url": url}).encode('utf-8'))
                        return
            except Exception as e:
                print(f"Upload error: {e}")
            self.send_response(500)
            self.end_headers()

        # --- SMS ENDPOINTS ---
        elif path == '/api/send-sms':
            if not self.check_auth(): return
            if not self.require_roles(load_data(), 'ADMIN', 'ACCOUNTANT'): return
            sms_data = get_json()
            if not self.enforce_rate_limit('send-sms', self._authed_email(), 30, 3600): return
            phone = sms_data.get('phone')
            message = sms_data.get('message')
            if not phone or not message:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Phone and message required"}).encode('utf-8'))
                return

            # Load persistent config for fallbacks (per-school; falls back to 'default').
            app_data = load_data()
            _sid = self._authed_school_id(app_data)
            school_info = app_data.get('schools', {}).get(_sid, {}).get('schoolInfo', {})

            # Dynamic AT Config
            AT_USERNAME = os.environ.get('AT_USERNAME') or school_info.get('atUsername') or 'sandbox'
            AT_API_KEY  = os.environ.get('AT_API_KEY') or school_info.get('atApiKey') or ''
            
            try:
                url = "https://api.africastalking.com/version1/messaging"
                if AT_USERNAME.lower() == 'sandbox':
                    url = "https://api.sandbox.africastalking.com/version1/messaging"
                
                # Using the modern /bulk approach with JSON
                bulk_url = f"{url}/bulk" if not url.endswith('/bulk') else url
                
                payload = json.dumps({
                    "username": AT_USERNAME,
                    "to": [phone] if isinstance(phone, str) else phone,
                    "message": message
                }).encode('utf-8')
                
                req = urllib.request.Request(bulk_url, data=payload)
                req.add_header("apiKey", AT_API_KEY)
                req.add_header("Accept", "application/json")
                req.add_header("Content-Type", "application/json")
                
                with urllib.request.urlopen(req, timeout=10) as response:
                    resp_data = json.loads(response.read().decode('utf-8'))
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"success": True, "provider": "africastalking", "data": resp_data}).encode('utf-8'))
                    return
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                return

        elif path == '/api/send-sms-hubtel':
            if not self.check_auth(): return
            if not self.require_roles(load_data(), 'ADMIN', 'ACCOUNTANT'): return
            sms_data = get_json()
            phone = sms_data.get('phone', '')
            message = sms_data.get('message', '')
            if not phone or not message:
                self.send_response(400)
                self.end_headers()
                return

            # Load persistent config for fallbacks (per-school; falls back to 'default').
            app_data = load_data()
            _sid = self._authed_school_id(app_data)
            school_info = app_data.get('schools', {}).get(_sid, {}).get('schoolInfo', {})

            # Dynamic Hubtel Config
            CLIENT_ID = sms_data.get('hubtelClientId') or school_info.get('hubtelClientId') or os.environ.get('HUBTEL_CLIENT_ID', '')
            CLIENT_SECRET = sms_data.get('hubtelClientSecret') or school_info.get('hubtelClientSecret') or os.environ.get('HUBTEL_CLIENT_SECRET', '')
            SENDER_ID = school_info.get('arkeselSender') or os.environ.get('HUBTEL_SENDER_ID', 'TrueStar')
            
            # Normalise phone
            phone_clean = phone.replace(' ', '').replace('+233', '0')
            if phone_clean.startswith('233'): phone_clean = '0' + phone_clean[3:]
            
            try:
                params = urllib.parse.urlencode({
                    "clientid": CLIENT_ID,
                    "clientsecret": CLIENT_SECRET,
                    "from": SENDER_ID,
                    "to": phone_clean,
                    "content": message
                })
                url = f"https://devp-sms03726-api.hubtel.com/v1/messages/send?{params}"
                
                req = urllib.request.Request(url)
                with urllib.request.urlopen(req, timeout=10) as response:
                    resp_data = json.loads(response.read().decode('utf-8'))
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"success": True, "provider": "hubtel", "data": resp_data}).encode('utf-8'))
                    return
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                return

        elif path == '/api/send-sms-arkesel':
            if not self.check_auth(): return
            if not self.require_roles(load_data(), 'ADMIN', 'ACCOUNTANT'): return
            sms_data = get_json()
            phone_input = (sms_data.get('phone') or '').replace(' ', '').replace('+233', '0')
            if phone_input.startswith('233'): phone_input = '0' + phone_input[3:]
            phone = phone_input
            message = sms_data.get('message', '')
            
            # Load persistent config for fallbacks (per-school; falls back to 'default').
            app_data = load_data()
            _sid = self._authed_school_id(app_data)
            school_info = app_data.get('schools', {}).get(_sid, {}).get('schoolInfo', {})

            # Dynamic Arkesel Config
            ARKESEL_API_KEY = sms_data.get('arkeselApiKey') or school_info.get('arkeselApiKey') or os.environ.get('ARKESEL_API_KEY', '')
            ARKESEL_SENDER = sms_data.get('arkeselSender') or school_info.get('arkeselSender') or os.environ.get('ARKESEL_SENDER', 'Arkesel')
            
            try:
                params = urllib.parse.urlencode({
                    "action": "send-sms",
                    "api_key": ARKESEL_API_KEY,
                    "to": phone,
                    "from": ARKESEL_SENDER,
                    "sms": message
                })
                url = f"https://sms.arkesel.com/sms/api?{params}"
                with urllib.request.urlopen(url, timeout=10) as response:
                    resp_data = json.loads(response.read().decode('utf-8'))
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"success": True, "provider": "arkesel", "data": resp_data}).encode('utf-8'))
                    return
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                return
        else:
            self.send_response(404)
            self.end_headers()

    def do_DELETE(self):
        if not self.check_host(): return
        path = urlparse(self.path).path

        template_delete = re.fullmatch(r'/api/report-template/delete/([^/]+)', path)
        if template_delete:
            if not self.check_auth(): return
            template_id = urllib.parse.unquote(template_delete.group(1)); result = {}
            with mutate_data() as data:
                if not self.require_roles(data, 'ADMIN'): raise SkipSave
                sid = self._authed_school_id(data); user = self._authed_user(data); templates = data.setdefault('schools', {}).setdefault(sid, {}).setdefault('reportTemplates', [])
                original = len(templates); templates[:] = [item for item in templates if str(item.get('id')) != template_id]
                if len(templates) == original: self.send_json(404, {'error': 'Template not found'}); raise SkipSave
                revision = bump_revision(data, sid); append_audit(data, sid, user, 'report_template.delete', 'reportTemplates', template_id); result = {'sid': sid, 'revision': revision}
            if not result: return
            self.send_json(200, {'success': True}, result['sid'], result['revision']); return

        recycle_purge = (re.fullmatch(r'/api/recycle/([^/]+)', path) or
                         re.fullmatch(r'/api/recycle/([^/]+)/purge', path))
        if recycle_purge:
            if not self.check_auth(): return
            deleted_id = urllib.parse.unquote(recycle_purge.group(1)); result = {}
            with mutate_data() as data:
                if not self.require_roles(data, 'ADMIN'): raise SkipSave
                sid = self._authed_school_id(data); user = self._authed_user(data)
                entry = next((d for d in data.get('deleted', []) if str(d.get('id')) == deleted_id and d.get('schoolId') == sid), None)
                if not entry: self.send_json(404, {'error': 'Recycle item not found'}); raise SkipSave
                data['deleted'].remove(entry); revision = bump_revision(data, sid)
                append_audit(data, sid, user, 'recycle.purge', 'deleted', deleted_id)
                result = {'sid': sid, 'revision': revision}
            if not result: return
            self.send_json(200, {'success': True}, result['sid'], result['revision']); return

        # Specific User Delete Route
        if path.startswith('/api/users/delete/'):
            if not self.check_auth(): return

            from urllib.parse import unquote
            email_to_delete = unquote(path.split('/')[-1]).lower().strip()

            with mutate_data() as data:
                if self.get_request_role(data) != 'ADMIN':
                    self.send_response(403)
                    self.end_headers()
                    raise SkipSave
                admin_sid = self._authed_school_id(data)
                # An admin can only delete users within their own school, and
                # cannot delete their own account.
                if email_to_delete == (self._authed_email() or ''):
                    self.send_response(403)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "You cannot delete your own account"}).encode('utf-8'))
                    raise SkipSave

                users = data.get('users', [])
                original_len = len(users)
                data['users'] = [
                    u for u in users
                    if not (u.get('email', '').lower().strip() == email_to_delete and u.get('schoolId') == admin_sid)
                ]

                if len(data['users']) == original_len:
                    self.send_response(404)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "User not found"}).encode('utf-8'))
                    raise SkipSave

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": True}).encode('utf-8'))
            return

        # Generic Data Delete (frontend uses /api/data/<collection>/delete/<id>
        # or /api/data/<collection>/<id>). Only deletes items in the caller's school.
        if path.startswith('/api/data/'):
            if not self.check_auth(): return
            parts = [p for p in path.split('/') if p]   # ['api','data','<collection>',('delete',)'<id>']
            collection = parts[2]
            item_id = parts[-1]
            mutation = {}
            with mutate_data() as data:
                role = self.get_request_role(data)
                is_workflow = collection in STAFF_SELF_SERVICE_COLLECTIONS or collection == 'staffAttendance'
                is_restricted_staff = collection in STAFF_WORKFLOW_COLLECTIONS and not is_workflow
                is_transport = collection in TRANSPORT_COLLECTIONS
                if ((is_restricted_staff and role not in ('ADMIN', 'HEAD TEACHER')) or
                        (is_workflow and role not in ('ADMIN', 'HEAD TEACHER', 'TEACHER')) or
                        (not is_workflow and not is_restricted_staff and not is_transport and role not in ('ADMIN', 'ACCOUNTANT')) or
                        (is_transport and role not in ('ADMIN', 'TRANSPORT_MANAGER'))):
                    self.send_response(403)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "Forbidden: insufficient role"}).encode('utf-8'))
                    raise SkipSave
                if collection == 'users':
                    self.send_response(403)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "Use /api/users/delete/<email> to remove users"}).encode('utf-8'))
                    raise SkipSave
                if collection not in MUTABLE_COLLECTIONS:
                    self.send_json(400, {'error': 'Collection is not mutable'})
                    raise SkipSave

                sid = self._authed_school_id(data)
                deleted = False
                if collection in data and isinstance(data[collection], list):
                    target = next((item for item in data[collection] if isinstance(item, dict)
                                   and item.get('schoolId') == sid
                                   and (str(item.get('id')) == str(item_id) or str(item.get('sid')) == str(item_id))), None)
                    if is_workflow and role not in ('ADMIN', 'HEAD TEACHER'):
                        email = self._authed_user(data).get('email', '').lower().strip()
                        if not target or _record_owner(target) != email:
                            self.send_json(403, {'error': 'Cannot delete another user\'s workflow record'}); raise SkipSave
                    def _keep(item):
                        if not isinstance(item, dict):
                            return True
                        is_target = str(item.get('id')) == str(item_id) or str(item.get('sid')) == str(item_id)
                        # Only delete the target if it belongs to the caller's school.
                        return not (is_target and item.get('schoolId') == sid)
                    original_len = len(data[collection])
                    data[collection] = [item for item in data[collection] if _keep(item)]
                    deleted = len(data[collection]) < original_len

                if not deleted:
                    revision = int(data.get('schools', {}).get(sid, {}).get('syncState', {}).get('revision', 0) or 0)
                    self.send_json(200, {'success': True, 'alreadyDeleted': True}, sid, revision)
                    raise SkipSave  # idempotent no-op; don't rewrite the file
                # Fall through: block exits normally and the delete is persisted.
                revision = bump_revision(data, sid)
                append_audit(data, sid, self._authed_user(data), 'collection.delete', collection, item_id)
                mutation = {'sid': sid, 'revision': revision}

            if not mutation: return
            self.send_json(200, {"success": True}, mutation['sid'], mutation['revision'])
            return

        self.send_response(404)
        self.end_headers()

from socketserver import ThreadingMixIn

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    """Handle requests in a separate thread."""

def run_startup_migration():
    """Run every additive, idempotent persistence migration before serving."""
    try:
        with mutate_data() as data:
            changed = migrate_schools(data)
            changed = initialize_schema(data) or changed
            if not changed:
                raise SkipSave  # already migrated — don't rewrite
    except RuntimeError as e:
        # Corrupt data.json — surfaced by _load_data_unlocked; refuse to start.
        print(f"FATAL: {e}")
        raise

if __name__ == '__main__':
    run_startup_migration()
    port = int(os.environ.get('PORT', 8081))
    server = ThreadedHTTPServer(('0.0.0.0', port), APIHandler)
    print(f"Server starting on port {port}...")
    server.serve_forever()
