import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Three.js ships untranspiled ES modules; Next 13.1+ requires transpilePackages
  // for the addons (`three/examples/jsm/*`) used by @react-three/drei.
  transpilePackages: ["three"],

  // We use 127.0.0.1 instead of localhost everywhere because Spotify's OAuth
  // redirect URI policy requires it. Next 16 blocks cross-origin dev assets
  // (including the HMR WebSocket) from non-allowlisted hosts, which silently
  // breaks hot reload and forces the browser to keep reusing stale chunks.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
