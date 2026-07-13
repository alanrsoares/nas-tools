import { Stream } from "@elysiajs/stream";
import { isErr } from "@onrails/result";
import { OpenRouter } from "@openrouter/sdk";
import { $ } from "bun";
import { t } from "elysia";
import { env } from "../env.js";
import { publicSubrouter } from "../lib/subrouter.js";
import type { Deps } from "../types/deps.js";

import { createMovePlanDraft, getMusicTargetDirectory } from "@nas-tools/core";
import type { MovePlan, FieldIssue } from "@nas-tools/core";
import { findCuePairs } from "../cue.js";
import type { CuePair } from "../cue.js";
import { addTorrent, cleanCompletedTorrents } from "../transmission.js";
import { prowlarrSearch } from "../prowlarr.js";
import { scanAllPlexLibraries, scanPlexSection } from "../plex.js";
import { isNone } from "../lib/maybe.js";

export class Subagent<TArgs = Record<string, unknown>> {
  public name: string;
  public description: string;
  public systemPrompt = "";
  public contextFn?: (args: TArgs) => Promise<string> | string;
  public schema?: Record<string, unknown>;

  constructor(name: string, description: string) {
    this.name = name;
    this.description = description;
  }

  prompt(promptText: string) {
    this.systemPrompt = promptText;
    return this;
  }

  args(schema: Record<string, unknown>) {
    this.schema = schema;
    return this;
  }

  context(fn: (args: TArgs) => Promise<string> | string) {
    this.contextFn = fn;
    return this;
  }

  async run(
    task: string,
    args: TArgs,
    openRouter: OpenRouter,
  ): Promise<{
    report: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  }> {
    let gatheredContext = "";
    if (this.contextFn) {
      try {
        gatheredContext = await this.contextFn(args);
      } catch (err) {
        gatheredContext = `[Context gather failed]: ${err}`;
      }
    }

    // biome-ignore lint/suspicious/noExplicitAny: openrouter response type wrapper
    const response: any = await openRouter.chat.send({
      chatRequest: {
        model: env.OPENROUTER_MODEL,
        messages: [
          { role: "system", content: this.systemPrompt },
          { role: "user", content: `Task: ${task}\n\nContext:\n${gatheredContext}` },
        ],
      },
    });

    return {
      report: response.choices?.[0]?.message?.content || "No report generated",
      usage: response.usage,
    };
  }
}

const musicCurator = new Subagent<{ task: string; folderPath?: string }>(
  "delegate_to_music_curator",
  "Delegate complex music library organization, variant planning, cue troubleshooting, and tagging questions to the Music Curator specialist subagent.",
)
  .prompt(
    "You are the Music Curator specialist subagent for nas-tools. Your goal is to analyze the provided metadata context and complete the music curation task. Keep your report extremely precise, actionable, and formatted in markdown.",
  )
  .args({
    type: "object",
    properties: {
      task: { type: "string", description: "Detailed description of the music task to perform" },
      folderPath: { type: "string", description: "Optional path to the music folder to analyze" },
    },
    required: ["task"],
  })
  .context(async (args) => {
    if (args.folderPath) {
      return await $`bun dist/cli/index.js music-variants --path ${args.folderPath}`.text();
    }
    return await $`bun dist/cli/index.js music-audit`.text();
  });

const systemDiagnostician = new Subagent<{ task: string }>(
  "delegate_to_system_diagnostician",
  "Delegate server errors, ALSA/MPD player issues, network problems, or logs troubleshooting to the System Diagnostician specialist subagent.",
)
  .prompt(
    "You are the System Diagnostician specialist subagent for nas-tools. Your goal is to diagnose playback, config, or network errors using the provided doctor diagnostics. Keep your troubleshooting steps precise, actionable, and formatted in markdown.",
  )
  .args({
    type: "object",
    properties: {
      task: {
        type: "string",
        description: "Detailed description of the system issue or error to diagnose",
      },
    },
    required: ["task"],
  })
  .context(async () => {
    return await $`bun dist/cli/index.js doctor`.text();
  });

