function svgDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const AGENT_PALETTES: Record<string, { skin: string; cloth: string; accent: string }> = {
  alice: { skin: "#a8653f", cloth: "#d78b3d", accent: "#f7d154" },
  bob: { skin: "#8f5536", cloth: "#587c46", accent: "#9fd36a" },
  charlie: { skin: "#7c4a32", cloth: "#7a5ac8", accent: "#c2a6ff" },
  dave: { skin: "#9c613a", cloth: "#4a78b4", accent: "#8cc7ff" },
  eve: { skin: "#b36d44", cloth: "#a3485d", accent: "#ff9ab0" },
  frank: { skin: "#875136", cloth: "#9a7440", accent: "#ffd27a" },
  grace: { skin: "#9b5a38", cloth: "#2f8a70", accent: "#83e3c1" },
  henry: { skin: "#784832", cloth: "#c15a38", accent: "#ffb18c" },
};

export function agentAvatarDataUri(agentId: string): string {
  const palette = AGENT_PALETTES[agentId] ?? { skin: "#9c613a", cloth: "#4f6a43", accent: "#e7c46b" };
  const initial = agentId.slice(0, 1).toUpperCase();
  return svgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 128" shape-rendering="crispEdges">
      <rect width="96" height="128" fill="none"/>
      <rect x="28" y="10" width="40" height="10" fill="#2c1b13"/>
      <rect x="18" y="20" width="60" height="12" fill="#3a2418"/>
      <rect x="26" y="28" width="44" height="34" fill="${palette.skin}"/>
      <rect x="18" y="38" width="12" height="20" fill="${palette.skin}"/>
      <rect x="66" y="38" width="12" height="20" fill="${palette.skin}"/>
      <rect x="34" y="40" width="8" height="8" fill="#1d130f"/>
      <rect x="54" y="40" width="8" height="8" fill="#1d130f"/>
      <rect x="42" y="54" width="12" height="4" fill="#4b2419"/>
      <rect x="26" y="62" width="44" height="34" fill="${palette.cloth}"/>
      <rect x="18" y="68" width="12" height="34" fill="${palette.skin}"/>
      <rect x="66" y="68" width="12" height="34" fill="${palette.skin}"/>
      <rect x="32" y="72" width="32" height="8" fill="${palette.accent}"/>
      <rect x="32" y="96" width="12" height="24" fill="#3b2a21"/>
      <rect x="52" y="96" width="12" height="24" fill="#3b2a21"/>
      <rect x="24" y="120" width="20" height="6" fill="#201510"/>
      <rect x="52" y="120" width="20" height="6" fill="#201510"/>
      <text x="48" y="91" text-anchor="middle" font-family="monospace" font-size="16" font-weight="700" fill="#fff3c4">${initial}</text>
    </svg>
  `);
}

export const lionAvatarDataUri = svgDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 96" shape-rendering="crispEdges">
    <rect width="160" height="96" fill="none"/>
    <rect x="14" y="28" width="42" height="42" fill="#5b351a"/>
    <rect x="22" y="20" width="26" height="58" fill="#724018"/>
    <rect x="50" y="36" width="76" height="28" fill="#c88936"/>
    <rect x="122" y="42" width="20" height="14" fill="#c88936"/>
    <rect x="138" y="46" width="12" height="6" fill="#5a3217"/>
    <rect x="28" y="40" width="8" height="8" fill="#10100f"/>
    <rect x="42" y="54" width="10" height="6" fill="#2b170d"/>
    <rect x="60" y="62" width="10" height="20" fill="#855423"/>
    <rect x="92" y="62" width="10" height="20" fill="#855423"/>
    <rect x="112" y="62" width="10" height="20" fill="#855423"/>
    <rect x="60" y="82" width="16" height="6" fill="#3c2414"/>
    <rect x="92" y="82" width="16" height="6" fill="#3c2414"/>
    <rect x="112" y="82" width="16" height="6" fill="#3c2414"/>
    <rect x="126" y="34" width="24" height="8" fill="#a56d2a"/>
    <rect x="148" y="30" width="6" height="6" fill="#5b351a"/>
  </svg>
`);

const ITEM_SVGS: Record<string, string> = {
  rocks: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges">
      <rect width="32" height="32" fill="none"/><rect x="6" y="16" width="10" height="8" fill="#7d756d"/><rect x="10" y="12" width="12" height="12" fill="#9a9288"/><rect x="18" y="18" width="8" height="8" fill="#69635d"/>
    </svg>`,
  sticks: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges">
      <rect width="32" height="32" fill="none"/><rect x="8" y="24" width="4" height="4" fill="#5b351a"/><rect x="12" y="20" width="4" height="4" fill="#70451f"/><rect x="16" y="16" width="4" height="4" fill="#84552a"/><rect x="20" y="12" width="4" height="4" fill="#9a6835"/><rect x="22" y="8" width="4" height="4" fill="#b27b43"/>
    </svg>`,
  berries: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges">
      <rect width="32" height="32" fill="none"/><rect x="10" y="10" width="6" height="6" fill="#c83f5a"/><rect x="18" y="12" width="6" height="6" fill="#a52d49"/><rect x="14" y="18" width="6" height="6" fill="#df5870"/><rect x="14" y="6" width="8" height="4" fill="#4f8a43"/>
    </svg>`,
  water: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges">
      <rect width="32" height="32" fill="none"/><rect x="14" y="6" width="4" height="4" fill="#8bd7ff"/><rect x="10" y="10" width="12" height="8" fill="#49a8e8"/><rect x="8" y="18" width="16" height="8" fill="#287cc7"/><rect x="12" y="14" width="4" height="4" fill="#d9f6ff"/>
    </svg>`,
  "dry grass": `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges">
      <rect width="32" height="32" fill="none"/><rect x="6" y="22" width="20" height="4" fill="#b78a38"/><rect x="10" y="12" width="4" height="10" fill="#d0a34a"/><rect x="16" y="8" width="4" height="14" fill="#e1bd62"/><rect x="22" y="14" width="4" height="8" fill="#a8792e"/>
    </svg>`,
};

export function itemIconDataUri(item: string): string {
  return svgDataUri(ITEM_SVGS[item] ?? ITEM_SVGS["rocks"]!);
}
