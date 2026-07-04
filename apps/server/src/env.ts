import path from "node:path";
import { z } from "zod";

const envSchema = z.object({
  HOME: z.string().optional(),
  HOST: z.string().default("::"),
  PORT: z.coerce.number().int().positive().default(8788),
  NAS_TOOLS_DB_PATH: z.string().optional(),
  PLEX_URL: z.string().default("http://127.0.0.1:32400"),
  PLEX_TOKEN: z.string().default(""),
  PLEX_SECTION_TITLE: z.string().default("Music"),
  PROWLARR_API_KEY: z.string().default(""),
  PROWLARR_URL: z.string().default("http://127.0.0.1:29696"),
  TRANSMISSION_RPC_URL: z.string().default("http://127.0.0.1:29091/transmission/rpc"),
  TRANSMISSION_RPC_USERNAME: z.string().default("trsmadmin"),
  TRANSMISSION_RPC_PASSWORD: z.string().default(""),
  MUSIC_LIBRARY_PATH: z.string().default("/volume1/music"),
  ALSA_DEVICE: z.string().default("hw:1,0"),
  NAS_TOOLS_API_TOKEN: z.string().optional(),
  ALLOWED_ORIGINS: z.string().default(""),
});

const parsed = envSchema.parse(process.env);

export const env = {
  ...parsed,
  NAS_TOOLS_DB_PATH:
    parsed.NAS_TOOLS_DB_PATH ??
    path.join(parsed.HOME ?? "~", ".local/share/nas-tools/cockpit.sqlite"),
};
