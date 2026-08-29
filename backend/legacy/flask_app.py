from flask import Flask, request, jsonify, send_from_directory, send_file
import json
import os
import requests
import smtplib
import random
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from functools import wraps
from datetime import datetime, timedelta
import jwt
from threading import RLock
import time
import bcrypt
import logging
import tempfile
from logging.handlers import RotatingFileHandler

app = Flask(__name__)
application = app  # PythonAnywhere WSGI entry point

# Global reentrant lock for safe nested data access
data_lock = RLock()

@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization,X-User-Role,X-Assigned-Class'
    response.headers['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS,PUT,DELETE'
    return response

BASE_DIR = os.path.dirname(__file__)
DATA_FILE = os.path.join(BASE_DIR, 'data.json')
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
DIST_DIR = os.path.join(os.path.dirname(BASE_DIR), 'frontend', 'dist')
SECRET_KEY = os.environ.get('SECRET_KEY', 'ZYMERA-ERP-SECRET-2026')
AUTH_TOKEN = "TSA-SECURE-ACCESS-2026" # Legacy fallback

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

DEFAULT_DATA = {
    "students": [
        { 
            "id": "1", "sid": "2026-STU001", "name": "ALICE JOHNSON", "class": "BASIC 6 A", 
            "contact": "123-456-7890", "gender": "F", "prevArrears": 0,
            "discountType": "none", "discountValue": 0
        },
        { 
            "id": "2", "sid": "2027-STU002", "name": "BOB SMITH", "class": "BASIC 8", 
            "contact": "098-765-4321", "gender": "M", "prevArrears": 500,
            "discountType": "none", "discountValue": 0
        }
    ],
    "payments": [],
    "deleted": [],
    "reports": [],
    "users": [{ "email": "admin@school.com", "password": "password123", "name": "Admin User" }],
    "currency": "GH₵",
    "feeConfig": {
        "CRECHE": 680, "NURSERY 1A": 680, "NURSERY 1B": 680, "NURSERY 2A": 680, "NURSERY 2B": 680,
        "KG1A": 680, "KG1B": 680, "KG2A": 680, "KG2B": 680,
        "BASIC 1": 700, "BASIC 2": 700, "BASIC 3": 700,
        "BASIC 4": 720, "BASIC 5": 720, "BASIC 6": 720,
        "BASIC 7": 900, "BASIC 8": 900, "BASIC 9": 900
    },
    "departments": {
        "PRESCHOOL": ["CRECHE", "NURSERY 1A", "NURSERY 1B", "NURSERY 2A", "NURSERY 2B", "KG1A", "KG1B", "KG2A", "KG2B"],
        "LOWER PRIMARY": ["BASIC 1", "BASIC 2", "BASIC 3"],
        "UPPER PRIMARY": ["BASIC 4", "BASIC 5", "BASIC 6"],
        "JHS": ["BASIC 7", "BASIC 8", "BASIC 9"]
    },
    "schoolInfo": {
        "schoolName": "TRUE STAR MONTESSORI SCHOOL",
        "termFee": 1000,
        "academicYear": "2024/2025",
        "term": "TERM 1",
        "logoUrl": "",
        "backgroundUrl": ""
    },
    "reportTemplates": [],
    "studentReports": []
}

def load_data_internal():
    if not os.path.exists(DATA_FILE):
        save_data(DEFAULT_DATA)
        return DEFAULT_DATA
    with open(DATA_FILE, 'r') as f:
        data = json.load(f)
        # Ensure all keys exist
        changed = False
        for key in DEFAULT_DATA:
            if key not in data:
                data[key] = DEFAULT_DATA[key]
                changed = True
        
        # Specific hardening for departments
        if "departments" not in data or not data["departments"]:
             data["departments"] = DEFAULT_DATA["departments"]
             changed = True
             
        if changed:
            save_data(data)
        return data

def save_data(data):
    with open(DATA_FILE, 'w') as f:
        json.dump(data, f, indent=2)

# ── Email Notification Helper ─────────────────────────────────────────────────
# Uses Gmail SMTP. Set SMTP_USER and SMTP_PASS as environment variables on
# PythonAnywhere (or fallback to the values below for testing).
SMTP_USER = os.environ.get('SMTP_USER', 'truestarmontessorischool@gmail.com')
SMTP_PASS = os.environ.get('SMTP_PASS', '')  # Set this in PythonAnywhere env vars
ADMIN_EMAIL = os.environ.get('ADMIN_EMAIL', 'truestarmontessorischool@gmail.com')

def send_email(to, subject, body):
    """Send a notification email. Silently fails if SMTP is not configured."""
    if not SMTP_PASS:
        print(f"[EMAIL SKIPPED - no SMTP_PASS] To: {to} | Subject: {subject}")
        return
    try:
        msg = MIMEMultipart()
        msg['From'] = SMTP_USER
        msg['To'] = to
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'html'))
        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as server:
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_USER, to, msg.as_string())
        print(f"[EMAIL SENT] To: {to} | Subject: {subject}")
    except Exception as e:
        print(f"[EMAIL FAILED] {e}")

def send_admin_email(subject, body):
    send_email(ADMIN_EMAIL, subject, body)

# ── Logging & Monitoring ──────────────────────────────────────────────────
LOG_FILE = os.path.join(BASE_DIR, 'system_audit.log')
logger = logging.getLogger('ERP-SaaS')
logger.setLevel(logging.INFO)
handler = RotatingFileHandler(LOG_FILE, maxBytes=10*1024*1024, backupCount=5)
formatter = logging.Formatter('%(asctime)s - [%(levelname)s] - %(message)s')
handler.setFormatter(formatter)
logger.addHandler(handler)

