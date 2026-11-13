#!/usr/bin/env python3
"""Reset the primary super-admin account and remove retired gatekeeper users."""
import argparse
import json
import os
import sys
import uuid

# Allow running as `python backend/reset_superadmin.py` from repo root.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import server  # noqa: E402

RETIRED_SUPERADMIN_EMAILS = frozenset({
    'wav.superadmin@gmail.com',
    'superadmin@school.com',
})

DEFAULT_PRIMARY = 'samuel15appiah@gmail.com'


def reset_superadmin(data, email, password, name='Samuel Appiah'):
    email = email.lower().strip()
    data['users'] = [
        u for u in data.get('users', [])
        if u.get('email', '').lower().strip() not in RETIRED_SUPERADMIN_EMAILS
        and u.get('email', '').lower().strip() != email
    ]
    if not data.get('schools'):
        server.migrate_schools(data)
    user = {
        'uuid': str(uuid.uuid4()),
        'name': name,
        'email': email,
        'password': server.hash_password(password),
        'role': 'ADMIN',
        'assignedClass': '',
        'status': 'active',
        'password_recovery_requested': False,
        'schoolId': 'default',
        'authVersion': 0,
    }
    data.setdefault('users', []).append(user)
    return user


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--email', default=os.environ.get('SUPERADMIN_PRIMARY_EMAIL', DEFAULT_PRIMARY))
    parser.add_argument('--password', default=os.environ.get('SUPERADMIN_BOOTSTRAP_PASSWORD', 'Zymera@15'))
    parser.add_argument('--data-file', default=server.DATA_FILE)
    parser.add_argument('--name', default='Samuel Appiah')
    args = parser.parse_args()
    if not server.valid_password(args.password):
        print('Password must be 8–256 characters.', file=sys.stderr)
        sys.exit(1)

    if os.path.exists(args.data_file):
        with open(args.data_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
    else:
        data = {'schools': {}, 'users': []}

    reset_superadmin(data, args.email, args.password, args.name)
    server.migrate_schools(data)
    server.initialize_schema(data)
    with server.process_data_lock():
        server._save_data_unlocked(data)
    print(f'OK: super-admin {args.email!r} reset; retired accounts removed.')
    print('Log in with the email and password you passed to this script.')


if __name__ == '__main__':
    main()
