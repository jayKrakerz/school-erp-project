import http.client
import json
import os
import sys
import tempfile
import threading
import unittest


BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, BACKEND)
import server


class ServerFoundationTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.old_data_file = server.DATA_FILE
        server.DATA_FILE = os.path.join(self.tempdir.name, 'data.json')
        self.users = [
            {'uuid': 'admin-a', 'email': 'admin-a@test', 'password': 'x', 'role': 'ADMIN', 'status': 'active', 'schoolId': 'a'},
            {'uuid': 'admin-b', 'email': 'admin-b@test', 'password': 'x', 'role': 'ADMIN', 'status': 'active', 'schoolId': 'b'},
            {'uuid': 'teacher-a', 'email': 'teacher-a@test', 'password': 'x', 'role': 'TEACHER', 'status': 'active', 'assignedClass': 'CLASS A', 'schoolId': 'a'},
            {'uuid': 'teacher-2', 'email': 'teacher-2@test', 'password': 'x', 'role': 'TEACHER', 'status': 'active', 'assignedClass': 'CLASS B', 'schoolId': 'a'},
            {'uuid': 'accountant-a', 'email': 'accountant-a@test', 'password': 'x', 'role': 'ACCOUNTANT', 'status': 'active', 'schoolId': 'a'},
            {'uuid': 'transport-a', 'email': 'transport-a@test', 'password': 'x', 'role': 'TRANSPORT_MANAGER', 'status': 'active', 'schoolId': 'a'},
            {'uuid': 'disabled-a', 'email': 'disabled-a@test', 'password': 'x', 'role': 'ADMIN', 'status': 'disabled', 'schoolId': 'a'},
        ]
        initial = {
            'users': self.users, 'schools': {
                'a': {'schoolName': 'A'}, 'b': {'schoolName': 'B'},
            }, 'students': [], 'reports': [], 'expenditures': [], 'deleted': [],
        }
        with open(server.DATA_FILE, 'w', encoding='utf-8') as handle:
            json.dump(initial, handle)
        server._DATA_CACHE = None
        server._DATA_TIMESTAMP = 0
        server.run_startup_migration()
        self.httpd = server.ThreadedHTTPServer(('127.0.0.1', 0), server.APIHandler)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        self.port = self.httpd.server_address[1]
        self.tokens = {
            'a': server.make_token('admin-a@test', 'admin-a'),
            'b': server.make_token('admin-b@test', 'admin-b'),
            'teacher-a': server.make_token('teacher-a@test', 'teacher-a'),
            'teacher-2': server.make_token('teacher-2@test', 'teacher-2'),
            'accountant-a': server.make_token('accountant-a@test', 'accountant-a'),
            'transport-a': server.make_token('transport-a@test', 'transport-a'),
            'disabled-a': server.make_token('disabled-a@test', 'disabled-a'),
        }

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=2)
        server.DATA_FILE = self.old_data_file
        server._DATA_CACHE = None
        server._DATA_TIMESTAMP = 0
        self.tempdir.cleanup()

    def request(self, method, path, body=None, tenant='a', token=None, headers=None):
        status, payload, _ = self.request_full(method, path, body, tenant, token, headers)
        return status, payload

    def request_full(self, method, path, body=None, tenant='a', token=None, headers=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.port, timeout=5)
        request_headers = {'Content-Type': 'application/json'}
        if token is not False:
            request_headers['Authorization'] = 'Bearer ' + (token or self.tokens[tenant])
        request_headers.update(headers or {})
        connection.request(method, path, json.dumps(body).encode() if body is not None else None, request_headers)
        response = connection.getresponse()
        raw = response.read()
        response_headers = dict(response.getheaders())
        connection.close()
        return response.status, json.loads(raw) if raw else None, response_headers

    def test_schema_auth_tenant_isolation_and_audit(self):
        data = server.load_data()
        for key in server.REQUIRED_ARRAYS:
            self.assertIsInstance(data[key], list)
        self.assertEqual(data['_schema']['version'], server.SCHEMA_VERSION)
        self.assertIn('retentionPolicy', data['schools']['a'])
        self.assertTrue(all(user['password'].startswith(('scrypt$', 'pbkdf2$')) for user in data['users']))

        status, created = self.request('POST', '/api/data/students/add', {'id': 's1', 'name': 'A'}, headers={'X-Sync-ID': 'sync-1'})
        self.assertEqual(status, 201)
        self.assertGreater(created['tenantRevision'], 0)
        status, school_b = self.request('GET', '/api/data', tenant='b')
        self.assertEqual(status, 200)
        self.assertEqual(school_b['students'], [])
        status, audit = self.request('GET', '/api/audit?collection=students')
        self.assertEqual(status, 200)
        self.assertEqual(audit['count'], 1)

        server.save_data({**server.load_data(), 'users': [self.users[1]]})
        status, _ = self.request('GET', '/api/data')
        self.assertEqual(status, 401)

    def test_report_finalization_revisions_and_versions(self):
        self.request('POST', '/api/data/students/add', {'id': 's1', 'sid': 'S1', 'name': 'Student'})
        status, saved = self.request('POST', '/api/save-report', {'id': 'r1', 'studentId': 's1', 'score': 70})
        self.assertEqual(status, 200)
        self.assertEqual(saved['report']['status'], 'draft')
        status, finalized = self.request('POST', '/api/reports/r1/finalize', {})
        self.assertEqual(status, 200)
        self.assertEqual(finalized['report']['status'], 'finalized')
        status, _ = self.request('POST', '/api/save-report', {'id': 'r1', 'score': 90})
        self.assertEqual(status, 409)
        status, versions = self.request('GET', '/api/reports/r1/versions')
        self.assertEqual(status, 200)
        self.assertEqual([v['version'] for v in versions['items']], [1, 2])
        status, revised = self.request('POST', '/api/reports/r1/revise', {})
        self.assertEqual(status, 201)
        self.assertEqual(revised['report']['revisedFrom'], 'r1')

    def test_recurring_materialization_is_idempotent(self):
        rule = {'description': 'Rent', 'amount': 100, 'frequency': 'monthly', 'startDate': '2026-01-31'}
        self.assertEqual(self.request('POST', '/api/recurring-expense-rules', rule)[0], 201)
        status, first = self.request('POST', '/api/recurring-expense-rules/materialize', {'throughDate': '2026-03-31'})
        self.assertEqual(status, 200)
        self.assertEqual(first['created'], 3)
        status, second = self.request('POST', '/api/recurring-expense-rules/materialize', {'throughDate': '2026-03-31'})
        self.assertEqual(status, 200)
        self.assertEqual(second['created'], 0)

    def test_invitation_hash_accept_and_tenant_scope(self):
        status, created = self.request('POST', '/api/invitations', {'email': 'teacher@test', 'role': 'TEACHER'})
        self.assertEqual(status, 201)
        raw_token = created['token']
        persisted = server.load_data()['invitations'][0]
        self.assertNotIn(raw_token, json.dumps(persisted))
        status, accepted = self.request('POST', '/api/invitations/accept', {'name': 'Teacher', 'password': 'safe-pass'}, token=raw_token)
        self.assertEqual(status, 200)
        self.assertEqual(accepted['user']['schoolId'], 'a')
        self.assertNotIn('password', accepted['user'])
        self.assertEqual(self.request('POST', '/api/invitations/accept', {'password': 'again'}, token=raw_token)[0], 400)

    def test_recycle_restore_and_permanent_purge(self):
        self.request('POST', '/api/data/students/add', {'id': 'recycle-me', 'name': 'Student'})
        status, moved = self.request('POST', '/api/recycle/students/recycle-me', {'reason': 'duplicate'})
        self.assertEqual(status, 200)
        recycle_id = moved['item']['id']
        status, restored = self.request('POST', '/api/recycle/%s/restore' % recycle_id, {})
        self.assertEqual(status, 200)
        self.assertEqual(restored['item']['id'], 'recycle-me')
        self.assertNotIn('originalCollection', restored['item'])
        status, moved = self.request('POST', '/api/recycle/students/recycle-me', {})
        self.assertEqual(status, 200)
        self.assertEqual(self.request('DELETE', '/api/recycle/' + moved['item']['id'])[0], 200)

    def test_transport_invoice_maintenance_and_isolation(self):
        self.request('POST', '/api/data/students/add', {'id': 's1', 'sid': 'S1', 'name': 'Student'})
        self.request('POST', '/api/data/transportRoutes/add', {'id': 'route1', 'name': 'North'})
        self.request('POST', '/api/data/buses/add', {'id': 'bus1', 'routeId': 'route1', 'reg': 'TEST-1'})
        status, invoice = self.request('POST', '/api/transport/invoices', {'studentId': 's1', 'amount': 50})
        self.assertEqual(status, 201)
        status, maintenance = self.request('POST', '/api/transport/maintenance', {'busId': 'bus1', 'description': 'Service'})
        self.assertEqual(status, 201)
        item_id = maintenance['item']['id']
        status, updated = self.request('POST', '/api/transport/maintenance/%s/status' % item_id, {'status': 'completed'})
        self.assertEqual(status, 200)
        self.assertEqual(updated['item']['status'], 'completed')
        self.assertEqual(self.request('GET', '/api/transport/invoices', tenant='b')[1]['items'], [])
        self.assertEqual(invoice['item']['schoolId'], 'a')

    def test_transport_manager_view_and_item_mutations(self):
        token = self.tokens['transport-a']
        status, route = self.request('POST', '/api/data/transportRoutes/add', {'id': 'route-1', 'name': 'North'}, token=token)
        self.assertEqual(status, 201)
        self.assertEqual(route['item']['schoolId'], 'a')
        self.request('POST', '/api/data/students/add', {'id': 'transport-student', 'name': 'Rider'})
        self.assertEqual(self.request('POST', '/api/data/studentTransport/add', {
            'id': 'enrollment-1', 'studentId': 'transport-student', 'routeId': 'route-1'}, token=token)[0], 201)
        self.assertEqual(self.request('POST', '/api/data/studentTransport/add', {
            'id': 'bad-enrollment', 'studentId': 'missing', 'routeId': 'route-1'}, token=token)[0], 400)
        self.assertEqual(self.request('POST', '/api/data/transportRoutes/update/route-1', {'name': 'North East'}, token=token)[0], 200)
        status, view = self.request('GET', '/api/data', token=token)
        self.assertEqual(status, 200)
        self.assertEqual(view['transportRoutes'][0]['name'], 'North East')
        self.assertEqual(view['payments'], [])
        self.assertEqual(self.request('DELETE', '/api/data/transportRoutes/route-1', token=token)[0], 200)

    def test_payroll_approval_transitions(self):
        accountant = self.tokens['accountant-a']
        status, submitted = self.request('POST', '/api/payroll/approval', {
            'action': 'submit', 'period': '2026-08', 'grossTotal': 1000, 'netTotal': 900}, token=accountant)
        self.assertEqual(status, 200)
        self.assertEqual(submitted['item']['status'], 'submitted')
        self.assertEqual(self.request('POST', '/api/payroll/approval', {
            'action': 'reopen', 'period': '2026-08'}, token=accountant)[0], 403)
        status, approved = self.request('POST', '/api/payroll/approval', {
            'action': 'approve', 'period': '2026-08'})
        self.assertEqual(status, 200)
        self.assertEqual(approved['item']['status'], 'approved')
        self.assertEqual(self.request('GET', '/api/payroll/approval?period=2026-08', token=accountant)[1]['item']['status'], 'approved')

    def test_corrupt_database_never_falls_back_to_defaults(self):
        with open(server.DATA_FILE, 'w', encoding='utf-8') as handle:
            handle.write('{not-json')
        server._DATA_CACHE = None
        with self.assertRaises(RuntimeError):
            server.load_data()
        self.assertFalse(os.path.exists(server.DATA_FILE))
        self.assertTrue(os.path.exists(server.DATA_FILE + '.corrupt-state'))
        with self.assertRaises(RuntimeError):
            server.load_data()

    def test_collection_replacement_and_record_upsert_are_safe(self):
        self.assertEqual(self.request('POST', '/api/data/students', {'id': 'bad'})[0], 400)
        status, created = self.request('POST', '/api/data/students/upsert', {'id': 's1', 'name': 'First'})
        self.assertEqual(status, 201)
        self.assertEqual(created['item']['schoolId'], 'a')
        status, updated = self.request('POST', '/api/data/students/update/s1', {'name': 'Updated', 'schoolId': 'b'})
        self.assertEqual(status, 200)
        self.assertEqual(updated['item']['name'], 'Updated')
        self.assertEqual(updated['item']['schoolId'], 'a')
        self.assertEqual(self.request('POST', '/api/data/students/update/missing', {'name': 'No'})[0], 404)
        self.assertEqual(self.request('GET', '/api/data', tenant='b')[1]['students'], [])

    def test_teacher_workflow_mutations_require_ownership(self):
        status, created = self.request('POST', '/api/data/lessonNotes/add', {'id': 'note-1', 'title': 'Mine'}, token=self.tokens['teacher-a'])
        self.assertEqual(status, 201)
        self.assertEqual(created['item']['createdBy'], 'teacher-a@test')
        self.assertEqual(self.request('POST', '/api/data/lessonNotes/update/note-1', {'title': 'Stolen'}, token=self.tokens['teacher-2'])[0], 403)
        self.assertEqual(self.request('DELETE', '/api/data/lessonNotes/note-1', token=self.tokens['teacher-2'])[0], 403)
        self.assertEqual(self.request('POST', '/api/workflows/lessonNotes/note-1/submit', {}, token=self.tokens['teacher-2'])[0], 403)
        self.assertEqual(self.request('POST', '/api/data/lessonNotes/update/note-1', {'title': 'Still mine'}, token=self.tokens['teacher-a'])[0], 200)
        self.assertEqual([item['id'] for item in self.request('GET', '/api/data', token=self.tokens['teacher-a'])[1]['lessonNotes']], ['note-1'])
        self.assertEqual(self.request('GET', '/api/data', token=self.tokens['teacher-2'])[1]['lessonNotes'], [])
        self.assertEqual(self.request('POST', '/api/data/lessonNotes', [], token=self.tokens['teacher-a'])[0], 403)

    def test_role_views_and_report_class_authorization(self):
        data = server.load_data()
        data['students'] = [
            {'id': 'sa', 'sid': 'SA', 'class': 'CLASS A', 'schoolId': 'a'},
            {'id': 'sb', 'sid': 'SB', 'class': 'CLASS B', 'schoolId': 'a'},
        ]
        data['auditEvents'] = [{'id': 'secret', 'schoolId': 'a'}]
        data['staffDisciplinary'] = [{'id': 'private', 'schoolId': 'a'}]
        data['transportRoutes'] = [{'id': 'route', 'schoolId': 'a'}]
        server.save_data(data)
        self.assertEqual(self.request('POST', '/api/save-report', {'id': 'ra', 'studentId': 'sa'})[0], 200)
        self.assertEqual(self.request('POST', '/api/save-report', {'id': 'rb', 'studentId': 'sb'})[0], 200)

        status, view = self.request('GET', '/api/data', token=self.tokens['teacher-a'])
        self.assertEqual(status, 200)
        self.assertEqual(view['auditEvents'], [])
        self.assertEqual(view['staffDisciplinary'], [])
        self.assertEqual(view['transportRoutes'], [])
        self.assertEqual(self.request('GET', '/api/reports/rb/versions', token=self.tokens['teacher-a'])[0], 403)
        self.assertEqual(self.request('GET', '/api/reports/ra/versions', token=self.tokens['teacher-a'])[0], 200)
        self.assertEqual(self.request('GET', '/api/student-report/sb', token=self.tokens['teacher-a'])[0], 403)
        self.assertEqual(self.request('POST', '/api/save-report', {'id': 'new-b', 'studentId': 'sb'}, token=self.tokens['teacher-a'])[0], 403)
        self.assertEqual(self.request('POST', '/api/reports/rb/revise', {}, token=self.tokens['teacher-a'])[0], 403)
        self.assertEqual(self.request('GET', '/api/reports/ra/versions', token=self.tokens['accountant-a'])[0], 403)

    def test_auth_recovery_cors_and_no_store(self):
        self.assertEqual(self.request('GET', '/api/data', token=self.tokens['disabled-a'])[0], 401)
        data = server.load_data()
        teacher = next(u for u in data['users'] if u['uuid'] == 'teacher-a')
        teacher['password_recovery_requested'] = True
        server.save_data(data)
        self.assertEqual(self.request('GET', '/api/data', token=self.tokens['teacher-a'])[0], 401)
        self.assertEqual(self.request('POST', '/api/auth/forgot-password', {'email': 'admin-a@test'}, token=False)[0], 200)
        self.assertFalse(next(u for u in server.load_data()['users'] if u['uuid'] == 'admin-a').get('password_recovery_requested', False))

        links = []
        original_sender = server.send_reset_email
        server.send_reset_email = lambda email, link: links.append(link)
        try:
            status, _ = self.request('POST', '/api/auth/request-password-reset', {'email': 'admin-a@test'}, token=False,
                                     headers={'Origin': 'https://attacker.invalid', 'Referer': 'https://attacker.invalid/x'})
        finally:
            server.send_reset_email = original_sender
        self.assertEqual(status, 200)
        self.assertTrue(links)
        self.assertNotIn('attacker.invalid', links[0])
        raw_reset_token = links[0].split('token=', 1)[1]
        self.assertNotIn(raw_reset_token, server.load_data().get('reset_tokens', {}))

        status, _, headers = self.request_full('GET', '/api/data')
        self.assertEqual(status, 200)
        self.assertEqual(headers.get('Cache-Control'), 'no-store')
        status, _, headers = self.request_full('OPTIONS', '/api/data', token=False,
                                               headers={'Origin': server.ALLOWED_ORIGINS[0]})
        self.assertEqual(status, 200)
        self.assertIn('X-Tenant-ID', headers.get('Access-Control-Allow-Headers', ''))
        self.assertEqual(headers.get('Access-Control-Allow-Methods'), 'GET, POST, DELETE, OPTIONS')
        data = server.load_data()
        admin = next(u for u in data['users'] if u['uuid'] == 'admin-a')
        admin['authVersion'] = 1
        server.save_data(data)
        self.assertEqual(self.request('GET', '/api/data', token=self.tokens['a'])[0], 401)

    def test_money_recurring_restore_ratings_and_role_gates(self):
        self.assertEqual(self.request('POST', '/api/expenditure', {'amount': 'NaN'})[0], 400)
        self.assertEqual(self.request('POST', '/api/data/payments/add', {'id': 'bad-payment', 'studentSid': 'missing', 'amount': 10})[0], 400)
        self.assertEqual(self.request('POST', '/api/save-report', {'id': 'orphan-report', 'studentId': 'missing'})[0], 400)
        self.assertEqual(self.request('POST', '/api/recurring-expense-rules', {
            'description': 'Bad', 'amount': -1, 'frequency': 'monthly', 'startDate': '2026-01-01'})[0], 400)
        self.assertEqual(self.request('POST', '/api/recurring-expense-rules', {
            'description': 'Backwards', 'amount': 1, 'frequency': 'monthly',
            'startDate': '2026-02-01', 'endDate': '2026-01-01'})[0], 400)

        self.request('POST', '/api/data/students/add', {'id': 'duplicate', 'name': 'Original'})
        moved = self.request('POST', '/api/recycle/students/duplicate', {})[1]
        self.request('POST', '/api/data/students/add', {'id': 'duplicate', 'name': 'Replacement'})
        self.assertEqual(self.request('POST', '/api/recycle/%s/restore' % moved['item']['id'], {})[0], 409)

        data = server.load_data()
        data['staff'] = [{'id': 'shared', 'name': 'A Staff', 'schoolId': 'a'},
                         {'id': 'shared', 'name': 'B Staff', 'schoolId': 'b'}]
        server.save_data(data)
        self.assertEqual(self.request('POST', '/api/staff-performance/rate', {'staffId': 'shared', 'ratings': {'adminRating': 91}})[0], 200)
        self.assertEqual(self.request('POST', '/api/staff-performance/rate', {'staffId': 'shared', 'ratings': {'adminRating': 72}}, tenant='b')[0], 200)
        ratings = server.load_data()['manualStaffRatings']
        self.assertEqual(ratings['a']['shared']['adminRating'], 91)
        self.assertEqual(ratings['b']['shared']['adminRating'], 72)

        teacher_token = self.tokens['teacher-2']
        self.assertEqual(self.request('GET', '/api/expenditure', token=teacher_token)[0], 403)
        self.assertEqual(self.request('GET', '/api/transport/routes', token=teacher_token)[0], 403)
        self.assertEqual(self.request('POST', '/api/send-sms', {'phone': '1', 'message': 'x'}, token=teacher_token)[0], 403)


if __name__ == '__main__':
    unittest.main()
