import { useQuery } from "@tanstack/react-query";
import { Link, Outlet } from "@tanstack/react-router";
import {
  Activity,
  Copy,
  Download,
  FolderCog,
  LayoutDashboard,
  ListChecks,
  Scissors,
  Settings as SettingsIcon,
} from "lucide-react";
import { api } from "../api";
import { PlexScanPopover } from "../features/staging/PlexScanPopover";
import type { NavItem, Section } from "../types";

export const navItems: NavItem[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "staging", label: "Staging", icon: FolderCog },
  { id: "dedupe", label: "Dedupe", icon: Copy },
  { id: "cue", label: "CUE Split", icon: Scissors },
  { id: "jobs", label: "Jobs", icon: ListChecks },
  { id: "downloads", label: "Downloads", icon: Download },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

export const sectionLabel: Record<Section, string> = {
  overview: "Overview",
  staging: "Download Staging Area",
  dedupe: "Library Dedupe",
  cue: "CUE Split",
  jobs: "Jobs",
  downloads: "Downloads",
  settings: "Settings",
};

export const sectionDescription: Record<Section, string> = {
  overview: "System status at a glance — active downloads, staging area, and cleanup tasks.",
  staging: "Scan your downloads folder, review detected media, and confirm moves to the library.",
  dedupe:
    "Index your FLAC library to identify duplicated releases and keep the best quality versions.",
  cue: "Audit unsplit CUE/audio pairs and run split jobs with live progress.",
  jobs: "Track active and past move operations. Select a job to see its progress and event log.",
  downloads: "Search Prowlarr indexers for lossless audio and add directly to Transmission.",
  settings: "NAS library paths used when organizing media. Edit via server environment variables.",
};

export function BrandIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 32 32"
      aria-hidden="true"
      style={{ color: "var(--primary)", flexShrink: 0 }}
    >
      <rect x="5" y="7" width="22" height="5.5" rx="1.5" fill="currentColor" />
      <rect x="5" y="13.5" width="22" height="5.5" rx="1.5" fill="currentColor" opacity="0.65" />
      <rect x="5" y="20" width="22" height="5.5" rx="1.5" fill="currentColor" opacity="0.35" />
      <circle cx="23.5" cy="9.75" r="1.3" fill="oklch(0.125 0.015 175)" />
      <circle cx="23.5" cy="16.25" r="1.3" fill="oklch(0.125 0.015 175)" />
      <circle cx="23.5" cy="22.75" r="1.3" fill="oklch(0.125 0.015 175)" />
    </svg>
  );
}

export function ServerStatus() {
  const query = useQuery({
    queryKey: ["health"],
    queryFn: async () => await api.health.get(),
    refetchInterval: 5000,
  });

  const connected = query.data?.data?.ok;
  return (
    <PlexScanPopover
      renderTrigger={({ anyPending }) => (
        <button
          type="button"
          className={connected ? "server-pulse-badge ok" : "server-pulse-badge"}
          disabled={anyPending}
          title={`${connected ? "Connected" : "Offline or unreachable"}. Trigger a Plex library refresh.`}
        >
          <span className="server-pulse-status">
            <Activity size={14} />
            Server
          </span>
          <span className="server-pulse-divider" aria-hidden="true" />
          <span className="server-pulse-action">{anyPending ? "Scanning…" : "Plex scan"}</span>
        </button>
      )}
    />
  );
}

export function AppShell() {
  const { pathname } = window.location;

  const currentSection = (pathname === "/" ? "overview" : pathname.slice(1)) as Section;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <BrandIcon />
          NAS Tools
        </div>
        <nav className="nav" aria-label="Cockpit sections">
          {navItems.map((item) => {
            const Icon = item.icon;
            const to = item.id === "overview" ? "/" : `/${item.id}`;
            return (
              <Link key={item.id} to={to} activeProps={{ className: "active" }}>
                <Icon size={17} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="content">
        <header className="topbar">
          <div>
            <h1>{sectionLabel[currentSection]}</h1>
            <p className="section-desc">{sectionDescription[currentSection]}</p>
          </div>
          <ServerStatus />
        </header>
        <Outlet />
      </main>
    </div>
  );
}
