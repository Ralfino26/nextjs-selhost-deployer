"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

// Placeholder repos
const repos = [
  "ralf/my-nextjs-app",
  "ralf/api-service",
  "ralf/dashboard",
  "ralf/blog",
];

export default function NewProjectPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    repo: "",
    projectName: "",
    port: "3000",
    createDatabase: false,
    domain: "",
  });

  const handleContinue = () => {
    if (step === 1) {
      if (formData.repo && formData.projectName) {
        setStep(2);
      }
    } else if (step === 2) {
      if (formData.domain) {
        setStep(3);
      }
    }
  };

  const handleCreate = () => {
    // Placeholder: create project
    router.push("/");
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-8 text-2xl font-semibold">New Project</h1>

        {/* Step 1: Select GitHub Repo */}
        {step === 1 && (
          <div className="space-y-6 rounded-md border border-gray-200 bg-white p-6">
            <div>
              <h2 className="mb-4 text-lg font-medium">Select GitHub Repository</h2>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="repo">Repository</Label>
                  <Select
                    value={formData.repo}
                    onValueChange={(value) =>
                      setFormData({ ...formData, repo: value })
                    }
                  >
                    <SelectTrigger id="repo" className="mt-1">
                      <SelectValue placeholder="Select a repository" />
                    </SelectTrigger>
                    <SelectContent>
                      {repos.map((repo) => (
                        <SelectItem key={repo} value={repo}>
                          {repo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="projectName">Project Name</Label>
                  <Input
                    id="projectName"
                    className="mt-1"
                    value={formData.projectName}
                    onChange={(e) =>
                      setFormData({ ...formData, projectName: e.target.value })
                    }
                    placeholder="my-project"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleContinue} disabled={!formData.repo || !formData.projectName}>
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Basic Configuration */}
        {step === 2 && (
          <div className="space-y-6 rounded-md border border-gray-200 bg-white p-6">
            <div>
              <h2 className="mb-4 text-lg font-medium">Basic Configuration</h2>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="port">Port</Label>
                  <Input
                    id="port"
                    className="mt-1"
                    value={formData.port}
                    readOnly
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="database">Create Database</Label>
                    <p className="text-sm text-gray-700">
                      Automatically create a PostgreSQL database for this project
                    </p>
                  </div>
                  <Switch
                    id="database"
                    checked={formData.createDatabase}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, createDatabase: checked })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="domain">Domain</Label>
                  <Input
                    id="domain"
                    className="mt-1"
                    value={formData.domain}
                    onChange={(e) =>
                      setFormData({ ...formData, domain: e.target.value })
                    }
                    placeholder="project.byralf.com"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button onClick={handleContinue} disabled={!formData.domain}>
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Summary */}
        {step === 3 && (
          <div className="space-y-6 rounded-md border border-gray-200 bg-white p-6">
            <div>
              <h2 className="mb-4 text-lg font-medium">Summary</h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-800">Repository:</span>
                  <span className="font-medium">{formData.repo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-800">Project Name:</span>
                  <span className="font-medium">{formData.projectName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-800">Port:</span>
                  <span className="font-medium">{formData.port}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-800">Domain:</span>
                  <span className="font-medium">{formData.domain}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-800">Database:</span>
                  <span className="font-medium">
                    {formData.createDatabase ? "Yes" : "No"}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button onClick={handleCreate}>Create Project</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