def load_data():
    with data_lock:
        return load_data_internal()

def save_data(data):
    """Atomic write operation to prevent data corruption during crashes."""
    with data_lock:
        # 1. Create a temporary file in the same directory as DATA_FILE
        # Using tempfile ensures uniqueness and security
        fd, temp_path = tempfile.mkstemp(dir=os.path.dirname(DATA_FILE), prefix='data_tmp_')
        try:
            with os.fdopen(fd, 'w') as f:
                json.dump(data, f, indent=2)
            # 2. Atomic replacement (safe on Unix systems)
            os.replace(temp_path, DATA_FILE)
            logger.info("Database synchronized atomically.")
        except Exception as e:
            if os.path.exists(temp_path):
                os.remove(temp_path)
            logger.error(f"DATABASE WRITE FAILURE: {e}")
            raise e

def update_data_atomic(collection, new_content):
    """Update a specific collection atomically and safely."""
    with data_lock:
        data = load_data_internal()
        data[collection] = new_content
        save_data(data) # Uses the atomic save_data with lock and tempfile
        return True

def hash_password(password):
    if not password: return ""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def check_password(password, hashed):
    if not password or not hashed: return False
    try:
        # Try as bcrypt
        return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        # Fallback to plain text for legacy accounts
        return password == hashed

def decode_token(token):
    try:
        if token.startswith('Bearer '):
            token = token.split(' ')[1]
        return jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
    except Exception as e:
        print(f"[JWT ERROR] {e}")
        return None

def check_auth():
    auth_header = request.headers.get('Authorization')
    if not auth_header:
        return False
    # Backward compatibility with legacy AUTH_TOKEN
    if auth_header == f"Bearer {AUTH_TOKEN}":
        return True
    return decode_token(auth_header) is not None

def get_school_context():
    """Helper to get the current school ID from request context (set by token_required)."""
    if hasattr(request, 'user') and request.user:
        return request.user.get('schoolId', 'UNKNOWN_SCHOOL')
    # Fallback to header for legacy/testing only if explicitly allowed, 
    # but for production production hardening we return a non-matching ID by default.
    return request.headers.get('X-School-Id', 'UNKNOWN_SCHOOL')

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if request.method == 'OPTIONS':
            return f(*args, **kwargs)
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            return jsonify({"error": "Unauthorized: No token provided"}), 401
        
        # Legacy static token bypass
        if auth_header == f"Bearer {AUTH_TOKEN}":
            return f(*args, **kwargs)
            
        decoded = decode_token(auth_header)
        if not decoded:
            return jsonify({"error": "Unauthorized: Invalid or expired token"}), 401
        
        # Attach user data to request context if needed
        request.user = decoded
        return f(*args, **kwargs)
    return decorated

@app.route('/api/calculate-fee', methods=['POST', 'OPTIONS'])
def calculate_fee():
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    if not check_auth():
        return jsonify({"error": "Unauthorized"}), 401
    
    student = request.get_json()
    data = load_data()
    fee_config = data.get('feeConfig', {})
    
    cls = (student.get('class') or '').upper()
    original_fee = 1000
    for key, fee in fee_config.items():
        if key in cls:
            original_fee = fee
            break
            
    discount_type = student.get('discountType', 'none')
    prev_arrears = float(student.get('prevArrears') or 0)
    
    current_fee = original_fee
    total_due = 0
    
    if discount_type == 'full':
        current_fee = 0
        total_due = 0
    elif discount_type == 'partial':
        current_fee = original_fee / 2
        total_due = current_fee + prev_arrears
    else:
        current_fee = original_fee
        total_due = current_fee + prev_arrears
        
    return jsonify({
        "originalFee": original_fee,
        "currentFee": current_fee,
        "totalDue": total_due,
        "prevArrears": prev_arrears
    }), 200



def get_request_role():
    """Extract and normalize the user role from the request header or JWT."""
    # Priority 1: role set by @token_required decorator
    if hasattr(request, 'user') and request.user:
        return request.user.get('role', 'TEACHER').upper()
    # Priority 2: decode JWT directly from Authorization header
    auth_header = request.headers.get('Authorization', '')
    if auth_header:
        if auth_header == f"Bearer {AUTH_TOKEN}":
            return 'ADMIN'
        decoded = decode_token(auth_header)
        if decoded:
            return decoded.get('role', 'TEACHER').upper()
    # Priority 3: fallback to X-User-Role header
    return request.headers.get('X-User-Role', 'TEACHER').upper()

def require_role(*allowed_roles):
    """Decorator: returns 403 if the requester's role is not in allowed_roles."""
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if request.method == 'OPTIONS':
                return f(*args, **kwargs)
            if not check_auth():
                return jsonify({"error": "Unauthorized"}), 401
            role = get_request_role()
            if role not in [r.upper() for r in allowed_roles]:
                return jsonify({"error": f"Forbidden: {role} role cannot access this resource"}), 403
            return f(*args, **kwargs)
        return decorated
    return decorator

# ── API Routes ────────────────────────────────────────────────────────────────

