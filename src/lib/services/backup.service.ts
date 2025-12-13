import { exec } from "child_process";
import { promisify } from "util";
import { join } from "path";
import { mkdir, readFile } from "fs/promises";
import { existsSync } from "fs";
import { config } from "@/lib/config";
import { getDocker } from "./docker.service";

const execAsync = promisify(exec);

/**
 * Get database configuration from docker-compose.yml
 */
async function getDatabaseConfig(projectName: string): Promise<{
  databaseName: string;
  username: string;
  password: string;
}> {
  const projectDir = join(config.projectsBaseDir, projectName);
  const databaseComposePath = join(projectDir, "database", "docker-compose.yml");
  
  if (!existsSync(databaseComposePath)) {
    throw new Error(`Database docker-compose.yml not found for project ${projectName}`);
  }
  
  try {
    const databaseComposeContent = await readFile(databaseComposePath, "utf-8");
    
    // Extract database name
    const dbNameMatch = databaseComposeContent.match(/MONGO_INITDB_DATABASE:\s*(\w+)/);
    const databaseName = dbNameMatch ? dbNameMatch[1] : projectName;
    
    // Extract username
    const usernameMatch = databaseComposeContent.match(/MONGO_INITDB_ROOT_USERNAME:\s*(\w+)/);
    const username = usernameMatch ? usernameMatch[1] : config.database.user;
    
    // Extract password
    const passwordMatch = databaseComposeContent.match(/MONGO_INITDB_ROOT_PASSWORD:\s*([^\s]+)/);
    const password = passwordMatch ? passwordMatch[1] : config.database.password;
    
    if (!username || !password) {
      throw new Error(`Could not extract MongoDB credentials from docker-compose.yml for project ${projectName}`);
    }
    
    return {
      databaseName,
      username,
      password,
    };
  } catch (error: any) {
    throw new Error(`Failed to read database configuration: ${error.message || error}`);
  }
}

/**
 * Create a MongoDB backup for a project
 * @param projectName - Name of the project
 * @returns Path to the backup directory
 */
