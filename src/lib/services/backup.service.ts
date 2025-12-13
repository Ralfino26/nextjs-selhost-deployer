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
  console.log(`[BACKUP] [getDatabaseConfig] Getting database config for project: ${projectName}`);
  const projectDir = join(config.projectsBaseDir, projectName);
  console.log(`[BACKUP] [getDatabaseConfig] Project directory: ${projectDir}`);
  
  const databaseComposePath = join(projectDir, "database", "docker-compose.yml");
  console.log(`[BACKUP] [getDatabaseConfig] Looking for docker-compose.yml at: ${databaseComposePath}`);
  
  if (!existsSync(databaseComposePath)) {
    console.error(`[BACKUP] [getDatabaseConfig] ✗ Database docker-compose.yml not found: ${databaseComposePath}`);
    throw new Error(`Database docker-compose.yml not found for project ${projectName}`);
  }
  console.log(`[BACKUP] [getDatabaseConfig] ✓ Database docker-compose.yml exists`);
  
  try {
    console.log(`[BACKUP] [getDatabaseConfig] Reading docker-compose.yml content...`);
    const databaseComposeContent = await readFile(databaseComposePath, "utf-8");
    console.log(`[BACKUP] [getDatabaseConfig] ✓ Read ${databaseComposeContent.length} bytes from docker-compose.yml`);
    
    // Extract database name
    const dbNameMatch = databaseComposeContent.match(/MONGO_INITDB_DATABASE:\s*(\w+)/);
    const databaseName = dbNameMatch ? dbNameMatch[1] : projectName;
    console.log(`[BACKUP] [getDatabaseConfig] Extracted database name: ${databaseName} (match: ${dbNameMatch ? "found" : "not found, using project name"})`);
    
    // Extract username
    const usernameMatch = databaseComposeContent.match(/MONGO_INITDB_ROOT_USERNAME:\s*(\w+)/);
    const username = usernameMatch ? usernameMatch[1] : config.database.user;
    console.log(`[BACKUP] [getDatabaseConfig] Extracted username: ${username} (match: ${usernameMatch ? "found" : "not found, using config default"})`);
    
    // Extract password
    const passwordMatch = databaseComposeContent.match(/MONGO_INITDB_ROOT_PASSWORD:\s*([^\s]+)/);
    const password = passwordMatch ? passwordMatch[1] : config.database.password;
    console.log(`[BACKUP] [getDatabaseConfig] Extracted password: ${password ? "***" : "NOT SET"} (match: ${passwordMatch ? "found" : "not found, using config default"})`);
    
    if (!username || !password) {
      console.error(`[BACKUP] [getDatabaseConfig] ✗ Missing credentials - Username: ${username ? "set" : "missing"}, Password: ${password ? "set" : "missing"}`);
      throw new Error(`Could not extract MongoDB credentials from docker-compose.yml for project ${projectName}`);
    }
    
    console.log(`[BACKUP] [getDatabaseConfig] ✓ Database config extracted successfully`);
    return {
      databaseName,
      username,
      password,
    };
  } catch (error: any) {
    console.error(`[BACKUP] [getDatabaseConfig] ✗ Error reading config: ${error.message || error}`);
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
    
    console.log(`[BACKUP] [mongodump] Executing mongodump command...`);
    console.log(`[BACKUP] [mongodump] Command: docker exec ${dbContainerName} mongodump --authenticationDatabase admin --username ${mongoUser} --password *** --db ${databaseName} --out /tmp/backup`);
    
    const dumpStartTime = Date.now();
    const dumpResult = await execAsync(mongodumpCommand, {
      shell: "/bin/sh",
      env: { ...process.env },
    });
    const dumpDuration = Date.now() - dumpStartTime;
    
    console.log(`[BACKUP] [mongodump] ✓ Mongodump completed in ${dumpDuration}ms`);
    if (dumpResult.stdout) {
      console.log(`[BACKUP] [mongodump] Stdout: ${dumpResult.stdout}`);
    }
    if (dumpResult.stderr) {
      console.warn(`[BACKUP] [mongodump] Stderr (warnings): ${dumpResult.stderr}`);
    }
    
    // Verify the dump was created in the container
    console.log(`[BACKUP] [verify] Verifying backup was created in container...`);
    const verifyDumpCommand = `docker exec ${dbContainerName} ls -la /tmp/backup/${databaseName}`;
    try {
      const verifyResult = await execAsync(verifyDumpCommand, {
        shell: "/bin/sh",
        env: { ...process.env },
      });
      console.log(`[BACKUP] [verify] ✓ Backup directory exists in container: /tmp/backup/${databaseName}`);
      console.log(`[BACKUP] [verify] Contents: ${verifyResult.stdout}`);
      
      // Count files
      const fileCount = (verifyResult.stdout.match(/-rw-r--r--/g) || []).length;
      console.log(`[BACKUP] [verify] Found ${fileCount} files in backup directory`);
    } catch (verifyError: any) {
      console.error(`[BACKUP] [verify] ✗ Failed to verify backup in container: ${verifyError.message}`);
      // Try listing /tmp/backup to see what's there
      console.log(`[BACKUP] [verify] Trying to list /tmp/backup directory...`);
      const listBackupCommand = `docker exec ${dbContainerName} ls -la /tmp/backup`;
      try {
        const listResult = await execAsync(listBackupCommand, {
          shell: "/bin/sh",
          env: { ...process.env },
        });
        console.log(`[BACKUP] [verify] Contents of /tmp/backup: ${listResult.stdout}`);
      } catch (listError) {
        console.error(`[BACKUP] [verify] ✗ Failed to list /tmp/backup: ${listError}`);
      }
      throw verifyError;
    }
    
    // Copy the backup from container to host backup directory
    // Use . at the end to copy contents of the directory, not the directory itself
    console.log(`[BACKUP] [copy] Copying backup from container to host...`);
    const copyCommand = `docker cp ${dbContainerName}:/tmp/backup/${databaseName}/. ${backupPath}`;
    console.log(`[BACKUP] [copy] Command: ${copyCommand}`);
    console.log(`[BACKUP] [copy] Source: ${dbContainerName}:/tmp/backup/${databaseName}/.`);
    console.log(`[BACKUP] [copy] Destination: ${backupPath}`);
    
    // Check if destination directory exists before copy
    if (!existsSync(backupPath)) {
      console.error(`[BACKUP] [copy] ✗ Destination directory does not exist: ${backupPath}`);
      throw new Error(`Destination directory does not exist: ${backupPath}`);
    }
    console.log(`[BACKUP] [copy] ✓ Destination directory exists: ${backupPath}`);
    
    const copyStartTime = Date.now();
    const copyResult = await execAsync(copyCommand, {
      shell: "/bin/sh",
      env: { ...process.env },
    });
    const copyDuration = Date.now() - copyStartTime;
    
    console.log(`[BACKUP] [copy] ✓ Copy completed in ${copyDuration}ms`);
    if (copyResult.stdout) {
      console.log(`[BACKUP] [copy] Stdout: ${copyResult.stdout}`);
    }
    if (copyResult.stderr) {
      console.warn(`[BACKUP] [copy] Stderr (warnings): ${copyResult.stderr}`);
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

