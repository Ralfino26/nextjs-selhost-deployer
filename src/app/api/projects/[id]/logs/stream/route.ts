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
          
          // Docker logs returns oldest first, but we want newest at the bottom
          // Split by lines and take the last 100 lines
          const lines = logOutput.split("\n");
          const lastLines = lines.slice(-100).join("\n");
          
          // Send initial logs (already in correct order - newest at end)
          if (lastLines) {
            sendLog(lastLines);
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
            // docker compose logs also returns oldest first, so take last lines
            const lines = logOutput.split("\n");
            const lastLines = lines.slice(-100).join("\n");
            if (lastLines) {
              sendLog(lastLines);
            }
          } catch (composeError) {
            sendLog("No logs available");
          }
        }

        // Now stream new logs in real-time using polling (more reliable than Docker stream)
        if (isActive) {
          let lastLogLines: string[] = [];
          let lastLineCount = 0;
          let initialPollDone = false;

          const pollLogs = async () => {
            if (!isActive) return;

            try {
              const logs = await container.logs({
                stdout: true,
                stderr: true,
                tail: 200, // Get last 200 lines
                timestamps: false,
              });

              let logOutput = logs.toString("utf-8").replace(/\x1b\[[0-9;]*m/g, "");
              const lines = logOutput.split("\n").filter(line => line.trim() !== "");
              const currentLineCount = lines.length;

              // Only send if we have new lines
              if (currentLineCount > lastLineCount) {
                if (lastLineCount === 0 || !initialPollDone) {
                  // First time, send all logs (newest at end)
                  sendLog(lines.join("\n") + "\n");
                  initialPollDone = true;
                } else {
                  // Send only new lines (the ones that were added)
                  const newLines = lines.slice(lastLineCount);
                  if (newLines.length > 0) {
                    sendLog(newLines.join("\n") + "\n");
                  }
                }
                lastLogLines = lines;
                lastLineCount = currentLineCount;
              } else if (currentLineCount < lastLineCount) {
                // Logs were cleared or container restarted, reset
                lastLineCount = 0;
                lastLogLines = [];
                initialPollDone = false;
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

                let logOutput = (result.stdout || result.stderr || "").replace(/\x1b\[[0-9;]*m/g, "");
                const lines = logOutput.split("\n").filter(line => line.trim() !== "");
                const currentLineCount = lines.length;

                if (currentLineCount > lastLineCount) {
                  if (lastLineCount === 0 || !initialPollDone) {
                    sendLog(lines.join("\n") + "\n");
                    initialPollDone = true;
                  } else {
                    const newLines = lines.slice(lastLineCount);
                    if (newLines.length > 0) {
                      sendLog(newLines.join("\n") + "\n");
                    }
                  }
                  lastLogLines = lines;
                  lastLineCount = currentLineCount;
                } else if (currentLineCount < lastLineCount) {
                  lastLineCount = 0;
                  lastLogLines = [];
                  initialPollDone = false;
                }
              } catch (composeError) {
                // Container might be stopped
                if (lastLineCount === 0 && !initialPollDone) {
                  sendLog("Container is not running or logs are not available");
                  initialPollDone = true;
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
            pollLogs().catch((error) => {
              console.error("Error in pollLogs:", error);
            });
          }, 1000);

          // Initial poll immediately
          pollLogs().catch((error) => {
            console.error("Error in initial pollLogs:", error);
          });

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

