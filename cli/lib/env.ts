import { z } from "zod";

const envSchema = z.object({
  HOME: z.string().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PATH: z.string().optional(),
  NAS_TOOLS_BASH_FUNCTIONS_PATH: z.string().optional(),
  PLEX_URL: z.string().default("http://127.0.0.1:32400"),
  PLEX_TOKEN: z.string().default(""),
  PROWLARR_API_KEY: z.string().default(""),
  PROWLARR_URL: z.string().default("http://127.0.0.1:29696"),
  TRANSMISSION_RPC_USERNAME: z.string().default("trsmadmin"),
  TRANSMISSION_RPC_PASSWORD: z.string().default(""),
  PROWLARR_CATEGORY_SET_MUSIC: z.string().default("3040"),
  PROWLARR_CATEGORY_SET_MOVIES: z.string().default("2000,2010,2030,2040,2045"),
  PROWLARR_CATEGORY_SET_TV: z.string().default("5000,5030,5040"),
  PROWLARR_CATEGORY_SET_AUDIOBOOK: z.string().default("3030"),
  PROWLARR_CATEGORY_SET_EBOOK: z.string().default("7010"),
});

export const env = envSchema.parse(process.env);