@app.route('/api/auth/login', methods=['POST', 'OPTIONS'])
def login():
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    credentials = request.get_json()
    email = credentials.get('email', '').lower().strip()
    password = credentials.get('password')
    data = load_data()
    # Find user by email only first (to check lock status before password)
    user_by_email = next((u for u in data['users']
                 if u['email'].lower().strip() == email), None)

    # Check if account is locked/pending recovery before validating password
    if user_by_email:
        if user_by_email.get('password_recovery_requested') == True:
            return jsonify({"error": "Account is locked. A password recovery request is pending. Please contact your Administrator to reset your password."}), 403
        if user_by_email.get('status') == 'pending_activation':
            return jsonify({"error": "Your account is pending activation. Please contact your Administrator."}), 403

    user = next((u for u in data['users']
                 if u['email'].lower().strip() == email), None)

    if user and check_password(password, user.get('password')):
        # Generate JWT
        token = jwt.encode({
            'email': user['email'],
            'role': user.get('role', 'TEACHER'),
            'name': user.get('name', 'User'),
            'assignedClass': user.get('assignedClass', ''),
            'schoolId': user.get('schoolId', 'default'),
            'exp': datetime.utcnow() + timedelta(days=7) # 7-day session
        }, SECRET_KEY, algorithm='HS256')

        # Record login time atomically
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        with data_lock:
            # Re-load inside lock to be safe
            with open(DATA_FILE, 'r') as f:
                current_data = json.load(f)
            current_data['activity_log'] = current_data.get('activity_log', [])
            current_data['activity_log'].append({
                'type': 'LOGIN',
                'email': user['email'],
                'name': user.get('name', 'Unknown'),
                'time': timestamp
            })
            with open(DATA_FILE, 'w') as f:
                json.dump(current_data, f, indent=2)

        return jsonify({
            "success": True, 
            "token": token, 
            "user": {
                "email": user['email'],
                "name": user.get('name', 'User'),
                "role": user.get('role', 'TEACHER'),
                "assignedClass": user.get('assignedClass', '')
            }
        }), 200
    return jsonify({"error": "Invalid credentials"}), 401

@app.route('/api/auth/verify', methods=['GET', 'OPTIONS'])
def verify_token():
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    auth_header = request.headers.get('Authorization')
    if not auth_header:
        return jsonify({"error": "No token"}), 401
    
    decoded = decode_token(auth_header)
    if decoded:
        return jsonify({"success": True, "user": decoded}), 200
    return jsonify({"error": "Invalid token"}), 401

@app.route('/api/auth/request-verification', methods=['POST', 'OPTIONS'])
def request_verification():
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    req = request.get_json()
    email = req.get('email', '').lower().strip()
    if not email:
        return jsonify({"error": "Email is required"}), 400
    
    code = str(random.randint(1000, 9999))
    with data_lock:
        with open(DATA_FILE, 'r') as f:
            current_data = json.load(f)
        if 'verifications' not in current_data:
            current_data['verifications'] = {}
        current_data['verifications'][email] = code
        with open(DATA_FILE, 'w') as f:
            json.dump(current_data, f, indent=2)
    
    subject = "[ERP] Your 4-Digit Verification Code"
    body = f"""
    <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #7e22ce;">Verification Code</h2>
        <p>You are signing up for the School ERP System. Please use the code below to verify your email:</p>
        <div style="font-size: 32px; font-weight: 800; letter-spacing: 5px; color: #7e22ce; margin: 20px 0;">
            {code}
        </div>
        <p style="font-size: 12px; color: #666;">If you did not request this code, please ignore this email.</p>
    </div>
    """
    send_email(email, subject, body)
    return jsonify({"success": True, "code": code}), 200

@app.route('/api/auth/signup', methods=['POST', 'OPTIONS'])
def signup():
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    user_data = request.get_json()
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    
    email = user_data.get('email', '').lower().strip()
    code = str(user_data.get('verificationCode', ''))
    
    with data_lock:
        with open(DATA_FILE, 'r') as f:
            current_data = json.load(f)
            
        if any(u['email'].lower().strip() == email for u in current_data['users']):
             return jsonify({"error": "Email already exists"}), 400

        # Verify code
        saved_code = current_data.get('verifications', {}).get(email)
        if not saved_code or saved_code != code:
            return jsonify({"error": "Invalid verification code"}), 400

        # Admin Key Check
        if user_data.get('role') == 'ADMIN':
            if user_data.get('adminKey') != "Zymera@15":
                return jsonify({"error": "Invalid Admin Verification Key"}), 403

        role = user_data.get('role', 'TEACHER').upper().strip()
        status = 'active' if role == 'ADMIN' else 'pending_activation'

        current_data['users'].append({
            "name": user_data.get('name', 'New User'),
            "email": email,
            "password": hash_password(user_data.get('password')),
            "role": role,
            "assignedClass": user_data.get('assignedClass', ''),
            "status": status,
            "password_recovery_requested": False
        })
        
        # Remove used code
        if email in current_data.get('verifications', {}):
            del current_data['verifications'][email]

        # Log signup event
        current_data['activity_log'] = current_data.get('activity_log', [])
        current_data['activity_log'].append({
            'type': 'SIGNUP',
            'email': email,
            'name': user_data.get('name', 'New User'),
            'time': timestamp
        })
        with open(DATA_FILE, 'w') as f:
            json.dump(current_data, f, indent=2)
    
    # Email admin
    subject = f"[ERP ALERT] New Account Created - {user_data.get('name', 'Unknown')}"
    body = f"""
    <h3>New Account Registration</h3>
    <p>A new user has signed up on the School ERP system.</p>
    <table border="1" cellpadding="6" style="border-collapse:collapse;">
      <tr><td><b>Name</b></td><td>{user_data.get('name', 'N/A')}</td></tr>
      <tr><td><b>Email</b></td><td>{user_data.get('email', 'N/A')}</td></tr>
      <tr><td><b>Time</b></td><td>{timestamp}</td></tr>
    </table>
    <p style="color:orange;"><b>Please review this account and revoke access if unauthorized.</b></p>
    """
    send_admin_email(subject, body)
    
    return jsonify({"success": True}), 201

