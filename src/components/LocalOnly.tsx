import { LOCAL_ONLY_NOTE } from "@/lib/deploy";

/** 线上演示版里，替代账号、资料库、反馈等需要服务器保存数据的页面 */
export default function LocalOnly() {
  return <div className="card p-5 text-sm text-ink-2">{LOCAL_ONLY_NOTE}</div>;
}
