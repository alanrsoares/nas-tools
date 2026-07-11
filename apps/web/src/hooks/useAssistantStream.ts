import { useState } from "react";
import { authHeaders } from "@/lib/auth";

export interface MessageType {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
}

export function useAssistantStream() {
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [isLoading, setIsLoading] = useState(false);

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

      // Add placeholder for streaming assistant response
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        assistantReply += chunk;

        setMessages((prev) => {
          const next = [...prev];
          const lastIndex = next.length - 1;
          if (next[lastIndex].role === "assistant") {
            next[lastIndex] = { role: "assistant", content: assistantReply };
          }
          return next;
        });
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
  };

  return { messages, sendMessage, clearMessages, isLoading };
}
