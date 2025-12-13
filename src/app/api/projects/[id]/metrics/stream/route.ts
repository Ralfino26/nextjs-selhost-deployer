import { NextRequest } from "next/server";
import { config } from "@/lib/config";
import { getProjectStatus } from "@/lib/services/docker.service";
import { getVisitorStats } from "@/lib/services/visitor.service";
import { ProjectDetails } from "@/types/project";
import { isAuthenticated } from "@/lib/auth";
import { readFile } from "fs/promises";
import { join } from "path";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Check authentication
  if (!isAuthenticated(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const projectName = id;
  
  // Get port from docker-compose.yml
  let port = 3000; // default
  try {
    const projectDir = join(config.projectsBaseDir, projectName);
    const dockerComposePath = join(projectDir, "docker", "docker-compose.yml");
    const content = await readFile(dockerComposePath, "utf-8");
    const portMatch = content.match(/ports:\s*-\s*"(\d+):/);
    if (portMatch) {
      port = parseInt(portMatch[1], 10);
    }
  } catch (error) {
    // Port not found, use default
  }

  // Create a readable stream for Server-Sent Events
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const sendData = (data: Partial<ProjectDetails>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      let isActive = true;

      // Cleanup on client disconnect
      request.signal.addEventListener("abort", () => {
        isActive = false;
        controller.close();
      });

      try {
        while (isActive) {
          try {
            // Get container metrics
            const { getDocker } = await import("@/lib/services/docker.service");
            const docker = await getDocker();
            const container = docker.getContainer(projectName);
            const info = await container.inspect();

            // Get status
            const status = await getProjectStatus(projectName);

            // Get container metrics if running
            let containerMetrics: ProjectDetails["containerMetrics"] | undefined;
            let containerHealth: ProjectDetails["containerHealth"] | undefined;

            if (info.State.Running) {
              // Get health check status
              if (info.State.Health) {
                containerHealth = info.State.Health.Status as "healthy" | "unhealthy" | "starting" | "none";
              } else {
                containerHealth = "none";
              }

              // Get container stats
              try {
                const stats = await container.stats({ stream: false });
                const statsData = stats as any;

                // Calculate CPU usage percentage
                let cpuUsage: number | undefined;
                if (statsData.cpu_stats && statsData.precpu_stats) {
                  const cpuDelta = statsData.cpu_stats.cpu_usage.total_usage - statsData.precpu_stats.cpu_usage.total_usage;
                  const systemDelta = statsData.cpu_stats.system_cpu_usage - statsData.precpu_stats.system_cpu_usage;
                  const numCpus = statsData.cpu_stats.online_cpus || 1;

                  if (systemDelta > 0 && cpuDelta > 0) {
                    cpuUsage = (cpuDelta / systemDelta) * numCpus * 100;
                    cpuUsage = Math.round(cpuUsage * 100) / 100;
                  }
                }

                // Get memory usage
                let memoryUsage: number | undefined;
                let memoryLimit: number | undefined;
                if (statsData.memory_stats) {
                  memoryUsage = statsData.memory_stats.usage || statsData.memory_stats.used || undefined;
                  memoryLimit = statsData.memory_stats.limit || undefined;
                }

                // Get network stats
                let networkRx: number | undefined;
                let networkTx: number | undefined;
                if (statsData.networks) {
                  // Sum up all network interfaces
                  let totalRx = 0;
                  let totalTx = 0;
                  for (const networkName in statsData.networks) {
                    const network = statsData.networks[networkName];
                    totalRx += network.rx_bytes || 0;
                    totalTx += network.tx_bytes || 0;
                  }
                  networkRx = totalRx;
                  networkTx = totalTx;
                }

                // Get uptime
                let uptime: number | undefined;
                if (info.State.StartedAt) {
                  const startedAt = new Date(info.State.StartedAt).getTime();
                  uptime = Math.floor((Date.now() - startedAt) / 1000);
                }

                containerMetrics = {
                  cpuUsage,
                  memoryUsage,
                  memoryLimit,
                  uptime,
                  restartCount: info.RestartCount || 0,
                  networkRx,
                  networkTx,
                };
              } catch (error) {
                // If stats fail, still include what we have
                if (info.State.StartedAt) {
                  const startedAt = new Date(info.State.StartedAt).getTime();
                  const uptime = Math.floor((Date.now() - startedAt) / 1000);
                  containerMetrics = {
                    uptime,
                    restartCount: info.RestartCount || 0,
                  };
                }
              }

              // Get visitor stats (only every 5 seconds to reduce load)
              let visitorStats: ProjectDetails["visitorStats"] | undefined;
              try {
                visitorStats = await getVisitorStats(projectName, port);
              } catch (error) {
                // Visitor stats failed, continue without them
              }

              // Send updated metrics
              sendData({
                status,
                containerMetrics,
                containerHealth,
                visitorStats,
                lastDeployment: info.State.StartedAt ? new Date(info.State.StartedAt).toLocaleString() : undefined,
              });
            } else {
              // Container not running
              sendData({
                status,
                visitorStats: {
                  activeConnections: 0,
                },
              });
            }

            // Wait 2 seconds before next update (real-time feel without heavy load)
            await new Promise((resolve) => setTimeout(resolve, 2000));
          } catch (error) {
            // If container doesn't exist or error, send error status
            sendData({
              status: "Stopped" as const,
            });
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }
      } catch (error) {
        console.error("Error in metrics stream:", error);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    },
  });
}

