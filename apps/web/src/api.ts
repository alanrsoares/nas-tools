import { treaty } from "@elysiajs/eden";
import type { App } from "@nas-tools/server";
import { QueryClient } from "@tanstack/react-query";

// ReturnType dance avoids TS2883 "inferred type cannot be named" when exporting
// from a separate module.
export type TreatyClient = ReturnType<typeof treaty<App>>;
export type ApiClient = TreatyClient["api"];
export const api: ApiClient = treaty<App>(window.location.origin).api;
export const queryClient = new QueryClient();