@app.route('/api/auth/logout-log', methods=['POST', 'OPTIONS'])
def logout_log():
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    if not check_auth():
        return jsonify({"error": "Unauthorized"}), 401
    body = request.get_json() or {}
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    
    with data_lock:
        with open(DATA_FILE, 'r') as f:
            current_data = json.load(f)
        current_data['activity_log'] = current_data.get('activity_log', [])
        current_data['activity_log'].append({
            'type': 'LOGOUT',
            'email': body.get('email', 'unknown'),
            'name': body.get('name', 'Unknown'),
            'time': timestamp
        })
        with open(DATA_FILE, 'w') as f:
            json.dump(current_data, f, indent=2)
    return jsonify({"success": True}), 200

@app.route('/api/auth/forgot-password', methods=['POST', 'OPTIONS'])
def forgot_password():
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    body = request.get_json() or {}
    email = body.get('email', '').lower().strip()
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    if not email:
        return jsonify({"error": "Email is required"}), 400

    with data_lock:
        with open(DATA_FILE, 'r') as f:
            current_data = json.load(f)

        user = next((u for u in current_data.get('users', [])
                     if u['email'].lower().strip() == email), None)

        if not user:
            # Return success anyway to avoid email enumeration
            return jsonify({"success": True, "message": "If that email exists, a recovery request has been sent."}), 200

        # Mark account as recovery-requested
        for i, u in enumerate(current_data['users']):
            if u['email'].lower().strip() == email:
                current_data['users'][i]['password_recovery_requested'] = True
                break

        # Log the recovery request
        current_data['activity_log'] = current_data.get('activity_log', [])
        current_data['activity_log'].append({
            'type': 'PASSWORD_RECOVERY',
            'email': email,
            'name': user.get('name', 'Unknown'),
            'time': timestamp
        })

        with open(DATA_FILE, 'w') as f:
            json.dump(current_data, f, indent=2)

    # Notify admin
    subject = f"[ERP ALERT] Password Recovery Request - {user.get('name', email)}"
    body_html = f"""
    <h3 style="color:#dc2626;">Password Recovery Request</h3>
    <p>A user has requested a password reset on the School ERP system.</p>
    <table border="1" cellpadding="6" style="border-collapse:collapse;">
      <tr><td><b>Name</b></td><td>{user.get('name', 'N/A')}</td></tr>
      <tr><td><b>Email</b></td><td>{email}</td></tr>
      <tr><td><b>Role</b></td><td>{user.get('role', 'N/A')}</td></tr>
      <tr><td><b>Time</b></td><td>{timestamp}</td></tr>
    </table>
    <p style="color:orange;"><b>Their account has been locked. Please go to System Access &rarr; Pending Activations to reset their password and re-activate their account.</b></p>
    """
    send_admin_email(subject, body_html)

    return jsonify({"success": True, "message": "Recovery request submitted. Your account is now locked. Please contact your Administrator to reset your password."}), 200


@app.route('/api/users/activate', methods=['POST', 'OPTIONS'])
@token_required
@require_role('ADMIN')
def activate_user():
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    body = request.get_json() or {}
    email = body.get('email', '').lower().strip()
    new_password = body.get('newPassword', '').strip()
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    if not email or not new_password:
        return jsonify({"error": "Email and newPassword are required"}), 400

    with data_lock:
        with open(DATA_FILE, 'r') as f:
            current_data = json.load(f)

        found = False
        for i, u in enumerate(current_data['users']):
            if u['email'].lower().strip() == email:
                current_data['users'][i]['password'] = hash_password(new_password)
                current_data['users'][i]['password_recovery_requested'] = False
                current_data['users'][i]['status'] = 'active'
                found = True
                break

        if not found:
            return jsonify({"error": "User not found"}), 404

        # Log the activation
        current_data['activity_log'] = current_data.get('activity_log', [])
        current_data['activity_log'].append({
            'type': 'ACCOUNT_ACTIVATED',
            'email': email,
            'time': timestamp
        })

        with open(DATA_FILE, 'w') as f:
            json.dump(current_data, f, indent=2)

    return jsonify({"success": True}), 200



@app.route('/api/activity-log', methods=['GET'])
@token_required
def get_activity_log():
    data = load_data()
    log = data.get('activity_log', [])
    # Return newest first
    return jsonify(list(reversed(log[-200:]))), 200

