export class SettingsService {
  async get(): Promise<Record<string, unknown>> {
    return {};
  }

  async set(_patch: Record<string, unknown>): Promise<void> {
    return;
  }
}
