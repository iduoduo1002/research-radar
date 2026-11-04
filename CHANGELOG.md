# Changelog

## 0.4.6 — 2026-11-04 — Installation and regression fixes

- Validate trimmed inbox paths, reject traversal/hidden directories and platform-reserved names.
- Keep saved translations and paused batches readable when feed issue-cache data is malformed.
- Use native setting headings.
- Add an external, user-run Python installer with checksum/manifest verification, dry run, upgrade backup, data preservation and failure rollback.
- Update community submission instructions for the Obsidian Community website.

## 0.4.5 — 2026-11-04 — Window fix and feedback

- Update public author attribution to iduoduo; retain Apache-2.0 and third-party notices.
- Render paper previews in the owner document and viewport; rebind Escape, scroll, resize and focus events after window migration and clean them up on unload.
- Add user-reviewed bug, feature and experience drafts from the toolbar, settings and command palette, with GitHub follow-up and copy/manual fallbacks.
- Do not collect private diagnostics, auto-submit issues or trigger translation.

## 0.4.4 — 2026-11-04 — Open-source desktop beta

- Adopt Apache-2.0 with alater copyright attribution, NOTICE, third-party notices and contribution terms.
- Update public download, rights and publication guidance; preserve original historical release artifacts.
- Include license notices in both the ZIP and bundled main.js for three-file installations.
- No functional changes; the known pop-out preview issue and unverified platform/API limits remain.

## 0.4.3 — Zotero setup and Agent guidance

- Added a copyable, vault-scoped Zotero setup Prompt in settings and the command palette.
- Added revision-checked Zotero-only configuration and read-only verification APIs.
- Added a compact red/green/unmatched/unverified legend and a full Zotero setup/troubleshooting guide.
- Existing Zotero/PDF colors and recovery remain; no automatic download, library writes or translation.


## 0.4.2 — 2026-11-04 — Private desktop preview

- Prepare a private GitHub repository and prerelease; no community-directory submission or public license grant.
- Add an English overview, screenshots, changelog, feedback templates, rights/provenance notes and a public-release checklist.
- Exclude local backups, evidence, test vaults, runtime data and credentials from version control.
- Set the conservative minimum Obsidian version to 1.13.7, the locally verified desktop build. Earlier versions and Windows/Linux runtime remain unverified.
- Preserve 0.4.1 functionality and include all user/security/Agent/acceptance documentation in the package.

## 0.4.1 — 2026-11-04

- Add saved default reading requirements, optional project context and editable Agent Prompt templates.
- Copy a ready task or save per-paper task snapshots and copy exact note paths; keep partial-save and clipboard failures distinct.
- Fix settings-link timing and handoff layout; no automatic Agent launch or Zotero write.

## 0.4.0 — 2026-11-04

- Add 13 selectable local, anonymous, official translation and AI API services, with independent cache identities and explicit online consent.
- Keep translation manual; no hover inference or silent service fallback. See the acceptance record for real-service and mock-test boundaries.

## 0.3.1 — 2026-11-04

- Port the optional read-only Zotero red/green/default title states and disconnection recovery to the standalone desktop plugin.

Historical test details and limits are recorded in docs/STATUS.md. Release notes describe implementation and verified scope, not scientific validation or a security certification.
