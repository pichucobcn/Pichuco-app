const PATHS: Record<string, string> = {
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3 2",
  cart: "M3 4h2l2.4 10.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6.2M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  tasks: "M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2",
  megaphone: "M4 10v4a1 1 0 0 0 1 1h2l5 4V5L7 9H5a1 1 0 0 0-1 1Zm12-2a5 5 0 0 1 0 8m2-11a9 9 0 0 1 0 14",
  chat: "M4 5h16v11H8l-4 4V5Zm4 5h8M8 13h5",
  home: "M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  box: "M3 7l9-4 9 4-9 4-9-4Zm0 0v10l9 4 9-4V7M12 11v10",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 10a7 7 0 0 1 14 0M17 3.5a4 4 0 0 1 0 7.5M22 21a7 7 0 0 0-4-6.3",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2Zm4 4a2 2 0 0 0 4 0",
  send: "M4 12l16-8-6 16-2.5-6.5L4 12Z",
  back: "M15 5l-7 7 7 7",
  plus: "M12 5v14M5 12h14",
  check: "M5 12l5 5 9-10",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11",
  history: "M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 8v4l3 2",
  pizza: "M12 3c3.6 0 6.9 1.3 9 3.5L12 21 3 6.5C5.1 4.3 8.4 3 12 3Zm-6.5 4.6A11 11 0 0 1 12 6c2.4 0 4.7.6 6.5 1.6M10 10.5h.01M14 13h.01M11.5 15.5h.01",
  truck: "M3 6h11v10H3zM14 9h4l3 3v4h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  table: "M3 9h18M5 9v11M19 9v11M8 9V5h8v4M8 14h8",
  bag: "M5 8h14l-1 12H6L5 8Zm4 0V6a3 3 0 0 1 6 0v2",
  shield: "M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3Zm-3.5 9l2.5 2.5 4.5-5",
  thermo: "M10 14V5a2 2 0 1 1 4 0v9a4 4 0 1 1-4 0Zm2 3v-6",
  spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z",
};

export function Icon({ name, size = 22, stroke = 2 }: { name: keyof typeof PATHS | string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] ?? ""} />
    </svg>
  );
}
