"use client";

import { useEffect, useState } from "react";

/**
 * PWA：注册 Service Worker，并在浏览器允许时显示「安装为 App」。
 * 浏览器只在 https 或本机 localhost 上启用 Service Worker；通过 http://局域网IP 访问时照常使用，只是不能离线。
 */

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: InstallEvent | null = null;
const INSTALL_EVENT = "fm:installable";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      // 开发模式下不要缓存，免得改了代码看不到
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
      return;
    }
    if (window.isSecureContext) navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  useEffect(() => {
    const on = (e: Event) => {
      e.preventDefault();
      deferred = e as InstallEvent;
      window.dispatchEvent(new Event(INSTALL_EVENT));
    };
    const done = () => {
      deferred = null;
      window.dispatchEvent(new Event(INSTALL_EVENT));
    };
    window.addEventListener("beforeinstallprompt", on);
    window.addEventListener("appinstalled", done);
    return () => {
      window.removeEventListener("beforeinstallprompt", on);
      window.removeEventListener("appinstalled", done);
    };
  }, []);
  return null;
}

/** 「安装为 App」：Chrome / Edge 弹出安装对话框；iPhone、iPad 的 Safari 给出「添加到主屏幕」的提示；已安装时不显示 */
export function InstallButton({ className = "" }: { className?: string }) {
  const [state, setState] = useState<"none" | "prompt" | "ios">("none");
  const [tip, setTip] = useState(false);
  useEffect(() => {
    const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const update = () => setState(standalone ? "none" : deferred ? "prompt" : ios ? "ios" : "none");
    update();
    window.addEventListener(INSTALL_EVENT, update);
    return () => window.removeEventListener(INSTALL_EVENT, update);
  }, []);
  if (state === "none") return null;
  return (
    <span className={className}>
      <button
        type="button"
        className="underline"
        onClick={async () => {
          if (state === "ios") return setTip((v) => !v);
          await deferred?.prompt();
          deferred = null;
          setState("none");
        }}
      >
        安装为 App
      </button>
      {tip && <span className="ml-2">在 Safari 中点「分享」→「添加到主屏幕」。</span>}
    </span>
  );
}
