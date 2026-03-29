export type ChaosEventType = 'network:failure' | 'network:latency' | 'ui:assault';

export interface ChaosEvent {
  type: ChaosEventType;
  timestamp: number;
  applied: boolean;
  detail: {
    url?: string;
    method?: string;
    statusCode?: number;
    delayMs?: number;
    selector?: string;
    action?: string;
  };
}

export type ChaosEventListener = (event: ChaosEvent) => void;

export class ChaosEventEmitter {
  private listeners: Map<string, Set<ChaosEventListener>> = new Map();
  private log: ChaosEvent[] = [];

  on(type: ChaosEventType | '*', listener: ChaosEventListener): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  off(type: ChaosEventType | '*', listener: ChaosEventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(event: ChaosEvent): void {
    this.log.push(event);

    const typeListeners = this.listeners.get(event.type);
    if (typeListeners) {
      for (const listener of typeListeners) {
        listener(event);
      }
    }

    const wildcardListeners = this.listeners.get('*');
    if (wildcardListeners) {
      for (const listener of wildcardListeners) {
        listener(event);
      }
    }
  }

  getLog(): ChaosEvent[] {
    return [...this.log];
  }

  clearLog(): void {
    this.log = [];
  }
}
