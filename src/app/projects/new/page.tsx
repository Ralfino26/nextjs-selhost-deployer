"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Search, Star, GitFork, Lock, Globe, ArrowLeft, Database, Server } from "lucide-react";
import { toast } from "sonner";
import { DeployModal } from "../[id]/deploy-modal";

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  language: string | null;
  updated_at: string;
  default_branch: string;
  stargazers_count: number;
  forks_count: number;
}

type ProjectType = "database-only" | "database-website";

export default function NewProjectPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [reposLoading, setReposLoading] = useState(true);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [filteredRepos, setFilteredRepos] = useState<GitHubRepo[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [projectType, setProjectType] = useState<ProjectType>("database-website");
  const [formData, setFormData] = useState({
    projectName: "",
    port: "",
    createDatabase: true, // Always true for database-only, optional for website
  });
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [deployLogs, setDeployLogs] = useState("");
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployPhases, setDeployPhases] = useState({
    initializing: "pending" as "pending" | "active" | "complete",
    building: "pending" as "pending" | "active" | "complete",
    deploying: "pending" as "pending" | "active" | "complete",
    cleanup: "pending" as "pending" | "active" | "complete",
    postProcessing: "pending" as "pending" | "active" | "complete",
  });

  // Fetch GitHub repositories only if website project type
  useEffect(() => {
    if (projectType === "database-website") {
      fetchRepos();
    } else {
      setReposLoading(false);
    }
  }, [projectType]);

  // Filter repos based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredRepos(repos);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredRepos(
        repos.filter(
          (repo) =>
            repo.name.toLowerCase().includes(query) ||
            repo.full_name.toLowerCase().includes(query) ||
            (repo.description && repo.description.toLowerCase().includes(query))
        )
      );
    }
  }, [searchQuery, repos]);

  const fetchRepos = async () => {
    setReposLoading(true);
    try {
      const auth = sessionStorage.getItem("auth");
      const response = await fetch("/api/github/repos", {
        headers: auth ? { Authorization: `Basic ${auth}` } : {},
      });

      if (!response.ok) {
        const error = await response.json();
        toast.error("Failed to fetch repositories", {
          description: error.error || "Please check your GitHub token in Settings",
        });
        return;
      }

      const data = await response.json();
      setRepos(data);
      setFilteredRepos(data);
    } catch (error: any) {
      toast.error("Failed to fetch repositories", {
        description: error.message || "Please check your GitHub token in Settings",
      });
    } finally {
      setReposLoading(false);
    }
  };

  const handleRepoSelect = (repo: GitHubRepo) => {
    setSelectedRepo(repo);
    // Auto-fill project name with repo name (without owner)
    if (!formData.projectName) {
      setFormData({ ...formData, projectName: repo.name });
    }
  };

  const handleContinue = async () => {
    if (step === 1) {
      if (!formData.projectName) {
        toast.error("Please enter a project name");
        return;
      }
      
      // For database-website, require repo selection
      if (projectType === "database-website" && !selectedRepo) {
        toast.error("Please select a repository");
        return;
      }
      
      setLoading(true);
      try {
        // For database-website, initialize project structure
        if (projectType === "database-website") {
          const auth = sessionStorage.getItem("auth");
          const response = await fetch("/api/projects/initialize", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(auth ? { Authorization: `Basic ${auth}` } : {}),
            },
            body: JSON.stringify({
              repo: selectedRepo!.full_name,
              projectName: formData.projectName,
            }),
          });

          if (!response.ok) {
            const error = await response.json();
            toast.error("Error initializing project", {
              description: error.error || "Unknown error",
            });
            return;
          }

          const data = await response.json();
          // Update formData with the auto-assigned port
          setFormData({
            ...formData,
            port: data.port.toString(),
          });
        } else {
          // For database-only, skip initialization, go directly to step 2
          // Port is not needed for database-only projects
        }
        
        setStep(2);
        if (projectType === "database-website") {
          toast.success("Project initialized", {
            description: "Repository cloned and Docker files created",
          });
        }
      } catch (error: any) {
        toast.error("Failed to initialize project", {
          description: error.message || "Failed to initialize project structure",
        });
      } finally {
        setLoading(false);
      }
    } else if (step === 2) {
      setStep(3);
    }
  };

  const handleCreate = async () => {
    if (projectType === "database-website" && !selectedRepo) return;
    
    setLoading(true);
    setShowDeployModal(true);
    setDeployLogs("");
    setIsDeploying(true);
    setDeployPhases({
      initializing: "active",
      building: projectType === "database-website" ? "pending" : "complete",
      deploying: projectType === "database-website" ? "pending" : "complete",
      cleanup: "pending",
      postProcessing: "pending",
    });
    
    try {
      const auth = sessionStorage.getItem("auth");
      const response = await fetch("/api/projects/create/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(auth ? { Authorization: `Basic ${auth}` } : {}),
        },
        body: JSON.stringify({
          repo: projectType === "database-website" ? selectedRepo!.full_name : null,
          projectName: formData.projectName,
          port: projectType === "database-website" ? parseInt(formData.port, 10) : 0,
          createDatabase: true, // Always true for both types
          projectType: projectType,
          envVars: [], // Environment variables can be added later via the interface
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to start project creation");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

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
                setDeployLogs((prev) => prev + data.log);
                
                // Update phases based on log content
                if (data.log.includes("🗄️  Setting up database") || data.log.includes("Setting up database")) {
                  setDeployPhases((prev) => ({ ...prev, initializing: "active" }));
                }
                if (data.log.includes("✅ Database started successfully")) {
                  setDeployPhases((prev) => ({ ...prev, initializing: "complete" }));
                }
                if (data.log.includes("🔨 Building images") || data.log.includes("Building images")) {
                  setDeployPhases((prev) => ({ ...prev, building: "active" }));
                }
                if (data.log.includes("✅ Build completed")) {
                  setDeployPhases((prev) => ({ ...prev, building: "complete" }));
                }
                if (data.log.includes("🚀 Starting containers") || data.log.includes("Starting containers")) {
                  setDeployPhases((prev) => ({ ...prev, deploying: "active" }));
                }
                if (data.log.includes("✅ Deployment completed")) {
                  setDeployPhases((prev) => ({ ...prev, deploying: "complete" }));
                }
                if (data.log === "DONE") {
                  setIsDeploying(false);
                  setTimeout(() => {
                    router.push(`/projects/${formData.projectName}`);
                  }, 2000);
                }
              }
            } catch (e) {
              // Ignore JSON parse errors
            }
          }
        }
      }
    } catch (error: any) {
      setIsDeploying(false);
      toast.error("Failed to create project", {
        description: error.message || "Failed to create project",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "today";
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" />
          Back to Projects
        </Link>
      </div>

      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Create New Project</h1>
          <p className="text-gray-600">Deploy a website or create a standalone database</p>
        </div>

        {/* Project Type Toggle */}
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <Label className="text-base font-semibold mb-4 block">Project Type</Label>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => {
                setProjectType("database-only");
                setSelectedRepo(null);
                setFormData({ ...formData, createDatabase: true });
              }}
              className={`relative rounded-lg border-2 p-6 text-left transition-all ${
                projectType === "database-only"
                  ? "border-blue-500 bg-blue-50 shadow-md"
                  : "border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100"
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${
                  projectType === "database-only" ? "bg-blue-500" : "bg-gray-300"
                }`}>
                  <Database className={`h-6 w-6 ${
                    projectType === "database-only" ? "text-white" : "text-gray-600"
                  }`} />
                </div>
                <div className="flex-1">
                  <h3 className={`font-semibold mb-1 ${
                    projectType === "database-only" ? "text-blue-900" : "text-gray-900"
                  }`}>
                    Database Only
                  </h3>
                  <p className={`text-sm ${
                    projectType === "database-only" ? "text-blue-700" : "text-gray-600"
                  }`}>
                    Create a standalone MongoDB database without deploying a website
                  </p>
                </div>
                {projectType === "database-only" && (
                  <div className="absolute top-4 right-4">
                    <div className="h-5 w-5 rounded-full bg-blue-500 flex items-center justify-center">
                      <span className="text-white text-xs">✓</span>
                    </div>
                  </div>
                )}
              </div>
            </button>

            <button
              onClick={() => {
                setProjectType("database-website");
                setFormData({ ...formData, createDatabase: true });
              }}
              className={`relative rounded-lg border-2 p-6 text-left transition-all ${
                projectType === "database-website"
                  ? "border-blue-500 bg-blue-50 shadow-md"
                  : "border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100"
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${
                  projectType === "database-website" ? "bg-blue-500" : "bg-gray-300"
                }`}>
                  <Server className={`h-6 w-6 ${
                    projectType === "database-website" ? "text-white" : "text-gray-600"
                  }`} />
                </div>
                <div className="flex-1">
                  <h3 className={`font-semibold mb-1 ${
                    projectType === "database-website" ? "text-blue-900" : "text-gray-900"
                  }`}>
                    Database + Website
                  </h3>
                  <p className={`text-sm ${
                    projectType === "database-website" ? "text-blue-700" : "text-gray-600"
                  }`}>
                    Deploy a website from GitHub with an optional MongoDB database
                  </p>
                </div>
                {projectType === "database-website" && (
                  <div className="absolute top-4 right-4">
                    <div className="h-5 w-5 rounded-full bg-blue-500 flex items-center justify-center">
                      <span className="text-white text-xs">✓</span>
                    </div>
                  </div>
                )}
              </div>
            </button>
          </div>
        </div>

        {/* Project Name Input - Always Visible */}
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <Label htmlFor="projectName" className="text-base font-semibold mb-2 block">
            Project Name
          </Label>
          <Input
            id="projectName"
            className="mt-2"
            value={formData.projectName}
            onChange={(e) =>
              setFormData({ ...formData, projectName: e.target.value })
            }
            placeholder="my-project"
          />
          <p className="mt-2 text-xs text-gray-500">
            This will be used as the container name and directory name
          </p>
        </div>

        {/* Step 1: Select GitHub Repo (only for database-website) */}
        {step === 1 && projectType === "database-website" && (
          <div className="mb-6 space-y-6">
            <div className="rounded-lg border-2 border-gray-800 bg-gray-900 p-6 shadow-lg">
              <div className="mb-4 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white">
                  <span className="text-lg">🐙</span>
                </div>
                <h2 className="text-lg font-semibold text-white">Select GitHub Repository</h2>
              </div>

              {/* Search */}
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Search repositories..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-gray-800 border-gray-700 text-white pl-10 placeholder:text-gray-500 focus:border-gray-600"
                  />
                </div>
              </div>

              {/* Repositories List */}
              <div className="max-h-[500px] space-y-2 overflow-y-auto rounded-md bg-gray-800 p-2">
                {reposLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                    <span className="ml-2 text-gray-400">Loading repositories...</span>
                  </div>
                ) : filteredRepos.length === 0 ? (
                  <div className="py-12 text-center text-gray-400">
                    {searchQuery ? "No repositories found" : "No repositories available"}
                  </div>
                ) : (
                  filteredRepos.map((repo) => (
                    <button
                      key={repo.id}
                      onClick={() => handleRepoSelect(repo)}
                      className={`w-full rounded-md border-2 p-4 text-left transition-all ${
                        selectedRepo?.id === repo.id
                          ? "border-blue-500 bg-blue-900/20"
                          : "border-gray-700 bg-gray-800 hover:border-gray-600 hover:bg-gray-700"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold text-white truncate">{repo.full_name}</h3>
                            {repo.private ? (
                              <Lock className="h-4 w-4 text-gray-400 flex-shrink-0" />
                            ) : (
                              <Globe className="h-4 w-4 text-gray-400 flex-shrink-0" />
                            )}
                          </div>
                          {repo.description && (
                            <p className="text-sm text-gray-400 mb-2 line-clamp-2">
                              {repo.description}
                            </p>
                          )}
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            {repo.language && (
                              <span className="flex items-center gap-1">
                                <span className="h-3 w-3 rounded-full bg-blue-500"></span>
                                {repo.language}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Star className="h-3 w-3" />
                              {repo.stargazers_count}
                            </span>
                            <span className="flex items-center gap-1">
                              <GitFork className="h-3 w-3" />
                              {repo.forks_count}
                            </span>
                            <span>Updated {formatDate(repo.updated_at)}</span>
                          </div>
                        </div>
                        {selectedRepo?.id === repo.id && (
                          <div className="flex-shrink-0">
                            <div className="h-5 w-5 rounded-full bg-blue-500 flex items-center justify-center">
                              <span className="text-white text-xs">✓</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Continue Button */}
        {step === 1 && (
          <div className="flex justify-end">
            <Button
              onClick={handleContinue}
              disabled={
                !formData.projectName || 
                (projectType === "database-website" && !selectedRepo) || 
                loading
              }
              className="min-w-[120px]"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {projectType === "database-website" ? "Initializing..." : "Processing..."}
                </>
              ) : (
                "Continue"
              )}
            </Button>
          </div>
        )}

        {/* Step 2: Basic Configuration */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold">Configuration</h2>
              <div className="space-y-4">
                {projectType === "database-website" && (
                  <div>
                    <Label htmlFor="port">Port</Label>
                    <Input
                      id="port"
                      className="mt-1"
                      value={formData.port}
                      readOnly
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Port automatically assigned based on existing containers
                    </p>
                  </div>
                )}
                <div className="flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 p-4">
                  <div className="flex items-center gap-3">
                    <Database className="h-5 w-5 text-gray-600" />
                    <div>
                      <Label htmlFor="database" className="text-base font-medium">
                        MongoDB Database
                      </Label>
                      <p className="mt-1 text-sm text-gray-600">
                        Automatically create a MongoDB database for this project
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="database"
                    checked={formData.createDatabase}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, createDatabase: checked })
                    }
                    disabled={projectType === "database-only"}
                  />
                </div>
                {projectType === "database-only" && (
                  <p className="text-xs text-gray-500 italic">
                    Database is always created for database-only projects
                  </p>
                )}
              </div>
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button onClick={handleContinue} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Continue"
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Summary */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold">Summary</h2>
              <div className="space-y-3">
                <div className="flex justify-between border-b border-gray-100 pb-3">
                  <span className="text-gray-600 font-medium">Project Type:</span>
                  <span className="font-semibold">
                    {projectType === "database-only" ? "Database Only" : "Database + Website"}
                  </span>
                </div>
                {projectType === "database-website" && (
                  <div className="flex justify-between border-b border-gray-100 pb-3">
                    <span className="text-gray-600 font-medium">Repository:</span>
                    <span className="font-semibold">{selectedRepo?.full_name || "N/A"}</span>
                  </div>
                )}
                <div className="flex justify-between border-b border-gray-100 pb-3">
                  <span className="text-gray-600 font-medium">Project Name:</span>
                  <span className="font-semibold">{formData.projectName}</span>
                </div>
                {projectType === "database-website" && (
                  <div className="flex justify-between border-b border-gray-100 pb-3">
                    <span className="text-gray-600 font-medium">Port:</span>
                    <span className="font-semibold">{formData.port}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600 font-medium">Database:</span>
                  <span className="font-semibold text-green-600">
                    {formData.createDatabase ? "Yes" : "No"}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button onClick={handleCreate} disabled={loading} className="min-w-[140px]">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Project"
                )}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Deploy Modal */}
      <DeployModal
        isOpen={showDeployModal}
        onClose={() => {
          if (!isDeploying) {
            setShowDeployModal(false);
          }
        }}
        projectName={formData.projectName}
        projectDomain={undefined}
        deployLogs={deployLogs}
        deployPhases={deployPhases}
        isDeploying={isDeploying}
      />
    </div>
  );
}
