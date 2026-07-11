import { Stream } from "@elysiajs/stream";
import { isErr } from "@onrails/result";
import { OpenRouter } from "@openrouter/sdk";
import { $ } from "bun";
import { t } from "elysia";
import { env } from "../env.js";
import { publicSubrouter } from "../lib/subrouter.js";
import type { Deps } from "../types/deps.js";

class Subagent<TArgs = Record<string, unknown>> {
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

  async run(task: string, args: TArgs, openRouter: OpenRouter): Promise<string> {
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

    return response.choices?.[0]?.message?.content || "No report generated";
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
      default: {
        const matchedAgent = subagents.find((a) => a.name === name);
        if (matchedAgent) {
          const openRouter = new OpenRouter({ apiKey: env.OPENROUTER_API_KEY });
          // biome-ignore lint/suspicious/noExplicitAny: type safety verified by runtime checks
          const report = await matchedAgent.run(args.task as string, args as any, openRouter);
          return { ok: true, report };
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

          const firstMessage = firstResponse.choices?.[0]?.message;

          if (!firstMessage) {
            stream.send("Error: Invalid response structure from OpenRouter");
            stream.close();
            return;
          }

          // If the model wants to call tools, execute them and stream the final answer
          if (firstMessage.tool_calls && firstMessage.tool_calls.length > 0) {
            payloadMessages.push(firstMessage);

            for (const toolCall of firstMessage.tool_calls) {
              const name = toolCall.function.name;
              let args: Record<string, unknown> = {};
              try {
                args = JSON.parse(toolCall.function.arguments);
              } catch {}

              const result = await executeTool(name, args, deps);
              payloadMessages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                name: name,
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
              },
            });

            for await (const chunk of streamResponse) {
              const text = chunk.choices?.[0]?.delta?.content;
              if (text) stream.send(text);
            }
          } else {
            // No tool calls, just stream the text we already fetched in phase 1
            const textContent = firstMessage.content || "";
            stream.send(textContent);
          }
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
            tool_calls: t.Optional(t.Any()),
          }),
        ),
      }),
    },
  );
}