export async function createMongoBackup(projectName: string): Promise<string> {
  console.log(`[BACKUP] Starting backup for project: ${projectName}`);
  
  const dbContainerName = `${projectName}-mongo`;
  console.log(`[BACKUP] Database container name: ${dbContainerName}`);
  
  const backupBaseDir = config.backupBaseDir || "/srv/vps/backups";
  console.log(`[BACKUP] Backup base directory from config: ${backupBaseDir}`);
  
  if (!backupBaseDir) {
    throw new Error("Backup base directory not configured. Please set it in Settings.");
  }
  
  // Get database configuration from docker-compose.yml
  console.log(`[BACKUP] Reading database configuration from docker-compose.yml...`);
  const dbConfig = await getDatabaseConfig(projectName);
  const { databaseName, username: mongoUser, password: mongoPassword } = dbConfig;
  console.log(`[BACKUP] Database config - Name: ${databaseName}, User: ${mongoUser}, Password: ${mongoPassword ? "***" : "NOT SET"}`);
  
  // Ensure backup directory exists
  console.log(`[BACKUP] Creating backup base directory: ${backupBaseDir}`);
  await mkdir(backupBaseDir, { recursive: true });
  
  if (!existsSync(backupBaseDir)) {
    throw new Error(`Failed to create backup base directory: ${backupBaseDir}`);
  }
  console.log(`[BACKUP] ✓ Backup base directory exists: ${backupBaseDir}`);
  
  // Create project-specific backup directory
  const projectBackupDir = join(backupBaseDir, projectName);
  console.log(`[BACKUP] Creating project backup directory: ${projectBackupDir}`);
  await mkdir(projectBackupDir, { recursive: true });
  
  // Verify project backup directory was created
  if (!existsSync(projectBackupDir)) {
    throw new Error(`Failed to create project backup directory: ${projectBackupDir}`);
  }
  console.log(`[BACKUP] ✓ Project backup directory exists: ${projectBackupDir}`);
  
  // Generate backup directory name with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
  const backupDirName = `${projectName}-${timestamp}`;
  const backupPath = join(projectBackupDir, backupDirName);
  console.log(`[BACKUP] Backup directory name: ${backupDirName}`);
  console.log(`[BACKUP] Full backup path: ${backupPath}`);
  
  // Ensure the backup path directory exists (docker cp needs the parent directory to exist)
  console.log(`[BACKUP] Creating backup path directory: ${backupPath}`);
  await mkdir(backupPath, { recursive: true });
  
  if (!existsSync(backupPath)) {
    throw new Error(`Failed to create backup path directory: ${backupPath}`);
  }
  console.log(`[BACKUP] ✓ Backup path directory exists: ${backupPath}`);
  
  // Check directory permissions
  const { stat } = await import("fs/promises");
  try {
    const backupPathStats = await stat(backupPath);
    console.log(`[BACKUP] Backup path stats - Mode: ${backupPathStats.mode.toString(8)}, UID: ${backupPathStats.uid}, GID: ${backupPathStats.gid}`);
  } catch (statError: any) {
    console.warn(`[BACKUP] Could not get stats for backup path: ${statError.message}`);
  }
  
  // Get Docker instance to check if container exists
  console.log(`[BACKUP] Connecting to Docker...`);
  let docker;
  try {
    docker = await getDocker();
    console.log(`[BACKUP] ✓ Docker connection established`);
  } catch (error: any) {
    console.error(`[BACKUP] ✗ Failed to connect to Docker: ${error.message || error}`);
    throw new Error(`Failed to connect to Docker: ${error.message || error}`);
  }
  
  console.log(`[BACKUP] Checking if container exists: ${dbContainerName}`);
  try {
    const container = docker.getContainer(dbContainerName);
    console.log(`[BACKUP] Container object created, inspecting...`);
    const containerInfo = await container.inspect();
    
    console.log(`[BACKUP] Container info - ID: ${containerInfo.Id.substring(0, 12)}, State: ${containerInfo.State.Status}, Running: ${containerInfo.State.Running}`);
    console.log(`[BACKUP] Container info - Image: ${containerInfo.Config?.Image}, Created: ${containerInfo.Created}`);
    
    // Check if container is running
    if (!containerInfo.State.Running) {
      console.error(`[BACKUP] ✗ Container is not running. State: ${containerInfo.State.Status}`);
      throw new Error(`Database container '${dbContainerName}' is not running. Current state: ${containerInfo.State.Status}`);
    }
    
    console.log(`[BACKUP] ✓ Container ${dbContainerName} is running`);
  } catch (error: any) {
    console.error(`[BACKUP] ✗ Container check failed: ${error.message || error}`);
    if (error.message && error.message.includes("is not running")) {
      throw error;
    }
    throw new Error(`Database container '${dbContainerName}' not found. Make sure the database is running. Error: ${error.message || error}`);
  }
  
  // Run mongodump in the container and copy output to host
  try {
    // Execute mongodump inside the container to /tmp/backup
    const mongodumpCommand = `docker exec ${dbContainerName} mongodump --authenticationDatabase admin --username ${mongoUser} --password ${mongoPassword} --db ${databaseName} --out /tmp/backup`;
    
    console.log(`Running mongodump: ${mongodumpCommand}`);
    const dumpResult = await execAsync(mongodumpCommand, {
      shell: "/bin/sh",
      env: { ...process.env },
    });
    console.log(`Mongodump output: ${dumpResult.stdout}`);
    if (dumpResult.stderr) {
      console.warn(`Mongodump warnings: ${dumpResult.stderr}`);
    }
    
    // Verify the dump was created in the container
    const verifyDumpCommand = `docker exec ${dbContainerName} ls -la /tmp/backup/${databaseName}`;
    try {
      const verifyResult = await execAsync(verifyDumpCommand, {
        shell: "/bin/sh",
        env: { ...process.env },
      });
      console.log(`Backup contents in container: ${verifyResult.stdout}`);
    } catch (verifyError: any) {
      console.error(`Failed to verify backup in container: ${verifyError.message}`);
      // Try listing /tmp/backup to see what's there
      const listBackupCommand = `docker exec ${dbContainerName} ls -la /tmp/backup`;
      try {
        const listResult = await execAsync(listBackupCommand, {
          shell: "/bin/sh",
          env: { ...process.env },
        });
        console.log(`Contents of /tmp/backup: ${listResult.stdout}`);
      } catch (listError) {
        console.error(`Failed to list /tmp/backup: ${listError}`);
      }
    }
    
    // Copy the backup from container to host backup directory
    // Use . at the end to copy contents of the directory, not the directory itself
    const copyCommand = `docker cp ${dbContainerName}:/tmp/backup/${databaseName}/. ${backupPath}`;
    console.log(`Copying backup: ${copyCommand}`);
    const copyResult = await execAsync(copyCommand, {
      shell: "/bin/sh",
      env: { ...process.env },
    });
    console.log(`Copy output: ${copyResult.stdout}`);
    if (copyResult.stderr) {
      console.warn(`Copy warnings: ${copyResult.stderr}`);
    }
    
    // Verify backup was created
    console.log(`[BACKUP] Verifying backup directory exists: ${backupPath}`);
    if (!existsSync(backupPath)) {
      console.error(`[BACKUP] ✗ Backup directory does not exist: ${backupPath}`);
      throw new Error(`Backup directory was not created: ${backupPath}`);
    }
    console.log(`[BACKUP] ✓ Backup directory exists: ${backupPath}`);
    
    // List contents to verify
    console.log(`[BACKUP] Reading backup directory contents...`);
    const { readdir, stat } = await import("fs/promises");
    const contents = await readdir(backupPath);
    console.log(`[BACKUP] Backup directory contains ${contents.length} items: ${contents.join(", ")}`);
    
    if (contents.length === 0) {
      console.error(`[BACKUP] ✗ Backup directory is empty: ${backupPath}`);
      throw new Error(`Backup directory is empty: ${backupPath}`);
    }
    
    // Get file sizes and details
    console.log(`[BACKUP] Getting file details...`);
    for (const file of contents) {
      try {
        const filePath = join(backupPath, file);
        const fileStats = await stat(filePath);
        console.log(`[BACKUP]   - ${file}: ${fileStats.size} bytes, mode: ${fileStats.mode.toString(8)}`);
      } catch (fileError: any) {
        console.warn(`[BACKUP]   - ${file}: Could not get stats: ${fileError.message}`);
      }
    }
    
    console.log(`[BACKUP] ✓ Backup completed successfully: ${backupPath}`);
    return backupPath;
  } catch (error: any) {
    console.error(`Backup error: ${error.message}`);
    console.error(`Error details:`, error);
    throw new Error(`Failed to create backup: ${error.message || error}`);
  }
}

