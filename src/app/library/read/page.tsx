import LocalOnly from "@/components/LocalOnly";
import LibraryReader from "@/components/LibraryReader";
import { getIndex } from "@/lib/content";
import { ONLINE_DEMO } from "@/lib/deploy";

export const metadata = { title: "阅读 · 我的资料库" };

export default function LibraryReadPage() {
  if (ONLINE_DEMO) return <LocalOnly />;
  const questions = getIndex().db.questions.map((q) => ({ id: q.id, text: q.text }));
  return <LibraryReader questions={questions} />;
}
