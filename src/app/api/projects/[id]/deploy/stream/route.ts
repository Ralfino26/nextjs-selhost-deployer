import { NextRequest } from "next/server";
import { join } from "path";
import { config } from "@/lib/config";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const projectName = id;
  const projectDir = join(config.projectsBaseDir, projectName);
  const dockerComposeDir = join(projectDir, "docker");

  const { spawn } = await import("child_process");

  // Create a readable stream for Server-Sent Events
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const sendLog = (data: string) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ log: data })}\n\n`));
      };

      try {
        sendLog("🛑 Stopping containers...\n");

        // Down phase
        await new Promise<void>((resolve, reject) => {
          const downProcess = spawn("docker", ["compose", "down"], {
            cwd: dockerComposeDir,
            shell: "/bin/sh",
          });

          downProcess.stdout?.on("data", (data) => {
            sendLog(data.toString());
          });

          downProcess.stderr?.on("data", (data) => {
            sendLog(data.toString());
          });

          downProcess.on("close", (code) => {
            if (code === 0) {
              sendLog("✅ Containers stopped\n");
              resolve();
            } else {
              // Down can fail if containers don't exist, which is fine
              sendLog("ℹ️  No containers to stop (this is OK)\n");
              resolve();
            }
          });

          downProcess.on("error", (error) => {
            // Don't fail on down errors, just log and continue
            sendLog(`ℹ️  Down process warning: ${error.message}\n`);
            resolve();
          });
        });

        sendLog("🔨 Building images...\n");

        // Build phase
        await new Promise<void>((resolve, reject) => {
          const buildProcess = spawn("docker", ["compose", "build"], {
            cwd: dockerComposeDir,
            shell: "/bin/sh",
          });

          buildProcess.stdout?.on("data", (data) => {
            sendLog(data.toString());
          });

          buildProcess.stderr?.on("data", (data) => {
            sendLog(data.toString());
          });

          buildProcess.on("close", (code) => {
            if (code === 0) {
              sendLog("✅ Build completed successfully\n");
              resolve();
            } else {
              reject(new Error(`Build failed with code ${code}`));
            }
          });

          buildProcess.on("error", (error) => {
            reject(error);
          });
        });

        sendLog("🚀 Starting containers...\n");

        // Start phase
        await new Promise<void>((resolve, reject) => {
          const upProcess = spawn("docker", ["compose", "up", "-d"], {
            cwd: dockerComposeDir,
            shell: "/bin/sh",
          });

          upProcess.stdout?.on("data", (data) => {
            sendLog(data.toString());
          });

          upProcess.stderr?.on("data", (data) => {
            sendLog(data.toString());
          });

          upProcess.on("close", (code) => {
            if (code === 0) {
              sendLog("✅ Deployment completed successfully\n");
              sendLog("DONE");
              resolve();
            } else {
              reject(new Error(`Deployment failed with code ${code}`));
            }
          });

          upProcess.on("error", (error) => {
            reject(error);
          });
        });
      } catch (error: any) {
        sendLog(`❌ Error: ${error.message}\n`);
        sendLog("DONE");
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
    },
  });
}


