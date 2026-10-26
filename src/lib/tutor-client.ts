/** 页面任何地方都能唤起 AI 助教：派发一个事件，由挂在 layout 里的 Tutor 接收 */
export const TUTOR_EVENT = "fm:ask-tutor";

export type TutorAsk = {
  /** 预填进输入框的问题 */
  text: string;
  /** 立即发送，而不只是预填 */
  send?: boolean;
  /** 附加的上下文说明（如导引的第几步），随问题一起发给助教 */
  hint?: string;
};

export function askTutor(ask: TutorAsk) {
  window.dispatchEvent(new CustomEvent<TutorAsk>(TUTOR_EVENT, { detail: ask }));
}
