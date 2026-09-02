#!/bin/bash
# PreToolUse(Bash) hook for pipeline BUILD/HEAL phases: denies shell commands
# that would bypass the orchestrator's evidence chain.
#   exit 2 = block the tool action (reason goes to stderr, shown to Claude)
#   exit 0 = allow
#
# WHY: the engine (run-pipeline.sh) captures the candidate tree, runs the
# frozen verification matrix, has it security-scanned and reviewed, and only
# THEN commits and publishes the run branch with a compare-and-swap ref
# update. A build-phase model that commits, pushes, resets, rewrites refs,
# publishes a package, pulls code from the network, deletes .git, or writes
# into the .pipeline/ ledger directory breaks that chain. This hook stops
# those at attempt time so they never surface as a late scanner/commit halt.
#
# WHAT IS DENIED (anywhere in a `;` `&&` `||` `|` `&` / newline chain, after
# stripping `sudo`, `env`, `FOO=bar`, `nohup`, `time`, `timeout`, `npx`,
# `xargs` … wrappers; `bash -c`, `eval`, `$(…)`, backticks, `find -exec` and
# shell heredocs are recursed into):
#   - git commit/push/pull/reset/checkout/switch/restore/rebase/merge/stash/
#     clean/tag/worktree/update-ref/filter-branch/am/cherry-pick/revert and
#     git branch -d/-D/-m/-M/-f. Read-only git (status, diff, log, show, blame,
#     grep, ls-files, rev-parse) and `git add` / `git rm --cached` stay allowed.
#   - npm/pnpm/yarn/cargo publish, twine upload, gh release.
#   - curl, wget, nc/ncat/netcat, ssh, pip download; scp/rsync to a remote.
#   - rm targeting /, ~, $HOME, ., .git or .pipeline.
#   - any redirect/tee/cp/mv/mkdir/sed -i/… into the .pipeline/ state dir.
#
# FAILS CLOSED: unparseable hook input, a command name or git subcommand that
# is computed at runtime ($VAR, $(…)), a shell fed from a pipe/redirect, and
# inline node/python/perl/ruby code that merely MENTIONS a denied pattern are
# all denied (the last three are pattern scans, not parses, so a benign
# `python -c "print('git push')"` is denied; run such things directly).
# Out of the hook's sight, by design: the contents of script files
# (`bash setup.sh`), git aliases, and paths assembled from variables — the
# engine's commit-integrity and ledger checks remain the authoritative gate.

INPUT=$(cat)

