from flask import Flask, request, jsonify, send_from_directory, send_file
import json, os, time, hmac, hashlib, base64, secrets, shutil, functools, platform
import bcrypt
from datetime import datetime

app = Flask(__name__)
application = app

DEFAULT_CLASSES = [
    'CRECHE', 'NURSERY 1A', 'NURSERY 1B', 'NURSERY 2A', 'NURSERY 2B',
    'KG1A', 'KG1B', 'KG2A', 'KG2B',
    'BASIC 1', 'BASIC 2', 'BASIC 3',
    'BASIC 4', 'BASIC 5', 'BASIC 6', 'BASIC 6 A', 'BASIC 6 B',
    'BASIC 7', 'BASIC 8', 'BASIC 9',
]

# --- UNIFIED PRODUCTION PATHS ---
if os.environ.get('VERCEL'):
    # Vercel Serverless - use /tmp for ephemeral storage
    BASE_DIR    = '/tmp'
    DIST_DIR    = '/tmp'
elif platform.system() == 'Linux':
    # PythonAnywhere Production
    BASE_DIR    = '/home/JarzyWav/backend'
    DIST_DIR    = '/home/JarzyWav/frontend/dist'
else:
    # Local Development
    BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
    DIST_DIR    = os.path.join(os.path.dirname(BASE_DIR), 'frontend', 'dist')

DATA_FILE   = os.path.join(BASE_DIR, 'data.json')
BACKUP_FILE = os.path.join(BASE_DIR, 'data.json.bak')
UPLOADS_DIR = os.path.join(BASE_DIR, 'uploads')

os.makedirs(UPLOADS_DIR, exist_ok=True)

