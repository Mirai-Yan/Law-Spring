/**
 * 线上演示版（例如部署在 Netlify）：服务器没有可以长期保存数据的磁盘，
 * 账号与同步、个人资料库、建议与纠错只在本机版提供；练习进度、主题和收藏仍保存在浏览器里。
 * 由构建时的环境变量 FM_ONLINE_DEMO=1 打开（见 next.config.ts 与 netlify.toml），构建时写死进代码，服务端和浏览器端都能读到。
 */
export const ONLINE_DEMO = process.env.FM_ONLINE_DEMO === "1";

export const LOCAL_ONLY_NOTE = "这是线上演示版，服务器不保存用户数据，这项功能只在本机版中提供。练习进度、主题和收藏仍会保存在这台设备的浏览器里。";
