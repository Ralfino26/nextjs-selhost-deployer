"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Config {
  githubToken: string;
  mongoUser: string;
  mongoPassword: string;
  mongoDefaultDatabase: string;
  projectsBaseDir: string;
  startingPort: number;
  websitesNetwork: string;
  infraNetwork: string;
  npmUrl?: string;
  npmEmail?: string;
  npmPassword?: string;
}

export default function SettingsPage() {
  const [config, setConfig] = useState<Config>({
    githubToken: "",
    mongoUser: "ralf",
    mongoPassword: "supersecret",
    mongoDefaultDatabase: "admin",
    projectsBaseDir: "/srv/vps/websites",
    startingPort: 5000,
    websitesNetwork: "websites_network",
    infraNetwork: "infra_network",
    npmUrl: "http://nginx-proxy-manager:81",
    npmEmail: "",
    npmPassword: "",
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const auth = sessionStorage.getItem("auth");
      const response = await fetch("/api/settings", {
        headers: auth ? { Authorization: `Basic ${auth}` } : {},
      });
      if (response.ok) {
        const data = await response.json();
        setConfig(data);
      }
    } catch (error) {
      console.error("Error fetching config:", error);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setMessage("");

    try {
      const auth = sessionStorage.getItem("auth");
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(auth ? { Authorization: `Basic ${auth}` } : {}),
        },
        body: JSON.stringify(config),
      });

      if (response.ok) {
        setMessage("Settings saved successfully");
      } else {
        setMessage("Failed to save settings");
      }
    } catch (error) {
      console.error("Error saving config:", error);
      setMessage("Failed to save settings");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Settings</h1>

      <div className="space-y-6 rounded-md border border-gray-200 bg-white p-6">
        <div>
          <h2 className="mb-4 text-lg font-medium">GitHub Configuration</h2>
          <div className="space-y-4">
            <div>
              <Label htmlFor="githubToken">GitHub Token</Label>
              <Input
                id="githubToken"
                type="password"
                value={config.githubToken}
                onChange={(e) =>
                  setConfig({ ...config, githubToken: e.target.value })
                }
                placeholder="ghp_..."
              />
              <p className="mt-1 text-xs text-gray-700">
                Required for private repositories. Generate at{" "}
                <a
                  href="https://github.com/settings/tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  GitHub Settings
                </a>
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-6">
          <h2 className="mb-4 text-lg font-medium">MongoDB Configuration</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="mongoUser">MongoDB User</Label>
              <Input
                id="mongoUser"
                value={config.mongoUser}
                onChange={(e) =>
                  setConfig({ ...config, mongoUser: e.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor="mongoPassword">MongoDB Password</Label>
              <Input
                id="mongoPassword"
                type="password"
                value={config.mongoPassword}
                onChange={(e) =>
                  setConfig({ ...config, mongoPassword: e.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor="mongoDefaultDatabase">Default Database</Label>
              <Input
                id="mongoDefaultDatabase"
                value={config.mongoDefaultDatabase}
                onChange={(e) =>
                  setConfig({ ...config, mongoDefaultDatabase: e.target.value })
                }
              />
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-6">
          <h2 className="mb-4 text-lg font-medium">Deployment Configuration</h2>
          <div className="space-y-4">
            <div>
              <Label htmlFor="projectsBaseDir">Projects Base Directory</Label>
              <Input
                id="projectsBaseDir"
                value={config.projectsBaseDir}
                onChange={(e) =>
                  setConfig({ ...config, projectsBaseDir: e.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor="startingPort">Starting Port</Label>
              <Input
                id="startingPort"
                type="number"
                value={config.startingPort}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    startingPort: parseInt(e.target.value, 10),
                  })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="websitesNetwork">Websites Network</Label>
                <Input
                  id="websitesNetwork"
                  value={config.websitesNetwork}
                  onChange={(e) =>
                    setConfig({ ...config, websitesNetwork: e.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="infraNetwork">Infra Network</Label>
                <Input
                  id="infraNetwork"
                  value={config.infraNetwork}
                  onChange={(e) =>
                    setConfig({ ...config, infraNetwork: e.target.value })
                  }
                />
              </div>
            </div>
          </div>
        </div>

        {message && (
          <div
            className={`rounded-md p-3 text-sm ${
              message.includes("success")
                ? "bg-green-50 text-green-800"
                : "bg-red-50 text-red-800"
            }`}
          >
            {message}
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </div>
    </div>
  );
}

