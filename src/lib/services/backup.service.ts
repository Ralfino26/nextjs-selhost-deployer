import { exec } from "child_process";
import { promisify } from "util";
import { join } from "path";
import { mkdir } from "fs/promises";
import { existsSync } from "fs";
import { config } from "@/lib/config";
import { getDocker } from "./docker.service";

const execAsync = promisify(exec);

/**
 * Create a MongoDB backup for a project
 * @param projectName - Name of the project
 * @returns Path to the backup archive
 */
export async function createMongoBackup(projectName: string): Promise<string> {
  const dbContainerName = `${projectName}-mongo`;
  const databaseName = projectName;
  const backupBaseDir = config.backupBaseDir || "/srv/vps/backups";
  
  if (!backupBaseDir) {
    throw new Error("Backup base directory not configured. Please set it in Settings.");
  }
  
  // Ensure backup directory exists
  await mkdir(backupBaseDir, { recursive: true });
  
  // Create project-specific backup directory
  const projectBackupDir = join(backupBaseDir, projectName);
  await mkdir(projectBackupDir, { recursive: true });
  
  // Generate backup filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
  const backupFileName = `${projectName}-${timestamp}`;
  const backupPath = join(projectBackupDir, backupFileName);
  
  // Get Docker instance to check if container exists
  const docker = await getDocker();
  let containerExists = false;
  
  try {
    const container = docker.getContainer(dbContainerName);
    await container.inspect();
    containerExists = true;
  } catch (error) {
    throw new Error(`Database container '${dbContainerName}' not found. Make sure the database is running.`);
  }
  
  if (!containerExists) {
    throw new Error(`Database container '${dbContainerName}' not found.`);
  }
  
  // Get MongoDB credentials
  const mongoUser = config.database.user;
  const mongoPassword = config.database.password;
  
  // Execute mongodump inside the container
  // mongodump will create a dump directory with the database backup
  try {
    // Run mongodump inside the container
    const mongodumpCommand = `docker exec ${dbContainerName} mongodump --authenticationDatabase admin --username ${mongoUser} --password ${mongoPassword} --db ${databaseName} --out /tmp/backup`;
    
    await execAsync(mongodumpCommand, {
      shell: "/bin/sh",
      env: { ...process.env },
    });
    
    // Copy the backup from container to host
    const copyCommand = `docker cp ${dbContainerName}:/tmp/backup/${databaseName} ${backupPath}`;
    await execAsync(copyCommand, {
      shell: "/bin/sh",
      env: { ...process.env },
    });
    
    // Create a tar archive of the backup
    const tarCommand = `tar -czf ${backupPath}.tar.gz -C ${projectBackupDir} ${backupFileName}`;
    await execAsync(tarCommand, {
      shell: "/bin/sh",
      env: { ...process.env },
    });
    
    // Remove the uncompressed backup directory
    const rmCommand = `rm -rf ${backupPath}`;
    await execAsync(rmCommand, {
      shell: "/bin/sh",
      env: { ...process.env },
    });
    
    // Clean up the backup inside the container
    const cleanupCommand = `docker exec ${dbContainerName} rm -rf /tmp/backup`;
    await execAsync(cleanupCommand, {
      shell: "/bin/sh",
      env: { ...process.env },
    }).catch(() => {
      // Ignore cleanup errors
    });
    
    return `${backupPath}.tar.gz`;
  } catch (error: any) {
    // Clean up on error
    try {
      await execAsync(`rm -rf ${backupPath}`, {
        shell: "/bin/sh",
      });
    } catch {
      // Ignore cleanup errors
    }
    
    throw new Error(`Failed to create backup: ${error.message || error}`);
  }
}

