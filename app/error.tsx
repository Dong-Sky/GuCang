"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Keep the error boundary quiet in production while still making it observable in Vercel logs.
    console.error("Gucang route error", { digest: error.digest });
  }, [error.digest]);

  return (
    <main className="route-error-shell">
      <div className="route-error-card">
        <span className="feedback-icon feedback-error" aria-hidden="true">!</span>
        <span className="eyebrow">页面加载中断</span>
        <h1>谷仓暂时没打开</h1>
        <p>刚才的操作可能已经保存。重新加载即可继续，已经创建的家庭空间不会重复创建。</p>
        <div className="route-error-actions">
          <button className="primary-button" type="button" onClick={() => reset()}>重新加载</button>
          <button className="secondary-button" type="button" onClick={() => window.location.reload()}>刷新页面</button>
        </div>
      </div>
    </main>
  );
}
