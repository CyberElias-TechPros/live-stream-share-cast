
export type EventListener = (...args: any[]) => void;

export class EventEmitter {
  private events: Map<string, EventListener[]> = new Map();

  /**
   * Register an event listener
   * @param event Event name
   * @param listener Event listener
   * @returns The EventEmitter instance
   */
  public on(event: string, listener: EventListener): this {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    
    this.events.get(event)!.push(listener);
    return this;
  }

  /**
   * Register a one-time event listener
   * @param event Event name
   * @param listener Event listener
   * @returns The EventEmitter instance
   */
  public once(event: string, listener: EventListener): this {
    const onceWrapper = (...args: any[]) => {
      listener(...args);
      this.off(event, onceWrapper);
    };
    
    return this.on(event, onceWrapper);
  }

  /**
   * Remove an event listener
   * @param event Event name
   * @param listener Event listener to remove
   * @returns The EventEmitter instance
   */
  public off(event: string, listener: EventListener): this {
    if (this.events.has(event)) {
      const listeners = this.events.get(event)!;
      const index = listeners.indexOf(listener);
      
      if (index !== -1) {
        listeners.splice(index, 1);
      }
      
      if (listeners.length === 0) {
        this.events.delete(event);
      }
    }
    
    return this;
  }

  /**
   * Remove all listeners for an event, or all events
   * @param event Optional event name
   * @returns The EventEmitter instance
   */
  public removeAllListeners(event?: string): this {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
    
    return this;
  }

  /**
   * Emit an event
   * @param event Event name
   * @param args Arguments to pass to listeners
   * @returns true if there were listeners, false otherwise
   */
  public emit(event: string, ...args: any[]): boolean {
    if (this.events.has(event)) {
      const listeners = this.events.get(event)!.slice();
      
      for (const listener of listeners) {
        try {
          listener(...args);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      }
      
      return true;
    }
    
    return false;
  }

  /**
   * Get the number of listeners for an event
   * @param event Event name
   * @returns Number of listeners
   */
  public listenerCount(event: string): number {
    return this.events.has(event) ? this.events.get(event)!.length : 0;
  }

  /**
   * Get all listeners for an event
   * @param event Event name
   * @returns Array of listeners
   */
  public listeners(event: string): EventListener[] {
    return this.events.has(event) ? this.events.get(event)!.slice() : [];
  }

  /**
   * Get all event names
   * @returns Array of event names
   */
  public eventNames(): string[] {
    return Array.from(this.events.keys());
  }
}
