# the file formats

## the status file format

the pipeline-status format (the files your pipelines write into the status folder) moved to the repo's root: [../FORMAT.md](../FORMAT.md). it is the agreement between writers and every mod that reads them, so it no longer lives in one mod.

## conversations

the mod itself writes one more kind of file, one per conversation, in `~/.claude/console/sessions/<session id>.json`: on this computer only, never in the status folder, because it holds what you typed. only that conversation writes its file, one write after another, and never while holding up a turn; it writes once more when the conversation ends. the pane reads them to know which conversations ask you something. a file there that does not parse (caught halfway through a write) keeps what the last read had; one whose `id` is not its file name is named at the bottom of the pane and left out.

```json
{
  "format": "session-status",
  "version": 1,
  "id": "4f0c…",
  "updated": "2026-10-27T12:00:00.000Z",
  "state": "waiting",
  "title": "the app's own title, or the first line you typed",
  "isAppTitle": true,
  "project": "puppy-mods",
  "recap": "what is now true and where it stands",
  "ask": "the question the last turn left you, or null"
}
```

`state` is `running` (a turn is going), `waiting` (the last turn asked you something), `done` or `error`. when the conversation ends, a `running` file becomes `done`; a `/clear` also turns `waiting` into `done`. a `running` file older than six hours is shown as `done` anyway (the conversation stopped without ending, a crash). `isAppTitle` is `true` once `title` is the app's own; `isWrapRecap` is `true` while `recap` is a wrap_up's (a later turn without one keeps it, never the answer's first line); `isFork` is `true` for a conversation forked from another, or one the app named as a side chat (`Side chat`, `btw: …`), which the pane leaves out; it also leaves out a file whose app title names a side chat without `isFork`. `host` is optional. files older than three days are not shown, except a `waiting` one, shown for two weeks; they stay in the folder.
