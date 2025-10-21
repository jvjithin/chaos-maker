import { vi } from 'vitest';

// Create and EXPORT the mocks
export const mockFetch = vi.fn();
export const mockXhrOpen = vi.fn();
export const mockXhrSend = vi.fn();

vi.stubGlobal('fetch', mockFetch);

class MockXMLHttpRequest {
  _chaos_url: string = '';
  _chaos_method: string = '';

  // Add getters/setters that were implicitly used by the patcher
  // This is a more robust mock.
  constructor() {
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

  open(method: string, url: string) {
    this._chaos_url = url;
    this._chaos_method = method;
    mockXhrOpen(method, url); // Call the exported mock
  }

  send(body?: any) {
    mockXhrSend(body); // Call the exported mock
  }

  dispatchEvent(event: Event) {
    return true;
  }
}

vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest as any);

vi.stubGlobal('Response', class MockResponse {
  status: number;
  statusText: string;
  body: any;

  constructor(body: any, init: any) {
    this.body = body;
    this.status = init?.status || 200;
    this.statusText = init?.statusText || 'OK';
  }

  json() {
    return Promise.resolve(JSON.parse(this.body));
  }
} as any);
