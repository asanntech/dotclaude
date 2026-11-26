// 証跡動画の一括再生シナリオの雛形。
// このファイルを複製した scenario.js の中身を、browser_run_code_unsafe の code に渡して実行する。
// （filename 指定はプロジェクト外のファイルを読めないため使わない）
// 書き換えるのは「設定」と「手順」の2か所だけ。after の録画では LABEL だけを変える（DEVICE も変えない）。
async (page) => {
  // ===== 設定 =====
  const OUT_DIR = '/abs/path/to/output'; // 出力先（絶対パス）
  const LABEL = 'before';                // before / after など。動画のファイル名になる
  const BASE_URL = 'http://localhost:3000';
  const DEVICE = 'desktop';              // desktop / iphone / ipad。before と after で変えない
  const HOLD = 1200;       // 各手順のあと、テロップを読ませる時間（ms）
  const RESULT_HOLD = 2000; // 最後の結果を見せる時間（ms）

  // ===== デバイスのプリセット（エミュレーション。実機ではない） =====
  // browser_run_code_unsafe から playwright.devices を使える保証がないので、ここに直接書く
  const DEVICES = {
    desktop: { viewport: { width: 1280, height: 720 } },
    iphone: {
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    },
    ipad: {
      viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    },
  };
  const device = DEVICES[DEVICE];
  if (!device) throw new Error(`DEVICE "${DEVICE}" は未定義です（${Object.keys(DEVICES).join(' / ')}）`);
  const SIZE = device.viewport;

  // ===== 録画用コンテキスト =====
  const src = page.context();
  const browser = src.browser();
  if (!browser) {
    throw new Error('browser() が null です。Playwright MCP の起動引数に --isolated を付けてください。');
  }
  const ctx = await browser.newContext({
    ...device,
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
          'position:fixed', 'left:50%', 'bottom:clamp(16px,4vh,32px)', 'transform:translateX(-50%)',
          'z-index:2147483647', 'max-width:90%', 'padding:clamp(8px,2vw,12px) clamp(12px,4vw,24px)', 'border-radius:8px',
          'background:rgba(0,0,0,.82)', 'color:#fff', 'pointer-events:none',
          // 画面幅に合わせて縮める（スマホでもはみ出さない）
          'font:600 clamp(14px,4.5vw,22px)/1.4 -apple-system,"Hiragino Sans","Noto Sans JP",sans-serif',
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
  // タッチ対応のデバイスでは、クリックではなくタップとして操作する
  const click = (text, locator) => step(text, async () => {
    await highlight(locator);
    if (device.hasTouch) await locator.tap();
    else await locator.click();
  });
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
