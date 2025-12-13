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
  const dbContainerName = `${projectName}-mongo`;
  const backupBaseDir = config.backupBaseDir || "/srv/vps/backups";
  
  if (!backupBaseDir) {
    throw new Error("Backup base directory not configured. Please set it in Settings.");
  }
  
  // Get database configuration from docker-compose.yml
  const dbConfig = await getDatabaseConfig(projectName);
  const { databaseName, username: mongoUser, password: mongoPassword } = dbConfig;
  
  // Ensure backup directory exists
  await mkdir(backupBaseDir, { recursive: true });
  
  // Create project-specific backup directory
  const projectBackupDir = join(backupBaseDir, projectName);
  await mkdir(projectBackupDir, { recursive: true });
  
  // Generate backup directory name with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
  const backupDirName = `${projectName}-${timestamp}`;
  const backupPath = join(projectBackupDir, backupDirName);
  
  // Get Docker instance to check if container exists
  const docker = await getDocker();
  try {
    const container = docker.getContainer(dbContainerName);
    await container.inspect();
  } catch (error) {
    throw new Error(`Database container '${dbContainerName}' not found. Make sure the database is running.`);
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
    const copyCommand = `docker cp ${dbContainerName}:/tmp/backup/${databaseName} ${backupPath}`;
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
    if (!existsSync(backupPath)) {
      throw new Error(`Backup directory was not created: ${backupPath}`);
    }
    
    // List contents to verify
    const { readdir } = await import("fs/promises");
    const contents = await readdir(backupPath);
    console.log(`Backup directory contents: ${contents.join(", ")}`);
    if (contents.length === 0) {
      throw new Error(`Backup directory is empty: ${backupPath}`);
    }
    
    return backupPath;
  } catch (error: any) {
    console.error(`Backup error: ${error.message}`);
    console.error(`Error details:`, error);
    throw new Error(`Failed to create backup: ${error.message || error}`);
  }
}

