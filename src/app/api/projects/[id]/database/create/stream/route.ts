import { NextRequest } from "next/server";
import { join } from "path";
import { config } from "@/lib/config";
import { existsSync } from "fs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const projectName = id;
  const projectDir = join(config.projectsBaseDir, projectName);
  const databaseDir = join(projectDir, "database");

  const { spawn } = await import("child_process");

  // Create a readable stream for Server-Sent Events
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const sendLog = (data: string) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ log: data })}\n\n`));
      };

      try {
        // Check if project exists
        if (!existsSync(projectDir)) {
          sendLog("❌ Error: Project not found\n");
          sendLog("DONE");
          controller.close();
          return;
        }

        // Check if database already exists
        if (existsSync(databaseDir)) {
          const dockerComposePath = join(databaseDir, "docker-compose.yml");
          if (existsSync(dockerComposePath)) {
            sendLog("❌ Error: Database already exists for this project\n");
            sendLog("DONE");
            controller.close();
            return;
          }
        }

        sendLog("🗄️  Setting up database...\n");

        // Create database compose file
        const { writeDatabaseCompose } = await import("@/lib/services/filesystem.service");
        await writeDatabaseCompose(projectDir, projectName);
        
        sendLog("✅ Database compose file created\n");
        sendLog("🚀 Starting database container...\n");

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
              sendLog("DONE");
              resolve();
            } else {
              sendLog(`⚠️  Database start returned code ${code}\n`);
              sendLog("DONE");
              resolve(); // Don't fail, just warn
            }
          });

          dbProcess.on("error", (error) => {
            sendLog(`❌ Database start error: ${error.message}\n`);
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

