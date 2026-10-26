import { accessCodeRequired, json } from "@/lib/ai/guard";
import { llmConfigured, llmModel } from "@/lib/llm";

export const dynamic = "force-dynamic";

export function GET() {
  return json({ configured: llmConfigured(), model: llmModel(), accessCodeRequired: accessCodeRequired() });
}