const subagents = [musicCurator, systemDiagnostician];

type MovePlanItem = MovePlan["items"][number];
type ItemEdit = { id: string; artistName?: string; included: boolean };

function mergeItemEdit(
  item: MovePlanItem,
  edit: ItemEdit | undefined,
  musicDir: string,
  issues: FieldIssue[],
): MovePlanItem {
  const artistName = edit?.artistName ?? item.artistName;
  const included = edit?.included ?? item.included;

  if (included && item.mediaType === "music" && !artistName) {
    issues.push({
      path: ["items", item.id, "artistName"],
      code: "ARTIST_REQUIRED",
      message: `Artist name required for "${item.albumName}"`,
    });
  }

  if (included && item.mediaType === "unknown") {
    issues.push({
      path: ["items", item.id, "included"],
      code: "UNSUPPORTED_MEDIA_TYPE",
      message: `"${item.albumName}" has no supported media type and cannot be moved`,
    });
  }

  const targetPath =
    item.mediaType === "music" && artistName && artistName !== item.artistName
      ? `${getMusicTargetDirectory(artistName, musicDir)}/${item.albumName}`
      : item.targetPath;

  return { ...item, artistName, included, targetPath };
}

function getAssistantTools() {
  return [
    {
      type: "function",
      function: {
        name: "get_health",
        description: "Get the current health status of the backend server",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "get_system_config",
        description: "Get current library config (music library path, staging path, etc.)",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "list_active_jobs",
        description: "Get the list of active or completed import/cue splitting jobs",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Number of jobs to return", default: 10 },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "control_mpd_player",
        description: "Control the music player playback. Supported actions: pause, resume, stop",
        parameters: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["pause", "resume", "stop"] },
          },
          required: ["action"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "scan_move_completed_staging",
        description: "Scan Download Staging Area for completed downloads and return a Move Plan Draft.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "confirm_move_completed_plan",
        description: "Confirm a move plan draft by plan ID and execute the move job to organize files in the library.",
        parameters: {
          type: "object",
          properties: {
            planId: { type: "string", description: "The ID of the move plan draft to confirm." },
            items: {
              type: "array",
              description: "Edits to specific items in the plan.",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", description: "Item ID (original file/folder path)." },
                  artistName: { type: "string", description: "Optional artist name override for music items." },
                  included: { type: "boolean", description: "Whether to include this item in the move operation." },
                },
                required: ["id", "included"],
              },
            },
            cueSplitEnabled: { type: "boolean", description: "Whether to automatically split CUE files on import." },
          },
          required: ["planId", "items"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "scan_unsplit_cue",
        description: "Scan the music library (or a specific root directory) for unsplit CUE audio/cue file pairs.",
        parameters: {
          type: "object",
          properties: {
            root: { type: "string", description: "Optional directory path to scan. Defaults to the music library root." },
            maxDepth: { type: "number", description: "Maximum directory depth to scan. Defaults to 6." },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "split_cue_files",
        description: "Queue and execute a job to split a list of unsplit CUE pairs.",
        parameters: {
          type: "object",
          properties: {
            pairs: {
              type: "array",
              description: "Array of CUE pairs to split.",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  directory: { type: "string" },
                  cueFile: { type: "string" },
                  audioFile: { type: "string" },
                  blocked: { type: "boolean" },
                  risks: { type: "array", items: { type: "string" } },
                },
                required: ["id", "directory", "cueFile", "audioFile", "blocked", "risks"],
              },
            },
          },
          required: ["pairs"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "clean_transmission_torrents",
        description: "Remove completed torrent records from Transmission whose files have already been moved/deleted from the complete folder.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "add_transmission_torrent",
        description: "Add a new torrent to Transmission via magnet link or torrent file URL.",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "The magnet link or URL of the torrent file to add." },
          },
          required: ["url"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "search_prowlarr",
        description: "Search Prowlarr indexers for a query and check if results already exist in the library.",
        parameters: {
          type: "object",
          properties: {
            q: { type: "string", description: "The query string to search for." },
            categories: {
              type: "array",
              description: "Optional array of category IDs to filter the search.",
              items: { type: "number" },
            },
          },
          required: ["q"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "scan_plex_library",
        description: "Trigger a Plex scan for all libraries or a specific section.",
        parameters: {
          type: "object",
          properties: {
            sectionKey: { type: "string", description: "Optional section key to scan. If omitted, scans all sections." },
          },
        },
      },
    },
    ...subagents.map((agent) => ({
      type: "function",
      function: {
        name: agent.name,
        description: agent.description,
        parameters: agent.schema,
      },
    })),
  ];
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: handle execution of different tools cleanly
async function executeTool(
  name: string,
  args: Record<string, unknown>,
  deps: Deps,
): Promise<unknown> {
  try {
    switch (name) {
      case "get_health":
        return { ok: true, status: "healthy" };
      case "get_system_config":
        return deps.config.get();
      case "list_active_jobs": {
        const limit = Number(args.limit) || 10;
        const result = deps.repos.jobs.list({ limit, offset: 0 });
        return { jobs: result.jobs, total: result.total };
      }
      case "control_mpd_player": {
        const action = args.action as string;
        const result =
          action === "pause"
            ? await deps.player.pause()
            : action === "resume"
              ? await deps.player.resume()
              : action === "stop"
                ? await deps.player.stop()
                : null;
        if (!result) {
          return { ok: false, error: `Unknown action: ${action}` };
        }
        if (isErr(result)) {
          return { ok: false, error: result.error.message };
        }
        return { ok: true, action };
      }
      case "scan_move_completed_staging": {
        const result = await createMovePlanDraft(deps.config.get());
        if (isErr(result)) {
          return { ok: false, error: "Failed to scan staging area", issues: result.error };
        }
        deps.repos.plans.persist(result.value);
        return { ok: true, plan: result.value };
      }
      case "confirm_move_completed_plan": {
        const planId = args.planId as string;
        const bodyItems = args.items as { id: string; artistName?: string; included: boolean }[];
        const cueSplitEnabled = args.cueSplitEnabled as boolean | undefined;

        const plan = deps.repos.plans.load(planId);
        if (isNone(plan)) {
          return { ok: false, error: "Plan not found" };
        }
        if (plan.value.status !== "draft") {
          return { ok: false, error: "Plan is not a draft" };
        }

        const loadedPlan = plan.value;
        const editMap = new Map(bodyItems.map((edit) => [edit.id, edit]));

        const issues: FieldIssue[] = [];
        const mergedItems = loadedPlan.items.map((item) =>
          mergeItemEdit(item, editMap.get(item.id), loadedPlan.config.musicDir, issues),
        );

        if (issues.length > 0) {
          return { ok: false, error: "Validation issues found", issues };
        }

        const now = new Date().toISOString();
        const confirmedPlan: MovePlan = {
          ...loadedPlan,
          status: "confirmed",
          cueSplitEnabled: cueSplitEnabled ?? loadedPlan.cueSplitEnabled,
          items: mergedItems,
          updatedAt: now,
        };

        deps.repos.plans.confirm(confirmedPlan, mergedItems);

        const jobId = crypto.randomUUID();
        deps.repos.jobs.create({
          id: jobId,
          type: "move_completed",
          status: "queued",
          planId: loadedPlan.id,
          counts: { total: 0, completed: 0, failed: 0, skipped: 0 },
          createdAt: now,
          updatedAt: now,
        });

        deps.execution.executeJob(jobId, confirmedPlan);

        return { ok: true, jobId };
      }
      case "scan_unsplit_cue": {
        const nasConfig = deps.config.get();
        const root = typeof args.root === "string" ? args.root : nasConfig.musicDir;
        const maxDepth = Number(args.maxDepth ?? 6);
        const pairs = await findCuePairs(root, maxDepth);
        return {
          ok: true,
          root,
          pairs,
          ready: pairs.filter((pair) => !pair.blocked).length,
          blocked: pairs.filter((pair) => pair.blocked).length,
        };
      }
      case "split_cue_files": {
        const pairs = (args.pairs as CuePair[]).filter((pair) => !pair.blocked);
        const jobId = crypto.randomUUID();
        const now = new Date().toISOString();

        deps.repos.jobs.create({
          id: jobId,
          type: "cue_fix",
          status: "queued",
          planId: null,
          counts: {
            total: pairs.length,
            completed: 0,
            failed: 0,
            skipped: 0,
          },
          createdAt: now,
          updatedAt: now,
        });

        deps.execution.executeCueJob(jobId, pairs);

        return { ok: true, jobId };
      }
      case "clean_transmission_torrents": {
        const result = await cleanCompletedTorrents(deps.config.get().stagingDir);
        return { ok: true, ...result };
      }
      case "add_transmission_torrent": {
        const url = args.url as string;
        const result = await addTorrent(url);
        return { ok: true, ...result };
      }
      case "search_prowlarr": {
        const q = args.q as string;
        const categories = args.categories as number[] | undefined;
        const results = await prowlarrSearch(q.trim(), categories);
        return { ok: true, results };
      }
      case "scan_plex_library": {
        const sectionKey = args.sectionKey as string | undefined;
        if (sectionKey) {
          const result = await scanPlexSection(sectionKey);
          return { ok: true, ...result };
        } else {
          const result = await scanAllPlexLibraries();
          return { ok: true, ...result };
        }
      }
      default: {
        const matchedAgent = subagents.find((a) => a.name === name);
        if (matchedAgent) {
          const openRouter = new OpenRouter({ apiKey: env.OPENROUTER_API_KEY });
          // biome-ignore lint/suspicious/noExplicitAny: type safety verified by runtime checks
          const result = await matchedAgent.run(args.task as string, args as any, openRouter);
          return { ok: true, report: result.report, usage: result.usage };
        }
        return { error: `Tool ${name} not found` };
      }
    }
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export function assistantModule(deps: Deps) {
  return publicSubrouter(deps).post(
    "/assistant/chat",
    async ({ body, set }) => {
      const { messages } = body;

      if (!env.OPENROUTER_API_KEY) {
        set.status = 500;
        return { ok: false, message: "OPENROUTER_API_KEY environment variable not configured" };
      }

      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: handle sequential streaming steps cleanly
      return new Stream(async (stream) => {
        let promptTokens = 0;
        let completionTokens = 0;

        try {
          // biome-ignore lint/suspicious/noExplicitAny: mixed OpenAI schema types
          const payloadMessages: any[] = [
            {
              role: "system",
              content:
                "You are a helpful NAS Tools Assistant. You have access to tools that can fetch the system config, list active import/cue jobs, check server health, and control music playback via the ALSA MPD player. You can also delegate complex tasks to specialized subagents (Music Curator and System Diagnostician) who can run backend CLI tools for deep analysis. Keep your responses helpful, clear, and direct.",
            },
            ...messages,
          ];

          const openRouter = new OpenRouter({
            apiKey: env.OPENROUTER_API_KEY,
            httpReferer: "https://github.com/nas-tools",
            appTitle: "nas-tools Assistant",
          });

          // Phase 1: Call OpenRouter non-streaming to detect/handle tool calls
          // biome-ignore lint/suspicious/noExplicitAny: openrouter response type wrapper
          const firstResponse: any = await openRouter.chat.send({
            chatRequest: {
              model: env.OPENROUTER_MODEL,
              messages: payloadMessages,
              // biome-ignore lint/suspicious/noExplicitAny: schema validation mismatch
              tools: getAssistantTools() as any,
              toolChoice: "auto",
            },
          });

          if (firstResponse.usage) {
            promptTokens +=
              firstResponse.usage.promptTokens || firstResponse.usage.prompt_tokens || 0;
            completionTokens +=
              firstResponse.usage.completionTokens || firstResponse.usage.completion_tokens || 0;
          }

          const firstMessage = firstResponse.choices?.[0]?.message;

          if (!firstMessage) {
            const errPayload = { type: "text", delta: "Error: Invalid response structure from OpenRouter" };
            stream.send(JSON.stringify(errPayload) + "\n");
            stream.close();
            return;
          }

          // If the model wants to call tools, execute them and stream the final answer
          if (firstMessage.toolCalls && firstMessage.toolCalls.length > 0) {
            // Stream tool calls to client immediately
            for (const toolCall of firstMessage.toolCalls) {
              const name = toolCall.function.name;
              let args: Record<string, unknown> = {};
              try {
                args = JSON.parse(toolCall.function.arguments);
              } catch {}

              const toolCallPayload = {
                type: "tool_call",
                id: toolCall.id,
                name,
                args,
              };
              stream.send(JSON.stringify(toolCallPayload) + "\n");
            }

            payloadMessages.push(firstMessage);

            for (const toolCall of firstMessage.toolCalls) {
              const name = toolCall.function.name;
              let args: Record<string, unknown> = {};
              try {
                args = JSON.parse(toolCall.function.arguments);
              } catch {}

              // biome-ignore lint/suspicious/noExplicitAny: typecast tool response payload dynamically
              const result: any = await executeTool(name, args, deps);
              
              // Stream tool results to client
              const toolResultPayload = {
                type: "tool_result",
                id: toolCall.id,
                name,
                result,
              };
              stream.send(JSON.stringify(toolResultPayload) + "\n");

              if (result?.usage) {
                promptTokens += result.usage.promptTokens || result.usage.prompt_tokens || 0;
                completionTokens +=
                  result.usage.completionTokens || result.usage.completion_tokens || 0;
              }

              payloadMessages.push({
                role: "tool",
                toolCallId: toolCall.id,
                content: JSON.stringify(result),
              });
            }

            // Phase 2: Call OpenRouter again with stream=true after submitting tool results
            // biome-ignore lint/suspicious/noExplicitAny: openrouter response type wrapper
            const streamResponse: any = await openRouter.chat.send({
              chatRequest: {
                model: env.OPENROUTER_MODEL,
                messages: payloadMessages,
                stream: true,
                streamOptions: {
                  includeUsage: true,
                },
              },
            });

            for await (const chunk of streamResponse) {
              const text = chunk.choices?.[0]?.delta?.content;
              if (text) {
                const textPayload = { type: "text", delta: text };
                stream.send(JSON.stringify(textPayload) + "\n");
              }

              if (chunk.usage) {
                promptTokens += chunk.usage.promptTokens || chunk.usage.prompt_tokens || 0;
                completionTokens +=
                  chunk.usage.completionTokens || chunk.usage.completion_tokens || 0;
              }
            }
          } else {
            // No tool calls, just stream the text we already fetched in phase 1
            const textContent = firstMessage.content || "";
            const textPayload = { type: "text", delta: textContent };
            stream.send(JSON.stringify(textPayload) + "\n");
          }

          // Send final aggregated telemetry statistics
          const totalTokens = promptTokens + completionTokens;
          // Gemini 2.5 Flash pricing: input = $0.075 / 1M tokens, output = $0.30 / 1M tokens
          const cost = (promptTokens * 0.075 + completionTokens * 0.3) / 1000000;

          const telemetryData = {
            type: "telemetry",
            promptTokens,
            completionTokens,
            totalTokens,
            cost,
          };
          stream.send(JSON.stringify(telemetryData) + "\n");
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          stream.send(`Error executing assistant query: ${errMsg}`);
        } finally {
          stream.close();
        }
      });
    },
    {
      body: t.Object({
        messages: t.Array(
          t.Object({
            role: t.Union([
              t.Literal("user"),
              t.Literal("assistant"),
              t.Literal("system"),
              t.Literal("tool"),
            ]),
            content: t.String(),
            name: t.Optional(t.String()),
            tool_call_id: t.Optional(t.String()),
            toolCallId: t.Optional(t.String()),
            tool_calls: t.Optional(t.Any()),
            toolCalls: t.Optional(t.Any()),
          }),
        ),
      }),
    },
  );
}
