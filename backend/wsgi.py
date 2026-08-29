"""WSGI bridge for hosting the authoritative stdlib APIHandler on PythonAnywhere."""

import getpass
import os
import socket
import sys
import threading


LOCAL_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.environ.get('PA_BACKEND_PATH') or (
    LOCAL_DIR if os.path.isfile(os.path.join(LOCAL_DIR, 'server.py'))
    else f'/home/{getpass.getuser()}/backend'
)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from server import APIHandler  # noqa: E402


class _BridgeServer:
    server_name = 'localhost'
    server_port = 80


def _serve(sock):
    try:
        APIHandler(sock, ('127.0.0.1', 0), _BridgeServer())
    finally:
        sock.close()


def application(environ, start_response):
    method = environ.get('REQUEST_METHOD', 'GET')
    path = environ.get('PATH_INFO', '/')
    query = environ.get('QUERY_STRING', '')
    target = f'{path}?{query}' if query else path
    content_length = int(environ.get('CONTENT_LENGTH') or 0)
    body = environ['wsgi.input'].read(content_length) if content_length else b''

    headers = {'Host': environ.get('HTTP_HOST', 'localhost'), 'Connection': 'close'}
    for key, value in environ.items():
        if key.startswith('HTTP_'):
            name = key[5:].replace('_', '-').title()
            if name not in ('Host', 'Connection'):
                headers[name] = value
    if environ.get('CONTENT_TYPE'):
        headers['Content-Type'] = environ['CONTENT_TYPE']
    headers['Content-Length'] = str(len(body))

    request_head = [f'{method} {target} HTTP/1.1']
    request_head.extend(f'{name}: {value}' for name, value in headers.items())
    raw_request = ('\r\n'.join(request_head) + '\r\n\r\n').encode('latin-1') + body

    client, handler = socket.socketpair()
    worker = threading.Thread(target=_serve, args=(handler,), daemon=True)
    worker.start()
    try:
        client.sendall(raw_request)
        client.shutdown(socket.SHUT_WR)
        chunks = []
        while True:
            chunk = client.recv(65536)
            if not chunk:
                break
            chunks.append(chunk)
    finally:
        client.close()
        worker.join(timeout=30)

    raw_response = b''.join(chunks)
    header_bytes, separator, response_body = raw_response.partition(b'\r\n\r\n')
    if not separator:
        start_response('500 Internal Server Error', [('Content-Type', 'application/json')])
        return [b'{"error":"Invalid backend response"}']

    lines = header_bytes.decode('latin-1').split('\r\n')
    status_parts = lines[0].split(' ', 2)
    status = ' '.join(status_parts[1:]) if len(status_parts) > 1 else '500 Internal Server Error'
    response_headers = []
    for line in lines[1:]:
        if ':' not in line:
            continue
        name, value = line.split(':', 1)
        if name.lower() not in ('connection', 'transfer-encoding'):
            response_headers.append((name.strip(), value.strip()))
    start_response(status, response_headers)
    return [response_body]
