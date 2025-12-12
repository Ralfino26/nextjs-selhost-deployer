# Next.js Self-Hosted Deployment Manager

A minimal MVP dashboard for automating deployments of GitHub Next.js projects to a VPS using Docker.

## Features

- **Project Management**: Create, view, and delete projects
- **GitHub Integration**: Clone and deploy GitHub repositories
- **Docker Automation**: Automatic Dockerfile and docker-compose.yml generation
- **Database Support**: Optional PostgreSQL database setup
- **Port Management**: Automatic port assignment
- **Environment Variables**: Manage project environment variables
- **Container Management**: Deploy, restart, update, and view logs

## Requirements

- Node.js 20+ or Bun
- Docker and Docker Compose installed
- Access to Docker socket (usually requires running as root or docker group)
- Git installed
- Write access to `/srv/vps/websites` (or configure `PROJECTS_BASE_DIR`)

## Configuration

Create a `.env.local` file in the root directory:

```env
PROJECTS_BASE_DIR=/srv/vps/websites
DB_USER=postgres
DB_PASSWORD=your_secure_password
```

## Project Structure

When you create a project, the following structure is created:

```
/srv/vps/websites/
└── project-name/
    ├── repo-name/          # Cloned GitHub repository
    │   ├── Dockerfile      # Auto-generated if not present
    │   └── .env.local      # Environment variables
    ├── docker/
    │   └── docker-compose.yml
    └── database/           # Only if database is enabled
        └── docker-compose.yml
```

## Next.js Project Requirements

For optimal deployment, your Next.js project should:

1. Have `output: 'standalone'` in `next.config.ts`:
   ```typescript
   const nextConfig = {
     output: 'standalone',
   };
   ```

2. Support the package manager you're using (npm, yarn, pnpm, or bun)

## Installation

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

## Usage

1. **Create a Project**: Click "New Project" and follow the 3-step wizard
   - Step 1: Select GitHub repository and enter project name
   - Step 2: Configure port (auto-assigned), database, and domain
   - Step 3: Review and create

2. **Manage Projects**: 
   - View all projects on the home page
   - Click "Open Project" to view details
   - Deploy, restart, update, or delete projects

3. **Environment Variables**:
   - Go to project details → Environment Variables tab
   - Add variables and save
   - Variables are saved to `.env.local` in the project directory

4. **View Logs**:
   - Go to project details → Logs tab
   - Click "Refresh" to load container logs

## API Endpoints

- `GET /api/projects` - List all projects
- `POST /api/projects` - Create a new project
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

The system automatically creates a Docker network named `deployment-network` (configurable via `DOCKER_NETWORK` env var). All containers are connected to this network.

## Notes

- This is an MVP - minimal features, no authentication
- Runs on the VPS where Docker is installed
- Requires appropriate file system permissions
- GitHub repositories should be publicly accessible or use SSH keys
