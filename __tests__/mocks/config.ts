export const configMock = {
  get: (key: string) => undefined,
  set: (key: string, value: unknown) => {},
  has: (key: string) => false,
  delete: (key: string) => false,
  clear: () => {},
};

export function createConfigMock(defaults?: Record<string, unknown>) {
  const config = { ...defaults };

  return {
    get: (key: string) => config[key],
    set: (key: string, value: unknown) => {
      config[key] = value;
    },
    has: (key: string) => key in config,
    delete: (key: string) => {
      delete config[key];
      return true;
    },
    clear: () => {
      Object.keys(config).forEach((key) => delete config[key]);
    },
    getAll: () => ({ ...config }),
  };
}
