import React from "react";
import { theme, font } from "../theme";

/**
 * Stand-in for real app footage. Renders a faithful app shell (sidebar + content
 * skeleton) so callout regions line up with where the real UI sits, plus a soft
 * gradient wash and a PREVIEW label. Fully replaced by <OffthreadVideo> when the
 * capture footage lands.
 */

const NAV: { label: string; badge?: string }[] = [
  { label: "Today" },
  { label: "Goals" },
  { label: "Tasks" },
  { label: "Meetings" },
  { label: "Email" },
  { label: "Calendar" },
  { label: "Connections" },
  { label: "Set up" },
];

const NavIcon: React.FC<{ active: boolean }> = ({ active }) => (
  <div
    style={{
      width: 16,
      height: 16,
      borderRadius: 5,
      background: active ? theme.accent : theme.surface3,
      border: `1px solid ${active ? theme.accent : theme.borderStrong}`,
      flexShrink: 0,
    }}
  />
);

const Sidebar: React.FC<{ active: string }> = ({ active }) => (
  <div
    style={{
      width: 208,
      flexShrink: 0,
      height: "100%",
      background: theme.surface,
      borderRight: `1px solid ${theme.border}`,
      display: "flex",
      flexDirection: "column",
      padding: "22px 14px",
      fontFamily: font.sans,
    }}
  >
    <div
      style={{
        fontWeight: 600,
        fontSize: 15,
        letterSpacing: -0.2,
        color: theme.foreground,
        padding: "0 8px 22px",
      }}
    >
      Otto
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {NAV.map((n) => {
        const isActive = n.label === active;
        return (
          <div
            key={n.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "9px 10px",
              borderRadius: 9,
              background: isActive ? theme.surface3 : "transparent",
              color: isActive ? theme.foreground : theme.mutedStrong,
              fontSize: 14.5,
              fontWeight: isActive ? 600 : 500,
            }}
          >
            <NavIcon active={isActive} />
            <span style={{ flex: 1 }}>{n.label}</span>
            {n.badge ? (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: theme.muted,
                  background: theme.surface3,
                  borderRadius: 999,
                  padding: "1px 8px",
                  border: `1px solid ${theme.border}`,
                }}
              >
                {n.badge}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
    <div style={{ flex: 1 }} />
    <div style={{ padding: "0 8px", fontSize: 12.5, color: theme.muted }}>
      maya@driftwoodroasters.com
    </div>
  </div>
);

const Bar: React.FC<{ w: number | string; h?: number; c?: string; r?: number }> = ({
  w,
  h = 12,
  c = theme.surface3,
  r = 6,
}) => <div style={{ width: w, height: h, borderRadius: r, background: c }} />;

const SkelCard: React.FC<{
  accent?: "red" | "green" | "none";
  lines?: number;
  chip?: boolean;
  tall?: boolean;
}> = ({ accent = "none", lines = 2, chip = true, tall = false }) => (
  <div
    style={{
      position: "relative",
      background: theme.surface,
      border: `1px solid ${theme.border}`,
      borderRadius: 16,
      padding: "18px 22px",
      boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 6px 18px rgba(16,24,40,0.05)",
      display: "flex",
      flexDirection: "column",
      gap: 12,
    }}
  >
    {accent !== "none" ? (
      <div
        style={{
          position: "absolute",
          left: -1,
          top: 10,
          bottom: 10,
          width: 3,
          borderRadius: 3,
          background: accent === "red" ? theme.danger : theme.success,
        }}
      />
    ) : null}
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <Bar w={tall ? 360 : 300} h={14} c={theme.border} />
      <Bar w={90} h={12} c={accent === "red" ? theme.dangerSoft : theme.surface3} />
    </div>
    {chip ? <Bar w={180} h={22} r={999} c={theme.accentSoft} /> : null}
    {Array.from({ length: lines }).map((_, i) => (
      <Bar key={i} w={i === lines - 1 ? "62%" : "88%"} h={10} />
    ))}
  </div>
);

const SectionLabel: React.FC<{ text: string; color?: string }> = ({ text, color }) => (
  <div
    style={{
      fontSize: 12.5,
      fontWeight: 700,
      letterSpacing: 1.2,
      color: color ?? theme.muted,
      textTransform: "uppercase",
      margin: "6px 0 2px",
    }}
  >
    {text}
  </div>
);

const Row: React.FC<{ children: React.ReactNode; pad?: string }> = ({ children, pad = "14px 20px" }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 14,
      padding: pad,
      background: theme.surface,
      border: `1px solid ${theme.border}`,
      borderRadius: 14,
      boxShadow: "0 1px 2px rgba(16,24,40,0.03)",
    }}
  >
    {children}
  </div>
);

const MeetingsView: React.FC = () => (
  <>
    {[0, 1, 2].map((i) => (
      <div
        key={i}
        style={{
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: 16,
          padding: "18px 22px",
          boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 6px 18px rgba(16,24,40,0.05)",
          display: "flex",
          flexDirection: "column",
          gap: 11,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
          <Bar w={240} h={14} c={theme.border} />
          <Bar w={70} h={11} />
        </div>
        {[0, 1, 2, 3].map((k) => (
          <div key={k} style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Bar w={54} h={10} c={theme.accentSoft} r={999} />
            <Bar w={`${70 - k * 8}%`} h={9} />
          </div>
        ))}
      </div>
    ))}
  </>
);

const EmailView: React.FC = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    {[0, 1, 2, 3, 4, 5].map((i) => (
      <Row key={i} pad="14px 18px">
        <div style={{ width: 34, height: 34, borderRadius: 999, background: theme.surface3, border: `1px solid ${theme.border}`, flexShrink: 0 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }}>
          <Bar w={160 + (i % 3) * 40} h={11} c={theme.border} />
          <Bar w={`${60 + (i % 4) * 8}%`} h={9} />
        </div>
        <Bar w={54} h={10} />
      </Row>
    ))}
  </div>
);

const CalendarView: React.FC = () => (
  <div
    style={{
      background: theme.surface,
      border: `1px solid ${theme.border}`,
      borderRadius: 16,
      padding: 18,
      boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 6px 18px rgba(16,24,40,0.05)",
    }}
  >
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, marginBottom: 10 }}>
      {Array.from({ length: 7 }).map((_, i) => (
        <Bar key={i} w={"70%"} h={9} />
      ))}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gridAutoRows: 78, gap: 8 }}>
      {Array.from({ length: 21 }).map((_, i) => {
        const hasEvent = [3, 5, 10, 12, 16].includes(i);
        const eventAccent = i === 5;
        return (
          <div
            key={i}
            style={{
              border: `1px solid ${theme.border}`,
              borderRadius: 9,
              padding: 7,
              display: "flex",
              flexDirection: "column",
              gap: 5,
              background: theme.background,
            }}
          >
            <Bar w={14} h={9} />
            {hasEvent ? (
              <Bar w={"100%"} h={16} r={5} c={eventAccent ? theme.accentSoft : theme.surface3} />
            ) : null}
          </div>
        );
      })}
    </div>
  </div>
);

