"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Copy, ArrowUp, ArrowDown, Maximize2, ExternalLink, CheckCircle2, Loader2, ChevronDown, ChevronRight } from "lucide-react";
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
  const [expandedPhases, setExpandedPhases] = useState<Record<string, boolean>>({
    building: true,
    deploying: false,
  });
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Split logs into phases - memoized
  const { buildLogs, deployLogs: deployPhaseLogs } = useMemo(() => {
    const stopStartMarker = "🛑 Stopping containers";
    const buildStartMarker = "🔨 Building images";
    const buildEndMarker = "✅ Build completed";
    const deployStartMarker = "🚀 Starting containers";
    const deployEndMarker = "✅ Deployment completed";

    const buildLogsArray: string[] = [];
    const deployLogsArray: string[] = [];
    let currentPhase: "build" | "deploy" | null = null;

    const lines = deployLogs.split("\n");
    for (const line of lines) {
      if (line.includes(stopStartMarker) || line.includes("Stopping containers")) {
        // Start of stopping phase, which is part of building phase
        currentPhase = "build";
        buildLogsArray.push(line);
      } else if (line.includes(buildStartMarker) || line.includes("🔨 Starting build") || line.includes("Building images")) {
        currentPhase = "build";
        buildLogsArray.push(line);
      } else if (line.includes(buildEndMarker)) {
        if (currentPhase === "build") {
          buildLogsArray.push(line);
        }
        currentPhase = null;
      } else if (line.includes(deployStartMarker)) {
        currentPhase = "deploy";
        deployLogsArray.push(line);
      } else if (line.includes(deployEndMarker)) {
        if (currentPhase === "deploy") {
          deployLogsArray.push(line);
        }
        currentPhase = null;
      } else {
        if (currentPhase === "build") {
          buildLogsArray.push(line);
        } else if (currentPhase === "deploy") {
          deployLogsArray.push(line);
        }
      }
    }

    return { buildLogs: buildLogsArray, deployLogs: deployLogsArray };
  }, [deployLogs]);

  // Format logs with line numbers - memoized
  const buildLogLines = useMemo(() => {
    return buildLogs.map((line, index) => ({
      number: index + 1,
      content: line,
    }));
  }, [buildLogs]);

  const deployLogLines = useMemo(() => {
    return deployPhaseLogs.map((line, index) => ({
      number: index + 1,
      content: line,
    }));
  }, [deployPhaseLogs]);

  const togglePhase = useCallback((phaseKey: string) => {
    setExpandedPhases((prev) => ({
      ...prev,
      [phaseKey]: !prev[phaseKey],
    }));
  }, []);

  const handleCopyLogs = useCallback(async () => {
    try {
      // Copy all logs (both build and deploy)
      const allLogs = deployLogs || "";
      if (!allLogs) {
        toast.error("No logs to copy");
        return;
      }

      // Try modern clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(allLogs);
          toast.success("Logs copied to clipboard");
          return;
        } catch (clipboardError) {
          console.warn("Clipboard API failed, trying fallback:", clipboardError);
        }
      }

      // Fallback: use execCommand for older browsers or HTTP
      const textArea = document.createElement("textarea");
      textArea.value = allLogs;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      try {
        const successful = document.execCommand("copy");
        document.body.removeChild(textArea);
        
        if (successful) {
          toast.success("Logs copied to clipboard");
        } else {
          throw new Error("execCommand('copy') failed");
        }
      } catch (execError) {
        document.body.removeChild(textArea);
        throw execError;
      }
    } catch (error) {
      console.error("Failed to copy logs:", error);
      toast.error("Failed to copy logs. Please select and copy manually.");
    }
  }, [deployLogs]);

  const scrollToTop = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, []);

  // Auto-scroll to bottom when new logs arrive (only if already near bottom)
  useEffect(() => {
    if (!scrollContainerRef.current || !deployLogs) return;
    
    const container = scrollContainerRef.current;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    if (isNearBottom) {
      const timeoutId = setTimeout(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
      }, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [deployLogs]);

  if (!isOpen) return null;

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
      onWheel={(e) => {
        // Stop wheel events from propagating to body
        e.stopPropagation();
      }}
    >
      <div
        className={`bg-white shadow-2xl border border-gray-200 flex flex-col transition-all ${
          isMaximized
            ? "w-full h-full rounded-none"
            : "w-full max-w-6xl h-[90vh] rounded-xl"
        }`}
        onClick={(e) => {
          // Prevent clicks inside modal from closing it
          e.stopPropagation();
        }}
        style={{
          maxHeight: isMaximized ? "100vh" : "90vh",
        }}
      >
        {/* Header Toolbar */}
        <header className="flex-shrink-0 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white px-6 py-4 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {isDeploying && (
                <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
              )}
              <h2 className="text-lg font-semibold text-gray-900">
                {isDeploying ? "Deploying..." : "Deploy log"}
              </h2>
            </div>
            {projectName && (
              <span className="text-sm text-gray-500 font-mono bg-gray-100 px-2 py-1 rounded">
                {projectName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {projectDomain && (
              <a
                href={`https://${projectDomain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center h-9 px-4 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors gap-2 shadow-sm"
              >
                <ExternalLink className="h-4 w-4" />
                Preview
              </a>
            )}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyLogs}
                className="h-8 w-8 p-0 hover:bg-white"
                title="Copy log content to clipboard"
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={scrollToTop}
                className="h-8 w-8 p-0 hover:bg-white"
                title="Go to top"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={scrollToBottom}
                className="h-8 w-8 p-0 hover:bg-white"
                title="Go to bottom"
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsMaximized(!isMaximized)}
              className="h-9 gap-2 border-gray-300 hover:bg-gray-50"
            >
              <Maximize2 className="h-4 w-4" />
              {isMaximized ? "Restore" : "Maximize"}
            </Button>
          </div>
        </header>

        {/* Logs Container with Collapsible Sections */}
        <div 
          className="flex-1 min-h-0 bg-gray-900 overflow-hidden flex flex-col" 
          id="deploy-logs-container"
        >
          <div 
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto min-h-0"
            onWheel={(e) => {
              // Stop wheel events from propagating to body
              e.stopPropagation();
            }}
            onTouchMove={(e) => {
              // Stop touch events from propagating to body
              e.stopPropagation();
            }}
            style={{ 
              overscrollBehavior: "contain",
              WebkitOverflowScrolling: "touch"
            }}
          >
            {/* Building Phase */}
            {(buildLogs.length > 0 || deployPhases.building !== "pending") && (
              <div className="border-b border-gray-700">
                {/* Phase Header - Always clickable */}
                <button
                  onClick={() => togglePhase("building")}
                  className="w-full relative bg-gray-800 hover:bg-gray-700 text-left transition-colors duration-150"
                >
                  <div className="flex items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-3">
                      {expandedPhases.building ? (
                        <ChevronDown className="h-5 w-5 text-gray-400 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
                      )}
                      <h3 className="font-semibold text-base text-white">Building</h3>
                    </div>
                    <div className="flex items-center gap-3">
                      {deployPhases.building === "complete" && (
                        <span className="flex items-center gap-2 text-green-400">
                          <CheckCircle2 className="h-5 w-5" />
                          <span className="text-xs font-medium bg-green-900/30 text-green-400 px-3 py-1.5 rounded-full border border-green-700">
                            Complete
                          </span>
                        </span>
                      )}
                      {deployPhases.building === "active" && (
                        <span className="flex items-center gap-2 text-blue-400">
                          <Loader2 className="h-5 w-5 animate-spin" />
                          <span className="text-xs font-medium bg-blue-900/30 text-blue-400 px-3 py-1.5 rounded-full border border-blue-700">
                            In progress
                          </span>
                        </span>
                      )}
                      {deployPhases.building === "pending" && (
                        <span className="text-xs font-medium text-gray-500 px-3 py-1.5 rounded-full bg-gray-700/50">
                          Pending
                        </span>
                      )}
                      {buildLogs.length > 0 && (
                        <span className="text-xs text-gray-400 font-mono bg-gray-700/50 px-2 py-1 rounded">
                          {buildLogs.length} lines
                        </span>
                      )}
                    </div>
                  </div>
                </button>
                
                {/* Phase Content - Collapsible */}
                {expandedPhases.building && (
                  <div className="bg-black border-t border-gray-800">
                    <div className="font-mono text-sm text-gray-100 antialiased p-6 pr-0">
                      {buildLogLines.length > 0 ? (
                        <div className="space-y-0">
                          {buildLogLines.map((line, idx) => (
                            <div
                              key={idx}
                              id={`build-L${line.number}`}
                              className="relative pl-16 hover:bg-gray-900/50 min-h-[1.5rem] group transition-colors"
                            >
                              <div
                                className="absolute left-0 top-0 h-full min-w-[4rem] text-right pr-4 text-gray-600 group-hover:text-gray-400 cursor-pointer select-none leading-[1.5rem] font-normal"
                                data-line-number={line.number}
                              >
                                {line.number}
                              </div>
                              <div className="border-l border-gray-800 group-hover:border-gray-700 break-words pl-6 pr-4 leading-[1.5rem] whitespace-pre-wrap text-gray-200">
                                {line.content || " "}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-gray-500 pl-16 flex items-center gap-2">
                          <span className="inline-block animate-pulse">▋</span>
                          <span>Waiting for build logs...</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Deploying Phase */}
            {(deployPhaseLogs.length > 0 || deployPhases.deploying !== "pending") && (
              <div className="border-b border-gray-700">
                {/* Phase Header - Always clickable */}
                <button
                  onClick={() => togglePhase("deploying")}
                  className="w-full relative bg-gray-800 hover:bg-gray-700 text-left transition-colors duration-150"
                >
                  <div className="flex items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-3">
                      {expandedPhases.deploying ? (
                        <ChevronDown className="h-5 w-5 text-gray-400 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
                      )}
                      <h3 className="font-semibold text-base text-white">Deploying</h3>
                    </div>
                    <div className="flex items-center gap-3">
                      {deployPhases.deploying === "complete" && (
                        <span className="flex items-center gap-2 text-green-400">
                          <CheckCircle2 className="h-5 w-5" />
                          <span className="text-xs font-medium bg-green-900/30 text-green-400 px-3 py-1.5 rounded-full border border-green-700">
                            Complete
                          </span>
                        </span>
                      )}
                      {deployPhases.deploying === "active" && (
                        <span className="flex items-center gap-2 text-blue-400">
                          <Loader2 className="h-5 w-5 animate-spin" />
                          <span className="text-xs font-medium bg-blue-900/30 text-blue-400 px-3 py-1.5 rounded-full border border-blue-700">
                            In progress
                          </span>
                        </span>
                      )}
                      {deployPhases.deploying === "pending" && (
                        <span className="text-xs font-medium text-gray-500 px-3 py-1.5 rounded-full bg-gray-700/50">
                          Pending
                        </span>
                      )}
                      {deployPhaseLogs.length > 0 && (
                        <span className="text-xs text-gray-400 font-mono bg-gray-700/50 px-2 py-1 rounded">
                          {deployPhaseLogs.length} lines
                        </span>
                      )}
                    </div>
                  </div>
                </button>
                
                {/* Phase Content - Collapsible */}
                {expandedPhases.deploying && (
                  <div className="bg-black border-t border-gray-800">
                    <div className="font-mono text-sm text-gray-100 antialiased p-6 pr-0">
                      {deployLogLines.length > 0 ? (
                        <div className="space-y-0">
                          {deployLogLines.map((line, idx) => (
                            <div
                              key={idx}
                              id={`deploy-L${line.number}`}
                              className="relative pl-16 hover:bg-gray-900/50 min-h-[1.5rem] group transition-colors"
                            >
                              <div
                                className="absolute left-0 top-0 h-full min-w-[4rem] text-right pr-4 text-gray-600 group-hover:text-gray-400 cursor-pointer select-none leading-[1.5rem] font-normal"
                                data-line-number={line.number}
                              >
                                {line.number}
                              </div>
                              <div className="border-l border-gray-800 group-hover:border-gray-700 break-words pl-6 pr-4 leading-[1.5rem] whitespace-pre-wrap text-gray-200">
                                {line.content || " "}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-gray-500 pl-16 flex items-center gap-2">
                          <span className="inline-block animate-pulse">▋</span>
                          <span>Waiting for deploy logs...</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

