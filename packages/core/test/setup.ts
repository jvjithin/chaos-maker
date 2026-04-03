import { vi } from 'vitest';

// Create and EXPORT the mocks
export const mockFetch = vi.fn();
export const mockXhrOpen = vi.fn();
export const mockXhrSend = vi.fn();
export const mockXhrAbort = vi.fn();

vi.stubGlobal('fetch', mockFetch);

class MockXMLHttpRequest extends EventTarget {
  _chaos_url: string = '';
  _chaos_method: string = '';
  _responseText: string = '';

  // Add getters/setters that were implicitly used by the patcher
  // This is a more robust mock.
  constructor() {
    super();
    Object.defineProperties(this, {
      status: {
        writable: true,
        configurable: true, // This is the key
        value: 200,
      },
      statusText: {
        writable: true,
        configurable: true, // This is the key
        value: 'OK',
      },
    });
  }

  get responseText() {
    return this._responseText;
  }

  set responseText(val) {
    this._responseText = val;
  }

  open(method: string, url: string) {
    this._chaos_url = url;
    this._chaos_method = method;
    mockXhrOpen(method, url); // Call the exported mock
  }

  send(body?: any) {
    mockXhrSend(body); // Call the exported mock
  }

  abort() {
    mockXhrAbort();
    this.status = 0;
    this.statusText = '';
    this.dispatchEvent(new Event('abort'));
    this.dispatchEvent(new Event('loadend'));
  }

  dispatchEvent(event: Event) {
    return super.dispatchEvent(event);
  }
}

vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest as any);

vi.stubGlobal('Response', class MockResponse {
  status: number;
  statusText: string;
  body: any;
  headers: any;

  constructor(body: any, init: any) {
    this.body = body;
    this.status = init?.status || 200;
    this.statusText = init?.statusText || 'OK';
    this.headers = init?.headers || {};
  }

  json() {
    return Promise.resolve(JSON.parse(this.body));
  }

  text() {
    return Promise.resolve(String(this.body));
  }
} as any);
