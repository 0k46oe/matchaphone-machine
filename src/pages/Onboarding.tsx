import {useLayoutEffect,useState} from "react";
import {
  ArrowRight,
  Bot,
  Check,
  Database,
  FileKey2,
  HeartHandshake,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {setSetting} from "../core/db";
import {useStore} from "../core/store";
import {defaultAppSettings} from "../core/types";

const notes = [
  {
    icon: Bot,
    title: "内容由 AI 生成",
    text: "回复、图片等可能出错、虚构或令人不适，请自行判断。",
  },
  {
    icon: Sparkles,
    title: "角色是虚构的",
    text: "角色没有真实意识、情感或线下行动能力，请与现实区分。",
  },
  {
    icon: HeartHandshake,
    title: "重要问题请寻求专业帮助",
    text: "医疗、心理、法律、财务或安全问题，请咨询专业人士。",
  },
  {
    icon: Database,
    title: "数据主要保存在本机",
    text: "聊天、角色和设置保存在当前浏览器；清除数据或换链接前请先备份。",
  },
  {
    icon: FileKey2,
    title: "了解 API 与隐私",
    text: "Key 保存在当前浏览器；生成时，必要对话会发送给所选服务商。",
  },
];

export default function Onboarding() {
  const reload = useStore((state) => state.reload);
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previousThemeColor = themeMeta?.content;
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      window.matchMedia?.("(display-mode: fullscreen)").matches ||
      (window.navigator as Navigator & {standalone?: boolean}).standalone === true;
    const background = root.dataset.chachaTheme === "dark" ? "#171417" : "#f7f5f6";

    root.dataset.chachaOnboarding = "true";
    root.dataset.chachaOnboardingStandalone = standalone ? "true" : "false";
    if (themeMeta) themeMeta.content = background;

    return () => {
      delete root.dataset.chachaOnboarding;
      delete root.dataset.chachaOnboardingStandalone;
      if (themeMeta && previousThemeColor) themeMeta.content = previousThemeColor;
    };
  }, []);

  const finish = async () => {
    if (!accepted || saving) return;
    setSaving(true);
    try {
      await setSetting("app", {
        ...defaultAppSettings,
        onboarded: true,
        adultConfirmed: true,
        sensitiveContent: false,
      });
      await reload();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="onboard disclaimer onboarding-page">
      <main className="onboarding-shell">
        <section className="onboarding-card" aria-labelledby="onboarding-title">
          <div className="onboarding-hero">
            <span className="onboarding-shield" aria-hidden="true">
              <ShieldCheck />
            </span>
            <div className="onboarding-eyebrow">
              <span>首次使用说明</span>
              <i>约 1 分钟</i>
            </div>
            <h1 id="onboarding-title">欢迎来到茶茶机</h1>
            <p>这是一个以本地数据为主的虚拟角色互动空间。开始前，请确认你已成年并了解以下事项。</p>
          </div>

          <div className="onboarding-section-title">
            <b>开始前，请了解</b>
            <span>5 项重要说明</span>
          </div>

          <div className="notice-list onboarding-notices">
            {notes.map((note) => (
              <article key={note.title}>
                <span className="onboarding-notice-icon" aria-hidden="true">
                  <note.icon />
                </span>
                <div>
                  <b>{note.title}</b>
                  <p>{note.text}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="onboarding-actions">
            <label className={`check onboarding-consent${accepted ? " is-accepted" : ""}`}>
              <input
                className="onboarding-consent-input"
                type="checkbox"
                checked={accepted}
                onChange={(event) => setAccepted(event.target.checked)}
              />
              <span className="onboarding-check-box" aria-hidden="true">
                <Check />
              </span>
              <span className="onboarding-consent-copy">
                <b>我已年满 18 周岁</b>
                <small>我已阅读以上说明，并理解 AI 生成内容需要自行判断。</small>
              </span>
            </label>

            <button
              className="primary onboarding-enter"
              type="button"
              disabled={!accepted || saving}
              aria-busy={saving}
              onClick={finish}
            >
              <span>{saving ? "正在进入…" : "进入茶茶机"}</span>
              {!saving && <ArrowRight aria-hidden="true" />}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
