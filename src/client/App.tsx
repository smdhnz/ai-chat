import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { getBootstrap, type Bootstrap } from "./api";
import { useTheme } from "./lib";
import { Login } from "./Login";
import { Chat } from "./Chat";
import { SettingsPage } from "./Settings";

export default function App() {
  const theme = useTheme();
  const [data, setData] = useState<Bootstrap | null>(null);
  const [path, setPath] = useState(location.pathname);
  const settings = path.startsWith("/settings/");
  const login = path === "/login";
  useEffect(() => {
    const update = () => setPath(location.pathname);
    addEventListener("popstate", update);
    return () => removeEventListener("popstate", update);
  }, []);
  useEffect(() => {
    if (!login) void getBootstrap().then(setData);
  }, [settings, login]);
  if (login) return <Login />;
  if (!data)
    return (
      <div className="flex h-svh items-center justify-center">
        <motion.div
          className="size-2 rounded-full bg-accent"
          animate={{ opacity: [0.25, 1, 0.25] }}
          transition={{ repeat: Infinity, duration: 1.2 }}
        />
      </div>
    );
  return path.startsWith("/settings/") ? (
    <SettingsPage initial={data} theme={theme} />
  ) : (
    <Chat initial={data} />
  );
}
