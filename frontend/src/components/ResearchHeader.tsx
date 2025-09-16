import React from "react";
import { Sun, Moon, Bot } from "lucide-react";

interface ResearchHeaderProps {
  mode: "light" | "dark";
  onToggleMode: () => void;
}

export const ResearchHeader: React.FC<ResearchHeaderProps> = ({ mode, onToggleMode }) => {
  return (
    <header className="relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 gradient-primary opacity-20" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background" />

      <div className="relative container mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center glow-primary">
              <Bot className="w-5 h-5 text-primary-foreground" />
            </div>
            <h1 className="text-3xl font-bold gradient-text">Research AI Agent</h1>
          </div>

          <button
            type="button"
            onClick={onToggleMode}
            aria-label="Toggle color mode"
            className="p-2 rounded-full glass-surface border border-border hover:border-primary/50"
            title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {mode === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
        {/* The query input lives in App.tsx immediately below this header */}
      </div>
    </header>
  );
};