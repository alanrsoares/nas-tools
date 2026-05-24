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
});

export const env = envSchema.parse(process.env);