@app.route('/api/send-sms', methods=['POST', 'OPTIONS'])
def send_sms():
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    
    # Load persistent config for fallbacks
    app_data = load_data()
    school_info = app_data.get('schoolInfo', {})

    # Africa's Talking Config
    AT_USERNAME = sms_data.get('atUsername') or school_info.get('atUsername') or os.environ.get('AT_USERNAME', 'sandbox')
    AT_API_KEY  = sms_data.get('atApiKey') or school_info.get('atApiKey') or os.environ.get('AT_API_KEY', 'atsk_2fd62c02d40a56ccd80dabc24e1cea2cd56d6e688ba1e57dea6b62967a1c76ab555f3d63')
    
    if not phone or not message:
        return jsonify({"error": "Phone and message required"}), 400
        
    try:
        url = "https://api.africastalking.com/version1/messaging"
        if AT_USERNAME.lower() == 'sandbox':
            url = "https://api.sandbox.africastalking.com/version1/messaging"
            
        headers = {
            "apiKey": AT_API_KEY,
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded"
        }
        payload = {
            "username": AT_USERNAME,
            "to": phone,
            "message": message
        }
        response = requests.post(url, data=payload, headers=headers, timeout=10)
        resp_json = {}
        try:
            resp_json = response.json()
        except:
            return jsonify({"error": "Provider returned non-JSON", "details": response.text[:300]}), 500
        
        # Africa's Talking returns 201 on success
        if response.status_code in [200, 201]:
            # Check for delivery errors inside payload
            entries = resp_json.get('SMSMessageData', {}).get('Recipients', [])
            if entries and entries[0].get('status') not in ['Success', 'Queued']:
                return jsonify({"error": f"AT Error: {entries[0].get('status')}", "details": resp_json}), 400
            return jsonify({"success": True, "provider": "africastalking", "data": resp_json}), 200
        else:
            return jsonify({"error": "AT API Error", "status": response.status_code, "details": resp_json}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/send-sms-hubtel', methods=['POST', 'OPTIONS'])
def send_sms_hubtel():
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    
    sms_data = request.get_json()
    phone   = sms_data.get('phone', '')
    message = sms_data.get('message', '')

    if not phone or not message:
        return jsonify({"error": "Phone and message required"}), 400

    # Load persistent config for fallbacks
    app_data = load_data()
    school_info = app_data.get('schoolInfo', {})

    # Dynamic Hubtel Config
    CLIENT_ID = sms_data.get('hubtelClientId') or school_info.get('hubtelClientId') or os.environ.get('HUBTEL_CLIENT_ID', '')
    CLIENT_SECRET = sms_data.get('hubtelClientSecret') or school_info.get('hubtelClientSecret') or os.environ.get('HUBTEL_CLIENT_SECRET', '')
    SENDER_ID = school_info.get('hubtelSenderId') or os.environ.get('HUBTEL_SENDER_ID', 'TrueStar')

    if not CLIENT_ID or not CLIENT_SECRET:
        return jsonify({"error": "Hubtel credentials not configured. Please enter them in Settings."}), 400

    # Normalise phone (e.g. "+ 233 597..." -> "059...")
    phone_clean = phone.replace(' ', '').replace('+233', '0')
    if phone_clean.startswith('233'):
        phone_clean = '0' + phone_clean[3:]
    normalised = phone_clean

    try:
        # Use the account-specific Hubtel API endpoint
        url = "https://devp-sms03726-api.hubtel.com/v1/messages/send"
        params = {
            "clientid": CLIENT_ID,
            "clientsecret": CLIENT_SECRET,
            "from": SENDER_ID,
            "to": normalised,
            "content": message
        }
        response = requests.get(url, params=params, timeout=10)
        resp_json = {}
        try:
            resp_json = response.json()
        except:
            return jsonify({"error": "Hubtel returned non-JSON", "details": response.text[:300]}), 500

        if response.status_code == 200 and resp_json.get('status') == 0:
            return jsonify({"success": True, "provider": "hubtel", "data": resp_json}), 200
        else:
            return jsonify({"error": "Hubtel Error", "details": resp_json}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/send-sms-arkesel', methods=['POST', 'OPTIONS'])
def send_sms_arkesel():
    if request.method == 'OPTIONS':
        return jsonify({}), 200

    sms_data = request.get_json()
    phone_input = (sms_data.get('phone') or '').replace(' ', '').replace('+233', '0')
    if phone_input.startswith('233'):
        phone_input = '0' + phone_input[3:]
    phone = phone_input
    message = sms_data.get('message', '')

    if not phone or not message:
        return jsonify({"error": "Phone and message required"}), 400

    # Load persistent config for fallbacks
    app_data = load_data()
    school_info = app_data.get('schoolInfo', {})

    # Dynamic Arkesel Config
    ARKESEL_API_KEY = sms_data.get('arkeselApiKey') or school_info.get('arkeselApiKey') or os.environ.get('ARKESEL_API_KEY', 'UHZFa1NBTWJrUFVNd0lRUklmYkI')
    ARKESEL_SENDER  = sms_data.get('arkeselSender') or school_info.get('arkeselSender') or os.environ.get('ARKESEL_SENDER', 'Arkesel')

    if not ARKESEL_API_KEY:
        return jsonify({"error": "Arkesel API key not configured. Please enter it in Settings."}), 400

    try:
        url = "https://sms.arkesel.com/sms/api"
        params = {
            "action": "send-sms",
            "api_key": ARKESEL_API_KEY,
            "to": phone,
            "from": ARKESEL_SENDER,
            "sms": message
        }
        response = requests.get(url, params=params, timeout=10)
        resp_json = {}
        try:
            resp_json = response.json()
        except:
            return jsonify({"error": "Arkesel non-JSON response", "details": response.text[:300]}), 500

        # Arkesel returns {"status":"ok"} on success
        if resp_json.get('status') == 'ok':
            return jsonify({"success": True, "provider": "arkesel", "data": resp_json}), 200
        else:
            return jsonify({"error": "Arkesel Error", "details": resp_json}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/data', methods=['GET', 'OPTIONS'])
def get_data():
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    if not check_auth():
        return jsonify({"error": "Unauthorized"}), 401

    role = get_request_role()
    data = load_data()
    school_id = getattr(request, 'user', {}).get('schoolId', 'default')

    # If in SaaS mode (not 'default'), we should filter the data.
    if school_id != 'default':
        filtered = {}
        for key, value in data.items():
            if isinstance(value, list):
                filtered[key] = [item for item in value if isinstance(item, dict) and item.get('schoolId', 'default') == school_id]
            else:
                filtered[key] = value
        data = filtered

    # For non-admin roles, filter sensitive collections
    if role not in ['ADMIN']:
        assigned_class = request.headers.get('X-Assigned-Class', '').strip().upper()

        # Filter students to only assigned class
        if assigned_class:
            data['students'] = [
                s for s in data.get('students', [])
                if (s.get('class') or '').upper().replace(' ', '') == assigned_class.replace(' ', '')
            ]
        else:
            data['students'] = []

        # Filter payments to only students in their class
        class_student_ids = {s.get('sid') for s in data['students']}
        data['payments'] = [
            p for p in data.get('payments', [])
            if p.get('studentSid') in class_student_ids
        ]

        # Filter reports to only students in their class
        data['reports'] = [
            r for r in data.get('reports', [])
            if r.get('studentClass', '').upper().replace(' ', '') == assigned_class.replace(' ', '')
        ] if assigned_class else []

        # Wipe admin-only collections
        data['users'] = []
        data['staff'] = []
        data['deleted'] = []
        data['activity_log'] = []

    return jsonify(data), 200

@app.route('/api/data/<collection>', methods=['POST', 'OPTIONS'])
def update_data(collection):
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    if not check_auth():
        return jsonify({"error": "Unauthorized"}), 401

    role = get_request_role()

    # Collections only ADMIN can modify
    admin_only = ['users', 'deleted', 'feeConfig', 'allClasses', 'schoolInfo']
    # Collections ADMIN + ACCOUNTANT can modify
    admin_accountant_only = ['students', 'staff', 'settings', 'currency', 'expenditures', 'feedingConfig']
    # Collections ADMIN + TEACHER + ACCOUNTANT can modify (payments and reports/attendance)
    staff_allowed = ['payments', 'reports', 'attendance']

    if collection == 'users' and role != 'ADMIN':
        return jsonify({"error": "Forbidden: Only ADMIN can modify user accounts"}), 403

    if collection in admin_only and role != 'ADMIN':
        return jsonify({"error": f"Forbidden: Only ADMIN can modify {collection}"}), 403
    if collection in admin_accountant_only and role not in ['ADMIN', 'ACCOUNTANT']:
        return jsonify({"error": f"Forbidden: {role} role cannot modify {collection}"}), 403
    # payments, reports, attendance: all staff can modify
    if collection in staff_allowed and role not in ['ADMIN', 'ACCOUNTANT', 'TEACHER']:
        return jsonify({"error": f"Forbidden: {role} role cannot modify {collection}"}), 403

    new_data = request.get_json()
    
    # Tag with schoolId strictly from JWT
    school_id = get_school_context()
    
    # Idempotency Check
    request_id = request.headers.get('X-Request-ID')
    if request_id:
        data = load_data_internal()
        # This is high-level idempotency; for large scale, use a separate 'processed_events' log
        if any(e.get('requestId') == request_id for e in data.get('activity_log', [])):
             return jsonify({"success": True, "message": "Already processed", "duplicate": True}), 200

    if isinstance(new_data, list):
        for item in new_data:
            if isinstance(item, dict):
                item['schoolId'] = school_id
                if request_id: item['requestId'] = request_id
    elif isinstance(new_data, dict):
        new_data['schoolId'] = school_id
        if request_id: new_data['requestId'] = request_id

    update_data_atomic(collection, new_data)
    
    # Log the event
    if request_id:
        with data_lock:
            data = load_data_internal()
            if 'activity_log' not in data: data['activity_log'] = []
            data['activity_log'].append({"type": "SYNC_EVENT", "id": request_id, "collection": collection, "schoolId": school_id, "time": datetime.now().strftime('%Y-%m-%d %H:%M:%S')})
            save_data(data)

    return jsonify({"success": True}), 200

# ── Incremental Updates for Concurrency ──────────────────────────────────────

@app.route('/api/<collection>/add', methods=['POST', 'OPTIONS'])
@token_required
def add_item(collection):
    if request.method == 'OPTIONS': return jsonify({}), 200
    item = request.get_json()
    if not item.get('id'):
        return jsonify({"error": "ID is required"}), 400
    
    with data_lock:
        data = load_data_internal()
        if collection not in data: data[collection] = []
        
        # Enforce School Id
        item['schoolId'] = get_school_context()

        # Check for duplicate ID or requestId
        request_id = request.headers.get('X-Request-ID')
        if request_id:
            if any(i.get('requestId') == request_id for i in data[collection]):
                 return jsonify({"success": True, "message": "Already processed", "duplicate": True}), 200
            item['requestId'] = request_id

        if any(i.get('id') == item['id'] for i in data[collection]):
            return jsonify({"error": "Item with this ID already exists"}), 400
            
        data[collection].append(item)
        save_data(data)
        
    return jsonify({"success": True}), 201

@app.route('/api/<collection>/update', methods=['POST', 'OPTIONS'])
@token_required
def update_item(collection):
    if request.method == 'OPTIONS': return jsonify({}), 200
    item = request.get_json()
    if not item.get('id'):
        return jsonify({"error": "ID is required"}), 400
    
    with data_lock:
        data = load_data()
        if collection not in data: 
            return jsonify({"error": "Collection not found"}), 404
        
        found = False
        for i, existing in enumerate(data[collection]):
            if existing.get('id') == item['id']:
                data[collection][i] = item
                found = True
                break
        
        if not found:
            return jsonify({"error": "Item not found"}), 404
            
        save_data(data)
        
    return jsonify({"success": True}), 200

@app.route('/api/users/delete/<email>', methods=['DELETE', 'OPTIONS'])
@token_required
@require_role('ADMIN')
def delete_user(email):
    if request.method == 'OPTIONS': return jsonify({}), 200
    
    with data_lock:
        data = load_data()
        original_len = len(data['users'])
        data['users'] = [u for u in data['users'] if u['email'].lower() != email.lower()]
        
        if len(data['users']) == original_len:
            return jsonify({"error": "User not found"}), 404
            
        save_data(data)
        
    return jsonify({"success": True}), 200

@app.route('/api/<collection>/delete/<item_id>', methods=['DELETE', 'OPTIONS'])
@token_required
def delete_item(collection, item_id):
    if request.method == 'OPTIONS': return jsonify({}), 200
    
    with data_lock:
        data = load_data()
        if collection not in data: 
            return jsonify({"error": "Collection not found"}), 404
        
        original_len = len(data[collection])
        data[collection] = [i for i in data[collection] if str(i.get('id')) != str(item_id)]
        
        if len(data[collection]) == original_len:
            return jsonify({"error": "Item not found"}), 404
            
        save_data(data)
        
    return jsonify({"success": True}), 200

# Internal helpers that don't acquire the lock themselves
def load_data_internal():
    if not os.path.exists(DATA_FILE):
        return DEFAULT_DATA
    with open(DATA_FILE, 'r') as f:
        data = json.load(f)
    
    # Ensure departments and schoolInfo are properly initialized if missing
    needs_save = False
    if 'departments' not in data:
        data['departments'] = DEFAULT_DATA['departments']
        needs_save = True
    if 'schoolInfo' not in data or data['schoolInfo'].get('schoolName') == 'TRUE STAR MONTESSORI':
        data['schoolInfo'] = DEFAULT_DATA['schoolInfo']
        needs_save = True
    if 'reportTemplates' not in data:
        data['reportTemplates'] = []
        needs_save = True

    if needs_save:
        save_data(data)
        
    return data

@app.route('/api/upload-<type>', methods=['POST', 'OPTIONS'])
def upload_file(type):
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    if not check_auth():
        return jsonify({"error": "Unauthorized"}), 401
    
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    
    if file:
        filename = f"{type}_{file.filename}"
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(filepath)
        
        # In a real production app on PythonAnywhere, you'd want to return the actual URL
        # For now, we'll return the local path or a served path
        url = f"/uploads/{filename}"
        
        # Update settings in data.json
        data = load_data()
        if 'settings' not in data: data['settings'] = {}
        data['settings'][f"{type}Url"] = url
        save_data(data)
        
        return jsonify({"success": True, "url": url}), 200

@app.route('/uploads/<filename>')
def serve_upload(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)


@app.route('/api/students', methods=['GET'])
@token_required
def get_students():
    role = get_request_role()
    school_id = get_school_context()
    data = load_data()
    arrears_type = request.args.get('arrearsType', 'all')
    
    # Tier 1: SaaS Isolation (School ID)
    students = [s for s in data.get('students', []) if s.get('schoolId', 'default') == school_id]
    
    # Tier 2: Role Restrictions (Teacher Class Assignment)
    if role == 'TEACHER':
        assigned_class = request.headers.get('X-Assigned-Class', '').strip().upper()
        if assigned_class:
            students = [s for s in students
                        if (s.get('class') or '').upper().replace(' ', '') == assigned_class.replace(' ', '')]

    # Tier 3: Functional Filtering (Debt Type)
    filtered = []
    for s in students:
        prev_arrears = float(s.get('prevArrears', 0))
        if arrears_type == 'previous' and prev_arrears > 0:
            filtered.append(s)
        elif arrears_type == 'current':
            filtered.append(s)
        elif arrears_type == 'all':
            filtered.append(s)

    return jsonify(filtered), 200

@app.route('/api/payments', methods=['GET'])
@token_required
def get_payments():
    role = get_request_role()
    school_id = get_school_context()
    # TEACHER cannot access payments
    if role == 'TEACHER':
        return jsonify({"error": "Forbidden: TEACHER role cannot access payments"}), 403

    data = load_data()
    filter_type = request.args.get('filter', 'all')
    
    # Filter by School ID
    payments = [p for p in data.get('payments', []) if p.get('schoolId', 'default') == school_id]
    
    now = datetime.now()
    filtered = []
    
    for p in payments:
        p_date_str = p.get('date', '')
        try:
            # Try parsing YYYY-MM-DD
            p_date = datetime.strptime(p_date_str, '%Y-%m-%d')
        except:
            try:
                # Try parsing DD/MM/YYYY
                p_date = datetime.strptime(p_date_str, '%d/%m/%Y')
            except:
                p_date = now # Fallback
                
        if filter_type == 'today':
            if p_date.date() == now.date():
                filtered.append(p)
        elif filter_type == 'week':
            if (now - p_date).days <= 7:
                filtered.append(p)
        elif filter_type == 'month':
            if p_date.month == now.month and p_date.year == now.year:
                filtered.append(p)
        else:
            filtered.append(p)
            
    return jsonify(filtered)

# ── Report Management Endpoints ──────────────────────────────────────────────

@app.route('/api/report-templates', methods=['GET', 'OPTIONS'])
@token_required
def get_templates():
    if request.method == 'OPTIONS': return jsonify({}), 200
    data = load_data()
    return jsonify(data.get('reportTemplates', [])), 200

@app.route('/api/upload-report-template', methods=['POST', 'OPTIONS'])
@token_required
@require_role('ADMIN')
def upload_template():
    if request.method == 'OPTIONS': return jsonify({}), 200
    if 'file' not in request.files: return jsonify({"error": "No file"}), 400
    
    file = request.files['file']
    template_name = request.form.get('name', 'New Template')
    assigned_to = request.form.get('assignedTo', '') # Dept or Class
    
    filename = f"template_{datetime.now().timestamp()}_{file.filename}"
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    file.save(filepath)
    url = f"/uploads/{filename}"
    
    with data_lock:
        data = load_data()
        if 'reportTemplates' not in data: data['reportTemplates'] = []
        new_template = {
            "id": str(int(datetime.now().timestamp())),
            "name": template_name,
            "url": url,
            "assignedTo": assigned_to,
            "createdAt": datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }
        data['reportTemplates'].append(new_template)
        save_data(data)
    
    return jsonify({"success": True, "template": new_template}), 200

@app.route('/api/save-report', methods=['POST', 'OPTIONS'])
@token_required
def save_report():
    if request.method == 'OPTIONS': return jsonify({}), 200
    report_data = request.get_json()
    
    with data_lock:
        data = load_data_internal()
        if 'reports' not in data: data['reports'] = []
        
        # Always enforce schoolId from authenticated context (cannot be user-injected)
        school_id = get_school_context()
        report_data['schoolId'] = school_id

        # Check if exists by ID and update, or append
        found = False
        report_id = report_data.get('id')
        if report_id:
            for i, r in enumerate(data['reports']):
                if str(r.get('id')) == str(report_id):
                    data['reports'][i] = report_data
                    found = True
                    break
        
        if not found:
            if not report_data.get('id'):
                report_data['id'] = str(int(time.time() * 1000))
            data['reports'].append(report_data)
        
        # Keep studentReports in sync for legacy compatibility
        data['studentReports'] = data['reports']
        
        save_data(data)
    return jsonify({"success": True, "report": report_data}), 200

# Legacy route alias
@app.route('/api/save-student-report', methods=['POST', 'OPTIONS'])
@token_required
def save_student_report_legacy():
    return save_report()

@app.route('/api/student-report/<student_id>', methods=['GET', 'OPTIONS'])
@token_required
def get_student_report(student_id):
    if request.method == 'OPTIONS': return jsonify({}), 200
    
    # Read-only — no lock needed (load_data() uses its own lock internally)
    data = load_data()
    reports = data.get('reports', [])
    
    # Filter by studentId, studentSid, or legacy report id
    matched = [
        r for r in reports
        if (str(r.get('studentId', '')) == student_id or
            str(r.get('studentSid', '')) == student_id or
            str(r.get('id', '')) == student_id)
    ]
    return jsonify(matched), 200

# ── Expenditure Module ────────────────────────────────────────────────────────

@app.route('/api/expenditure', methods=['GET', 'POST', 'OPTIONS'])
@token_required
def manage_expenditure():
    if request.method == 'OPTIONS':
        return jsonify({}), 200
        
    if request.method == 'POST':
        exp_data = request.get_json()
        # Required: date, description, category, amount, approvedBy
        with data_lock:
            data = load_data_internal()
            if 'expenditures' not in data: data['expenditures'] = []
            
            school_id = get_school_context()
            
            # Idempotency Check (prevent duplicate POSTs)
            request_id = request.headers.get('X-Request-ID')
            if request_id:
                if any(e.get('requestId') == request_id for e in data.get('expenditures', [])):
                    logger.warning(f"DUPLICATE EVENT DETECTED: {request_id} for school {school_id}")
                    return jsonify({"success": True, "message": "Already processed", "duplicate": True}), 200

            new_exp = {
                "id": str(int(time.time() * 1000)),
                "date": exp_data.get('date'),
                "description": exp_data.get('description'),
                "category": exp_data.get('category'),
                "amount": float(exp_data.get('amount', 0)),
                "approvedBy": exp_data.get('approvedBy'),
                "schoolId": school_id,
                "requestId": request_id, # Link to idempotency key
                "createdAt": datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            }
            data['expenditures'].append(new_exp)
            save_data(data)
        return jsonify({"success": True, "expenditure": new_exp}), 200
    
    # GET logic
    data = load_data()
    school_id = get_school_context()
    
    # Filter expenditures by schoolId
    filtered = [e for e in data.get('expenditures', []) if e.get('schoolId') == school_id]
    return jsonify(filtered), 200



@app.route('/api/students', methods=['GET'])
def get_departments():
    data = load_data()
    # If departments not in data, return the default structure
    return jsonify(data.get('departments', DEFAULT_DATA['departments'])), 200

# ── Serve React Frontend ──────────────────────────────────────────────────────

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_react(path):
    # Ensure API requests don't get served the React HTML
    if path.startswith('api/'):
        return jsonify({"error": "API endpoint not found"}), 404
        
    if path and os.path.exists(os.path.join(DIST_DIR, path)):
        return send_from_directory(DIST_DIR, path)
    return send_file(os.path.join(DIST_DIR, 'index.html'))


@app.errorhandler(Exception)
def handle_exception(e):
    # Pass through HTTP errors
    if hasattr(e, 'code'):
        return jsonify({"error": str(e), "success": False}), e.code
    # Handle non-HTTP exceptions only
    return jsonify({"error": "Internal Server Error", "details": str(e), "success": False}), 500

if __name__ == '__main__':
    app.run(debug=True, port=8080)
