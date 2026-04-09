import Link from "next/link";
import { UserBadge } from "./UserBadge";

/**
 * Top navigation bar shared across all authenticated pages.
 * Renders the site brand, primary navigation links, and the current user badge.
 */
export function NavBar() {
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <nav className="flex items-center gap-6" aria-label="Primary navigation">
          <Link
            href="/"
            className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
          >
            Gateway Tools
          </Link>
          <Link
            href="/"
            className="text-sm text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            Dashboard
          </Link>
        </nav>
        <UserBadge />
      </div>
    </header>
  );
}
