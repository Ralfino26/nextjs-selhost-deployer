"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Copy, ArrowUp, ArrowDown, Maximize2, ExternalLink, CheckCircle2, Loader2 } from "lucide-react";
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
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set(["building"]));

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

  if (!isOpen) return null;

  // Split logs into phases
  const splitLogsByPhase = (logs: string) => {
    const buildStartMarker = "🔨 Starting build";
    const buildEndMarker = "✅ Build completed";
    const deployStartMarker = "🚀 Starting containers";
    const deployEndMarker = "✅ Deployment completed";

    const buildLogs: string[] = [];
    const deployLogs: string[] = [];
    let currentPhase: "build" | "deploy" | null = null;

    const lines = logs.split("\n");
    for (const line of lines) {
      if (line.includes(buildStartMarker)) {
        currentPhase = "build";
        buildLogs.push(line);
      } else if (line.includes(buildEndMarker)) {
        if (currentPhase === "build") {
          buildLogs.push(line);
        }
        currentPhase = null;
      } else if (line.includes(deployStartMarker)) {
        currentPhase = "deploy";
        deployLogs.push(line);
      } else if (line.includes(deployEndMarker)) {
        if (currentPhase === "deploy") {
          deployLogs.push(line);
        }
        currentPhase = null;
      } else {
        if (currentPhase === "build") {
          buildLogs.push(line);
        } else if (currentPhase === "deploy") {
          deployLogs.push(line);
        }
      }
    }

    return { buildLogs, deployLogs };
  };

  const { buildLogs, deployLogs: deployPhaseLogs } = splitLogsByPhase(deployLogs);

  const formatLogsWithLineNumbers = (logs: string[]) => {
    return logs.map((line, index) => ({
      number: index + 1,
      content: line,
    }));
  };

  const buildLogLines = formatLogsWithLineNumbers(buildLogs);
  const deployLogLines = formatLogsWithLineNumbers(deployPhaseLogs);

  const togglePhase = (phaseKey: string) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phaseKey)) {
        next.delete(phaseKey);
      } else {
        next.add(phaseKey);
      }
      return next;
    });
  };

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
      onWheel={(e) => {
        // Stop wheel events from propagating to body
        e.stopPropagation();
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

        {/* Logs Container with Collapsible Sections */}
        <div 
          className="flex-1 min-h-0 bg-black overflow-hidden" 
          id="deploy-logs-container"
          onWheel={(e) => {
            // Stop wheel events from propagating to body
            e.stopPropagation();
            const container = e.currentTarget.querySelector(".overflow-y-auto") as HTMLElement;
            if (container) {
              const delta = e.deltaY;
              container.scrollTop += delta;
              e.preventDefault();
            }
          }}
        >
          <div className="h-full overflow-y-auto" style={{ maxHeight: "100%" }}>
            {/* Building Phase */}
            {(buildLogs.length > 0 || deployPhases.building !== "pending") && (
              <details
                id="building"
                open={expandedPhases.has("building") || deployPhases.building === "active"}
                className="border-t border-gray-800"
              >
                <summary
                  className="relative bg-white text-gray-900 py-4 pl-14 pr-6 cursor-pointer list-none hover:bg-gray-50"
                  onClick={(e) => {
                    e.preventDefault();
                    togglePhase("building");
                  }}
                >
                  <div
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-2 h-2 border-r-2 border-b-2 border-gray-400 transition-transform duration-200"
                    style={{
                      transform: expandedPhases.has("building") ? "rotate(45deg)" : "rotate(-45deg)",
                    }}
                  />
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="font-medium text-sm sm:min-w-[250px]">Building</h3>
                    <div className="ml-auto flex items-center gap-2 min-w-0 sm:flex-grow">
                      {deployPhases.building === "complete" && (
                        <span className="flex items-center text-green-600">
                          <CheckCircle2 className="h-5 w-5 mr-2" />
                          <span className="text-xs font-medium bg-green-100 text-green-800 px-2 py-0.5 rounded capitalize">
                            Complete
                          </span>
                        </span>
                      )}
                      {deployPhases.building === "active" && (
                        <span className="flex items-center text-blue-600">
                          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                          <span className="text-xs font-medium">In progress</span>
                        </span>
                      )}
                    </div>
                  </div>
                </summary>
                <div className="bg-black">
                  <div className="font-mono text-sm text-white antialiased p-6 pr-0">
                    {buildLogLines.length > 0 ? (
                      buildLogLines.map((line, idx) => (
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
                        <span className="inline-block animate-pulse">▋</span> Waiting for build logs...
                      </div>
                    )}
                  </div>
                </div>
              </details>
            )}

            {/* Deploying Phase */}
            {(deployPhaseLogs.length > 0 || deployPhases.deploying !== "pending") && (
              <details
                id="deploying"
                open={expandedPhases.has("deploying") || deployPhases.deploying === "active"}
                className="border-t border-gray-800"
              >
                <summary
                  className="relative bg-white text-gray-900 py-4 pl-14 pr-6 cursor-pointer list-none hover:bg-gray-50"
                  onClick={(e) => {
                    e.preventDefault();
                    togglePhase("deploying");
                  }}
                >
                  <div
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-2 h-2 border-r-2 border-b-2 border-gray-400 transition-transform duration-200"
                    style={{
                      transform: expandedPhases.has("deploying") ? "rotate(45deg)" : "rotate(-45deg)",
                    }}
                  />
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="font-medium text-sm sm:min-w-[250px]">Deploying</h3>
                    <div className="ml-auto flex items-center gap-2 min-w-0 sm:flex-grow">
                      {deployPhases.deploying === "complete" && (
                        <span className="flex items-center text-green-600">
                          <CheckCircle2 className="h-5 w-5 mr-2" />
                          <span className="text-xs font-medium bg-green-100 text-green-800 px-2 py-0.5 rounded capitalize">
                            Complete
                          </span>
                        </span>
                      )}
                      {deployPhases.deploying === "active" && (
                        <span className="flex items-center text-blue-600">
                          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                          <span className="text-xs font-medium">In progress</span>
                        </span>
                      )}
                    </div>
                  </div>
                </summary>
                <div className="bg-black">
                  <div className="font-mono text-sm text-white antialiased p-6 pr-0">
                    {deployLogLines.length > 0 ? (
                      deployLogLines.map((line, idx) => (
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
                        <span className="inline-block animate-pulse">▋</span> Waiting for deploy logs...
                      </div>
                    )}
                  </div>
                </div>
              </details>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

