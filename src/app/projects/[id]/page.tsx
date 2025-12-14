"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProjectDetails, EnvironmentVariable } from "@/types/project";
import { toast } from "sonner";
import { DeployModal } from "./deploy-modal";

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const [project, setProject] = useState<ProjectDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState("");
  const [logsStreamActive, setLogsStreamActive] = useState(false);
  const [envVariables, setEnvVariables] = useState<EnvironmentVariable[]>([]);
  const [envComparison, setEnvComparison] = useState<Array<{
    key: string;
    productionValue: string | null;
    exampleValue: string | null;
    status: "up-to-date" | "missing-in-production" | "missing-in-example" | "different" | "only-in-production" | "only-in-example";
  }>>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showDeployLogs, setShowDeployLogs] = useState(false);
  const [isDeployModalMinimized, setIsDeployModalMinimized] = useState(false);
  const [deployLogs, setDeployLogs] = useState<string>("");
  const [deployLogsByPhase, setDeployLogsByPhase] = useState<{
    initializing: string[];
    building: string[];
    deploying: string[];
    cleanup: string[];
    postProcessing: string[];
  }>({
    initializing: [],
    building: [],
    deploying: [],
    cleanup: [],
    postProcessing: [],
  });
  const [deployPhases, setDeployPhases] = useState<{
    initializing: "pending" | "active" | "complete";
    building: "pending" | "active" | "complete";
    deploying: "pending" | "active" | "complete";
    cleanup: "pending" | "active" | "complete";
    postProcessing: "pending" | "active" | "complete";
  }>({
    initializing: "pending",
    building: "pending",
    deploying: "pending",
    cleanup: "pending",
    postProcessing: "pending",
  });
  const [isMaximized, setIsMaximized] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [gitStatus, setGitStatus] = useState<{
    isBehind: boolean;
    commitsBehind: number;
    currentBranch?: string;
  } | null>(null);

  useEffect(() => {
    fetchProject();
    fetchEnvVars();
    fetchEnvComparison();
    fetchGitStatus();
  }, [projectId]);

  // Auto-refresh project data, git status, and env comparison every 30 seconds
  useEffect(() => {
    if (!autoRefresh || !project) return;

    const interval = setInterval(() => {
      fetchProject(true); // Silent refresh
      fetchGitStatus();
      fetchEnvComparison();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, project, projectId]);

  // Suppress browser extension errors and other non-critical errors
  useEffect(() => {
    const originalError = console.error;
    const originalWarn = console.warn;
    
    console.error = (...args: any[]) => {
      const message = args[0]?.toString() || "";
      // Suppress browser extension errors
      if (
        message.includes("moz-extension://") ||
        message.includes("chrome-extension://") ||
        message.includes("solanaActionsContentScript") ||
        message.includes("h1-check.js") ||
        message.includes("detectStore") ||
        message.includes("Receiving end does not exist")
      ) {
        return; // Suppress these errors
      }
      originalError.apply(console, args);
    };
    
    console.warn = (...args: any[]) => {
      const message = args[0]?.toString() || "";
      // Suppress browser extension warnings
      if (
        message.includes("moz-extension://") ||
        message.includes("chrome-extension://") ||
        message.includes("solanaActionsContentScript")
      ) {
        return; // Suppress these warnings
      }
      originalWarn.apply(console, args);
    };
    
    return () => {
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, []);

  // Real-time metrics stream using Server-Sent Events
  useEffect(() => {
    // Only stream if enabled, project is loaded and no actions are in progress
    if (!autoRefresh || !project || actionLoading !== null || loading) {
      return;
    }

    let isActive = true;
    let reader: ReadableStreamDefaultReader<Uint8Array> | null | undefined = null;

    const connectStream = async () => {
      try {
        const auth = sessionStorage.getItem("auth");
        const response = await fetch(`/api/projects/${projectId}/metrics/stream`, {
          headers: auth ? { Authorization: `Basic ${auth}` } : {},
        });

        if (!response.ok) {
          throw new Error("Failed to connect to metrics stream");
        }

        const streamReader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!streamReader) {
          throw new Error("No response body");
        }

        reader = streamReader;

        let buffer = "";

        while (isActive && autoRefresh && project && actionLoading === null) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                // Update project with new metrics
                setProject((prev) => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    status: data.status || prev.status,
                    containerMetrics: data.containerMetrics || prev.containerMetrics,
                    containerHealth: data.containerHealth || prev.containerHealth,
                    lastDeployment: data.lastDeployment || prev.lastDeployment,
                  };
                });
                setLastRefresh(new Date());
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
        }
      } catch (error: any) {
        // Suppress network errors and stream errors (normal when streams are aborted during navigation)
        const isNetworkError = 
          error?.name === "NetworkError" || 
          error?.message?.includes("NetworkError") ||
          error?.message?.includes("fetch resource") ||
          error?.message?.includes("input stream") ||
          error?.message?.includes("aborted") ||
          error?.message?.includes("cancelled");
        
        if (!isNetworkError) {
          console.error("Error in metrics stream:", error);
        }
        // Silently reconnect after a delay
        if (isActive && autoRefresh) {
          setTimeout(() => {
            if (isActive && autoRefresh) {
              connectStream();
            }
          }, 3000);
        }
      }
    };

    connectStream();

    return () => {
      isActive = false;
      if (reader) {
        reader.cancel().catch(() => {});
      }
    };
  }, [autoRefresh, project, actionLoading, loading, projectId]);

  const fetchProject = async (silent = false) => {
    try {
      const auth = sessionStorage.getItem("auth");
      const response = await fetch(`/api/projects/${projectId}`, {
        headers: auth ? { Authorization: `Basic ${auth}` } : {},
      });
      if (response.ok) {
        const data = await response.json();
        setProject(data);
        setLastRefresh(new Date());
      }
    } catch (error: any) {
      // Suppress network errors (normal during navigation)
      const isNetworkError = 
        error?.name === "NetworkError" || 
        error?.message?.includes("NetworkError") ||
        error?.message?.includes("fetch resource");
      
      if (!isNetworkError) {
        console.error("Error fetching project:", error);
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const fetchLogs = async () => {
    try {
      const auth = sessionStorage.getItem("auth");
      const response = await fetch(`/api/projects/${projectId}/logs?lines=100`, {
        headers: auth ? { Authorization: `Basic ${auth}` } : {},
      });
      if (response.ok) {
        const data = await response.json();
        setLogs(data.logs);
      }
    } catch (error) {
      console.error("Error fetching logs:", error);
    }
  };

  const fetchGitStatus = async () => {
    try {
      const auth = sessionStorage.getItem("auth");
      const response = await fetch(`/api/projects/${projectId}/git-status`, {
        headers: auth ? { Authorization: `Basic ${auth}` } : {},
      });
      if (response.ok) {
        const data = await response.json();
        setGitStatus({
          isBehind: data.isBehind || false,
          commitsBehind: data.commitsBehind || 0,
          currentBranch: data.currentBranch,
        });
      }
    } catch (error) {
      // Silently fail - git status check is optional
      console.debug("Error fetching git status:", error);
    }
  };

  // Real-time logs stream
  useEffect(() => {
    if (!project || loading || actionLoading !== null) {
      return;
    }

    let isActive = true;
    let logsReader: ReadableStreamDefaultReader<Uint8Array> | null | undefined = null;

    const connectLogsStream = async () => {
      try {
        const auth = sessionStorage.getItem("auth");
        const response = await fetch(`/api/projects/${projectId}/logs/stream`, {
          headers: auth ? { Authorization: `Basic ${auth}` } : {},
        });

        if (!response.ok) {
          // Don't log 4xx/5xx errors as they're handled silently
          throw new Error("Failed to connect to logs stream");
        }

        const streamReader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!streamReader) {
          throw new Error("No response body");
        }

        logsReader = streamReader;
        setLogsStreamActive(true);

        let buffer = "";
        let initialLogsReceived = false;

        while (isActive && project && actionLoading === null) {
          const { done, value } = await logsReader.read();
          if (done) {
            // Stream ended, try to reconnect
            if (isActive && project && actionLoading === null) {
              setTimeout(() => {
                if (isActive && project && actionLoading === null) {
                  connectLogsStream();
                }
              }, 2000);
            }
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.log) {
                  if (!initialLogsReceived) {
                    // First chunk is the initial logs, replace
                    setLogs(data.log);
                    initialLogsReceived = true;
                  } else {
                    // Subsequent chunks are new logs, append
                    setLogs((prev) => prev + data.log);
                  }
                  
                  // Auto-scroll to bottom
                  setTimeout(() => {
                    const logElement = document.getElementById("container-logs");
                    if (logElement) {
                      logElement.scrollTop = logElement.scrollHeight;
                    }
                  }, 100);
                }
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
        }
      } catch (error: any) {
        // Suppress network errors and stream errors (normal when streams are aborted during navigation)
        const isNetworkError = 
          error?.name === "NetworkError" || 
          error?.message?.includes("NetworkError") ||
          error?.message?.includes("fetch resource") ||
          error?.message?.includes("input stream") ||
          error?.message?.includes("aborted") ||
          error?.message?.includes("cancelled");
        
        if (!isNetworkError) {
          console.error("Error in logs stream:", error);
        }
        setLogsStreamActive(false);
        // Silently reconnect after a delay
        if (isActive && project && actionLoading === null) {
          setTimeout(() => {
            if (isActive && project && actionLoading === null) {
              connectLogsStream();
            }
          }, 3000);
        }
      }
    };

    connectLogsStream();

    return () => {
      isActive = false;
      setLogsStreamActive(false);
      if (logsReader) {
        logsReader.cancel().catch(() => {});
      }
    };
  }, [project, loading, actionLoading, projectId]);

  const fetchEnvVars = async () => {
    try {
      const auth = sessionStorage.getItem("auth");
      const response = await fetch(`/api/projects/${projectId}/env`, {
        headers: auth ? { Authorization: `Basic ${auth}` } : {},
      });
      if (response.ok) {
        const data = await response.json();
        setEnvVariables(data.variables || []);
      }
    } catch (error) {
      console.error("Error fetching env vars:", error);
    }
  };

  const fetchEnvComparison = async () => {
    try {
      const auth = sessionStorage.getItem("auth");
      const response = await fetch(`/api/projects/${projectId}/env/compare`, {
        headers: auth ? { Authorization: `Basic ${auth}` } : {},
      });
      if (response.ok) {
        const data = await response.json();
        setEnvComparison(data.comparison || []);
      }
    } catch (error) {
      console.error("Error fetching env comparison:", error);
    }
  };

  const handleDeploy = async () => {
    setActionLoading("deploy");
    setShowDeployLogs(true);
    setDeployLogs("");
    // Reset phases
    setDeployPhases({
      initializing: "active",
      building: "pending",
      deploying: "pending",
      cleanup: "pending",
      postProcessing: "pending",
    });
    
    try {
      const auth = sessionStorage.getItem("auth");
      const response = await fetch(`/api/projects/${projectId}/deploy/stream`, {
        headers: auth ? { Authorization: `Basic ${auth}` } : {},
      });

      if (!response.ok) {
        throw new Error("Failed to start deployment");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      let deploymentComplete = false;
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.log) {
                const logText = data.log;
                setDeployLogs((prev) => prev + logText);
                
                // Detect phase transitions
                if (logText.includes("🛑 Stopping containers") || logText.includes("Stopping containers")) {
                  setDeployPhases((prev) => ({
                    ...prev,
                    initializing: "complete",
                    building: "active", // Use building phase for stopping
                  }));
                } else if (logText.includes("🔨 Building images") || logText.includes("🔨 Starting build") || logText.includes("Building images") || logText.includes("Starting build")) {
                  setDeployPhases((prev) => ({
                    ...prev,
                    building: "active",
                  }));
                } else if (logText.includes("✅ Build completed") || logText.includes("Build completed")) {
                  setDeployPhases((prev) => ({
                    ...prev,
                    building: "complete",
                    deploying: "active",
                  }));
                } else if (logText.includes("🚀 Starting containers") || logText.includes("Starting containers")) {
                  setDeployPhases((prev) => ({
                    ...prev,
                    deploying: "active",
                  }));
                } else if (logText.includes("✅ Deployment completed") || logText.includes("Deployment completed")) {
                  setDeployPhases((prev) => ({
                    ...prev,
                    deploying: "complete",
                    cleanup: "active",
                  }));
                } else if (logText.includes("DONE")) {
                  setDeployPhases((prev) => ({
                    ...prev,
                    cleanup: "complete",
                    postProcessing: "complete",
                  }));
                  deploymentComplete = true;
                  setActionLoading(null);
                  toast.success("Deployment completed", {
                    description: `${project?.name} has been deployed successfully`,
                  });
                  await fetchProject();
                  // Don't auto-close if minimized - let user restore and see completion
                  if (!isDeployModalMinimized) {
                    setTimeout(() => {
                      router.push(`/projects/${projectId}`);
                    }, 2000);
                  }
                  return;
                }
                
                // Auto-scroll to bottom
                setTimeout(() => {
                  const logElement = document.getElementById("deploy-logs");
                  if (logElement) {
                    logElement.scrollTop = logElement.scrollHeight;
                  }
                }, 100);
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }

      if (!deploymentComplete) {
        setActionLoading(null);
        setDeployLogs((prev) => prev + "\n\n⚠️ Deployment stream ended unexpectedly\n");
      }
    } catch (error: any) {
      console.error("Error deploying:", error);
      setDeployLogs((prev) => prev + `\n\n❌ Error: ${error.message}\n`);
      toast.error("Deployment failed", {
        description: error.message || "Failed to deploy project",
      });
      setActionLoading(null);
    }
  };

  const handleUpdate = async () => {
    setActionLoading("update");
    try {
      const auth = sessionStorage.getItem("auth");
      const response = await fetch(`/api/projects/${projectId}/update`, {
        method: "POST",
        headers: auth ? { Authorization: `Basic ${auth}` } : {},
      });
      if (response.ok) {
        const data = await response.json();
        toast.success("Project updated", {
          description: data.message || "Successfully pulled latest changes from GitHub",
        });
        await fetchProject();
        await fetchGitStatus(); // Refresh git status after pull
      } else {
        const error = await response.json();
        toast.error("Update failed", {
          description: error.error || "Failed to update project",
        });
      }
    } catch (error) {
      console.error("Error updating:", error);
      toast.error("Update failed", {
        description: "Failed to update project",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRestart = async () => {
    setActionLoading("restart");
    try {
      const auth = sessionStorage.getItem("auth");
      const response = await fetch(`/api/projects/${projectId}/restart`, {
        method: "POST",
        headers: auth ? { Authorization: `Basic ${auth}` } : {},
      });
      if (response.ok) {
        const data = await response.json();
        toast.success("Project restarted", {
          description: data.message || "Container has been restarted",
        });
        await fetchProject();
      } else {
        const error = await response.json();
        toast.error("Restart failed", {
          description: error.error || "Failed to restart project",
        });
      }
    } catch (error) {
      console.error("Error restarting:", error);
      toast.error("Restart failed", {
        description: "Failed to restart project",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRestartDatabase = async () => {
    if (!project?.database) {
      toast.error("No database found", {
        description: "This project does not have a database",
      });
      return;
    }

    setActionLoading("restart-database");
    try {
      const auth = sessionStorage.getItem("auth");
      const response = await fetch(`/api/projects/${projectId}/database/restart`, {
        method: "POST",
        headers: auth ? { Authorization: `Basic ${auth}` } : {},
      });
      if (response.ok) {
        const data = await response.json();
        toast.success("Database restarted", {
          description: data.message || "Database has been restarted without losing data",
        });
        await fetchProject();
      } else {
        const error = await response.json();
        toast.error("Database restart failed", {
          description: error.error || "Failed to restart database",
        });
      }
    } catch (error) {
      console.error("Error restarting database:", error);
      toast.error("Database restart failed", {
        description: "Failed to restart database",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleBackup = async () => {
    if (!project?.database) {
      toast.error("No database found", {
        description: "This project does not have a database to backup",
      });
      return;
    }

    setActionLoading("backup");
    try {
      const auth = sessionStorage.getItem("auth");
      const response = await fetch(`/api/projects/${projectId}/backup`, {
        method: "POST",
        headers: auth ? { Authorization: `Basic ${auth}` } : {},
      });
      if (response.ok) {
        const data = await response.json();
        toast.success("Backup created", {
          description: `Backup saved to: ${data.backupPath}`,
        });
      } else {
        const error = await response.json();
        toast.error("Backup failed", {
          description: error.error || "Failed to create backup",
        });
      }
    } catch (error) {
      console.error("Error creating backup:", error);
      toast.error("Backup failed", {
        description: "Failed to create backup",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this project?")) {
      return;
    }

    setActionLoading("delete");
    try {
      const auth = sessionStorage.getItem("auth");
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
        headers: auth ? { Authorization: `Basic ${auth}` } : {},
      });
      if (response.ok) {
        toast.success("Project deleted", {
          description: "Project has been successfully deleted",
        });
        router.push("/");
      } else {
        const error = await response.json();
        toast.error("Delete failed", {
          description: error.error || "Failed to delete project",
        });
        setActionLoading(null);
      }
    } catch (error) {
      console.error("Error deleting:", error);
      toast.error("Delete failed", {
        description: "Failed to delete project",
      });
      setActionLoading(null);
    }
  };


  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-gray-700">Loading project...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-gray-700">Project not found</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/" className="text-sm text-gray-800 hover:text-gray-900">
          ← Back to Projects
        </Link>
      </div>

      {/* Project Header */}
      <div className="mb-6 rounded-lg border border-gray-200 bg-gradient-to-r from-gray-50 to-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="mb-2 text-3xl font-bold text-gray-900">{project.name}</h1>
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
                  project.status === "Running"
                    ? "bg-green-100 text-green-800"
                    : project.status === "Building"
                    ? "bg-yellow-100 text-yellow-800"
                    : project.status === "Error"
                    ? "bg-red-100 text-red-800"
                    : "bg-gray-100 text-gray-800"
                }`}
              >
                {project.status}
              </span>
              {project.domain && !project.domain.startsWith("ERROR") && (
                <a
                  href={`https://${project.domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {project.domain}
                </a>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <span>Auto-refresh</span>
              </label>
            </div>
            {lastRefresh && (
              <div className="text-xs text-gray-500">
                Updated: {lastRefresh.toLocaleTimeString()}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchProject(true)}
              className="text-xs"
            >
              🔄 Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Service Cards Grid */}
      <div className="mb-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Project Info Card */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100">
              <span className="text-lg">📦</span>
            </div>
            <h2 className="text-base font-semibold text-gray-900">Project Information</h2>
          </div>
          <div className="space-y-2 text-sm">
            <div>
              <span className="font-medium text-gray-600">Name:</span>
              <p className="mt-0.5 text-gray-900">{project.name}</p>
            </div>
            <div>
              <span className="font-medium text-gray-600">Status:</span>
              <div className="mt-0.5">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                    project.status === "Running"
                      ? "bg-green-100 text-green-800"
                      : project.status === "Building"
                      ? "bg-yellow-100 text-yellow-800"
                      : project.status === "Error"
                      ? "bg-red-100 text-red-800"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {project.status}
                </span>
              </div>
            </div>
            <div>
              <span className="font-medium text-gray-600">Port:</span>
              <p className="mt-0.5 font-mono text-gray-900">{project.port}</p>
            </div>
            <div>
              <span className="font-medium text-gray-600">Domain:</span>
              <p className="mt-0.5">
                {project.domain.startsWith("ERROR") ? (
                  <span className="text-red-600">{project.domain}</span>
                ) : (
                  <a
                    href={`https://${project.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    {project.domain}
                  </a>
                )}
              </p>
            </div>
            {project.createDatabase && (
              <div>
                <span className="font-medium text-gray-600">Database:</span>
                <p className="mt-0.5 text-green-600">✓ Enabled</p>
              </div>
            )}
            {project.lastDeployment && (
              <div>
                <span className="font-medium text-gray-600">Last Deployment:</span>
                <p className="mt-0.5 text-xs text-gray-900">{project.lastDeployment}</p>
              </div>
            )}
          </div>
        </div>

        {/* Git Information Card - GitHub Theme */}
        <div className="rounded-lg border-2 border-gray-800 bg-gray-900 p-5 shadow-lg">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white">
              <span className="text-lg">🐙</span>
            </div>
            <h2 className="text-base font-semibold text-white">Git Repository</h2>
          </div>
          <div className="space-y-3 text-sm">
            {project.gitRemote ? (
              <>
                <div className="rounded-md bg-gray-800 p-2">
                  <span className="text-xs font-medium text-gray-400">Remote</span>
                  <p className="mt-1 break-all font-mono text-xs text-gray-200">
                    {project.gitRemote.replace(/https?:\/\/[^@]+@/, "https://***@")}
                  </p>
                </div>
                {project.gitBranch && (
                  <div className="rounded-md bg-gray-800 p-2">
                    <span className="text-xs font-medium text-gray-400">Branch</span>
                    <p className="mt-1 font-mono text-sm text-white">{project.gitBranch}</p>
                  </div>
                )}
                {project.gitCommit && (
                  <div className="rounded-md bg-gray-800 p-2">
                    <span className="text-xs font-medium text-gray-400">Commit</span>
                    <p className="mt-1 font-mono text-xs text-gray-200">{project.gitCommit}</p>
                  </div>
                )}
                {project.gitCommitMessage && (
                  <div className="rounded-md bg-gray-800 p-2">
                    <span className="text-xs font-medium text-gray-400">Message</span>
                    <p className="mt-1 text-xs text-gray-200">{project.gitCommitMessage}</p>
                  </div>
                )}
                {project.gitCommitAuthor && (
                  <div className="rounded-md bg-gray-800 p-2">
                    <span className="text-xs font-medium text-gray-400">Author</span>
                    <p className="mt-1 text-xs text-gray-200">{project.gitCommitAuthor}</p>
                  </div>
                )}
                {project.gitCommitDate && (
                  <div className="rounded-md bg-gray-800 p-2">
                    <span className="text-xs font-medium text-gray-400">Date</span>
                    <p className="mt-1 text-xs text-gray-200">{project.gitCommitDate}</p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-gray-400">No git information available</p>
            )}
          </div>
        </div>

        {/* Docker Container Card - Docker Theme */}
        <div className="rounded-lg border-2 border-blue-500 bg-gradient-to-br from-blue-50 to-white p-5 shadow-lg">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500">
              <span className="text-lg">🐳</span>
            </div>
            <h2 className="text-base font-semibold text-gray-900">Docker Container</h2>
          </div>
          <div className="space-y-2 text-sm">
            {project.containerId ? (
              <>
                <div>
                  <span className="font-medium text-gray-600">Container ID:</span>
                  <p className="mt-0.5 font-mono text-xs text-gray-900">{project.containerId}</p>
                </div>
                {project.containerImage && (
                  <div>
                    <span className="font-medium text-gray-600">Image:</span>
                    <p className="mt-0.5 break-all font-mono text-xs text-gray-900">
                      {project.containerImage}
                    </p>
                  </div>
                )}
                {project.containerCreated && (
                  <div>
                    <span className="font-medium text-gray-600">Created:</span>
                    <p className="mt-0.5 text-xs text-gray-900">{project.containerCreated}</p>
                  </div>
                )}
                {project.containerNetworks && project.containerNetworks.length > 0 && (
                  <div>
                    <span className="font-medium text-gray-600">Networks:</span>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {project.containerNetworks.map((network) => (
                        <span
                          key={network}
                          className="rounded bg-blue-100 px-2 py-1 text-xs font-mono text-blue-800"
                        >
                          {network}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {project.containerHealth && project.containerHealth !== "none" && (
                  <div>
                    <span className="font-medium text-gray-600">Health:</span>
                    <div className="mt-0.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                          project.containerHealth === "healthy"
                            ? "bg-green-100 text-green-800"
                            : project.containerHealth === "starting"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {project.containerHealth}
                      </span>
                    </div>
                  </div>
                )}
                {project.containerMetrics && (
                  <>
                    {project.containerMetrics.cpuUsage !== undefined && (
                      <div className="rounded-md bg-blue-50 p-2">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-700">CPU Usage</span>
                          <span className="text-xs font-semibold text-blue-700">
                            {project.containerMetrics.cpuUsage.toFixed(2)}%
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-blue-100">
                          <div
                            className="h-full bg-blue-500 transition-all"
                            style={{ width: `${Math.min(project.containerMetrics.cpuUsage, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {project.containerMetrics.memoryUsage !== undefined && (
                      <div className="rounded-md bg-blue-50 p-2">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-700">Memory</span>
                          <span className="text-xs font-semibold text-blue-700">
                            {project.containerMetrics.memoryLimit
                              ? `${((project.containerMetrics.memoryUsage / project.containerMetrics.memoryLimit) * 100).toFixed(1)}%`
                              : "N/A"}
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-blue-100">
                          <div
                            className="h-full bg-blue-500 transition-all"
                            style={{
                              width: project.containerMetrics.memoryLimit
                                ? `${Math.min((project.containerMetrics.memoryUsage / project.containerMetrics.memoryLimit) * 100, 100)}%`
                                : "0%",
                            }}
                          />
                        </div>
                        <p className="mt-1 text-xs text-gray-600">
                          {project.containerMetrics.memoryLimit
                            ? `${(project.containerMetrics.memoryUsage / 1024 / 1024).toFixed(2)} MB / ${(project.containerMetrics.memoryLimit / 1024 / 1024).toFixed(2)} MB`
                            : `${(project.containerMetrics.memoryUsage / 1024 / 1024).toFixed(2)} MB`}
                        </p>
                      </div>
                    )}
                    {project.containerMetrics.uptime !== undefined && (
                      <div>
                        <span className="font-medium text-gray-600">Uptime:</span>
                        <p className="mt-0.5 text-xs text-gray-900">
                          {project.containerMetrics.uptime >= 86400
                            ? `${Math.floor(project.containerMetrics.uptime / 86400)}d ${Math.floor((project.containerMetrics.uptime % 86400) / 3600)}h`
                            : project.containerMetrics.uptime >= 3600
                            ? `${Math.floor(project.containerMetrics.uptime / 3600)}h ${Math.floor((project.containerMetrics.uptime % 3600) / 60)}m`
                            : `${Math.floor(project.containerMetrics.uptime / 60)}m ${project.containerMetrics.uptime % 60}s`}
                        </p>
                      </div>
                    )}
                    {project.containerMetrics.restartCount !== undefined && (
                      <div>
                        <span className="font-medium text-gray-600">Restart Count:</span>
                        <p className="mt-0.5 text-xs text-gray-900">
                          {project.containerMetrics.restartCount}
                        </p>
                      </div>
                    )}
                  </>
                )}
                {project.volumeMounts && project.volumeMounts.length > 0 && (
                  <div>
                    <span className="font-medium text-gray-600">Volume Mounts:</span>
                    <div className="mt-0.5 space-y-1">
                      {project.volumeMounts.map((mount, index) => (
                        <div key={index} className="text-xs">
                          <p className="font-mono text-gray-900 break-all">
                            {mount.source} → {mount.destination}
                          </p>
                          <p className="text-gray-500 text-[10px]">({mount.type})</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-gray-500">Container not found or not running</p>
            )}
          </div>
        </div>

        {/* Database Information Card - MongoDB Theme */}
        {project.database && (
          <div className="rounded-lg border-2 border-green-600 bg-gradient-to-br from-green-50 to-white p-5 shadow-lg">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-600">
                <span className="text-lg">🍃</span>
              </div>
              <h2 className="text-base font-semibold text-gray-900">MongoDB Database</h2>
            </div>
            <div className="space-y-3 text-sm">
              {project.database.containerStatus && (
                <div className="rounded-md bg-green-50 p-2">
                  <span className="text-xs font-medium text-gray-700">Status</span>
                  <div className="mt-1">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                        project.database.containerStatus === "Running"
                          ? "bg-green-600 text-white"
                          : project.database.containerStatus === "Stopped"
                          ? "bg-gray-400 text-white"
                          : "bg-red-500 text-white"
                      }`}
                    >
                      {project.database.containerStatus}
                    </span>
                  </div>
                </div>
              )}
              {project.database.containerId && (
                <div className="rounded-md bg-green-50 p-2">
                  <span className="text-xs font-medium text-gray-700">Container ID</span>
                  <p className="mt-1 font-mono text-xs text-gray-800">
                    {project.database.containerId}
                  </p>
                </div>
              )}
              {project.database.containerImage && (
                <div className="rounded-md bg-green-50 p-2">
                  <span className="text-xs font-medium text-gray-700">Image</span>
                  <p className="mt-1 break-all font-mono text-xs text-gray-800">
                    {project.database.containerImage}
                  </p>
                </div>
              )}
              {project.database.databaseName && (
                <div className="rounded-md bg-green-50 p-2">
                  <span className="text-xs font-medium text-gray-700">Database Name</span>
                  <p className="mt-1 font-mono text-sm font-semibold text-green-700">
                    {project.database.databaseName}
                  </p>
                </div>
              )}
              {project.database.port && (
                <div className="rounded-md bg-green-50 p-2">
                  <span className="text-xs font-medium text-gray-700">Port</span>
                  <p className="mt-1 font-mono text-sm text-gray-800">
                    {project.database.port}
                  </p>
                </div>
              )}
              {project.database.username && (
                <div className="rounded-md bg-green-50 p-2">
                  <span className="text-xs font-medium text-gray-700">Username</span>
                  <p className="mt-1 font-mono text-xs text-gray-800">
                    {project.database.username}
                  </p>
                </div>
              )}
              {project.database.connectionString && (
                <div className="rounded-md bg-green-50 p-2">
                  <span className="text-xs font-medium text-gray-700">Connection String</span>
                  <div className="mt-1 flex items-center gap-2">
                    <p 
                      className="flex-1 break-all font-mono text-xs text-gray-800 cursor-text select-all"
                      onClick={(e) => {
                        const text = e.currentTarget.textContent;
                        if (text) {
                          const selection = window.getSelection();
                          const range = document.createRange();
                          range.selectNodeContents(e.currentTarget);
                          selection?.removeAllRanges();
                          selection?.addRange(range);
                        }
                      }}
                    >
                      {project.database.connectionString}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        const connectionString = project.database!.connectionString!;
                        try {
                          // Try modern clipboard API first
                          if (navigator.clipboard && navigator.clipboard.writeText) {
                            await navigator.clipboard.writeText(connectionString);
                            toast.success("Connection string copied to clipboard");
                            return;
                          }
                          
                          // Fallback: use execCommand
                          const textArea = document.createElement("textarea");
                          textArea.value = connectionString;
                          textArea.style.position = "fixed";
                          textArea.style.left = "-999999px";
                          document.body.appendChild(textArea);
                          textArea.focus();
                          textArea.select();
                          
                          const successful = document.execCommand("copy");
                          document.body.removeChild(textArea);
                          
                          if (successful) {
                            toast.success("Connection string copied to clipboard");
                          } else {
                            throw new Error("execCommand failed");
                          }
                        } catch (error) {
                          toast.error("Failed to copy", {
                            description: "Please select and copy manually",
                          });
                        }
                      }}
                      className="h-7 border-green-300 bg-white text-xs text-green-700 hover:bg-green-50 flex-shrink-0"
                    >
                      Copy
                    </Button>
                  </div>
                </div>
              )}
              {project.database.volumePath && (
                <div className="rounded-md bg-green-50 p-2">
                  <span className="text-xs font-medium text-gray-700">Volume Path</span>
                  <p className="mt-1 break-all font-mono text-xs text-gray-800">
                    {project.database.volumePath}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* File Paths Card */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100">
              <span className="text-lg">📁</span>
            </div>
            <h2 className="text-base font-semibold text-gray-900">File Paths</h2>
          </div>
          <div className="space-y-3 text-sm">
            {project.repoPath && (
              <div className="rounded-md bg-gray-50 p-2">
                <span className="text-xs font-medium text-gray-600">Repository</span>
                <p className="mt-1 break-all font-mono text-xs text-gray-800">
                  {project.repoPath}
                </p>
              </div>
            )}
            {project.dockerComposePath && (
              <div className="rounded-md bg-gray-50 p-2">
                <span className="text-xs font-medium text-gray-600">Docker Compose</span>
                <p className="mt-1 break-all font-mono text-xs text-gray-800">
                  {project.dockerComposePath}
                </p>
              </div>
            )}
            <div className="rounded-md bg-gray-50 p-2">
              <span className="text-xs font-medium text-gray-600">Project Directory</span>
              <p className="mt-1 break-all font-mono text-xs text-gray-800">
                {project.directory}
              </p>
            </div>
          </div>
        </div>
      </div>


      {/* Deploy Logs Modal - Netlify Style */}
      <DeployModal
        isOpen={showDeployLogs}
        isMinimized={isDeployModalMinimized}
        onClose={() => {
          // Only allow closing if not deploying
          if (actionLoading !== "deploy") {
            setShowDeployLogs(false);
            setIsDeployModalMinimized(false);
            setDeployLogs("");
            setDeployPhases({
              initializing: "pending",
              building: "pending",
              deploying: "pending",
              cleanup: "pending",
              postProcessing: "pending",
            });
          }
        }}
        onMinimize={() => {
          setIsDeployModalMinimized(true);
        }}
        onRestore={() => {
          setIsDeployModalMinimized(false);
        }}
        projectName={project?.name || ""}
        projectDomain={project?.domain}
        deployLogs={deployLogs}
        deployPhases={deployPhases}
        isDeploying={actionLoading === "deploy"}
      />

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        {/* Website Actions */}
        <div className="rounded-lg border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white p-5 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">Website Actions</h3>
          <div className="space-y-4">
            {/* Step 1: Git Pull */}
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-700 mb-1">
                  Klaar met development?
                </p>
                <p className="text-xs text-gray-500">
                  Pull de laatste wijzigingen van GitHub
                </p>
              </div>
              <Button
                variant="outline"
                onClick={handleUpdate}
                disabled={actionLoading !== null}
                className={`min-w-[120px] ${
                  gitStatus?.isBehind
                    ? "animate-pulse border-orange-500 bg-orange-50 hover:bg-orange-100"
                    : ""
                }`}
              >
                {actionLoading === "update" ? (
                  <>
                    <span className="mr-2">⏳</span>
                    Updating...
                  </>
                ) : (
                  <>
                    <span className="mr-2">
                      {gitStatus?.isBehind ? "⚠️" : "📥"}
                    </span>
                    Git pull
                    {gitStatus?.isBehind && gitStatus.commitsBehind > 0 && (
                      <span className="ml-2 text-xs bg-orange-500 text-white px-1.5 py-0.5 rounded">
                        {gitStatus.commitsBehind}
                      </span>
                    )}
                  </>
                )}
              </Button>
            </div>

            <div className="border-t border-blue-200"></div>

            {/* Step 2: Deploy */}
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-700 mb-1">
                  Klaar om te deployen?
                </p>
                <p className="text-xs text-gray-500">
                  Stop containers, build nieuwe images en start opnieuw
                </p>
              </div>
              <Button
                onClick={() => {
                  handleDeploy();
                }}
                disabled={actionLoading !== null}
                className="min-w-[140px] bg-blue-600 hover:bg-blue-700"
              >
                {actionLoading === "deploy" ? (
                  <>
                    <span className="mr-2">⏳</span>
                    Deploying...
                  </>
                ) : (
                  <>
                    <span className="mr-2">🚀</span>
                    Deploy & Restart
                  </>
                )}
              </Button>
            </div>

            <div className="border-t border-blue-200"></div>

            {/* Delete Project */}
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-700 mb-1">
                  Delete Project
                </p>
                <p className="text-xs text-gray-500">
                  Verwijder project en alle containers
                </p>
              </div>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={actionLoading !== null}
                className="min-w-[120px]"
              >
                {actionLoading === "delete" ? (
                  <>
                    <span className="mr-2">⏳</span>
                    Deleting...
                  </>
                ) : (
                  <>
                    <span className="mr-2">🗑️</span>
                    Delete
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Database Actions */}
        {project?.database ? (
          <div className="rounded-lg border-2 border-green-200 bg-gradient-to-br from-green-50 to-white p-5 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Database Actions</h3>
            <div className="space-y-4">
              {/* Backup Database */}
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-700 mb-1">
                    Backup Database
                  </p>
                  <p className="text-xs text-gray-500">
                    Maak een backup van de database
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={handleBackup}
                  disabled={actionLoading !== null}
                  className="min-w-[120px] border-green-300 hover:bg-green-50"
                >
                  {actionLoading === "backup" ? (
                    <>
                      <span className="mr-2">⏳</span>
                      Backing up...
                    </>
                  ) : (
                    <>
                      <span className="mr-2">💾</span>
                      Backup
                    </>
                  )}
                </Button>
              </div>

              <div className="border-t border-green-200"></div>

              {/* Restart Database */}
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-700 mb-1">
                    Restart Database
                  </p>
                  <p className="text-xs text-gray-500">
                    Herstart database zonder data te verliezen
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={handleRestartDatabase}
                  disabled={actionLoading !== null}
                  className="min-w-[120px] border-green-300 hover:bg-green-50"
                >
                  {actionLoading === "restart-database" ? (
                    <>
                      <span className="mr-2">⏳</span>
                      Restarting...
                    </>
                  ) : (
                    <>
                      <span className="mr-2">🔄</span>
                      Restart
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border-2 border-gray-200 bg-gray-50 p-5 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Database Actions</h3>
            <p className="text-sm text-gray-500">
              No database configured for this project
            </p>
          </div>
        )}
      </div>

      <Tabs defaultValue="logs" className="w-full">
        <TabsList>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="env">Environment Variables</TabsTrigger>
        </TabsList>
        <TabsContent value="logs" className="mt-4">
          <div className="rounded-md border border-gray-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-medium">Container Logs</h3>
                {logsStreamActive && (
                  <span className="flex items-center gap-1 text-xs text-green-600">
                    <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                    Live
                  </span>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={fetchLogs}>
                Refresh
              </Button>
            </div>
            <pre
              id="container-logs"
              className="max-h-96 overflow-auto rounded bg-gray-900 p-4 text-xs text-green-400 font-mono whitespace-pre-wrap"
            >
              {logs || "No logs available. Loading..."}
            </pre>
          </div>
        </TabsContent>
        <TabsContent value="env" className="mt-4">
          <div className="space-y-6">
            {/* Environment Variables Comparison */}
            <div className="rounded-md border border-gray-200 bg-white p-6">
              <div className="mb-4 flex justify-between items-center">
                <div>
                  <h3 className="font-medium">Environment Variables Comparison</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Compare production .env with .env.example
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={fetchEnvComparison}>
                  Refresh
                </Button>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Key</TableHead>
                      <TableHead>Production Value</TableHead>
                      <TableHead>Example Value</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {envComparison.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-gray-700">
                          No environment variables found or .env.example not available
                        </TableCell>
                      </TableRow>
                    ) : (
                      envComparison.map((item, index) => {
                        const getStatusBadge = () => {
                          switch (item.status) {
                            case "up-to-date":
                              return (
                                <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                                  ✓ Up to date
                                </span>
                              );
                            case "missing-in-production":
                              return (
                                <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800">
                                  ⚠ Missing
                                </span>
                              );
                            case "different":
                              return (
                                <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-1 text-xs font-medium text-orange-800">
                                  ↻ Different
                                </span>
                              );
                            case "only-in-production":
                              return (
                                <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                                  + Only in production
                                </span>
                              );
                            case "only-in-example":
                              return (
                                <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800">
                                  - Only in example
                                </span>
                              );
                            default:
                              return null;
                          }
                        };

                        return (
                          <TableRow
                            key={index}
                            className={
                              item.status === "missing-in-production"
                                ? "bg-yellow-50"
                                : item.status === "different"
                                ? "bg-orange-50"
                                : ""
                            }
                          >
                            <TableCell className="font-medium font-mono text-sm">
                              {item.key}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {item.productionValue ? (
                                <span className="text-gray-900">{item.productionValue}</span>
                              ) : (
                                <span className="text-gray-400 italic">Not set</span>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {item.exampleValue ? (
                                <span className="text-gray-900">{item.exampleValue}</span>
                              ) : (
                                <span className="text-gray-400 italic">Not in example</span>
                              )}
                            </TableCell>
                            <TableCell>{getStatusBadge()}</TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Current Environment Variables (Read-only) */}
            <div className="rounded-md border border-gray-200 bg-white p-6">
              <div className="mb-4 flex justify-between items-center">
                <div>
                  <h3 className="font-medium">Current Environment Variables</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    All environment variables currently in use (read-only)
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={fetchEnvVars}>
                  Refresh
                </Button>
              </div>
              <div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Key</TableHead>
                      <TableHead>Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {envVariables.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-gray-700">
                          No environment variables found
                        </TableCell>
                      </TableRow>
                    ) : (
                      envVariables.map((env, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium font-mono text-sm">{env.key}</TableCell>
                          <TableCell className="font-mono text-xs">{env.value}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
