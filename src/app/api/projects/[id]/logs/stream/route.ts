import { NextRequest } from "next/server";
import { isAuthenticated } from "@/lib/auth";

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

  // Create a readable stream for Server-Sent Events
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const sendLog = (data: string) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ log: data })}\n\n`));
      };

      let isActive = true;

      // Cleanup on client disconnect
      request.signal.addEventListener("abort", () => {
        isActive = false;
        controller.close();
      });

      try {
        const { getDocker } = await import("@/lib/services/docker.service");
        const docker = await getDocker();
        const container = docker.getContainer(projectName);

        // First, get the last 100 lines to show current state
        try {
          const initialLogs = await container.logs({
            stdout: true,
            stderr: true,
            tail: 100,
            timestamps: false,
          });

          let logOutput = initialLogs.toString("utf-8");
          logOutput = logOutput.replace(/\x1b\[[0-9;]*m/g, ""); // Remove ANSI codes
          
          // Send initial logs
          if (logOutput) {
            sendLog(logOutput);
          }
        } catch (error) {
          // If container doesn't exist, try docker compose logs
          try {
            const { config } = await import("@/lib/config");
            const { join } = await import("path");
            const { exec } = await import("child_process");
            const { promisify } = await import("util");
            const execAsync = promisify(exec);

            const projectDir = join(config.projectsBaseDir, projectName);
            const dockerComposeDir = join(projectDir, "docker");

            const result = await execAsync(
              `docker compose logs --tail=100`,
              { cwd: dockerComposeDir }
            );

            const logOutput = (result.stdout || result.stderr || "").replace(/\x1b\[[0-9;]*m/g, "");
            if (logOutput) {
              sendLog(logOutput);
            }
          } catch (composeError) {
            sendLog("No logs available");
          }
        }

        // Now stream new logs in real-time using polling (more reliable than Docker stream)
        if (isActive) {
          let lastLogSize = 0;
          let lastLogHash = "";

          const pollLogs = async () => {
            if (!isActive) return;

            try {
              const logs = await container.logs({
                stdout: true,
                stderr: true,
                tail: 200, // Get last 200 lines
                timestamps: false,
              });

              const logOutput = logs.toString("utf-8").replace(/\x1b\[[0-9;]*m/g, "");
              const currentSize = logOutput.length;
              const currentHash = logOutput.slice(-1000); // Hash of last 1000 chars

              // Only send if logs have changed
              if (currentSize > lastLogSize || currentHash !== lastLogHash) {
                if (lastLogSize === 0) {
                  // First time, send all logs
                  sendLog(logOutput);
                } else {
                  // Send only new logs
                  const newLogs = logOutput.slice(lastLogSize);
                  if (newLogs) {
                    sendLog(newLogs);
                  }
                }
                lastLogSize = currentSize;
                lastLogHash = currentHash;
              }
            } catch (error) {
              // If container doesn't exist, try docker compose logs
              try {
                const { config } = await import("@/lib/config");
                const { join } = await import("path");
                const { exec } = await import("child_process");
                const { promisify } = await import("util");
                const execAsync = promisify(exec);

                const projectDir = join(config.projectsBaseDir, projectName);
                const dockerComposeDir = join(projectDir, "docker");

                const result = await execAsync(
                  `docker compose logs --tail=200`,
                  { cwd: dockerComposeDir }
                );

                const logOutput = (result.stdout || result.stderr || "").replace(/\x1b\[[0-9;]*m/g, "");
                const currentSize = logOutput.length;
                const currentHash = logOutput.slice(-1000);

                if (currentSize > lastLogSize || currentHash !== lastLogHash) {
                  if (lastLogSize === 0) {
                    sendLog(logOutput);
                  } else {
                    const newLogs = logOutput.slice(lastLogSize);
                    if (newLogs) {
                      sendLog(newLogs);
                    }
                  }
                  lastLogSize = currentSize;
                  lastLogHash = currentHash;
                }
              } catch (composeError) {
                // Container might be stopped
                if (lastLogSize === 0) {
                  sendLog("Container is not running or logs are not available");
                }
              }
            }
          };

          // Poll every 1 second for real-time feel
          const pollInterval = setInterval(() => {
            if (!isActive) {
              clearInterval(pollInterval);
              return;
            }
            pollLogs();
          }, 1000);

          // Initial poll
          pollLogs();

          request.signal.addEventListener("abort", () => {
            clearInterval(pollInterval);
          });
        }
      } catch (error) {
        console.error("Error in logs stream:", error);
        sendLog(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
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

