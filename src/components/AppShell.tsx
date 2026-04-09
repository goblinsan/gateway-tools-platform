import { NavBar } from "./NavBar";

/**
 * Application shell used by all pages.
 *
 * The `NavBar` inside this shell renders a `UserBadge` that reads the
 * `x-user-email` header forwarded by the proxy layer.  On the `/unauthorized`
 * page those headers are absent, so `UserBadge` renders nothing – the shell
 * still renders to provide consistent branding and layout, but without an
 * active user identity.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      <NavBar />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
