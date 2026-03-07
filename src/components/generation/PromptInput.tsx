import { useGenerationStore } from "@/stores/generation";
import { usePromptHistoryStore } from "@/stores/promptHistory";
import { STYLE_PRESETS } from "@/lib/constants";
import { useRef, useCallback, useState, useEffect } from "react";
import { Clock, X, Trash2, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export function PromptInput() {
  const prompt = useGenerationStore((s) => s.prompt);
  const setPrompt = useGenerationStore((s) => s.setPrompt);
  const isGenerating = useGenerationStore((s) => s.isGenerating);
  const entries = usePromptHistoryStore((s) => s.entries);
  const removeEntry = usePromptHistoryStore((s) => s.removeEntry);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [showHistory, setShowHistory] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredEntries = searchQuery
    ? entries.filter((e) =>
        e.prompt.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : entries;

  // Close dropdown on outside click
  useEffect(() => {
    if (!showHistory) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowHistory(false);
        setSearchQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showHistory]);

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setPrompt(e.target.value);
      const el = e.target;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    },
    [setPrompt]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && e.metaKey) {
        e.preventDefault();
        document.getElementById("generate-button")?.click();
      }
    },
    []
  );

  const handleSelectEntry = useCallback(
    (entryPrompt: string) => {
      setPrompt(entryPrompt);
      setShowHistory(false);
      setSearchQuery("");
      // Auto-resize textarea after load
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.style.height = "auto";
          el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
        }
      });
    },
    [setPrompt]
  );

  const handleClear = useCallback(() => {
    setPrompt("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [setPrompt]);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - ts;
    if (diff < 60_000) return "just now";
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
    if (d.toDateString() === new Date(now.getTime() - 86400_000).toDateString()) return "yesterday";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="flex items-center justify-between mb-2">
        <label
          htmlFor="prompt-input"
          className="text-xs font-medium text-text-secondary uppercase tracking-wider"
        >
          Prompt
        </label>
        <div className="flex items-center gap-1">
          {prompt.length > 0 && (
            <button
              onClick={handleClear}
              className="p-0.5 rounded text-text-muted hover:text-text-secondary transition-colors"
              title="Clear prompt"
            >
              <X size={12} />
            </button>
          )}
          {entries.length > 0 && (
            <button
              onClick={() => { setShowHistory(!showHistory); setSearchQuery(""); }}
              className={cn(
                "p-0.5 rounded transition-colors",
                showHistory
                  ? "text-accent"
                  : "text-text-muted hover:text-text-secondary"
              )}
              title={`Prompt history (${entries.length})`}
            >
              <Clock size={12} />
            </button>
          )}
        </div>
      </div>

      <textarea
        ref={textareaRef}
        id="prompt-input"
        value={prompt}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        disabled={isGenerating}
        placeholder="Describe what you want to create..."
        rows={3}
        className="w-full bg-bg-primary border border-border-default rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors disabled:opacity-50"
      />

      <div className="flex justify-end mt-1">
        <span className="text-[10px] text-text-muted">
          {prompt.length > 0 ? `${prompt.length} chars` : "⌘Enter to generate"}
        </span>
      </div>

      {/* History dropdown */}
      {showHistory && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 bg-bg-secondary border border-border-default rounded-lg shadow-xl overflow-hidden animate-fade-in">
          {/* Search bar */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border-default">
            <Search size={12} className="text-text-muted shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search history..."
              autoFocus
              className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-muted focus:outline-none"
            />
            <span className="text-[10px] text-text-muted shrink-0">
              {filteredEntries.length}
            </span>
          </div>

          {/* Entries */}
          <div className="max-h-64 overflow-y-auto">
            {filteredEntries.length === 0 ? (
              <div className="px-3 py-4 text-xs text-text-muted text-center">
                {searchQuery ? "No matching prompts" : "No history yet"}
              </div>
            ) : (
              filteredEntries.map((entry) => {
                const presetInfo = entry.stylePresetId
                  ? STYLE_PRESETS.find((p) => p.id === entry.stylePresetId)
                  : null;
                return (
                  <div
                    key={entry.id}
                    className="group flex items-start gap-2 px-3 py-2 hover:bg-bg-hover cursor-pointer border-b border-border-default/50 last:border-0"
                    onClick={() => handleSelectEntry(entry.prompt)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-text-primary leading-snug line-clamp-2">
                        {entry.prompt}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-text-muted">
                          {formatTime(entry.timestamp)}
                        </span>
                        {presetInfo && (
                          <span className="text-[10px] text-text-muted">
                            {presetInfo.icon} {presetInfo.name}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeEntry(entry.id);
                      }}
                      className="p-1 rounded opacity-0 group-hover:opacity-100 text-text-muted hover:text-red-400 transition-all shrink-0"
                      title="Remove from history"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
