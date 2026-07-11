import {
  Activity,
  HelpCircle,
  ListChecks,
  Pause,
  Play,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ChatContainerContent,
  ChatContainerRoot,
  ChatContainerScrollAnchor,
} from "@/components/ui/chat-container";
import { Loader } from "@/components/ui/loader";
import { Message, MessageAvatar, MessageContent } from "@/components/ui/message";
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/ui/prompt-input";
import { ScrollButton } from "@/components/ui/scroll-button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAssistantStream } from "../hooks/useAssistantStream";

export function AssistantDrawer() {
  const { messages, sendMessage, clearMessages, isLoading } = useAssistantStream();
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    sendMessage(input);
    setInput("");
  };

  const handleSuggestionClick = (suggestionText: string) => {
    if (isLoading) return;
    sendMessage(suggestionText);
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-[0_4px_20px_oklch(0.58_0.14_170_/_0.4)] hover:shadow-[0_6px_25px_oklch(0.58_0.14_170_/_0.6)] bg-gradient-to-tr from-primary to-[oklch(0.65_0.14_165)] hover:from-[oklch(0.62_0.14_170)] hover:to-[oklch(0.68_0.14_160)] text-primary-foreground hover:scale-110 active:scale-95 transition-all duration-300 z-45 border-none cursor-pointer flex items-center justify-center group"
          aria-label="Open assistant"
        >
          <Sparkles className="h-6 w-6 transition-transform duration-500 group-hover:rotate-12 group-hover:scale-110" />
          <span
            className="absolute -inset-0.5 rounded-full bg-primary/20 animate-ping opacity-75 group-hover:opacity-100"
            style={{ animationDuration: "3s" }}
          />
        </button>
      </SheetTrigger>

      <SheetContent className="w-[480px] sm:w-[640px] flex flex-col h-full bg-background/95 backdrop-blur-lg border-l border-border/40 z-50 p-0 shadow-2xl">
        <SheetHeader className="flex flex-row items-center justify-between border-b border-border/30 px-6 py-4.5 bg-card/30 backdrop-blur-md">
          <SheetTitle className="flex items-center gap-2 text-foreground font-semibold tracking-tight">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-4.5 w-4.5 text-primary animate-pulse" />
            </div>
            nas-tools assistant
          </SheetTitle>
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg cursor-pointer transition-colors"
              onClick={clearMessages}
              disabled={isLoading}
              title="Clear conversation"
            >
              <Trash2 className="h-4.5 w-4.5" />
            </Button>
          )}
        </SheetHeader>

        {/* ChatContainer handles auto-scroll anchoring */}
        <ChatContainerRoot className="flex-1 px-6 py-5 overflow-y-auto bg-gradient-to-b from-background via-muted/5 to-background relative">
          <ChatContainerContent className="gap-5">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center pt-8 text-center animate-fade-in">
                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                  <HelpCircle className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-base font-medium text-foreground tracking-tight mb-2">
                  How can I help you today?
                </h3>
                <p className="text-xs text-muted-foreground max-w-[280px] leading-relaxed mb-8">
                  Ask me to control player, check job list, or get system health.
                </p>

                {/* Suggestions Grid */}
                <div className="grid grid-cols-2 gap-3 w-full max-w-[420px]">
                  <button
                    type="button"
                    onClick={() => handleSuggestionClick("pause music player")}
                    className="flex flex-col items-start gap-1.5 p-3 rounded-xl border border-border/50 bg-card/40 hover:bg-accent/40 text-left cursor-pointer transition-all duration-200 hover:-translate-y-0.5 group"
                  >
                    <div className="h-7 w-7 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500">
                      <Pause className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-xs font-medium text-foreground">Pause Playback</span>
                    <span className="text-[10px] text-muted-foreground">Pause ALSA MPD player</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSuggestionClick("resume music player")}
                    className="flex flex-col items-start gap-1.5 p-3 rounded-xl border border-border/50 bg-card/40 hover:bg-accent/40 text-left cursor-pointer transition-all duration-200 hover:-translate-y-0.5 group"
                  >
                    <div className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                      <Play className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-xs font-medium text-foreground">Resume Playback</span>
                    <span className="text-[10px] text-muted-foreground">
                      Resume ALSA MPD player
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSuggestionClick("list active jobs")}
                    className="flex flex-col items-start gap-1.5 p-3 rounded-xl border border-border/50 bg-card/40 hover:bg-accent/40 text-left cursor-pointer transition-all duration-200 hover:-translate-y-0.5 group"
                  >
                    <div className="h-7 w-7 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                      <ListChecks className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-xs font-medium text-foreground">Check Active Jobs</span>
                    <span className="text-[10px] text-muted-foreground">
                      List import and cue jobs
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSuggestionClick("check server health")}
                    className="flex flex-col items-start gap-1.5 p-3 rounded-xl border border-border/50 bg-card/40 hover:bg-accent/40 text-left cursor-pointer transition-all duration-200 hover:-translate-y-0.5 group"
                  >
                    <div className="h-7 w-7 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500">
                      <Activity className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-xs font-medium text-foreground">Server Health</span>
                    <span className="text-[10px] text-muted-foreground">Verify backend status</span>
                  </button>
                </div>
              </div>
            )}

            {messages.map((m, idx) => (
              <Message key={idx} className={m.role === "user" ? "flex-row-reverse" : "flex-row"}>
                <MessageAvatar
                  src=""
                  alt={m.role === "user" ? "User" : "AI"}
                  fallback={m.role === "user" ? "U" : "AI"}
                  className={
                    m.role === "user"
                      ? "bg-primary/20 text-primary-foreground font-semibold"
                      : "bg-gradient-to-tr from-primary to-[oklch(0.65_0.14_165)] text-primary-foreground font-semibold"
                  }
                />
                <MessageContent
                  markdown
                  className={
                    m.role === "user"
                      ? "bg-gradient-to-br from-primary to-[oklch(0.52_0.13_170)] text-primary-foreground shadow-md rounded-2xl rounded-tr-none px-3.5 py-2 border-none max-w-[85%] leading-relaxed text-[13.5px]"
                      : "bg-card border border-border/50 text-foreground shadow-sm rounded-2xl rounded-tl-none px-4 py-2.5 max-w-[85%] leading-relaxed text-[13.5px] prose-invert"
                  }
                >
                  {m.content}
                </MessageContent>
              </Message>
            ))}

            {isLoading && (
              <Message className="flex-row">
                <MessageAvatar
                  src=""
                  alt="AI"
                  fallback="AI"
                  className="bg-gradient-to-tr from-primary to-[oklch(0.65_0.14_165)] text-primary-foreground font-semibold"
                />
                <MessageContent className="bg-card border border-border/50 text-foreground shadow-sm rounded-2xl rounded-tl-none px-4 py-3 flex items-center justify-center min-w-[65px] h-[36px]">
                  <Loader variant="typing" size="sm" />
                </MessageContent>
              </Message>
            )}

            <ChatContainerScrollAnchor />
          </ChatContainerContent>

          {/* Scroll down quick-button */}
          <ScrollButton className="absolute bottom-4 right-4 bg-background border border-border/40 hover:bg-accent/40 shadow-xl cursor-pointer" />
        </ChatContainerRoot>

        {/* PromptInput container with glass effect */}
        <div className="p-4 border-t border-border/20 bg-card/20 backdrop-blur-md">
          <PromptInput
            value={input}
            onValueChange={setInput}
            onSubmit={handleSend}
            disabled={isLoading}
            className="flex items-end gap-2 border border-border/50 focus-within:border-primary/80 focus-within:ring-2 focus-within:ring-primary/20 rounded-2xl p-2 bg-background/50 shadow-inner transition-all duration-200"
          >
            <PromptInputTextarea
              placeholder="Message nas-tools..."
              className="flex-1 max-h-[120px] text-foreground placeholder:text-muted-foreground/60 text-sm leading-relaxed"
            />
            <PromptInputActions>
              <PromptInputAction tooltip="Send message">
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={isLoading || !input.trim()}
                  className="h-8.5 w-8.5 rounded-xl bg-primary text-primary-foreground disabled:bg-muted disabled:text-muted-foreground flex items-center justify-center cursor-pointer hover:bg-primary/90 transition-colors border-none"
                >
                  <Send className="h-4 w-4" />
                </button>
              </PromptInputAction>
            </PromptInputActions>
          </PromptInput>
        </div>
      </SheetContent>
    </Sheet>
  );
}
