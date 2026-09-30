---
title: "Live Sessions"
description: "Real-time collaboration between browsers: shared workspaces, peer queries, cursors, and forking, with no server in between"
---

Share Live connects two or more Duck-UI browsers directly to each other. Someone else joins your workspace from their own browser, sees your tabs and dashboards, watches your cursor, and can query the data you chose to share. Queries they run execute **in your browser**, and results stream straight back to them.

There is no server in the middle. No SQL executes anywhere but the participants' browsers, and no analytical data is stored anywhere but the participants' browsers.

## Starting a session

Click the radio icon in the rail, under Data, to open the **Live session** page. It explains what a session is and has two cards: **Host a session** and **Join a session**. Host from the first one:

1. Name the session and pick a **data access** mode (below).
2. Duck-UI produces an **invite link**. Send it to the person you want in the session, over whatever channel you already trust.
3. They open it, click **Join**, and get a **connection code** back. They send that code to you.
4. Paste their code and click **Connect**. You are live.

While a session runs, the same page lists who is in it and what is shared, and is where the host removes a participant, withdraws data, invites someone else or ends the session. The rail icon shows the session from any screen: amber while an invite is waiting, green with the number of guests once connected. Leaving the page does not end the session.

Two pastes, no account, no server. Each invite works exactly once; **Invite someone else** mints a fresh one per person.

> **Why the code dance?** The invite and answer carry the network handshake (WebRTC) that would normally need a signaling server. Carrying them by hand is what makes "no backend, ever" literally true. Both blobs travel in the URL fragment (`#live=…`), which browsers never send to any server.

## Data access modes

Sharing your workspace and sharing your data are different decisions, so the host form makes you pick:

| Mode | What guests can query |
|------|----------------------|
| **No data access** | nothing. They see tabs, editors, and dashboards, not data |
| **All data** | every table on the connection, **including tables you add while the session is live** |
| **Share selected tables** | exactly the tables you tick |

With **All data**, a table you import or create mid-session is picked up automatically, copied into the shared engine, and appears in every guest's explorer within a moment. Copies are snapshots: later changes to a shared table's rows do not re-sync.

### What sharing actually shares

Shared tables are **copied into a separate, isolated DuckDB engine** in your browser, hardened before a single guest query runs: no file access, no network access, no extensions, a memory ceiling, configuration locked. Guest SQL runs there and only there, never in your own session.

- **Read-only.** Writable shares do not exist.
- **Result limits.** Every guest query is capped (rows, bytes, time) by the limit you set.
- **Revocable.** Withdraw access or remove a participant at any time; in-flight queries fail immediately.
- **Credentials never travel.** Database passwords and API keys never leave your browser, whatever you share. A guest learns that a source exists and what tables it has, never how to reach it.

## Joining a session

Open the invite link (or paste the link or code into **Join a session** on the Live session page), send back your connection code, and you are in. The shared workspace appears in your tabs, shared data mounts as a connection under **Session**, and the host's tables show up in your explorer.

Joining grants nothing by itself: everything you can query was explicitly shared by the host, and it disappears the moment the session ends or access is revoked.

## Co-editing

SQL tabs, notebooks, and dashboards are collaborative while a session runs:

- **Character-level merging.** Two people can type in the same editor at once; edits merge like in Google Docs, and your caret and undo history stay yours.
- **Visible cursors.** Every participant has a colored caret with their name above it, plus selection highlights.
- **Notebooks merge per cell.** Different cells never conflict; the same cell merges by character. Cell **results stay local** to whoever ran them; results are never synced.
- **Dashboards co-edit live.** Anyone with the dashboard open in Edit mode types into the same source; everyone else watches the report re-render.

## Fork: leave with your own copy

A guest can **fork** shared tables: copy them into their own engine (in-memory, or an OPFS database to keep them beyond the tab). Click **Fork** next to the shared data on the Live session page, pick tables and a destination, done.

After a fork the copy is fully independent. The host can revoke, disconnect, or close the laptop; the forked tables keep working. The host's result limits apply to what crosses, and the dialog says honestly when a copy was truncated.

## Disconnects

A transient network blip gets a grace window and usually heals on its own. If the link truly drops, the rail icon turns red and the Live session page tells you what survives: **everything local**: your workspace, results, and forked tables. Rejoining takes a fresh invite (there is no server to renegotiate through), and the shared workspace catches up automatically when you are back.

## Networking

Direct peer connections work on most networks out of the box, using a public STUN server to discover addresses. Deployments can override everything:

| Variable | Meaning |
|----------|---------|
| `DUCK_UI_STUN_URLS` | comma-separated STUN URLs. Set **empty** for LAN-only or air-gapped deployments |
| `DUCK_UI_TURN_URLS` | optional TURN relay for strict NATs |
| `DUCK_UI_TURN_USERNAME` / `DUCK_UI_TURN_CREDENTIAL` | relay credentials |

When a TURN relay is configured, the host form offers **Test it**: Duck-UI asks the relay for a relay-only candidate, which exercises the URL, the credentials, and the allocation path, the same path a real session uses behind a symmetric NAT. A relay only ever sees encrypted traffic.

## Security posture, in short

- Every peer connection is DTLS-encrypted end to end.
- Every inbound message is schema-validated before any field is read; malformed frames are dropped and counted.
- Guest SQL is screened, then runs in the isolated engine either way. The isolation is the boundary; the screen is for legible error messages.
- Credentials have no field to travel in: the wire types simply cannot carry them.
- Invites and shares ride URL fragments, never query strings, so they stay out of server logs.

The full threat model, including honest limitations, lives in the repository at `docs/architecture/security.md`.
