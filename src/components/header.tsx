import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Header() {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link href="/" className="text-lg font-semibold">
          Deployment Manager
        </Link>
        <nav className="flex items-center gap-4">
          <Link href="/projects/new">
            <Button>New Project</Button>
          </Link>
        </nav>
      </div>
    </header>
  );
}

