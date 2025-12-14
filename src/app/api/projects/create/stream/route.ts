import { NextRequest, NextResponse } from "next/server";
import { join } from "path";
import { config } from "@/lib/config";
import { z } from "zod";
import { existsSync } from "fs";

const createProjectSchema = z.object({
  repo: z.string().min(1),
  projectName: z.string().min(1),
  port: z.number().int().positive(),
  createDatabase: z.boolean(),
  envVars: z.array(
    z.object({
      key: z.string(),
      value: z.string(),
    })
  ).optional(),
});

export async function POST(request: NextRequest) {
  const { spawn } = await import("child_process");
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  // Create a readable stream for Server-Sent Events
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const sendLog = (data: string) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ log: data })}\n\n`));
      };

      try {
        const body = await request.json();
        const data = createProjectSchema.parse(body);

        const projectDir = join(config.projectsBaseDir, data.projectName);
        
        // Check if project structure already exists (from initialize)
        if (!existsSync(projectDir)) {
          sendLog("❌ Error: Project structure not found. Please initialize the project first.\n");
          sendLog("DONE");
          controller.close();
          return;
        }

        // Extract repo name
        const repoName = data.repo.split("/").pop() || "repo";

        // Regenerate Dockerfile first to detect SSG (force overwrite)
        sendLog("📝 Regenerating Dockerfile (checking for SSG)...\n");
        const { writeDockerfile, writeDockerCompose } = await import("@/lib/services/filesystem.service");
        await writeDockerfile(projectDir, repoName, true);
        sendLog("✅ Dockerfile regenerated\n");

        sendLog("📝 Writing docker-compose.yml...\n");

        // Write docker-compose.yml with chosen port and environment variables
        // This will also detect SSG and use the correct port (80 for SSG, 3000 for SSR)
        await writeDockerCompose(
          projectDir,
          data.projectName,
          repoName,
          data.port,
          data.envVars || []
        );

        sendLog("✅ docker-compose.yml written\n");

        // Write database compose if needed
        if (data.createDatabase) {
          sendLog("🗄️  Setting up database...\n");
          
          const { writeDatabaseCompose } = await import("@/lib/services/filesystem.service");
          // Generate unique credentials per database
          await writeDatabaseCompose(projectDir, data.projectName);
          
          sendLog("✅ Database compose file created\n");
          sendLog("🚀 Starting database container...\n");

          const databaseDir = join(projectDir, "database");
          
          // Start database with streaming logs
          await new Promise<void>((resolve, reject) => {
            const dbProcess = spawn("docker", ["compose", "up", "-d"], {
              cwd: databaseDir,
              shell: "/bin/sh",
            });

            dbProcess.stdout?.on("data", (data) => {
              sendLog(data.toString());
            });

            dbProcess.stderr?.on("data", (data) => {
              sendLog(data.toString());
            });

            dbProcess.on("close", (code) => {
              if (code === 0) {
                sendLog("✅ Database started successfully\n");
                resolve();
              } else {
                sendLog(`⚠️  Database start returned code ${code}\n`);
                // Don't fail, just warn
                resolve();
              }
            });

            dbProcess.on("error", (error) => {
              sendLog(`⚠️  Database start warning: ${error.message}\n`);
              // Don't fail, just warn
              resolve();
            });
          });
        }

        sendLog("🛑 Stopping containers (if any)...\n");

        // Deploy the project - Down phase
        const dockerComposeDir = join(projectDir, "docker");
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
              resolve();
            } else {
              reject(new Error(`Deployment failed with code ${code}`));
            }
          });

          upProcess.on("error", (error) => {
            reject(error);
          });
        });

        sendLog("DONE");
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

