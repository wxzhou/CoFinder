export class ConnectionManager {
  private readonly tabToConnection = new Map<string, string>();

  bind(tabId: string, connectionId: string): void {
    this.tabToConnection.set(tabId, connectionId);
  }

  unbind(tabId: string): void {
    this.tabToConnection.delete(tabId);
  }
}
