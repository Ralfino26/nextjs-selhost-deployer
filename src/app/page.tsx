import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Placeholder data
const projects = [
  {
    id: "1",
    name: "my-nextjs-app",
    status: "Running",
    lastDeployment: "2024-01-15 10:30 AM",
  },
  {
    id: "2",
    name: "api-service",
    status: "Stopped",
    lastDeployment: "2024-01-14 3:45 PM",
  },
  {
    id: "3",
    name: "dashboard",
    status: "Running",
    lastDeployment: "2024-01-15 9:15 AM",
  },
];

export default function Home() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <Link href="/projects/new">
          <Button>New Project</Button>
        </Link>
      </div>

      <div className="rounded-md border border-gray-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Deployment</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((project) => (
              <TableRow key={project.id}>
                <TableCell className="font-medium">{project.name}</TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                      project.status === "Running"
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {project.status}
                  </span>
                </TableCell>
                <TableCell>{project.lastDeployment}</TableCell>
                <TableCell className="text-right">
                  <Link href={`/projects/${project.id}`}>
                    <Button variant="outline" size="sm">
                      Open Project
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
