// HTTP-клиент для обращения к бэкенду: подставляет JWT в заголовок,
// разбирает ответы и ошибки сервера, обрабатывает 401 (выход из системы).
import type { ApiResponse, ApiError } from '@tarbie/shared';

const API_BASE = import.meta.env.VITE_API_URL ?? 'https://dprabota.bahtyarsanzhar.workers.dev';

class ApiClient {
  private token: string | null = null;
  private onUnauthorized: (() => void) | null = null;

  setToken(token: string | null): void {
    this.token = token;
  }

  setOnUnauthorized(cb: () => void): void {
    this.onUnauthorized = cb;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string>
  ): Promise<T> {
    let url = `${API_BASE}${path}`;
    
    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v) searchParams.set(k, v);
      });
      const queryString = searchParams.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    const headers: Record<string, string> = {};

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await res.text();
      throw new ApiRequestError('INVALID_RESPONSE', `Expected JSON response but got: ${text.slice(0, 100)}`, res.status);
    }

    const text = await res.text();
    if (!text || text.trim() === '') {
      throw new ApiRequestError('EMPTY_RESPONSE', 'Server returned empty response', res.status);
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      throw new ApiRequestError('INVALID_JSON', `Failed to parse JSON: ${text.slice(0, 100)}`, res.status);
    }

    if (!res.ok) {
      if (res.status === 401 && this.onUnauthorized) {
        this.onUnauthorized();
      }
      const error = json as ApiError;
      throw new ApiRequestError(error.code ?? 'UNKNOWN', error.message ?? 'Request failed', res.status);
    }

    return (json as ApiResponse<T>).data;
  }

  private async requestRaw<T>(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string>
  ): Promise<T> {
    let url = `${API_BASE}${path}`;

    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v) searchParams.set(k, v);
      });
      const queryString = searchParams.toString();
      if (queryString) url += `?${queryString}`;
    }

    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    if (!text || text.trim() === '') {
      throw new ApiRequestError('EMPTY_RESPONSE', 'Server returned empty response', res.status);
    }

    let json;
    try { json = JSON.parse(text); } catch {
      throw new ApiRequestError('INVALID_JSON', `Failed to parse JSON: ${text.slice(0, 100)}`, res.status);
    }

    if (!res.ok) {
      const error = json as ApiError;
      throw new ApiRequestError(error.code ?? 'UNKNOWN', error.message ?? 'Request failed', res.status);
    }

    return json as T;
  }

  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    return this.request<T>('GET', path, undefined, params);
  }

  async getRaw<T>(path: string, params?: Record<string, string>): Promise<T> {
    return this.requestRaw<T>('GET', path, undefined, params);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  async postFormData<T>(path: string, formData: FormData): Promise<T> {
    const url = `${API_BASE}${path}`;
    const headers: Record<string, string> = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
    });

    const text = await res.text();
    if (!text || text.trim() === '') {
      throw new ApiRequestError('EMPTY_RESPONSE', 'Server returned empty response', res.status);
    }

    let json;
    try { json = JSON.parse(text); } catch {
      throw new ApiRequestError('INVALID_JSON', `Failed to parse JSON: ${text.slice(0, 100)}`, res.status);
    }

    if (!res.ok) {
      if (res.status === 401 && this.onUnauthorized) {
        this.onUnauthorized();
      }
      const error = json as ApiError;
      throw new ApiRequestError(error.code ?? 'UNKNOWN', error.message ?? 'Request failed', res.status);
    }

    return (json as ApiResponse<T>).data;
  }
}

export class ApiRequestError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export const api = new ApiClient();
