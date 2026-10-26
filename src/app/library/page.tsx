import LibraryClient from "@/components/LibraryClient";
import LocalOnly from "@/components/LocalOnly";
import { PageHeader } from "@/components/ui";
import { getIndex } from "@/lib/content";
import { ONLINE_DEMO } from "@/lib/deploy";

export const metadata = { title: "我的资料库 · 法脉·刑法学" };

export default function LibraryPage() {
  const questions = getIndex().db.questions.map((q) => ({ id: q.id, text: q.text }));
  return (
    <>
      <PageHeader eyebrow="个人资料库" title="我的资料库">
        <p className="text-ink-2">上传自己的论文、书籍和笔记，在里面全文检索、只依据它们提问，并把读到的段落摘成卡片，关联到知识库里的问题。资料只有你自己能看到，不会进入公共知识库。</p>
      </PageHeader>
      {ONLINE_DEMO ? <LocalOnly /> : <LibraryClient questions={questions} />}
    </>
  );
}
