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
import { Project, EnvironmentVariable } from "@/types/project";

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState("");
  const [envVariables, setEnvVariables] = useState<EnvironmentVariable[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showDeployLogs, setShowDeployLogs] = useState(false);
  const [deployLogs, setDeployLogs] = useState<string>("");

  useEffect(() => {
    fetchProject();
    fetchEnvVars();
  }, [projectId]);

  const fetchProject = async () => {
    try {
      const auth = sessionStorage.getItem("auth");
      const response = await fetch(`/api/projects/${projectId}`, {
        headers: auth ? { Authorization: `Basic ${auth}` } : {},
      });
      if (response.ok) {
        const data = await response.json();
        setProject(data);
      }
    } catch (error) {
      console.error("Error fetching project:", error);
    } finally {
      setLoading(false);
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

  const handleDeploy = async () => {
    setActionLoading("deploy");
    setActionMessage(null);
    setShowDeployLogs(true);
    setDeployLogs("");
    
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.log) {
                setDeployLogs((prev) => prev + data.log);
                // Auto-scroll to bottom
                setTimeout(() => {
                  const logElement = document.getElementById("deploy-logs");
                  if (logElement) {
                    logElement.scrollTop = logElement.scrollHeight;
                  }
                }, 100);
              }
              if (data.log === "DONE") {
                deploymentComplete = true;
                setActionLoading(null);
                setActionMessage({ type: "success", text: "Project deployed successfully" });
                await fetchProject();
                // Don't auto-close, let user close manually
                return;
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
      setActionMessage({ type: "error", text: error.message || "Failed to deploy project" });
      setActionLoading(null);
    }
  };

  const handleUpdate = async () => {
    setActionLoading("update");
    setActionMessage(null);
    try {
      const auth = sessionStorage.getItem("auth");
      const response = await fetch(`/api/projects/${projectId}/update`, {
        method: "POST",
        headers: auth ? { Authorization: `Basic ${auth}` } : {},
      });
      if (response.ok) {
        const data = await response.json();
        setActionMessage({ type: "success", text: data.message || "Project updated successfully" });
        await fetchProject();
      } else {
        const error = await response.json();
        setActionMessage({ type: "error", text: error.error || "Failed to update project" });
      }
    } catch (error) {
      console.error("Error updating:", error);
      setActionMessage({ type: "error", text: "Failed to update project" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRestart = async () => {
    setActionLoading("restart");
    setActionMessage(null);
    try {
      const auth = sessionStorage.getItem("auth");
      const response = await fetch(`/api/projects/${projectId}/restart`, {
        method: "POST",
        headers: auth ? { Authorization: `Basic ${auth}` } : {},
      });
      if (response.ok) {
        const data = await response.json();
        setActionMessage({ type: "success", text: data.message || "Project restarted successfully" });
        await fetchProject();
      } else {
        const error = await response.json();
        setActionMessage({ type: "error", text: error.error || "Failed to restart project" });
      }
    } catch (error) {
      console.error("Error restarting:", error);
      setActionMessage({ type: "error", text: "Failed to restart project" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this project?")) {
      return;
    }

    setActionLoading("delete");
    setActionMessage(null);
    try {
      const auth = sessionStorage.getItem("auth");
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
        headers: auth ? { Authorization: `Basic ${auth}` } : {},
      });
      if (response.ok) {
        router.push("/");
      } else {
        const error = await response.json();
        setActionMessage({ type: "error", text: error.error || "Failed to delete project" });
        setActionLoading(null);
      }
    } catch (error) {
      console.error("Error deleting:", error);
      setActionMessage({ type: "error", text: "Failed to delete project" });
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

      <div className="mb-6">
        <h1 className="mb-2 text-2xl font-semibold">{project.name}</h1>
        <div className="space-y-2 text-sm text-gray-900">
          <div>
            <span className="font-medium">Domain: </span>
            <a
              href={`https://${project.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              {project.domain}
            </a>
          </div>
          <div>
            <span className="font-medium">Status: </span>
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
          <div>
            <span className="font-medium">Port: </span>
            {project.port}
          </div>
          <div>
            <span className="font-medium">Repository: </span>
            {project.repo}
          </div>
        </div>
      </div>

      {actionMessage && (
        <div className={`mb-4 rounded-md p-3 ${
          actionMessage.type === "success" 
            ? "bg-green-50 text-green-800" 
            : "bg-red-50 text-red-800"
        }`}>
          {actionMessage.text}
        </div>
      )}

      {/* Deploy Logs Modal */}
      {showDeployLogs && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 transition-opacity"
          onClick={(e) => {
            if (e.target === e.currentTarget && actionLoading !== "deploy") {
              setShowDeployLogs(false);
              setDeployLogs("");
            }
          }}
        >
          <div className="w-full max-w-5xl rounded-lg bg-white shadow-2xl animate-in fade-in-0 zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className={`h-2 w-2 rounded-full ${
                  actionLoading === "deploy" ? "bg-yellow-500 animate-pulse" : "bg-green-500"
                }`} />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Deployment Logs</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {actionLoading === "deploy" ? "Deployment in progress..." : "Deployment completed"}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowDeployLogs(false);
                  setDeployLogs("");
                }}
                disabled={actionLoading === "deploy"}
                className="disabled:opacity-50"
              >
                {actionLoading === "deploy" ? (
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
                    Deploying...
                  </span>
                ) : (
                  "Close"
                )}
              </Button>
            </div>

            {/* Logs Container */}
            <div className="bg-gray-900 p-6">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span>📋</span>
                  <span>Live deployment output</span>
                </div>
                {deployLogs && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const logElement = document.getElementById("deploy-logs");
                      if (logElement) {
                        logElement.scrollTop = logElement.scrollHeight;
                      }
                    }}
                    className="text-xs text-gray-400 hover:text-gray-300 h-6"
                  >
                    Scroll to bottom
                  </Button>
                )}
              </div>
              <div className="relative">
                <pre
                  id="deploy-logs"
                  className="rounded-lg bg-black p-4 text-xs text-green-400 font-mono whitespace-pre-wrap overflow-auto"
                  style={{ 
                    maxHeight: "60vh", 
                    minHeight: "400px",
                    scrollBehavior: "smooth"
                  }}
                >
                  {deployLogs || (
                    <span className="text-gray-500">
                      <span className="inline-block animate-pulse">▋</span> Initializing deployment...
                    </span>
                  )}
                </pre>
                {actionLoading === "deploy" && (
                  <div className="absolute bottom-4 right-4 flex items-center gap-2 text-xs text-gray-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                    <span>Streaming...</span>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-gray-200 bg-gray-50 px-6 py-3">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Project: {project?.name}</span>
                <span>
                  {actionLoading === "deploy" ? (
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse" />
                      In progress
                    </span>
                  ) : (
                    <span className="flex items-center gap-2 text-green-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                      Completed
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6 flex gap-2">
        <Button
          onClick={handleDeploy}
          disabled={actionLoading !== null}
        >
          {actionLoading === "deploy" ? "Deploying..." : "Deploy"}
        </Button>
        <Button
          variant="outline"
          onClick={handleUpdate}
          disabled={actionLoading !== null}
        >
          {actionLoading === "update" ? "Updating..." : "Update from GitHub"}
        </Button>
        <Button
          variant="outline"
          onClick={handleRestart}
          disabled={actionLoading !== null}
        >
          {actionLoading === "restart" ? "Restarting..." : "Restart"}
        </Button>
        <Button
          variant="destructive"
          onClick={handleDelete}
          disabled={actionLoading !== null}
        >
          {actionLoading === "delete" ? "Deleting..." : "Delete Project"}
        </Button>
      </div>

      <Tabs defaultValue="logs" className="w-full">
        <TabsList>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="env">Environment Variables</TabsTrigger>
        </TabsList>
        <TabsContent value="logs" className="mt-4">
          <div className="rounded-md border border-gray-200 bg-white p-4">
            <div className="mb-2 flex justify-between">
              <h3 className="font-medium">Container Logs</h3>
              <Button variant="outline" size="sm" onClick={fetchLogs}>
                Refresh
              </Button>
            </div>
            <pre className="max-h-96 overflow-auto rounded bg-gray-50 p-4 text-xs text-gray-900">
              {logs || "No logs available. Click Refresh to load logs."}
            </pre>
          </div>
        </TabsContent>
        <TabsContent value="env" className="mt-4">
          <div className="rounded-md border border-gray-200 bg-white p-6">
            <div className="mb-4 flex justify-between items-center">
              <h3 className="font-medium">Environment Variables</h3>
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
                        <TableCell className="font-medium">{env.key}</TableCell>
                        <TableCell className="font-mono text-sm">{env.value}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
