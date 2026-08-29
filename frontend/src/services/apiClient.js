const readActiveUser = () => {
  try {
    return JSON.parse(localStorage.getItem('erp_active_user') || '{}');
  } catch {
    return {};
  }
};

const createRequestId = () => globalThis.crypto?.randomUUID?.()
  || `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const isBodySerializable = (body) => body != null
  && typeof body === 'object'
  && !(body instanceof FormData)
  && !(body instanceof Blob)
  && !(body instanceof URLSearchParams)
  && !(body instanceof ArrayBuffer);

export class ApiError extends Error {
  constructor(message, { status, data, requestId, response } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.requestId = requestId;
    this.response = response;
  }
}

async function parseResponse(response) {
  if (response.status === 204 || response.status === 205) return null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json') || contentType.includes('+json')) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  return response.text();
}

export function createApiClient({ baseUrl = '/api', getToken, getTenantId, defaultHeaders = {} } = {}) {
  const request = async (path, options = {}) => {
    const {
      query,
      tenantId: suppliedTenantId,
      requestId: suppliedRequestId,
      headers: suppliedHeaders,
      body: suppliedBody,
      ...fetchOptions
    } = options;
    const requestId = suppliedRequestId || createRequestId();
    const activeUser = readActiveUser();
    const token = getToken?.() ?? localStorage.getItem('erp_token');
    const tenantId = suppliedTenantId ?? getTenantId?.() ?? activeUser.schoolId;
    const headers = new Headers(defaultHeaders);
    new Headers(suppliedHeaders).forEach((value, key) => headers.set(key, value));
    headers.set('Accept', 'application/json');
    headers.set('X-Request-ID', requestId);
    if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
    if (tenantId && !headers.has('X-Tenant-ID')) headers.set('X-Tenant-ID', String(tenantId));

    let body = suppliedBody;
    if (isBodySerializable(body)) {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(body);
    }

    const base = String(baseUrl || '/api').replace(/\/$/, '');
    let relativePath = String(path).replace(/^\//, '');
    if (base.endsWith('/api') && relativePath.startsWith('api/')) relativePath = relativePath.slice(4);
    const normalizedPath = /^https?:\/\//.test(path)
      ? path
      : `${base}/${relativePath}`;
    const url = new URL(normalizedPath, window.location.origin);
    Object.entries(query || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      if (Array.isArray(value)) value.forEach((item) => url.searchParams.append(key, item));
      else url.searchParams.set(key, value);
    });

    let response;
    try {
      response = await fetch(url.toString(), { ...fetchOptions, headers, body });
    } catch (cause) {
      throw new ApiError(cause.message || 'Unable to reach the server', { requestId });
    }

    const data = await parseResponse(response);
    if (!response.ok) {
      const message = typeof data === 'string'
        ? data
        : data?.message || data?.error || `Request failed with status ${response.status}`;
      const responseRequestId = response.headers.get('X-Request-ID') || data?.requestId || requestId;
      throw new ApiError(message, { status: response.status, data, requestId: responseRequestId, response });
    }
    return data;
  };

  return {
    request,
    get: (path, options) => request(path, { ...options, method: 'GET' }),
    post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
    delete: (path, options) => request(path, { ...options, method: 'DELETE' })
  };
}

export function backendRequest(baseUrl, token, path, options = {}) {
  if (!baseUrl || !token) throw new ApiError('This action requires a connected backend.');
  return createApiClient({ baseUrl, getToken: () => token }).request(path, options);
}

const apiClient = createApiClient();
export default apiClient;
