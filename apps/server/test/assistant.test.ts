import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { env } from "../src/env.js";
import { Subagent } from "../src/modules/assistant.js";
import { createTestHarness } from "./testing.js";

describe("assistant module & subagent builder", () => {
  let harness: ReturnType<typeof createTestHarness>;

  beforeEach(() => {
    harness = createTestHarness();
  });

  afterEach(() => {
    harness.teardown();
  });

  it("should fail validation if messages are missing", async () => {
    const response = await harness.api.handle(
      new Request("http://localhost/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(response.status).toBe(422);
  });

  it("should fail with 500 if OPENROUTER_API_KEY is not configured", async () => {
    const prevKey = env.OPENROUTER_API_KEY;
    // @ts-expect-error - mutate read-only/defined properties safely in test environment
    env.OPENROUTER_API_KEY = "";

    try {
      const response = await harness.api.handle(
        new Request("http://localhost/api/assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
        }),
      );
      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.message).toContain("OPENROUTER_API_KEY");
    } finally {
      // @ts-expect-error
      env.OPENROUTER_API_KEY = prevKey;
    }
  });

  it("should chain builder methods correctly on Subagent", async () => {
    const testAgent = new Subagent<{ query: string }>("test_agent", "Description of test agent")
      .prompt("System prompt test")
      .args({ type: "object", properties: { query: { type: "string" } } })
      .context((args) => `User query is: ${args.query}`);

    expect(testAgent.name).toBe("test_agent");
    expect(testAgent.description).toBe("Description of test agent");
    expect(testAgent.systemPrompt).toBe("System prompt test");
    expect(testAgent.schema).toEqual({
      type: "object",
      properties: { query: { type: "string" } },
    });

    const contextResult = await testAgent.contextFn?.({ query: "find flac" });
    expect(contextResult).toBe("User query is: find flac");
  });
});