const TasksView: React.FC = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    {[0, 1, 2, 3, 4, 5].map((i) => (
      <Row key={i} pad="14px 18px">
        <div style={{ width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${theme.borderStrong}`, flexShrink: 0 }} />
        <Bar w={`${44 + (i % 3) * 10}%`} h={12} c={theme.border} />
        <Bar w={150} h={22} r={999} c={theme.accentSoft} />
        <div style={{ flex: 1 }} />
        <Bar w={64} h={10} c={i === 0 ? theme.dangerSoft : theme.surface3} />
      </Row>
    ))}
  </div>
);

const Content: React.FC<{ variant: string }> = ({ variant }) => {
  return (
    <div
      style={{
        flex: 1,
        height: "100%",
        overflow: "hidden",
        padding: "34px 48px",
        fontFamily: font.sans,
      }}
    >
      <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* header */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 6 }}>
          <Bar w={260} h={22} c={theme.border} r={7} />
          <Bar w={440} h={12} />
        </div>

        {variant === "today" ? (
          <>
            <SectionLabel text="Overdue (1)" color={theme.danger} />
            <SkelCard accent="red" chip lines={1} />
            <SkelCard accent="red" chip lines={2} />
            <SectionLabel text="Today (2)" />
            <SkelCard chip lines={2} tall />
            <SkelCard chip lines={1} />
            <SectionLabel text="Done (1)" color={theme.success} />
            <SkelCard accent="green" chip={false} lines={0} />
          </>
        ) : variant === "review" ? (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                border: `1px solid ${theme.border}`,
                borderRadius: 14,
                background: theme.surface,
              }}
            >
              <Bar w={20} h={20} r={5} c={theme.accent} />
              <Bar w={90} h={12} c={theme.border} />
              <Bar w={80} h={26} r={999} c={theme.successSoft} />
              <div style={{ flex: 1 }} />
              <Bar w={200} h={10} />
            </div>
            <SkelCard chip lines={1} />
            <SkelCard chip lines={1} />
            <SkelCard chip lines={1} />
            <SkelCard chip lines={1} />
          </>
        ) : variant === "goals" ? (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "16px 18px",
                border: `1px solid ${theme.border}`,
                borderRadius: 14,
                background: theme.surface,
              }}
            >
              <Bar w={"100%"} h={14} />
              <Bar w={110} h={34} r={9} c={theme.accent} />
            </div>
            <SkelCard chip={false} lines={3} tall />
            <SkelCard chip={false} lines={2} tall />
          </>
        ) : variant === "meetings" ? (
          <MeetingsView />
        ) : variant === "email" ? (
          <EmailView />
        ) : variant === "calendar" ? (
          <CalendarView />
        ) : variant === "tasks" ? (
          <TasksView />
        ) : (
          <>
            <SkelCard chip lines={2} />
            <SkelCard chip lines={2} />
            <SkelCard chip lines={2} />
            <SkelCard chip lines={1} />
          </>
        )}
      </div>
    </div>
  );
};

export const StandIn: React.FC<{ label: string; page: string; variant?: string }> = ({
  label,
  page,
  variant = "generic",
}) => {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", background: theme.background }}>
      {/* soft gradient wash */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(50rem 34rem at 20% -8%, rgba(51,65,85,0.05), transparent 60%), radial-gradient(44rem 34rem at 100% 0%, rgba(30,41,59,0.03), transparent 55%)",
          pointerEvents: "none",
        }}
      />
      <Sidebar active={pageToNav(page)} />
      <Content variant={variant} />

      {/* PREVIEW watermark */}
      <div
        style={{
          position: "absolute",
          bottom: 18,
          right: 22,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 12px",
          borderRadius: 999,
          background: "rgba(17,24,39,0.72)",
          color: "#fff",
          fontFamily: font.mono,
          fontSize: 12,
          letterSpacing: 0.6,
        }}
      >
        <div style={{ width: 7, height: 7, borderRadius: 999, background: theme.warning }} />
        PREVIEW - {label}
      </div>
    </div>
  );
};

function pageToNav(page: string): string {
  const map: Record<string, string> = {
    today: "Today",
    goals: "Goals",
    tasks: "Tasks",
    meetings: "Meetings",
    email: "Email",
    calendar: "Calendar",
  };
  return map[page] ?? "Today";
}
