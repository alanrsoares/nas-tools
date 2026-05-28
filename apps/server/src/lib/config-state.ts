import { defaultNasPathConfig, type NasPathConfig } from "@nas-tools/core";

export type ConfigState = {
  get: () => NasPathConfig;
  set: (config: NasPathConfig) => void;
};

export function createConfigState(initial = defaultNasPathConfig): ConfigState {
  let config: NasPathConfig = initial;
  return {
    get: () => config,
    set: (next) => {
      config = next;
    },
  };
}
