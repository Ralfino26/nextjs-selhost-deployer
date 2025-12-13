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
 * @returns Path to the backup archive
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
  
  // Execute mongodump inside the container
  // mongodump will create a dump directory with the database backup
  try {
    // First, verify connection by listing databases
    const testConnectionCommand = `docker exec ${dbContainerName} mongosh --authenticationDatabase admin --username ${mongoUser} --password ${mongoPassword} --eval "db.adminCommand('listDatabases')" --quiet`;
    
    try {
      await execAsync(testConnectionCommand, {
        shell: "/bin/sh",
        env: { ...process.env },
      });
    } catch (testError: any) {
      throw new Error(`Failed to authenticate with MongoDB. Please verify credentials in Settings. Error: ${testError.message || testError}`);
    }
    
    // Run mongodump inside the container
    // Authenticate with admin database, then dump the specific database
    // Use URI format for better compatibility
    const mongoUri = `mongodb://${mongoUser}:${encodeURIComponent(mongoPassword)}@localhost:27017/${databaseName}?authSource=admin`;
    const mongodumpCommand = `docker exec ${dbContainerName} mongodump --uri "${mongoUri}" --out /tmp/backup`;
    
    try {
      await execAsync(mongodumpCommand, {
        shell: "/bin/sh",
        env: { ...process.env },
      });
    } catch (dumpError: any) {
      // If specific database dump fails, try dumping all databases
      console.warn(`Failed to dump specific database ${databaseName}, trying all databases:`, dumpError.message);
      const allDbsCommand = `docker exec ${dbContainerName} mongodump --authenticationDatabase admin --username ${mongoUser} --password ${mongoPassword} --out /tmp/backup`;
      await execAsync(allDbsCommand, {
        shell: "/bin/sh",
        env: { ...process.env },
      });
    }
    
    // Copy the entire backup directory from container to host
    // mongodump creates /tmp/backup/{databaseName}/... so we copy the whole backup directory
    const copyCommand = `docker cp ${dbContainerName}:/tmp/backup ${backupPath}`;
    console.log(`Copying backup from container: ${copyCommand}`);
    await execAsync(copyCommand, {
      shell: "/bin/sh",
      env: { ...process.env },
    });
    
    // Verify the backup was copied
    const { existsSync } = await import("fs");
    const databaseBackupPath = join(backupPath, databaseName);
    if (!existsSync(databaseBackupPath)) {
      // Try alternative path (if all databases were dumped)
      if (!existsSync(backupPath)) {
        throw new Error(`Backup directory not found after copy: ${backupPath}`);
      }
      // If backup path exists but database folder doesn't, check what's inside
      const { readdir } = await import("fs/promises");
      const contents = await readdir(backupPath);
      console.log(`Backup directory contents: ${contents.join(", ")}`);
      if (contents.length === 0) {
        throw new Error(`Backup directory is empty: ${backupPath}`);
      }
    }
    
    // Create a tar archive of the backup
    // Tar the entire backup directory
    const tarCommand = `tar -czf ${backupPath}.tar.gz -C ${projectBackupDir} ${backupFileName}`;
    console.log(`Creating tar archive: ${tarCommand}`);
    await execAsync(tarCommand, {
      shell: "/bin/sh",
      env: { ...process.env },
    });
    
    // Verify tar was created
    if (!existsSync(`${backupPath}.tar.gz`)) {
      throw new Error(`Tar archive was not created: ${backupPath}.tar.gz`);
    }
    
    // Remove the uncompressed backup directory
    const rmCommand = `rm -rf ${backupPath}`;
    console.log(`Cleaning up uncompressed backup: ${rmCommand}`);
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

