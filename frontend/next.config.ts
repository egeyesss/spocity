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

  // In production the browser can't share the session cookie with a Django
  // on another domain, so every /api/* request goes to the frontend's own
  // origin and gets proxied here (afterFiles — Next's own /api/auth/* route
  // handlers win first). BACKEND_URL is unset in local dev, where the
  // browser talks to Django directly on 127.0.0.1:8000.
  async rewrites() {
    const backend = process.env.BACKEND_URL;
    if (!backend) return [];
    return [
      {
        source: "/api/:path*",
        // Django URLs require the trailing slash; Next strips it on ingress.
        destination: `${backend}/api/:path*/`,
      },
    ];
  },
};

export default nextConfig;
