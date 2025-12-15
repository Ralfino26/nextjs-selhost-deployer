"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Plus, 
  Search, 
  Database, 
  Server, 
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  Globe,
  Settings,
  GitBranch
} from "lucide-react";
import { Project } from "@/types/project";
import { toast } from "sonner";

export default function Home() {
  const pathname = usePathname();
  const hasFetchedRef = useRef(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchProjects = useCallback(async () => {
    // Always set loading to true at the start
    setLoading(true);
    // Clear existing projects immediately to show loading state
    setProjects([]);
    setFilteredProjects([]);
    
    try {
      const auth = sessionStorage.getItem("auth");
      const response = await fetch("/api/projects", {
        headers: auth ? { Authorization: `Basic ${auth}` } : {},
        cache: "no-store", // Ensure fresh data
      });
      
      if (!response.ok) {
        const error = await response.json();
        console.error("Error fetching projects:", error);
        setLoading(false);
        return;
      }
      
      const data = await response.json();
      setProjects(data);
      setFilteredProjects(data);
      hasFetchedRef.current = true;
    } catch (error: any) {
      // Only log non-network errors (network errors are normal during navigation)
      if (error?.name !== "NetworkError" && error?.message !== "NetworkError when attempting to fetch resource") {
        console.error("Error fetching projects:", error);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch projects when component mounts or pathname changes (handles navigation)
  useEffect(() => {
    if (pathname === "/") {
      // Always reset and fetch fresh data when on homepage
      hasFetchedRef.current = false;
      setProjects([]);
      setFilteredProjects([]);
      setLoading(true);
      
      // Use a small delay to ensure state is reset before fetching
      const timer = setTimeout(() => {
        fetchProjects();
      }, 0);
      
      return () => clearTimeout(timer);
    }
  }, [pathname, fetchProjects]);

  // Also handle window focus (when user navigates back via browser back button)
  useEffect(() => {
    const handleFocus = () => {
      if (pathname === "/" && (!hasFetchedRef.current || projects.length === 0)) {
        hasFetchedRef.current = false;
        setLoading(true);
        fetchProjects();
      }
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [pathname, projects.length, fetchProjects]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredProjects(projects);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredProjects(
        projects.filter(
          (project) =>
            project.name.toLowerCase().includes(query) ||
            project.repo.toLowerCase().includes(query) ||
            (project.domain && project.domain.toLowerCase().includes(query))
        )
      );
    }
  }, [searchQuery, projects]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Running":
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case "Building":
        return <Clock className="h-4 w-4 text-yellow-600 animate-spin" />;
      case "Error":
        return <XCircle className="h-4 w-4 text-red-600" />;
      case "Stopped":
        return <AlertCircle className="h-4 w-4 text-gray-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Running":
        return "bg-green-50 text-green-700 border-green-200";
      case "Building":
        return "bg-yellow-50 text-yellow-700 border-yellow-200";
      case "Error":
        return "bg-red-50 text-red-700 border-red-200";
      case "Stopped":
        return "bg-gray-50 text-gray-700 border-gray-200";
      default:
        return "bg-gray-50 text-gray-500 border-gray-200";
    }
  };


  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-8">
          <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-2" />
          <div className="h-4 w-96 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-lg p-6 animate-pulse">
              <div className="h-6 w-32 bg-gray-200 rounded mb-4" />
              <div className="h-4 w-24 bg-gray-200 rounded mb-2" />
              <div className="h-4 w-40 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Projects</h1>
            <p className="text-gray-600">
              Manage and monitor your deployed applications
            </p>
          </div>
          <Link href="/projects/new">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Project
            </Button>
          </Link>
        </div>

        {/* Search */}
        {projects.length > 0 && (
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              type="text"
              placeholder="Search projects by name, repo, or domain..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        )}
      </div>

      {/* Projects Grid */}
      {filteredProjects.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
          {projects.length === 0 ? (
            <>
              <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <Server className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No projects yet
              </h3>
              <p className="text-gray-600 mb-6 max-w-md mx-auto">
                Get started by creating your first project. Deploy from GitHub and manage everything in one place.
              </p>
              <Link href="/projects/new">
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create Your First Project
                </Button>
              </Link>
            </>
          ) : (
            <>
              <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <Search className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No projects found
              </h3>
              <p className="text-gray-600 mb-4">
                Try adjusting your search query
              </p>
              <Button
                variant="outline"
                onClick={() => setSearchQuery("")}
                className="gap-2"
              >
                Clear Search
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project) => {
            const isDatabaseOnly = project.repo === "Database Only";
            const cardColorClass = isDatabaseOnly 
              ? "bg-gradient-to-br from-green-50 to-white border-green-200" 
              : "bg-gradient-to-br from-blue-50 to-white border-blue-200";
            
            return (
            <div
              key={project.id}
              className={`${cardColorClass} border-2 rounded-lg p-6 hover:shadow-lg transition-shadow duration-200`}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-semibold text-gray-900 truncate">
                      {project.name}
                    </h3>
                    {project.gitBehind && (
                      <span className="flex items-center gap-1 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full border border-orange-300 animate-pulse">
                        <GitBranch className="h-3 w-3" />
                        Behind
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 truncate">
                    {project.repo}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-2">
                  {getStatusIcon(project.status)}
                </div>
              </div>

              {/* Status Badge */}
              <div className="mb-4">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${getStatusColor(
                    project.status
                  )}`}
                >
                  {getStatusIcon(project.status)}
                  {project.status}
                </span>
              </div>

              {/* Info Grid */}
              <div className="space-y-3 mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Server className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  <span className="truncate">Port: {project.port}</span>
                </div>
                
                {project.domain && !project.domain.includes("ERROR") && project.domain !== "N/A" && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Globe className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    {project.status === "Running" ? (
                      <a
                        href={`https://${project.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-blue-600 hover:text-blue-800 hover:underline"
                        title={project.domain}
                      >
                        {project.domain}
                      </a>
                    ) : (
                      <span className="truncate" title={project.domain}>
                        {project.domain}
                      </span>
                    )}
                  </div>
                )}

                {project.createDatabase && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Database className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    <span>Database enabled</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="pt-4 border-t border-gray-200">
                <Link href={`/projects/${project.id}`} className="block">
                  <Button variant="outline" size="sm" className="w-full gap-2">
                    <Settings className="h-4 w-4" />
                    Manage
                  </Button>
                </Link>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* Stats Footer */}
      {projects.length > 0 && (
        <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">{projects.length}</span>
                <span>Total Projects</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">
                  {projects.filter((p) => p.status === "Running").length}
                </span>
                <span>Running</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">
                  {projects.filter((p) => p.createDatabase).length}
                </span>
                <span>With Database</span>
              </div>
            </div>
            <Link href="/settings">
              <Button variant="ghost" size="sm" className="gap-2">
                <Settings className="h-4 w-4" />
                Settings
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
