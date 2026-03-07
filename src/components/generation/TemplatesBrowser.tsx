import { useState, useRef, useEffect } from "react";
import { X, Search, FileText } from "lucide-react";
import { TEMPLATE_CATEGORIES, type PromptTemplate } from "@/lib/promptTemplates";
import { useGenerationStore } from "@/stores/generation";
import { cn } from "@/lib/utils";

interface TemplatesBrowserProps {
  onClose: () => void;
}

export function TemplatesBrowser({ onClose }: TemplatesBrowserProps) {
  const setPrompt = useGenerationStore((s) => s.setPrompt);
  const [selectedCategory, setSelectedCategory] = useState(TEMPLATE_CATEGORIES[0].id);
  const [searchQuery, setSearchQuery] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // All templates flat for search
  const allTemplates = TEMPLATE_CATEGORIES.flatMap((cat) =>
    cat.templates.map((t) => ({ ...t, categoryId: cat.id, categoryName: cat.name, categoryIcon: cat.icon }))
  );

  const filteredTemplates = searchQuery
    ? allTemplates.filter(
        (t) =>
          t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.prompt.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : null;

  const currentCategory = TEMPLATE_CATEGORIES.find((c) => c.id === selectedCategory)!;

  const handleSelect = (template: PromptTemplate) => {
    setPrompt(template.prompt);
    onClose();
    // Auto-resize prompt textarea
    requestAnimationFrame(() => {
      const el = document.getElementById("prompt-input") as HTMLTextAreaElement;
      if (el) {
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
      }
    });
  };

  const displayTemplates = filteredTemplates ?? currentCategory.templates;

  return (
    <div
      ref={panelRef}
      className="absolute left-0 right-0 top-0 z-50 bg-bg-secondary border border-border-default rounded-lg shadow-2xl overflow-hidden animate-fade-in"
      style={{ maxHeight: "480px" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-default">
        <div className="flex items-center gap-2">
          <FileText size={13} className="text-accent" />
          <span className="text-xs font-medium text-text-primary">Prompt Templates</span>
          <span className="text-[10px] text-text-muted">
            {allTemplates.length} templates
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-text-muted hover:text-text-secondary transition-colors"
        >
          <X size={13} />
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-default">
        <Search size={12} className="text-text-muted shrink-0" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search templates..."
          autoFocus
          className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-muted focus:outline-none"
        />
      </div>

      <div className="flex" style={{ height: "360px" }}>
        {/* Category sidebar */}
        {!filteredTemplates && (
          <div className="w-28 shrink-0 border-r border-border-default overflow-y-auto py-1">
            {TEMPLATE_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={cn(
                  "w-full flex items-center gap-1.5 px-3 py-2 text-left transition-colors",
                  selectedCategory === cat.id
                    ? "bg-accent-muted text-accent"
                    : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                )}
              >
                <span className="text-xs">{cat.icon}</span>
                <span className="text-[11px] font-medium truncate">{cat.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Template list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {filteredTemplates && (
            <div className="px-1 py-1 text-[10px] text-text-muted">
              {filteredTemplates.length} result{filteredTemplates.length !== 1 ? "s" : ""}
            </div>
          )}
          {displayTemplates.length === 0 ? (
            <div className="flex items-center justify-center h-full text-xs text-text-muted">
              No templates found
            </div>
          ) : (
            displayTemplates.map((template) => (
              <button
                key={template.id}
                onClick={() => handleSelect(template)}
                className="w-full text-left p-2.5 rounded-md border border-transparent hover:border-border-default hover:bg-bg-hover transition-all group"
              >
                <div className="flex items-center gap-2 mb-1">
                  {filteredTemplates && "categoryIcon" in template && (
                    <span className="text-xs">{(template as any).categoryIcon}</span>
                  )}
                  <span className="text-xs font-medium text-text-primary group-hover:text-accent transition-colors">
                    {template.title}
                  </span>
                </div>
                <p className="text-[11px] text-text-muted leading-relaxed line-clamp-2">
                  {template.prompt}
                </p>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
