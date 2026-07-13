import { useState } from "react";
import { authHeaders } from "@/lib/auth";

export interface ToolInvocation {
  toolCallId: string;
  toolName: string;
  args: any;
  result?: any;
}

export interface MessageType {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolInvocations?: ToolInvocation[];
}

export interface TelemetryType {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
}

export function useAssistantStream() {
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [telemetry, setTelemetry] = useState<TelemetryType>({
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cost: 0,
  });

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: handle fetch streaming loop cleanly
  const sendMessage = async (userText: string) => {
    if (!userText.trim() || isLoading) return;

    const userMessage: MessageType = { role: "user", content: userText };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setIsLoading(true);

    try {
      const response = await fetch(`${window.location.origin}/api/assistant/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({ messages: updatedMessages }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP error ${response.status}`);
      }

      if (!response.body) {
        throw new Error("No response body received from assistant endpoint");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantReply = "";
      let toolCalls: ToolInvocation[] = [];

      // Add placeholder for streaming assistant response
      setMessages((prev) => [...prev, { role: "assistant", content: "", toolInvocations: [] }]);

      const handleLine = (line: string): boolean => {
        if (!line.startsWith("data: ")) return false;
        const rawContent = line.endsWith("\r") ? line.slice(6, -1) : line.slice(6);
        if (!rawContent.trim()) return false;

        try {
          const data = JSON.parse(rawContent);
          if (data.type === "telemetry") {
            setTelemetry((prev) => ({
              promptTokens: prev.promptTokens + (data.promptTokens || 0),
              completionTokens: prev.completionTokens + (data.completionTokens || 0),
              totalTokens: prev.totalTokens + (data.totalTokens || 0),
              cost: prev.cost + (data.cost || 0),
            }));
            return false;
          } else if (data.type === "text") {
            assistantReply += data.delta;
            return true;
          } else if (data.type === "tool_call") {
            toolCalls.push({
              toolCallId: data.id,
              toolName: data.name,
              args: data.args,
            });
            return true;
          } else if (data.type === "tool_result") {
            toolCalls = toolCalls.map((tc) =>
              tc.toolCallId === data.id ? { ...tc, result: data.result } : tc
            );
            return true;
          }
        } catch (err) {
          assistantReply += rawContent;
          return true;
        }
        return false;
      };

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let hasNewContent = false;
        for (const line of lines) {
          if (handleLine(line)) {
            hasNewContent = true;
          } else if (line === "data:") {
            hasNewContent = true;
          }
        }

        if (hasNewContent) {
          setMessages((prev) => {
            const next = [...prev];
            const lastIndex = next.length - 1;
            if (next[lastIndex].role === "assistant") {
              next[lastIndex] = {
                role: "assistant",
                content: assistantReply,
                toolInvocations: [...toolCalls],
              };
            }
            return next;
          });
        }
      }

      if (buffer) {
        if (handleLine(buffer)) {
          setMessages((prev) => {
            const next = [...prev];
            const lastIndex = next.length - 1;
            if (next[lastIndex].role === "assistant") {
              next[lastIndex] = {
                role: "assistant",
                content: assistantReply,
                toolInvocations: [...toolCalls],
              };
            }
            return next;
          });
        }
      }
    } catch (error: unknown) {
      console.error("Stream failed", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${errorMessage}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearMessages = () => {
    setMessages([]);
    setTelemetry({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cost: 0,
    });
  };

  return { messages, sendMessage, clearMessages, telemetry, isLoading };
}
