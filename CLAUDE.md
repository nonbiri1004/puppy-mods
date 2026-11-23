# puppy-mods

lofi puppy 維護的 Claude Code 小 mod，一個 mod 一個資料夾。這個 repo 是**公開的**：不放私人路徑、金鑰或品牌文件。

## 規則
- **畫任何 pane、band 或圖之前，先讀 `STYLE.md`**，照著做。新的 mod 長得跟 `puppy-sessions` 一樣。
- **白白要出現在新的地方（新的 pane、新的 surface、新的大小）之前，先讀 baibai-brand 的 `docs/品牌風格.md`〈白白的造型〉和 `docs/characters.md`**。repo 裡現有的寫法不一定是品牌規定；兩邊不一樣時照品牌，在 PR 裡說。
- 產生出來的檔案（`<mod>/hooks/puppy.ts`、`<mod>/hooks/puppy-blocks.ts`、`brand.lock.json`）絕對不要手改；改 baibai-brand 再同步。
- 每個 mod 的測試放在 `<mod>/tests/`；開 PR 前先跑 `claude plugin test <mod>` 和 `claude plugin validate <mod>`。
- mod 有改動時，要調高它 `.claude-plugin/plugin.json` 裡的 `version`。
- git commit 訊息用英文，動詞開頭。PR 標題和說明用簡單的英文。回覆使用者用繁體中文。
- Codex 會把這個檔案當成 `AGENTS.md`（symlink）來讀。Codex 不改這個檔案或 `STYLE.md`；想改的話，在 PR 說明裡提議。

## 使用者實際跑的是什麼，以及怎麼試改動
- 使用者從 GitHub（`nonbiri1004/puppy-mods`，`main` 分支）安裝這些 mod。Claude Code 會在 `~/.claude/plugins/cache/` 留一份副本，所以使用者只會跑到已經 merge 的內容，版本是 `plugin.json` 裡的 `version`。在這個資料夾切換分支，不會改變他們跑的東西。
- 改動要等 PR merge **而且** `version` 調高之後，才會到使用者手上。接著他們要執行 `claude plugin marketplace update puppy-mods` 和 `claude plugin update <mod>@puppy-mods`，再重新啟動。
- 在 worktree 裡工作（`git worktree add .claude/worktrees/<name> -b <name> origin/main`）。絕不在主資料夾切換分支：其他 session 和 Codex 都在用它。
- merge 之前想試改動：在終端機執行 `claude --plugin-dir .claude/worktrees/<name>/<mod>`，或把 `CLAUDE_CODE_PLUGIN_DIRS` 設成那個資料夾的絕對路徑。那份副本只在那個 session 取代已安裝的同名 mod。每次修改後執行 `/reload-plugins`。
