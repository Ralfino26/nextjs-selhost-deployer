"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, ArrowUp, ArrowDown, Maximize2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface DeployModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  projectDomain?: string;
  deployLogs: string;
  deployPhases: {
    initializing: "pending" | "active" | "complete";
    building: "pending" | "active" | "complete";
    deploying: "pending" | "active" | "complete";
    cleanup: "pending" | "active" | "complete";
    postProcessing: "pending" | "active" | "complete";
  };
  isDeploying: boolean;
}

export function DeployModal({
  isOpen,
  onClose,
  projectName,
  projectDomain,
  deployLogs,
  deployPhases,
  isDeploying,
}: DeployModalProps) {
  const [isMaximized, setIsMaximized] = useState(false);

  if (!isOpen) return null;

  const formatLogsWithLineNumbers = (logs: string) => {
    const lines = logs.split("\n");
    return lines.map((line, index) => ({
      number: index + 1,
      content: line,
    }));
  };

  const logLines = formatLogsWithLineNumbers(deployLogs);

  const handleCopyLogs = async () => {
    try {
      await navigator.clipboard.writeText(deployLogs);
      toast.success("Logs copied to clipboard");
    } catch (error) {
      toast.error("Failed to copy logs");
    }
  };

  const scrollToTop = () => {
    const logContainer = document.getElementById("deploy-logs-container");
    if (logContainer) {
      logContainer.scrollTop = 0;
    }
  };

  const scrollToBottom = () => {
    const logContainer = document.getElementById("deploy-logs-container");
    if (logContainer) {
      logContainer.scrollTop = logContainer.scrollHeight;
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity ${
        isMaximized ? "p-0" : "p-4"
      }`}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDeploying) {
          onClose();
        }
      }}
    >
      <div
        className={`bg-white shadow-2xl border border-gray-200 flex flex-col overflow-hidden transition-all ${
          isMaximized
            ? "w-full h-full rounded-none"
            : "w-full max-w-6xl max-h-[90vh] rounded-xl"
        }`}
      >
        {/* Header Toolbar */}
        <header className="sticky top-0 z-10 border-b border-gray-200 bg-white px-6 py-4 flex items-center justify-between flex-wrap gap-4">
          <h2 className="text-lg font-semibold text-gray-900 mr-auto">Deploy log</h2>
          <div className="flex items-center gap-2 flex-wrap">
            {projectDomain && (
              <a
                href={`https://${projectDomain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center h-8 px-3 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 gap-2"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Preview
              </a>
            )}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyLogs}
                className="h-8 w-8 p-0"
                title="Copy log content to clipboard"
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={scrollToTop}
                className="h-8 w-8 p-0"
                title="Go to top"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={scrollToBottom}
                className="h-8 w-8 p-0"
                title="Go to bottom"
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsMaximized(!isMaximized)}
                className="h-8 gap-2"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                {isMaximized ? "Restore" : "Maximize log"}
              </Button>
            </div>
          </div>
        </header>

        {/* Logs Container - Single section with all logs */}
        <div className="flex-1 min-h-0 bg-black overflow-hidden" id="deploy-logs-container">
          <div className="h-full overflow-y-auto">
            <div className="bg-black">
              <div className="font-mono text-sm text-white antialiased p-6 pr-0">
                {logLines.length > 0 ? (
                  logLines.map((line, idx) => (
                    <div
                      key={idx}
                      id={`L${line.number}`}
                      className="relative pl-10 hover:bg-gray-900 min-h-[1.5rem]"
                    >
                      <div
                        className="absolute left-0 top-0 h-full min-w-16 text-right pr-4 text-gray-500 hover:text-white cursor-pointer select-none leading-[1.5rem]"
                        data-line-number={line.number}
                      >
                        {line.number}
                      </div>
                      <div className="border-l-2 border-gray-800 break-words pl-10 pr-4 leading-[1.5rem] whitespace-pre-wrap">
                        {line.content || " "}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-gray-500 pl-10">
                    <span className="inline-block animate-pulse">▋</span> Waiting for logs...
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

