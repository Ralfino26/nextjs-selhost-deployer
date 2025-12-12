"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchProject();
    fetchEnvVars();
  }, [projectId]);

  const fetchProject = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}`);
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
      const response = await fetch(`/api/projects/${projectId}/logs?lines=100`);
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
      const response = await fetch(`/api/projects/${projectId}/env`);
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
    try {
      const response = await fetch(`/api/projects/${projectId}/deploy`, {
        method: "POST",
      });
      if (response.ok) {
        await fetchProject();
      }
    } catch (error) {
      console.error("Error deploying:", error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdate = async () => {
    setActionLoading("update");
    try {
      const response = await fetch(`/api/projects/${projectId}/update`, {
        method: "POST",
      });
      if (response.ok) {
        await fetchProject();
      }
    } catch (error) {
      console.error("Error updating:", error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRestart = async () => {
    setActionLoading("restart");
    try {
      const response = await fetch(`/api/projects/${projectId}/restart`, {
        method: "POST",
      });
      if (response.ok) {
        await fetchProject();
      }
    } catch (error) {
      console.error("Error restarting:", error);
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
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        router.push("/");
      }
    } catch (error) {
      console.error("Error deleting:", error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddEnvVar = () => {
    if (newKey && newValue) {
      setEnvVariables([...envVariables, { key: newKey, value: newValue }]);
      setNewKey("");
      setNewValue("");
    }
  };

  const handleSave = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/env`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ variables: envVariables }),
      });
      if (response.ok) {
        alert("Environment variables saved");
      }
    } catch (error) {
      console.error("Error saving env vars:", error);
      alert("Failed to save environment variables");
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
            <div className="mb-4">
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
                        No environment variables set
                      </TableCell>
                    </TableRow>
                  ) : (
                    envVariables.map((env, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{env.key}</TableCell>
                        <TableCell>{env.value}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="mb-4 space-y-3 border-t border-gray-200 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="env-key">Key</Label>
                  <Input
                    id="env-key"
                    className="mt-1"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    placeholder="ENV_VAR_NAME"
                  />
                </div>
                <div>
                  <Label htmlFor="env-value">Value</Label>
                  <Input
                    id="env-value"
                    className="mt-1"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    placeholder="value"
                  />
                </div>
              </div>
              <Button variant="outline" onClick={handleAddEnvVar}>
                Add Variable
              </Button>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSave}>Save</Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
