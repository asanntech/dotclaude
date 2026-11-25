// 証跡動画の一括再生シナリオの雛形。
// このファイルを複製した scenario.js の中身を、browser_run_code_unsafe の code に渡して実行する。
// （filename 指定はプロジェクト外のファイルを読めないため使わない）
// 書き換えるのは「設定」と「手順」の2か所だけ。after の録画では LABEL だけを変える。
async (page) => {
  // ===== 設定 =====
  const OUT_DIR = '/abs/path/to/output'; // 出力先（絶対パス）
  const LABEL = 'before';                // before / after など。動画のファイル名になる
  const BASE_URL = 'http://localhost:3000';
  const SIZE = { width: 1280, height: 720 };
  const HOLD = 1200;       // 各手順のあと、テロップを読ませる時間（ms）
  const RESULT_HOLD = 2000; // 最後の結果を見せる時間（ms）

  // ===== 録画用コンテキスト =====
  const src = page.context();
  const browser = src.browser();
  if (!browser) {
    throw new Error('browser() が null です。Playwright MCP の起動引数に --isolated を付けてください。');
  }
  const ctx = await browser.newContext({
    viewport: SIZE,
    recordVideo: { dir: `${OUT_DIR}/.raw`, size: SIZE },
    storageState: await src.storageState(), // 下見で得たログイン状態を引き継ぐ
  });

  // テロップ: sessionStorage に保持し、ページを読み込むたびに描き直す
  await ctx.addInitScript(() => {
    const render = (text) => {
      if (!document.body) return;
      let el = document.getElementById('__evidence_caption');
      if (!el) {
        el = document.createElement('div');
        el.id = '__evidence_caption';
        el.style.cssText = [
          'position:fixed', 'left:50%', 'bottom:32px', 'transform:translateX(-50%)',
          'z-index:2147483647', 'max-width:90%', 'padding:12px 24px', 'border-radius:8px',
          'background:rgba(0,0,0,.82)', 'color:#fff', 'pointer-events:none',
          'font:600 22px/1.4 -apple-system,"Hiragino Sans","Noto Sans JP",sans-serif',
          'white-space:pre-wrap', 'text-align:center', 'box-shadow:0 4px 16px rgba(0,0,0,.3)',
        ].join(';');
        document.body.appendChild(el);
      }
      el.textContent = text;
      el.style.display = text ? 'block' : 'none';
    };
    window.__caption = (text) => {
      try { sessionStorage.setItem('__caption', text); } catch {}
      render(text);
    };
    const restore = () => {
      try { render(sessionStorage.getItem('__caption') || ''); } catch {}
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', restore);
    else restore();
  });

  const startedAt = Date.now();
  const p = await ctx.newPage();
  const video = p.video();

  // ===== ヘルパー =====
  const caption = (text) => p.evaluate((t) => window.__caption && window.__caption(t), text).catch(() => {});

  // 操作対象に枠線を付けて、見る人に「どこを触るか」を示す
  const highlight = async (locator) => {
    await locator.scrollIntoViewIfNeeded();
    await locator.evaluate((el) => {
      const prev = [el.style.outline, el.style.outlineOffset];
      el.style.outline = '3px solid #ff3b30';
      el.style.outlineOffset = '2px';
      setTimeout(() => { [el.style.outline, el.style.outlineOffset] = prev; }, 600);
    });
    await p.waitForTimeout(300);
  };

  // テロップを出す → 操作 → テロップを出し直す（ページ移動対策）→ 読ませる時間だけ待つ
  const step = async (text, action, hold = HOLD) => {
    await caption(text);
    await action();
    await caption(text);
    await p.waitForTimeout(hold);
  };
  const click = (text, locator) => step(text, async () => { await highlight(locator); await locator.click(); });
  const fill = (text, locator, value) => step(text, async () => { await highlight(locator); await locator.fill(value); });
  const select = (text, locator, value) => step(text, async () => { await highlight(locator); await locator.selectOption(value); });
  // 結果の確認。waitFor で表示を待ってから、強調して長めに見せる
  const result = (text, locator) => step(text, async () => { await locator.waitFor(); await highlight(locator); }, RESULT_HOLD);

  let trimStart = 0;
  let error;
  try {
    await p.goto(BASE_URL);
    trimStart = (Date.now() - startedAt) / 1000; // 冒頭の about:blank 区間。変換時に削る

    // ===== 手順（下見の結果から書く） =====
    // 固定の waitForTimeout は使わない。待つのは locator.waitFor() / p.waitForURL() など条件付きの待機だけ。
    //
    // await click('① ヘッダーの「ログイン」を押す', p.getByRole('button', { name: 'ログイン' }));
    // await fill('② メールアドレスを入力', p.getByLabel('メールアドレス'), 'user@example.com');
    // await click('③ 「送信」を押す', p.getByRole('button', { name: '送信' }));
    // await result('結果: 「ようこそ」と表示される', p.getByText('ようこそ'));
  } catch (e) {
    error = e;
  } finally {
    await ctx.close();
  }

  const raw = `${OUT_DIR}/.raw/${LABEL}${error ? '-failed' : ''}.webm`;
  await video.saveAs(raw);
  await video.delete();
  if (error) throw new Error(`録画に失敗しました（途中までの動画: ${raw}）: ${error.message}`);
  return { raw, trimStart: Number(trimStart.toFixed(2)) };
}
