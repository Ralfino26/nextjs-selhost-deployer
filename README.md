# Next.js Self-Hosted Deployment Manager

A minimal MVP dashboard for automating deployments of GitHub Next.js projects to a VPS using Docker.

## Features

- **Project Management**: Create, view, and delete projects
- **GitHub Integration**: Clone and deploy GitHub repositories
- **Docker Automation**: Automatic Dockerfile and docker-compose.yml generation
- **Database Support**: Optional PostgreSQL/MongoDB database setup
- **Port Management**: Manual port selection per project
- **Environment Variables**: Manage project environment variables
- **Container Management**: Deploy, restart, update, and view logs

## Requirements

- Docker and Docker Compose installed on your VPS
- Git installed (included in Docker image)
- Access to Docker socket (mounted in container)

## Quick Installation on VPS

Download the `docker-compose.yml` file and run it:

```bash
# Download docker-compose.yml
curl -O https://raw.githubusercontent.com/Ralfino26/nextjs-selhost-deployer/main/docker-compose.yml

# Create .env file (optional, defaults work)
curl -O https://raw.githubusercontent.com/Ralfino26/nextjs-selhost-deployer/main/.env.example
cp .env.example .env

# Edit .env if needed (optional)
nano .env

# Start the deployment manager
docker compose up -d
```

That's it! The deployment manager will be available at `http://localhost:3000` (or your configured port).

**Note:** The first time you run this, Docker will build the image from the GitHub repository. Subsequent starts will be instant.

## Configuration

Edit the `.env` file to configure the deployment manager:

```env
# Port for the deployment manager web interface
PORT=3000

# Base directory where all projects will be stored
# This path will be mounted as a volume
PROJECTS_BASE_DIR=/srv/vps/websites

# Starting port for new projects (default, users choose manually)
STARTING_PORT=5000

# Docker network name for deployed projects
DOCKER_NETWORK=deployment-network

# GitHub API token (optional, required for private repositories)
# Generate at: https://github.com/settings/tokens
GITHUB_TOKEN=your_github_token_here

# Database credentials (for projects that use databases)
DB_USER=postgres
DB_PASSWORD=your_secure_password_here
DB_DEFAULT_DATABASE=postgres
```

### Important Configuration Options

- **PROJECTS_BASE_DIR**: Change this to where you want projects stored on your VPS
  - Default: `/srv/vps/websites`
  - Example: `/home/user/projects` or `/var/www/projects`
  
- **GITHUB_TOKEN**: Required if you want to clone private repositories
  - Generate at: https://github.com/settings/tokens
  - Needs `repo` scope for private repos

- **DB_PASSWORD**: Change this to a secure password for database projects

## Accessing the Dashboard

After installation, access the dashboard at:
- **Local**: http://localhost:3000
- **VPS**: http://your-vps-ip:3000

## Usage

### 1. Create a Project

1. Click **"New Project"** in the top right
2. **Step 1**: Select GitHub repository and enter project name
   - The system will automatically:
     - Clone the repository
     - Create folder structure
     - Generate Dockerfile
     - Create docker-compose.yml
     - Assign a port
3. **Step 2**: Configure domain and database (optional)
4. **Step 3**: Review and create

### 2. Project Structure

When you create a project, the following structure is automatically generated:

```
PROJECTS_BASE_DIR/
└── project-name/
    ├── repo-name/              # Cloned GitHub repository
    │   ├── Dockerfile          # Auto-generated if not present
    │   └── Dockerfile          # Auto-generated if not present
    ├── docker/
    │   └── docker-compose.yml   # Auto-generated
    └── database/                # Only if database is enabled
        └── docker-compose.yml   # Only if database is enabled
```

### 3. Manage Projects

- **View Projects**: See all projects on the home page
- **Project Details**: Click "Open Project" to view details
- **Deploy**: Build and start the container
- **Restart**: Restart a running container
- **Update**: Pull latest changes from GitHub and redeploy
- **Delete**: Remove project and containers

### 4. Environment Variables

- Go to project details → **Environment Variables** tab
- Add variables and click **Save**
- Variables are stored directly in `docker-compose.yml` (no separate .env files)
- Container automatically restarts with new variables

### 5. View Logs

- Go to project details → **Logs** tab
- Click **Refresh** to load container logs

## Docker Commands

```bash
# View logs
docker compose logs -f

# Stop the deployment manager
docker compose stop

# Start the deployment manager
docker compose start

# Restart the deployment manager
docker compose restart

# Stop and remove containers
docker compose down

# Rebuild after code changes
docker compose build
docker compose up -d
```

## Next.js Project Requirements

For optimal deployment, your Next.js projects should:

1. Have `output: 'standalone'` in `next.config.ts`:
   ```typescript
   const nextConfig = {
     output: 'standalone',
   };
   ```

2. Support the package manager you're using (npm, yarn, pnpm, or bun)

## API Endpoints

- `GET /api/projects` - List all projects
- `POST /api/projects/initialize` - Initialize project structure
- `POST /api/projects` - Create/finalize a project
- `GET /api/projects/[id]` - Get project details
- `DELETE /api/projects/[id]` - Delete a project
- `POST /api/projects/[id]/deploy` - Deploy a project
- `POST /api/projects/[id]/restart` - Restart a project
- `POST /api/projects/[id]/update` - Update from GitHub
- `GET /api/projects/[id]/logs` - Get container logs
- `GET /api/projects/[id]/env` - Get environment variables
- `POST /api/projects/[id]/env` - Save environment variables
- `GET /api/ports/next` - Get next available port

## Docker Network

The system automatically creates a Docker network (configurable via `DOCKER_NETWORK` env var). All deployed project containers are connected to this network.

## Troubleshooting

### Container can't access Docker socket

Make sure the Docker socket is mounted correctly in `docker-compose.yml`:
```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

### Permission denied errors

The container runs with privileged access to manage Docker. In production, consider:
- Using a docker group instead of privileged mode
- Ensuring proper file permissions on PROJECTS_BASE_DIR

### GitHub private repos not working

Make sure you've set `GITHUB_TOKEN` in your `.env` file with a token that has `repo` scope.

### Projects directory not found

Ensure `PROJECTS_BASE_DIR` in `.env` matches the mounted volume path in `docker-compose.yml`.

## Development

For local development (without Docker):

```bash
# Install dependencies
bun install

# Run development server
bun run dev

# Build for production
bun run build

# Start production server
bun run start
```

## Notes

- This is an MVP - minimal features, no authentication
- The deployment manager itself runs in Docker
- Requires Docker socket access to manage other containers
- GitHub repositories should be publicly accessible or use GITHUB_TOKEN
- All projects are deployed as Docker containers

## License

MIT
