import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useLocation } from "@tanstack/react-router";
import {
  Activity,
  Copy,
  Download,
  FolderCog,
  LayoutDashboard,
  ListChecks,
  Music2,
  Scissors,
  Settings as SettingsIcon,
} from "lucide-react";
import {
  Brand,
  Content,
  Nav,
  navLinkActiveClass,
  navLinkClass,
  navLinkLabelClass,
  PageTitle,
  SectionDesc,
  ServerPulseAction,
  ServerPulseBadge,
  ServerPulseDivider,
  ServerPulseStatus,
  Shell,
  Sidebar,
  Topbar,
  TopbarHeading,
} from "@/components/styled";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  { id: "player", label: "Player", icon: Music2 },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

export const sectionLabel: Record<Section, string> = {
  overview: "Overview",
  staging: "Download Staging Area",
  dedupe: "Library Dedupe",
  cue: "CUE Split",
  jobs: "Jobs",
  downloads: "Downloads",
  player: "Player",
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
  player: "Browse and play FLAC files directly via ALSA — bit-perfect output to USB DAC.",
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
        <Tooltip>
          <TooltipTrigger asChild>
            <ServerPulseBadge $connected={!!connected} disabled={anyPending}>
              <ServerPulseStatus
                className={connected ? "[&_svg]:animate-pulse [&_svg]:opacity-100" : ""}
              >
                <Activity size={14} />
                Server
              </ServerPulseStatus>
              <ServerPulseDivider aria-hidden="true" />
              <ServerPulseAction>{anyPending ? "Scanning…" : "Plex scan"}</ServerPulseAction>
            </ServerPulseBadge>
          </TooltipTrigger>
          <TooltipContent>
            {connected ? "Connected" : "Offline or unreachable"}. Trigger a Plex library refresh.
          </TooltipContent>
        </Tooltip>
      )}
    />
  );
}

function NavBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <Badge
      variant="outline"
      className="ml-auto h-[17px] min-w-[17px] justify-center border-transparent bg-primary/15 px-1 text-[10px] font-semibold leading-none tabular-nums text-primary max-md:absolute max-md:left-1/2 max-md:top-0.5 max-md:ml-0 max-md:translate-x-[7px]"
    >
      {count > 99 ? "99+" : count}
    </Badge>
  );
}

function useStagingCount(): number {
  // Shares the ["dashboard"] cache with Staging — the queryFn must return
  // the same unwrapped shape used there.
  const query = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const res = await api.dashboard.get();
      return res.data && "staging" in res.data ? res.data : null;
    },
    refetchInterval: 30_000,
  });
  return query.data?.staging?.total ?? 0;
}

export function AppShell() {
  const { pathname } = useLocation();
  const stagingCount = useStagingCount();

  const currentSection = (pathname === "/" ? "overview" : pathname.slice(1)) as Section;

  return (
    <Shell>
      <Sidebar>
        <Brand>
          <BrandIcon />
          NAS Tools
        </Brand>
        <Nav aria-label="Console sections">
          {navItems.map((item) => {
            const Icon = item.icon;
            const to = item.id === "overview" ? "/" : `/${item.id}`;
            return (
              <Link
                key={item.id}
                to={to}
                aria-label={item.label}
                className={navLinkClass}
                activeProps={{ className: navLinkActiveClass }}
              >
                <Icon size={17} />
                <span className={navLinkLabelClass}>{item.label}</span>
                {item.id === "staging" ? <NavBadge count={stagingCount} /> : null}
              </Link>
            );
          })}
        </Nav>
      </Sidebar>
      <Content>
        <Topbar>
          <TopbarHeading>
            <PageTitle>{sectionLabel[currentSection]}</PageTitle>
            <SectionDesc>{sectionDescription[currentSection]}</SectionDesc>
          </TopbarHeading>
          <ServerStatus />
        </Topbar>
        <div className="md:flex-1 md:min-h-0 md:overflow-y-auto">
          <Outlet />
        </div>
      </Content>
    </Shell>
  );
}
