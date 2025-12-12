"use client";

import { useState } from "react";
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

// Placeholder project data
const projectData = {
  id: "1",
  name: "my-nextjs-app",
  domain: "my-nextjs-app.byralf.com",
  status: "Running",
  port: "3000",
  repo: "ralf/my-nextjs-app",
};

// Placeholder environment variables
const envVars = [
  { key: "NODE_ENV", value: "production" },
  { key: "DATABASE_URL", value: "postgresql://..." },
  { key: "API_KEY", value: "***" },
];

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const [envVariables, setEnvVariables] = useState(envVars);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const handleAddEnvVar = () => {
    if (newKey && newValue) {
      setEnvVariables([...envVariables, { key: newKey, value: newValue }]);
      setNewKey("");
      setNewValue("");
    }
  };

  const handleSave = () => {
    // Placeholder: save environment variables
  };

  const handleDelete = () => {
    // Placeholder: delete project
    router.push("/");
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/" className="text-sm text-gray-800 hover:text-gray-900">
          ← Back to Projects
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="mb-2 text-2xl font-semibold">{projectData.name}</h1>
        <div className="space-y-2 text-sm text-gray-900">
          <div>
            <span className="font-medium">Domain: </span>
            <a
              href={`https://${projectData.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              {projectData.domain}
            </a>
          </div>
          <div>
            <span className="font-medium">Status: </span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                projectData.status === "Running"
                  ? "bg-green-100 text-green-800"
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              {projectData.status}
            </span>
          </div>
          <div>
            <span className="font-medium">Port: </span>
            {projectData.port}
          </div>
          <div>
            <span className="font-medium">Repository: </span>
            {projectData.repo}
          </div>
        </div>
      </div>

      <div className="mb-6 flex gap-2">
        <Button>Deploy</Button>
        <Button variant="outline">Update from GitHub</Button>
        <Button variant="outline">Restart</Button>
        <Button variant="destructive" onClick={handleDelete}>
          Delete Project
        </Button>
      </div>

      <Tabs defaultValue="logs" className="w-full">
        <TabsList>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="env">Environment Variables</TabsTrigger>
        </TabsList>
        <TabsContent value="logs" className="mt-4">
          <div className="rounded-md border border-gray-200 bg-white p-4">
            <p className="text-sm text-gray-700">Logs will appear here...</p>
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
                  {envVariables.map((env, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{env.key}</TableCell>
                      <TableCell>{env.value}</TableCell>
                    </TableRow>
                  ))}
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

