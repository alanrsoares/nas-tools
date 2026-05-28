import { defaultNasPathConfig, type NasPathConfig } from "@nas-tools/core";

let config: NasPathConfig = defaultNasPathConfig;

export function getNasConfig(): NasPathConfig {
  return config;
}

export function setNasConfig(next: NasPathConfig): void {
  config = next;
}
