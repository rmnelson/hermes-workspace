export type WorkspaceScope = {
  path?: string
  folderName?: string
  isValid?: boolean
}

// Matches a leading workspace_context directive in three forms:
//   (a) the canonical, fully-formed self-closing tag prepended by send-stream
//   (b) any leading <…context …/> or <…context …> tag we don't recognize
//   (c) the truncated remnant Hermes stores in session previews
//       (SUBSTR(content, 1, 63) cuts the tag mid-attribute, so there is
//       no closing `>` to anchor on — anchor on end-of-string instead).
const WORKSPACE_DIRECTIVE_RE = /^\s*<\w*context\b[^>]*(?:\/?>|$)\s*/i

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function buildWorkspaceDirective(workspace: WorkspaceScope): string {
  const path = workspace.path?.trim() ?? ''
  if (!path || workspace.isValid === false) return ''
  const name = workspace.folderName?.trim() || path.split('/').filter(Boolean).at(-1) || 'workspace'
  return `<workspace_context active="true" name="${escapeAttribute(name)}" path="${escapeAttribute(path)}" />`
}

export function buildWorkspaceScopedTextMessage(
  message: string,
  workspace: WorkspaceScope | null | undefined,
): string {
  if (message.includes('<workspace_context active="true"')) return message
  const directive = workspace ? buildWorkspaceDirective(workspace) : ''
  if (!directive) return message
  return `${directive}\n\n${message}`
}

export function stripWorkspaceDirective(message: string): string {
  // No `includes` fast-path: the previous one required the full canonical
  // string and missed truncated tags (Hermes stores SUBSTR(content, 1, 63)
  // as the session preview, which cuts mid-attribute). The regex test is
  // cheap; just run it.
  return message.replace(WORKSPACE_DIRECTIVE_RE, '').trimStart()
}