@app.after_request
def add_cors(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS, PUT, DELETE'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response

# --- Security & Hashing (Bcrypt) ---
SESSION_SECRET = os.environ.get('SESSION_SECRET', 'TSA-STABLE-PRODUCTION-SECRET-2026-X9')
TOKEN_TTL = 7 * 24 * 3600
S_BYTES = SESSION_SECRET.encode('utf-8')
SUPERADMIN_EMAILS = {"superadmin@school.com", "admin@school.com", "wav.superadmin@gmail.com"}

def hash_password(password):
    """Bcrypt hashing (Industry Standard)."""
    if not password: return None
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def verify_password(password, hashed):
    """Secure bcrypt comparison with plain-text legacy fallback."""
    if not password or not hashed: return False
    try:
        if hashed.startswith('$2b$'):
            # Modern bcrypt hash
            return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
        else:
            # Legacy plain-text fallback (auto-upgrade handled in login route)
            return password == hashed
    except Exception as e:
        print(f"Auth Error: {e}")
        return False

def make_token(email):
    p = base64.urlsafe_b64encode(
        json.dumps({"email": email, "exp": int(time.time()) + TOKEN_TTL}).encode()
    ).decode().rstrip('=')
    s = base64.urlsafe_b64encode(
        hmac.new(S_BYTES, p.encode('ascii'), hashlib.sha256).digest()
    ).decode().rstrip('=')
    return f"{p}.{s}"

def verify_token(token):
    try:
        p_b64, sig_b64 = token.split('.')
        expected = base64.urlsafe_b64encode(
            hmac.new(S_BYTES, p_b64.encode('ascii'), hashlib.sha256).digest()
        ).decode().rstrip('=')
        if not hmac.compare_digest(sig_b64, expected):
            return None
        p = json.loads(base64.urlsafe_b64decode(p_b64 + '=' * (-len(p_b64) % 4)))
        if p.get('exp', 0) < time.time(): return None
        return (p.get('email') or '').lower().strip()
    except: return None

def public_user(u):
    """Return user dict without the password field."""
    return {k: v for k, v in u.items() if k != 'password'}

def token_required(f):
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        h = request.headers.get('Authorization', '')
        t = h[7:] if h.startswith('Bearer ') else None
        if not t: return jsonify({"error": "Unauthorized"}), 401
        email = verify_token(t)
        if not email: return jsonify({"error": "Unauthorized"}), 401
        request.user_email = email
        return f(*args, **kwargs)
    return decorated

# --- Production Data Storage (Atomic Save) ---
def ensure_superadmin(d):
    """Ensure a cross-school superadmin exists so pending institutions can be activated."""
    for email in SUPERADMIN_EMAILS:
        if not any(u.get('email','').lower().strip()==email for u in d.get('users',[])):
            d.setdefault('users',[]).append({
                "name": "Super Admin", "email": email,
                "password": hash_password("Super@2026!"),
                "role": "ADMIN", "status": "active", "schoolId": "default",
                "dateAdded": datetime.now().isoformat()
            })
def load_data():
    """CRITICAL: Absolute Disk Read with No Cache."""
    if not os.path.exists(DATA_FILE):
        d={"schools": {}, "users": []}
        ensure_superadmin(d); save_data(d); return d
    
    try:
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            d = json.load(f)
        
        # Ensure core structure exists before returning
        if not isinstance(d, dict): d = {}
        if 'users' not in d: d['users'] = []
        if 'schools' not in d: d['schools'] = {}
        ensure_superadmin(d)
        # Unify: ensure every user has a schoolId
        for u in d['users']:
            if not u.get('schoolId'): u['schoolId'] = 'default'
            
        return d
    except Exception as e:
        print(f"FAILED DATA LOAD: {e}")
        # Try backup or return empty
        if os.path.exists(BACKUP_FILE):
            try:
                with open(BACKUP_FILE, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except: pass
        return {"schools": {}, "users": []}

def save_data(data):
    """CRITICAL: Atomic Safe Save."""
    if os.path.exists(DATA_FILE):
        shutil.copy2(DATA_FILE, BACKUP_FILE)
    
    tmp = DATA_FILE + ".tmp"
    try:
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, DATA_FILE)
    except Exception as e:
        print(f"FAILED DATA SAVE: {e}")
        if os.path.exists(tmp): os.remove(tmp)

def get_user_and_sid(data):
    u = next((u for u in data.get('users', []) if u.get('email', '').lower() == request.user_email), None)
    sid = u.get('schoolId', 'default') if u else 'default'
    return u, sid

def _gen_school_id(d):
    for _ in range(500):
        sid = secrets.token_hex(8)
        if sid not in d.get('schools', {}): return sid
    return str(int(time.time()))

def _gen_school_code(d):
    existing = {s.get('schoolCode') for s in d.get('schools', {}).values()}
    for _ in range(500):
        c = ''.join(secrets.choice('ABCDEFGHJKLMNPQRSTUVWXYZ23456789') for _ in range(6))
        if c not in existing: return c
    return secrets.token_hex(4).upper()

def new_school_config(name, code):
    return {
        "schoolName": name,
        "schoolCode": code,
        "schoolInfo": {"schoolName": name, "academicYear": "2024/2025", "term": "TERM 1", "termFee": 0},
        "feeConfig": {
            "CRECHE": 680, "NURSERY": 680, "KINDERGARTEN": 680,
            "BASIC 1": 700, "BASIC 2": 700, "BASIC 3": 700,
            "BASIC 4": 720, "BASIC 5": 720, "BASIC 6": 720,
            "BASIC 7": 900, "BASIC 8": 900, "BASIC 9": 900,
        },
        "settings": {},
        "currency": "GH₵",
        "allClasses": list(DEFAULT_CLASSES),
        "departments": {
            "PRESCHOOL I":    {"id": "p1",  "name": "PRESCHOOL I",    "level": 1},
            "PRESCHOOL II":   {"id": "p2",  "name": "PRESCHOOL II",   "level": 2},
            "LOWER PRIMARY":  {"id": "lp",  "name": "LOWER PRIMARY",  "level": 3},
            "UPPER PRIMARY":  {"id": "up",  "name": "UPPER PRIMARY",  "level": 4},
            "JHS":            {"id": "jhs", "name": "JHS",            "level": 5},
        },
        "reportTemplates": [],
        "attendance": {},
        "feedingConfig": {},
    }

# ============================================================
# AUTH ENDPOINTS
# ============================================================

@app.route('/api/auth/verify', methods=['GET', 'OPTIONS'])
def verify_session():
    """Called by the frontend on every page load to validate the stored token."""
    if request.method == 'OPTIONS': return '', 204
    h = request.headers.get('Authorization', '')
    t = h[7:] if h.startswith('Bearer ') else None
    if not t: return jsonify({"error": "Unauthorized"}), 401
    email = verify_token(t)
    if not email: return jsonify({"error": "Unauthorized"}), 401
    d = load_data()
    # Search all school user lists + legacy top-level list
    all_users = list(d.get('users', []))
    for s in d.get('schools', {}).values():
        all_users.extend(s.get('users', []))

    u = next((u for u in all_users if u.get('email', '').lower().strip() == email), None)
    if not u: return jsonify({"error": "Unauthorized"}), 401
    return jsonify({"success": True, "user": public_user(u)})
@app.route('/api/auth/login', methods=['POST', 'OPTIONS'])
def login():
    if request.method == 'OPTIONS': return '', 204
    c = request.get_json() or {}
    d = load_data()
    e = (c.get('email') or '').lower().strip()
    p = c.get('password')

    print(f"--- AUTH AUDIT: Login attempt for {e} ---")

    # 1. Find user by email or username
    u = next((u for u in d.get('users', []) if u.get('email', '').lower().strip() == e), None)
    if not u:
        for s in d.get('schools', {}).values():
            found = next((user for user in s.get('users', []) if user.get('email', '').lower().strip() == e), None)
            if found: u = found; break

    if not u:
        print(f"--- AUTH FAILED: User not found {e} ---")
        return jsonify({"error": "Account not found. Please register."}), 404

    # 2. Verify account is active
    if u.get('status', 'active').lower() in ('pending', 'pending_activation', 'disabled'):
        print(f"--- AUTH FAILED: Account {u.get('status')} for {e} ---")
        return jsonify({"error": f"Account {u.get('status')}. Contact administrator."}), 403

    # 3. Secure bcrypt comparison
    if not verify_password(p, u.get('password')):
        print(f"--- AUTH FAILED: Password mismatch for {e} ---")
        return jsonify({"error": "Incorrect password. Please try again."}), 401

    print(f"--- AUTH SUCCESS: {e} ---")
    token = make_token(e)
    return jsonify({
        "success": True, 
        "token": token, 
        "user": public_user(u)
    })

@app.route('/api/auth/register-institution', methods=['POST', 'OPTIONS'])
def register_institution():
    """Register a brand-new school. Admin starts as 'pending' (Gatekeeper system)."""
    if request.method == 'OPTIONS': return '', 204
    reg = request.get_json() or {}
    institution_name = (reg.get('institutionName') or '').strip()
    admin_name = (reg.get('adminName') or '').strip()
    email = (reg.get('adminEmail') or reg.get('email') or '').lower().strip()
    password = reg.get('password') or ''

    if not institution_name or not email or not password:
        return jsonify({"error": "Institution name, email and password are required"}), 400

    d = load_data()
    if any(u.get('email', '').lower().strip() == email for u in d.get('users', [])):
        return jsonify({"error": "An account with this email already exists"}), 400

    sid = _gen_school_id(d)
    code = _gen_school_code(d)
    
    admin = {
        "name": admin_name or "Admin",
        "email": email,
        "password": hash_password(password),
        "role": "ADMIN",
        "status": "pending",
        "schoolId": sid,
        "dateAdded": datetime.now().isoformat()
    }
    
    # Store in new multi-school structure
    d.setdefault('schools', {})[sid] = new_school_config(institution_name, code)
    d['schools'][sid]['users'] = [admin]
    d.setdefault('users', []).append(admin)
    
    save_data(d)
    
    # Final Verification: Read back from disk
    verify_d = load_data()
    if not any(u.get('email') == email for u in verify_d.get('users', [])):
        return jsonify({"error": "Critical: Database write failure"}), 500

    return jsonify({
        "success": True,
        "message": "Registration successful! Pending activation.",
        "schoolCode": code,
        "user": public_user(admin),
    }), 201

@app.route('/api/auth/signup', methods=['POST', 'OPTIONS'])
def signup():
    """Staff joining an existing school via its school code."""
    if request.method == 'OPTIONS': return '', 204
    reg = request.get_json() or {}
    email = (reg.get('email') or '').lower().strip()
    code = (reg.get('schoolCode') or '').strip().upper()
    role = (reg.get('role') or 'TEACHER').upper().strip()
    if role not in ('TEACHER', 'ACCOUNTANT'): role = 'TEACHER'

    if not email or not reg.get('password') or not code:
        return jsonify({"error": "Email, password and school code are required"}), 400

    d = load_data()
    sid = next((s for s, conf in d.get('schools', {}).items() if conf.get('schoolCode') == code), None)
    if not sid: return jsonify({"error": "Invalid school code. Ask your administrator for your institution's code."}), 400
    if any(u.get('email', '').lower().strip() == email for u in d.get('users', [])):
        return jsonify({"error": "An account with this email already exists"}), 400

    user = {
        "name": reg.get('name', 'Staff'),
        "email": email,
        "password": hash_password(reg.get('password')),
        "role": role,
        "assignedClass": reg.get('assignedClass', ''),
        "schoolId": sid,
        "status": "pending_activation",
        "dateAdded": datetime.now().isoformat()
    }
    
    d.setdefault('users', []).append(user)
    d.get('schools', {})[sid].setdefault('users', []).append(user)
    save_data(d)
    
    # Verification
    verify_d = load_data()
    check_u = next((u for u in verify_d.get('users', []) if u.get('email') == email), None)
    if not check_u or not check_u.get('password'):
        return jsonify({"error": "Critical: Data persistence failure. Account missing fields."}), 500

    return jsonify({"success": True}), 201

@app.route('/api/auth/request-password-reset', methods=['POST', 'OPTIONS'])
def request_password_reset():
    """Public reset request alias used by the React login screen."""
    if request.method == 'OPTIONS': return '', 204
    body = request.get_json() or {}
    email = (body.get('email') or '').lower().strip()
    if not email:
        return jsonify({"success": True, "message": "If this email is registered, a reset request has been recorded."})

    d = load_data()
    u = next((u for u in d.get('users', []) if u.get('email', '').lower().strip() == email), None)
    if u:
        u['password_recovery_requested'] = True
        save_data(d)
    return jsonify({"success": True, "message": "If this email is registered, a reset request has been recorded."})

@app.route('/api/auth/execute-password-reset', methods=['POST', 'OPTIONS'])
def execute_password_reset():
    """Reject public reset-token activation on this backend implementation."""
    if request.method == 'OPTIONS': return '', 204
    return jsonify({"error": "Password reset links are not enabled on this server. Contact your administrator."}), 400

@app.route('/api/auth/forgot-password', methods=['POST', 'OPTIONS'])
def forgot_password():
    """Lock the account and flag it for admin password reset."""
    if request.method == 'OPTIONS': return '', 204
    body = request.get_json() or {}
    email = (body.get('email') or '').lower().strip()
    if not email:
        return jsonify({"error": "Email is required"}), 400

    d = load_data()
    u = next((u for u in d.get('users', []) if u.get('email', '').lower().strip() == email), None)
    if u:
        u['password_recovery_requested'] = True
        save_data(d)

    # Always return 200 to avoid email enumeration
    return jsonify({"success": True, "message": "Recovery request submitted. Your account is now locked. Please contact your Administrator to reset your password."})

# ============================================================
# USER MANAGEMENT ENDPOINTS
# ============================================================

@app.route('/api/users/activate', methods=['POST', 'OPTIONS'])
@token_required
def activate_user():
    """Admin activates a pending user and sets their password."""
    if request.method == 'OPTIONS': return '', 204
    d = load_data()
    requester, sid = get_user_and_sid(d)
    if not requester or requester.get('role') != 'ADMIN':
        return jsonify({"error": "Forbidden: Only admins can activate users"}), 403

    body = request.get_json() or {}
    target_email = (body.get('email') or '').lower().strip()
    new_password = (body.get('newPassword') or '').strip()

    if not target_email or not new_password:
        return jsonify({"error": "Email and newPassword are required"}), 400

    # Superadmin can activate across any school (gatekeeper bypass)
    is_super = (requester.get('email','').lower().strip() in SUPERADMIN_EMAILS)
    if is_super:
        u = next((u for u in d.get('users', []) if u.get('email', '').lower().strip() == target_email), None)
        if not u: return jsonify({"error": "User not found"}), 404
        sid = u.get('schoolId','default')
    else:
        u = next((u for u in d.get('users', []) if u.get('email', '').lower().strip() == target_email and u.get('schoolId') == sid), None)
        if not u: return jsonify({"error": "User not found"}), 404

    new_hash = hash_password(new_password)
    u['status'] = 'active'
    u['password'] = new_hash
    u['password_recovery_requested'] = False

    # Keep the school-level copy in sync
    school = d.get('schools', {}).get(sid, {})
    for su in school.get('users', []):
        if su.get('email', '').lower().strip() == target_email:
            su['status'] = 'active'
            su['password'] = new_hash
            su['password_recovery_requested'] = False

    save_data(d)
    return jsonify({"success": True, "user": public_user(u)})

@app.route('/api/users/delete/<path:user_email>', methods=['DELETE', 'OPTIONS'])
@token_required
def delete_user(user_email):
    """Admin deletes a user account."""
    if request.method == 'OPTIONS': return '', 204
    d = load_data()
    requester, sid = get_user_and_sid(d)
    if not requester or requester.get('role') != 'ADMIN':
        return jsonify({"error": "Forbidden"}), 403
    target_email = (user_email or '').lower().strip()
    original_len = len(d.get('users', []))
    d['users'] = [u for u in d.get('users', []) if not (
        u.get('email', '').lower().strip() == target_email and u.get('schoolId') == sid
    )]
    if len(d['users']) == original_len:
        return jsonify({"error": "User not found"}), 404
    # Also remove from the school-level copy
    school = d.get('schools', {}).get(sid, {})
    if 'users' in school:
        school['users'] = [u for u in school['users'] if u.get('email', '').lower().strip() != target_email]
    save_data(d)
    return jsonify({"success": True})

@app.route('/api/users/reset-password', methods=['POST', 'OPTIONS'])
@token_required
def reset_user_password():
    """Admin resets a user's password and clears any recovery lock."""
    if request.method == 'OPTIONS': return '', 204
    d = load_data()
    requester, sid = get_user_and_sid(d)
    if not requester or requester.get('role') != 'ADMIN':
        return jsonify({"error": "Forbidden"}), 403

    body = request.get_json() or {}
    target_email = (body.get('email') or '').lower().strip()
    new_password = (body.get('newPassword') or '').strip()
    if not target_email or not new_password:
        return jsonify({"error": "Email and newPassword are required"}), 400

    u = next((u for u in d.get('users', []) if u.get('email', '').lower().strip() == target_email and u.get('schoolId') == sid), None)
    if not u: return jsonify({"error": "User not found"}), 404

    new_hash = hash_password(new_password)
    u['password'] = new_hash
    u['password_recovery_requested'] = False
    u['status'] = 'active'

    # Keep the school-level copy in sync
    school = d.get('schools', {}).get(sid, {})
    for su in school.get('users', []):
        if su.get('email', '').lower().strip() == target_email:
            su['password'] = new_hash
            su['password_recovery_requested'] = False
            su['status'] = 'active'

    save_data(d)
    return jsonify({"success": True})

# ============================================================
# MAIN DATA SYNC
# ============================================================

@app.route('/api/data', methods=['GET'])
@token_required
def get_all():
    d = load_data()
    u, sid = get_user_and_sid(d)
    if sid not in d['schools']: d['schools'][sid] = {}
    s = d['schools'][sid]
    r = {k: s.get(k, {} if k in ['schoolInfo','feeConfig','settings','departments','feedingConfig'] else [])
         for k in ['schoolInfo','feeConfig','settings','currency','allClasses','departments','feedingConfig','reportTemplates','attendance']}
    for k in ['students','payments','reports','staff','expenditures','deleted','activity_log','studentReports']:
        r[k] = [i for i in d.get(k, []) if i.get('schoolId') == sid]
    # Superadmin sees pending users across all schools (gatekeeper)
    if (u or {}).get('email','').lower().strip() in SUPERADMIN_EMAILS:
        r['users'] = [public_user(usr) for usr in d.get('users', [])]
    else:
        r['users'] = [public_user(usr) for usr in d.get('users', []) if usr.get('schoolId') == sid]
    return jsonify(r)

@app.route('/api/data/<collection>', methods=['POST', 'OPTIONS'])
@app.route('/api/data/<collection>/<action>', methods=['POST', 'OPTIONS'])
@app.route('/api/data/<collection>/<action>/<item_id>', methods=['POST', 'DELETE', 'OPTIONS'])
@token_required
def sync(collection, action=None, item_id=None):
    if request.method == 'OPTIONS': return '', 204
    d = load_data()
    u, sid = get_user_and_sid(d)
    body = request.get_json()

    if collection == 'payments' and (not u or u.get('role') not in ('ADMIN', 'ACCOUNTANT')):
        return jsonify({"error": "Forbidden: insufficient role"}), 403

    if collection in ['schoolInfo','feeConfig','settings','currency','allClasses','departments','feedingConfig','reportTemplates','attendance']:
        if sid not in d['schools']: d['schools'][sid] = {}
        d['schools'][sid][collection] = body
    else:
        if collection not in d: d[collection] = []
        if action == 'add':
            body['schoolId'] = sid
            if not any(str(i.get('id')) == str(body.get('id')) for i in d[collection]):
                d[collection].append(body)
        elif action == 'delete' or request.method == 'DELETE':
            d[collection] = [i for i in d[collection] if not (
                i.get('schoolId') == sid and (
                    str(i.get('id')) == str(item_id) or str(i.get('sid')) == str(item_id)
                )
            )]
        else:
            other = [i for i in d[collection] if i.get('schoolId') != sid]
            if isinstance(body, list):
                for i in body: i['schoolId'] = sid

                if collection == 'users':
                    # CRITICAL: The frontend strips passwords (via public_user).
                    # Merge incoming user data with the stored record, preserving
                    # the server-side password, status, and role so they are never wiped.
                    existing_map = {
                        u.get('email', '').lower().strip(): u
                        for u in d[collection] if u.get('schoolId') == sid
                    }
                    merged = []
                    for incoming in body:
                        email_key = incoming.get('email', '').lower().strip()
                        stored = existing_map.get(email_key, {})
                        merged_user = {**incoming}
                        # Always keep the authoritative server-side fields
                        if stored.get('password'):
                            merged_user['password'] = stored['password']
                        if stored.get('status'):
                            merged_user['status'] = stored['status']
                        if stored.get('role'):
                            merged_user['role'] = stored['role']
                        merged.append(merged_user)
                    # Guard: never wipe all users with an empty sync
                    if merged or not existing_map:
                        d[collection] = other + merged
                    else:
                        print(f"GUARD: Rejected empty users sync for school {sid}")
                else:
                    # Mass-delete guard: reject if incoming shrinks data by >50%
                    current_count = len([i for i in d[collection] if i.get('schoolId') == sid])
                    if current_count > 2 and len(body) < current_count * 0.5:
                        print(f"GUARD: Rejected suspicious bulk sync '{collection}': {len(body)} vs {current_count}")
                        return jsonify({"success": True, "warning": "Suspicious sync rejected"}), 200
                    d[collection] = other + body
            elif isinstance(body, dict):
                body['schoolId'] = sid
                d[collection] = other + [body]
    save_data(d)
    return jsonify({"success": True})

# ============================================================
# MISSING ENDPOINTS FOR frontend AccessManagementExtras (avoid 404 HTML)
# ============================================================

@app.route('/api/invitations', methods=['GET', 'POST', 'OPTIONS'])
@app.route('/api/invitations/<path:subpath>', methods=['GET', 'POST', 'OPTIONS'])
@token_required
def invitations_stub(subpath=None):
    if request.method == 'OPTIONS': return '', 204
    if request.method == 'GET': return jsonify({"items": []})
    # POST create stub — frontend expects {invitation, token}
    body=request.get_json() or {}
    return jsonify({"invitation": {"id": "inv-stub", "email": body.get('email',''), "role": body.get('role','TEACHER'), "status": "pending"}, "token": "stub"})

@app.route('/api/audit', methods=['GET', 'OPTIONS'])
@app.route('/api/audit/<path:subpath>', methods=['GET', 'OPTIONS'])
@token_required
def audit_stub(subpath=None):
    if request.method == 'OPTIONS': return '', 204
    return jsonify({"items": []})

# ============================================================
# FILE UPLOAD
# ============================================================

@app.route('/api/upload', methods=['POST'])
@token_required
def upload():
    if 'file' not in request.files: return jsonify({"error": "No file provided"}), 400
    file = request.files['file']
    filename = f"{int(time.time())}_{file.filename}"
    file.save(os.path.join(UPLOADS_DIR, filename))
    return jsonify({"success": True, "url": f"/api/uploads/{filename}"})

@app.route('/api/uploads/<f>')
def upload_serve(f): return send_from_directory(UPLOADS_DIR, f)

# ============================================================
# STATIC FILE SERVING (SPA) - Skip on Vercel (handled by Vercel CDN)
# ============================================================

if not os.environ.get('VERCEL') and os.path.exists(os.path.join(DIST_DIR, 'index.html')):
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve(path):
        if path.startswith('api/'): return jsonify({"error": "Not Found"}), 404
        if path and os.path.exists(os.path.join(DIST_DIR, path)):
            return send_from_directory(DIST_DIR, path)
        try:
            return send_file(os.path.join(DIST_DIR, 'index.html'))
        except FileNotFoundError:
            return jsonify({"error": "Frontend not built on this service — use the Static Site URL"}), 404

if __name__ == '__main__':
    app.run(port=8080, debug=False)
