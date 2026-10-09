# Local MCP server (desktop app, opt-in)

The desktop app can let AI apps on the **same computer** (for example a desktop chat app or a code editor
with MCP support) read the open document and propose suggestions the user reviews. This implements plan
§9.7. It is **off by default**, desktop only (Windows, macOS, Linux), and never reachable from the network.

Code: `packages/ai/native/src/mcp.rs` (server, keys, limits), `apps/shell/src-tauri/src/mcp.rs` (Tauri
commands, forwarding to the WebView), `apps/demo/src/ai/mcp.ts` (settings UI and tool execution).

## Using it

1. Review › Assistant › **AI Models** → **Connect AI apps on this computer (MCP)** → turn on
   **Allow AI apps to connect**. The app starts listening on `http://127.0.0.1:<random port>/mcp`.
2. Choose an access level and **Create key for this document**. The key is shown **once**, with a ready
   settings snippet:

   ```json
   {
     "mcpServers": {
       "lucid-sentence": {
         "url": "http://127.0.0.1:53817/mcp",
         "headers": { "Authorization": "Bearer lsk_ab3k9m2q_…" }
       }
     }
   }
   ```

3. Paste it into the AI app. A status-bar chip, **AI access on**, shows while the server runs; recent
   activity (time, key name, tool, outcome; never document text) is listed in the same panel.
4. **Stop all AI access** revokes every key and closes the port immediately. Turning the switch off also
   closes the port (keys stay until revoked). The server never starts on its own at launch.

## Security design

| Concern                  | Design                                                                                                                                                                                                                                                                                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Network exposure         | Binds `127.0.0.1` only, on a random port (`TcpListener::bind("127.0.0.1:0")`). No IPv6 wildcard, no LAN.                                                                                                                                                                                                                                              |
| DNS rebinding / browsers | Every request must carry `Host: 127.0.0.1:<port>` or `localhost:<port>`, and any request with an `Origin` header (that is, from a web page) gets **403**. Local MCP clients don't send one.                                                                                                                                                           |
| Authentication           | `Authorization: Bearer lsk_<keyId>_<secret>`. The secret is 256 bits from the OS RNG (`getrandom`), base64url. Requests without a valid key get 401.                                                                                                                                                                                                  |
| Key storage              | Only `SHA-256(install salt ‖ secret)` is stored, in the **OS keystore** (macOS Keychain, Windows Credential Manager, Linux kernel keyring via `keyring` 3.6), falling back to a user-only (0600) file when no keystore is available. Comparison is constant-time. The install salt lives in app data, so a copied hash is useless on another install. |
| Scope                    | Each key is bound to **one document id** and a permission class: `read` < `comment` < `suggest` < `edit`. `tools/list` shows only the tools a key may use. Calls for a document that isn't open fail. Keys can expire (TTL) and be revoked one by one or all at once.                                                                                 |
| What the document stores | Only a random document id. With .docx saving (engine milestone) it goes in a custom document property, `LucidSentence.DocumentId`; no key, hash, or endpoint is ever written into the file. Until then the id is kept in local app storage.                                                                                                           |
| Edits                    | `suggest_replace` shows a suggestion card (accept/reject); nothing changes until the user accepts. `commands_run` (edit level) asks the user to **Allow** or **Deny** each command in the app. `comment_add` adds a comment authored "AI · <key name>".                                                                                               |
| Limits                   | 20 requests/s burst and 600/min per key, 60 write calls/min, 1 MB request bodies, 30 s read timeout, 120 s for a tool that waits on the user.                                                                                                                                                                                                         |
| Prompt injection         | Tool descriptions tell clients that document text is untrusted content. The app never executes text from a client: commands must be registry ids, validated, and confirmed.                                                                                                                                                                           |
| Privacy                  | No telemetry. The audit log is in memory and records tool names and outcomes, not content.                                                                                                                                                                                                                                                            |

## Protocol

MCP Streamable HTTP, protocol version `2026-07-28`, JSON responses (no SSE stream needed for these
tools). Supported methods: `initialize`, `ping`, `tools/list`, `tools/call`; notifications get 202.

| Tool               | Permission | Arguments                    | Result                                            |
| ------------------ | ---------- | ---------------------------- | ------------------------------------------------- |
| `document_read`    | read       | —                            | `{ text }`                                        |
| `document_outline` | read       | —                            | `{ headings: [{ level, text }] }`                 |
| `selection_get`    | read       | —                            | `{ text }`                                        |
| `commands_search`  | read       | `query`                      | `{ commands: [{ id, label, where, available }] }` |
| `comment_add`      | comment    | `anchor`, `text`             | `{ ok }`                                          |
| `suggest_replace`  | suggest    | `find`, `replace`, `reason?` | shown to the user for review                      |
| `commands_run`     | edit       | `id`, `value?`               | runs after the user allows it                     |

## Not in this pass

- Mobile (plan: desktop v1 only).
- Resources, prompts, and SSE notifications.
- Persisting "server on" across launches (deliberately off at every start).
