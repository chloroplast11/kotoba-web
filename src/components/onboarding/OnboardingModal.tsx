"use client";
import { useOnboardingStore } from "@/store/onboardingStore";

export default function OnboardingModal() {
  const open = useOnboardingStore((s) => s.modalOpen);
  const dismiss = useOnboardingStore((s) => s.dismiss);

  if (!open) return null;

  return (
    <div className="onboarding-root" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="onboarding-overlay" onClick={dismiss} />
      <div className="onboarding-panel">
        <h2 id="onboarding-title" className="onboarding-title">言葉帖の学び方</h2>
        <p className="onboarding-lede">
          ここは「先に理解、それから練習」の学習帖です。<br />
          言葉は3つの次元で身につきます。
        </p>

        <ul className="onboarding-dims">
          <li>
            <span className="onboarding-dim-letter dim-R">R</span>
            <span className="onboarding-dim-name">認識（にんしき）</span>
            <span className="onboarding-dim-desc">見て・聞いて意味が分かる</span>
          </li>
          <li>
            <span className="onboarding-dim-letter dim-P">P</span>
            <span className="onboarding-dim-name">産出（さんしゅつ）</span>
            <span className="onboarding-dim-desc">意味から正しい言葉を引き出せる</span>
          </li>
          <li>
            <span className="onboarding-dim-letter dim-U">U</span>
            <span className="onboarding-dim-name">運用（うんよう）</span>
            <span className="onboarding-dim-desc">文の中で正しく使える</span>
          </li>
        </ul>

        <p className="onboarding-foot">
          新しい言葉はまず R から、慣れてくると P・U が解放されます。
        </p>

        <button className="btn" onClick={dismiss}>始める</button>
      </div>
    </div>
  );
}
