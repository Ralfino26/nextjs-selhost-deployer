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
            const ssgPortMatch = existingContent.match(/ports:\s*-\s*"(\d+):80"/);
            const ssrPortMatch = existingContent.match(/ports:\s*-\s*"(\d+):3000"/);
            if (ssgPortMatch) {
              port = parseInt(ssgPortMatch[1], 10);
            } else if (ssrPortMatch) {
              port = parseInt(ssrPortMatch[1], 10);
            }
            
            // Extract environment variables
            const envMatch = existingContent.match(/environment:\s*\n((?:\s+[^\n]+\n?)+)/);
            if (envMatch) {
              const envLines = envMatch[1].trim().split("\n");
              for (const line of envLines) {
                const match = line.trim().match(/^([^:]+):\s*(.+)$/);
                if (match && match[1] !== "NODE_ENV") {
                  envVars.push({ key: match[1].trim(), value: match[2].trim() });
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
              sendLog("DONE");
              resolve();
            } else {
              sendLog(`❌ Build failed with code ${code}\n`);
              sendLog("DONE");
              reject(new Error(`Build failed with code ${code}`));
            }
          });

          buildProcess.on("error", (error) => {
            sendLog(`❌ Build error: ${error.message}\n`);
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

