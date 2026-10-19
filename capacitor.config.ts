import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl =
  process.env.CAPACITOR_SERVER_URL ?? "https://dare-web-app.vercel.app";

const config: CapacitorConfig = {
  appId: "com.dare.app",
  appName: "Dare",
  webDir: "mobile-www",
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
  },
};

export default config;
