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
        // Regenerate Dockerfile and docker-compose.yml to ensure SSG detection is up-to-date
        sendLog("🔄 Regenerating configuration files...\n");
        
        const { readdir, readFile } = await import("fs/promises");
        const projectSubDirs = await readdir(projectDir, { withFileTypes: true });
        const repoDir = projectSubDirs.find(
          (dir) => dir.isDirectory() && dir.name !== "docker" && dir.name !== "database"
        );
        
        if (repoDir) {
          const repoName = repoDir.name;
          const { writeDockerfile, writeDockerCompose } = await import("@/lib/services/filesystem.service");
          
          // Regenerate Dockerfile with force to detect SSG
          sendLog("📝 Regenerating Dockerfile (checking for SSG)...\n");
          await writeDockerfile(projectDir, repoName, true);
          sendLog("✅ Dockerfile regenerated\n");
          
          // Read existing docker-compose.yml to get port and env vars
          const dockerComposePath = join(dockerComposeDir, "docker-compose.yml");
          let port = 3000;
          let envVars: { key: string; value: string }[] = [];
          
          try {
            const existingContent = await readFile(dockerComposePath, "utf-8");
            // Extract port (supports both SSG :80 and SSR :3000)
            // Try SSG format first (port:80), then SSR format (port:3000)
            const ssgPortMatch = existingContent.match(/ports:\s*-\s*"(\d+):80"/);
            const ssrPortMatch = existingContent.match(/ports:\s*-\s*"(\d+):3000"/);
            if (ssgPortMatch) {
              port = parseInt(ssgPortMatch[1], 10);
            } else if (ssrPortMatch) {
              port = parseInt(ssrPortMatch[1], 10);
            }
            
            // Extract environment variables (stop at next top-level key like networks:, volumes:, etc.)
            const envStartMatch = existingContent.match(/environment:\s*\n/);
            if (envStartMatch) {
              const envStartIndex = envStartMatch.index! + envStartMatch[0].length;
              const afterEnv = existingContent.substring(envStartIndex);
              
              // Find the next top-level key (starts with 2 spaces or less, followed by a key name)
              const nextKeyMatch = afterEnv.match(/\n\s{0,2}(networks|volumes|restart|ports|build|container_name|depends_on):/);
              const envEndIndex = nextKeyMatch ? nextKeyMatch.index! : afterEnv.length;
              const envSection = afterEnv.substring(0, envEndIndex);
              
              const envLines = envSection.split("\n");
              for (const line of envLines) {
                const trimmedLine = line.trim();
                // Skip empty lines and stop if we hit a top-level key
                if (!trimmedLine || trimmedLine.match(/^(networks|volumes|restart|ports|build|container_name|depends_on):/)) {
                  break;
                }
                const match = trimmedLine.match(/^([^:]+):\s*(.+)$/);
                if (match && match[1] !== "NODE_ENV") {
                  const key = match[1].trim();
                  const value = match[2].trim();
                  // Filter out invalid keys that shouldn't be environment variables
                  if (key && !['name', 'external'].includes(key.toLowerCase())) {
                    envVars.push({ key, value });
                  }
                }
              }
            }
          } catch (error) {
            console.warn(`Could not read existing docker-compose.yml, using defaults:`, error);
          }
          
          // Regenerate docker-compose.yml with SSG detection
          sendLog("📝 Regenerating docker-compose.yml (checking for SSG)...\n");
          await writeDockerCompose(projectDir, projectName, repoName, port, envVars);
          sendLog("✅ docker-compose.yml regenerated\n");
        }
        
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
              sendLog(`❌ Deployment failed with code ${code}\n`);
              sendLog("DONE");
              reject(new Error(`Deployment failed with code ${code}`));
            }
          });

          upProcess.on("error", (error) => {
            sendLog(`❌ Deployment error: ${error.message}\n`);
            sendLog("DONE");
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