JS=$(cat <<'EOF'
const GIT_DENY = "commit push pull reset checkout switch restore rebase merge stash clean tag worktree update-ref filter-branch am cherry-pick revert".split(" ");
const NET = /^(curl|wget|nc|ncat|netcat|ssh)$/, REMOTE = /^(?:[\w.-]+@)?[\w.-]+:|^rsync:\/\//;
const SHELLS = /^(sh|bash|zsh|dash|ksh|ash|su)$/, PIPE_DIR = /(^|\/)\.pipeline(\/|$)/;
const MUTATORS = /^(tee|cp|mv|rm|rmdir|mkdir|touch|truncate|chmod|chown|chgrp|ln|dd|install|rsync|tar|unzip|shred|sponge|cd|pushd)$/;
const INLINE = { node: /^(-e|--eval|-p|--print)$/, python: /^-c$/, perl: /^-[eE]$/, ruby: /^-e$/, php: /^-r$/ };
// wrappers stripped from the front of a segment: name -> flags that consume the next token
const WRAP = { sudo: "-u -g -h -p -C -D -r -t -T -U -R", doas: "-u -C", env: "-u -C -S", command: "", exec: "", builtin: "", nohup: "", time: "", nice: "-n", ionice: "-c -n -p", timeout: "-s -k", npx: "-p --package -c --call", xargs: "-n -I -L -P -s -d -E -a -l -i", stdbuf: "-o -e -i", busybox: "" };
const RAW = [ // fail-closed pattern scan for code the hook cannot parse
  [/\bgit\b[^|;&\n]{0,80}\b(commit|push|pull|reset|checkout|switch|restore|rebase|merge|stash|clean|tag|worktree|update-ref|filter-branch|am|cherry-pick|revert)\b/, "run a mutating git command"],
  [/\b(npm|pnpm|yarn|cargo)\b.{0,40}\bpublish\b|\btwine\b.{0,40}\bupload\b|\bgh\b.{0,40}\brelease\b/, "publish a package or release"],
  [/\b(curl|wget|nc|ncat|netcat|ssh|scp|rsync)\b/, "reach the network"],
  [/\brm\b.{0,80}(\.git\b|\s\/(\s|$|\*)|~)/, "delete .git or the filesystem root"],
  [/(^|[\/\s"'`])\.pipeline(\/|$)/, "touch the .pipeline/ state directory"]];
const PIPE_MSG = c => `${c} touching the .pipeline/ state directory is not permitted — it holds the orchestrator's ledger and evidence (read it with cat/ls if needed, never modify it)`;
const OPAQUE = "cannot be verified by the pipeline guard (fails closed) — spell the command out literally";
const base = x => x.replace(/^.*\//, "").replace(/\.exe$/i, "");
const pos = a => { const o = []; let dd = false; for (const x of a) { if (dd || !x.startsWith("-")) o.push(x); else if (x === "--") dd = true; } return o; };

// Split a command string into pipeline segments, honouring quotes, comments,
// heredocs, line continuations, `$(…)` and backticks (collected as nested commands).
function split(S) {
  const segs = []; let w = "", words = [], nested = [], piped = false, pend = [], lineStart = 0, i = 0; const n = S.length;
  const push = () => { if (w) { words.push(w); w = ""; } };
  const end = op => { push(); if (words.length || nested.length) segs.push({ w: words, nested, heredoc: [], piped }); words = []; nested = []; piped = op === "|" || op === "|&"; };
  const grab = close => { let d = 1, j = i; for (; j < n; j++) { if (close === "`") { if (S[j] === "`") break; } else if (S[j] === "(") d++; else if (S[j] === ")" && --d === 0) break; } const inner = S.slice(i, j); i = j + 1; nested.push(inner); w += "\0"; };
  while (i < n) {
    const c = S[i], nx = S[i + 1];
    if (c === "'") { const j = S.indexOf("'", i + 1); w += S.slice(i + 1, j < 0 ? n : j); i = (j < 0 ? n : j) + 1; continue; }
    if (c === '"') { i++; while (i < n && S[i] !== '"') { if (S[i] === "\\" && i + 1 < n) { w += S[i + 1]; i += 2; } else if (S[i] === "$" && S[i + 1] === "(") { i += 2; grab(")"); } else if (S[i] === "`") { i++; grab("`"); } else w += S[i++]; } i++; continue; }
    if (c === "\\") { if (nx === "\n") push(); else w += nx || ""; i += 2; continue; }
    if (c === "$" && nx === "(") { i += 2; grab(")"); continue; }
    if (c === "`") { i++; grab("`"); continue; }
    if (c === "#" && !w) { while (i < n && S[i] !== "\n") i++; continue; }
    if (c === "\n") { end(";"); i++;
      while (pend.length) { const d = pend.shift(); let body = "";   // heredoc body: data for every segment on that line
        while (i < n) { let j = S.indexOf("\n", i); if (j < 0) j = n; const line = S.slice(i, j); i = j + 1; if (line.replace(/^\t+/, "") === d) break; body += line + "\n"; }
        for (let k = lineStart; k < segs.length; k++) segs[k].heredoc.push(body); }
      lineStart = segs.length; continue; }
    if (c === "&" && nx === "&") { end("&&"); i += 2; continue; }
    if (c === "|" && nx === "|") { end("||"); i += 2; continue; }
    if (c === "|" && !w.endsWith(">")) { const op = nx === "&" ? "|&" : "|"; end(op); i += op.length; continue; }
    if (c === "&" && nx !== ">" && !/[<>]$/.test(w)) { end("&"); i++; continue; }
    if (c === ";" || c === "(" || c === ")") { end(c); i++; continue; }
    if (c === "<" && nx === "<" && S[i + 2] !== "<") { push(); i += 2; if (S[i] === "-") i++; while (S[i] === " " || S[i] === "\t") i++;
      let d = ""; if (S[i] === "'" || S[i] === '"') { const j = S.indexOf(S[i], i + 1); d = S.slice(i + 1, j < 0 ? n : j); i = (j < 0 ? n : j) + 1; } else while (i < n && !/[\s;|&<>]/.test(S[i])) d += S[i++];
      pend.push(d); continue; }
    if (c === "{" && nx === "}" && !w) { w = "{}"; i += 2; continue; }
    if (/\s/.test(c) || ((c === "{" || c === "}") && !w)) { push(); i++; continue; }
    w += c; i++;
  }
  end(""); return segs;
}

function analyze(src, depth) {
  if (depth > 6) return "command nesting is too deep and " + OPAQUE;
  for (const seg of split(src)) {
    for (const nst of seg.nested) { const r = analyze(nst, depth + 1); if (r) return r; }
    const argv = [], redir = []; let input = false;   // peel redirections off the word list
    for (let k = 0; k < seg.w.length; k++) { const t = seg.w[k]; let m;
      if ((m = /^(\d*|&)>>?[|&]?(.*)$/.exec(t))) redir.push(m[2] || seg.w[++k] || "");
      else if ((m = /^\d*<{1,3}(.*)$/.exec(t))) { if (!m[1]) k++; input = true; }
      else argv.push(t); }
    for (const t of redir) if (PIPE_DIR.test(t)) return PIPE_MSG("a redirect");
    const r = evalArgv(argv, { piped: seg.piped, input, heredoc: seg.heredoc, depth }); if (r) return r;
  }
  return null;
}

function evalArgv(a, ctx) {
  for (;;) {   // strip env assignments and transparent wrappers
    if (!a.length) return null;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(a[0])) { a = a.slice(1); continue; }
    const c = base(a[0]); if (!(c in WRAP)) break;
    const takes = WRAP[c].split(" "); a = a.slice(1);
    while (a.length && a[0].startsWith("-") && a[0] !== "--") { const f = a.shift(); if (takes.includes(f)) a.shift(); }
    if (c === "timeout") a.shift();
    if (a[0] === "--") a.shift();
  }
  if (/[\0$]/.test(a[0])) return `a command name computed at runtime (${a[0].replace(/\0/g, "$(…)")}) ` + OPAQUE;
  const cmd = base(a[0]), args = a.slice(1), p = pos(args);
  if (cmd === "git") {
    let k = 0; while (k < args.length && args[k].startsWith("-")) { if (/^(-C|-c|--git-dir|--work-tree|--namespace|--config-env)$/.test(args[k])) k++; k++; }
    const sub = args[k];
    if (!sub) return ctx.piped ? "git with its subcommand supplied from stdin " + OPAQUE : null;
    if (/[\0$]/.test(sub)) return "a git subcommand computed at runtime " + OPAQUE;
    if (GIT_DENY.includes(sub)) return `git ${sub} is not permitted in a build phase — the orchestrator commits, checkpoints and publishes the reviewed tree; only read-only git (status, diff, log, show, blame, grep, ls-files, rev-parse) and git add are allowed`;
    if (sub === "branch" && args.slice(k + 1).some(x => /^-[a-zA-Z]*[dDmMf]/.test(x) || /^--(delete|move|force)$/.test(x))) return "git branch -d/-D/-m/-M/-f is not permitted in a build phase — the run branch is engine-owned";
    return null;
  }
  if (/^(npm|pnpm|yarn|cargo)$/.test(cmd) && p.includes("publish")) return `${cmd} publish is not permitted in a build phase — nothing may be published from an unreviewed candidate`;
  if ((cmd === "twine" && p.includes("upload")) || (cmd === "gh" && p.includes("release"))) return `${cmd} ${p[0]} is not permitted in a build phase — nothing may be published from an unreviewed candidate`;
  if (NET.test(cmd)) return `${cmd} is not permitted in a build phase — build/heal phases must not fetch from, upload to, or open shells on remote hosts`;
  if (/^(scp|sftp|rsync)$/.test(cmd) && args.some(x => (!x.startsWith("-") && REMOTE.test(x)) || /^(-e|--rsh)(=|$)/.test(x))) return `${cmd} to a remote host is not permitted in a build phase`;
  const pipArgs = /^python[\d.]*$/.test(cmd) && args[0] === "-m" && args[1] === "pip" ? args.slice(2) : /^pip[\d.]*$/.test(cmd) ? args : null;
  if (pipArgs && pos(pipArgs)[0] === "download") return "pip download is not permitted in a build phase — build/heal phases must not fetch arbitrary artifacts";
  if (cmd === "rm") for (const t of p) { const u = t.replace(/\/+$/, "") || "/";
    if (/^(\/|\/\*|\.|\.\.)$/.test(u) || /^(~|\$HOME|\$\{HOME\})(\/\*?)?$/.test(u) || /(^|\/)\.git(\/|$)/.test(u) || PIPE_DIR.test(u)) return `rm targeting ${t} is not permitted in a build phase`; }
  if (MUTATORS.test(cmd) && args.some(x => PIPE_DIR.test(x))) return PIPE_MSG(cmd);
  if (/^(sed|perl)$/.test(cmd) && args.some(x => /^-[a-zA-Z]*i/.test(x) || /^--in-place/.test(x)) && args.some(x => PIPE_DIR.test(x))) return PIPE_MSG(cmd + " -i");
  if (cmd === "eval") return analyze(args.join(" "), ctx.depth + 1);
  if (SHELLS.test(cmd)) {
    const ci = args.findIndex(x => /^-[a-zA-Z]*c/.test(x));
    if (ci >= 0 && args[ci + 1] != null) return analyze(args[ci + 1], ctx.depth + 1);
    for (const b of ctx.heredoc) { const r = analyze(b, ctx.depth + 1); if (r) return r; }
    if (!ctx.heredoc.length && !p.length && (ctx.piped || ctx.input)) return `${cmd} reading its commands from a pipe or redirect ` + OPAQUE;
    return null;   // `bash script.sh`: the script body is outside the hook's view
  }
  if (cmd === "find") { const ei = args.findIndex(x => /^-(exec|execdir|ok|okdir)$/.test(x));
    if (ei >= 0) { const e = args.findIndex((x, j) => j > ei && (x === ";" || x === "+")); return evalArgv(args.slice(ei + 1, e < 0 ? undefined : e), { ...ctx, piped: false }); } }
  const key = cmd.replace(/[\d.]+$/, "");
  if (INLINE[key]) { const ii = args.findIndex(x => INLINE[key].test(x)); const code = ii >= 0 ? args[ii + 1] : null;
    if (code != null) for (const [re, why] of RAW) if (re.test(code)) return `inline ${cmd} code appears to ${why}; the guard cannot parse code, so it fails closed — run the command directly if it is benign`; }
  return null;
}

let d = ""; process.stdin.on("data", c => d += c);
process.stdin.on("end", () => {
  let j; try { j = JSON.parse(d); } catch (e) { process.exit(3); }   // parse failure -> caller fails closed
  if (j.tool_name && j.tool_name !== "Bash") return;                 // matcher should route only Bash here
  const cmd = j.tool_input && j.tool_input.command; if (typeof cmd !== "string" || !cmd.trim()) return;
  try { const r = analyze(cmd, 0); if (r) process.stdout.write(r); } catch (e) { process.stderr.write(String(e) + "\n"); process.exit(3); }
});
EOF
)

REASON=$(printf '%s' "$INPUT" | node -e "$JS") || {
  echo "BLOCKED: pipeline guard could not parse or analyze the hook input (node missing or bad JSON); failing closed." >&2
  exit 2
}

if [ -n "$REASON" ]; then
  echo "pipeline guard: $REASON" >&2
  echo "Build/heal phases may edit files, read git state and run the project's tests; the orchestrator commits the reviewed tree." >&2
  exit 2
fi

exit 0
