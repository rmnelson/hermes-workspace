import { describe, expect, it } from 'vitest'

import {
  buildWorkspaceScopedTextMessage,
  stripWorkspaceDirective,
} from './workspace-message-scope'

describe('buildWorkspaceScopedTextMessage', () => {
  it('prepends an explicit active workspace directive to plain text chat messages', () => {
    expect(
      buildWorkspaceScopedTextMessage('Run the tests', {
        path: '/Users/eric/projects/hermes-workspace',
        folderName: 'hermes-workspace',
        isValid: true,
      }),
    ).toBe(
      '<workspace_context active="true" name="hermes-workspace" path="/Users/eric/projects/hermes-workspace" />\n\nRun the tests',
    )
  })

  it('does not duplicate the directive if the message is retried', () => {
    const scoped = buildWorkspaceScopedTextMessage('Run the tests', {
      path: '/Users/eric/work',
      folderName: 'work',
      isValid: true,
    })
    expect(
      buildWorkspaceScopedTextMessage(scoped, {
        path: '/Users/eric/other',
        folderName: 'other',
        isValid: true,
      }),
    ).toBe(scoped)
  })

  it('leaves messages unchanged when no valid workspace exists', () => {
    expect(
      buildWorkspaceScopedTextMessage('hello', {
        path: '',
        folderName: '',
        isValid: false,
      }),
    ).toBe('hello')
  })

  it('strips the workspace directive back out for user-visible rendering', () => {
    expect(
      stripWorkspaceDirective(
        '<workspace_context active="true" name="Home" path="/Users/aurora/workspace" />\n\nRun the tests',
      ),
    ).toBe('Run the tests')
  })

  it('strips a truncated workspace directive from session previews', () => {
    // hermes_state.py builds previews with SUBSTR(content, 1, 63), which
    // cuts the directive mid-attribute. The strip must not require a
    // closing `>` or it leaves the user with a sidebar full of
    // <workspace_context active="true" name="Home" path="/home/use
    expect(
      stripWorkspaceDirective(
        '<workspace_context active="true" name="Home" path="/home/use',
      ),
    ).toBe('')
  })

  it('leaves messages without a context directive untouched', () => {
    expect(stripWorkspaceDirective('plain user message')).toBe(
      'plain user message',
    )
    expect(stripWorkspaceDirective('What is the best web interface?')).toBe(
      'What is the best web interface?',
    )
  })
})
