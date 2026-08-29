const apiOrigin = process.env.API_ORIGIN || "http://localhost:3001";

/** @type {import("next").NextConfig} */
const config = {
  async rewrites() {
    return process.env.NODE_ENV === "development"
      ? ["/api/:path*", "/files/:path*", "/logout"].map((source) => ({
          source,
          destination: `${apiOrigin}${source}`,
        }))
      : [];
  },
};

export default config;
